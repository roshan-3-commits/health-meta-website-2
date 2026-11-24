/**
 * "Continue with Google" using Google Identity Services (no Firebase).
 * Needs VITE_GOOGLE_CLIENT_ID (an OAuth Web client ID from Google Cloud Console).
 * The access token is sent to the Python backend, which verifies it with Google.
 */
const GOOGLE_CLIENT_ID: string = ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '').trim();
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const isGoogleSignInEnabled = (): boolean => Boolean(GOOGLE_CLIENT_ID);

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load Google sign-in. Check your internet connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/** Opens the Google account picker and resolves with an access token. */
export async function getGoogleAccessToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not set up yet. Please use email and password.');
  await loadGoogleScript();
  const oauth2 = (window as any).google.accounts.oauth2;

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (resp: any) => {
        if (resp?.access_token) resolve(resp.access_token);
        else reject(new Error(resp?.error_description || 'Google sign-in was cancelled.'));
      },
      error_callback: (err: any) => {
        reject(
          new Error(
            err?.type === 'popup_closed'
              ? 'Google sign-in window was closed before finishing.'
              : err?.type === 'popup_failed_to_open'
                ? 'Your browser blocked the Google popup. Allow popups for this site and try again.'
                : 'Google sign-in failed. Please try again.'
          )
        );
      },
    });
    client.requestAccessToken();
  });
}

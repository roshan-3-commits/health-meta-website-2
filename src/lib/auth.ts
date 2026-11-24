/**
 * Sign-in for Health-Meta. All accounts and logins are handled by the Python backend
 * and saved in its SQL database. (No Firebase.)
 */
import { authApi, getSessionToken, setSessionToken, type AuthEvent, type AuthResponse, type BackendUser } from './api';
import { getGoogleAccessToken } from './googleAuth';

/** The signed-in user, as the rest of the app uses it. */
export interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  providerId?: string;
}

// Active local session key
const ACTIVE_USER_KEY = 'calai_active_user';
const GUEST_EMAIL_KEY = 'healthmeta_guest_email';

// Old builds stored plain-text passwords here; remove them.
try {
  if (typeof window !== 'undefined') localStorage.removeItem('calai_registered_users');
} catch {
  /* ignore */
}

const authListeners: Array<(user: User | null) => void> = [];

function notifyAuthListeners(user: User | null) {
  authListeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  });
}

function getLocalActiveUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Turn any sign-in error into a short message for the user. */
export function formatAuthErrorMessage(error: any): string {
  return error?.message || 'Authentication failed. Please try again.';
}

function toAppUser(u: BackendUser): User {
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    photoURL: u.photoURL || '',
    emailVerified: u.provider !== 'guest',
    isAnonymous: u.provider === 'guest',
    providerId: u.provider,
  };
}

/** Save the backend session and tell the app who is logged in. */
function startLocalSession(res: AuthResponse): User {
  setSessionToken(res.token);
  const user = toAppUser(res.user);
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
  }
  notifyAuthListeners(user);
  return user;
}

function toAuthError(err: any): Error {
  const e = new Error(err?.message || 'Authentication failed. Please try again.');
  (e as any).status = err?.status;
  return e;
}

/** Sign in with Google. The backend verifies the Google token and saves the login. */
export async function signInWithGoogle(): Promise<User> {
  const accessToken = await getGoogleAccessToken();
  try {
    return startLocalSession(await authApi.google(accessToken));
  } catch (err: any) {
    throw toAuthError(err);
  }
}

/** A guest email unique to this browser, so separate guests never share one account. */
function deviceGuestEmail(): string {
  const make = () => `guest-${Math.random().toString(36).slice(2, 10)}@guest.healthmeta.app`;
  try {
    const saved = localStorage.getItem(GUEST_EMAIL_KEY);
    if (saved) return saved;
    const generated = make();
    localStorage.setItem(GUEST_EMAIL_KEY, generated);
    return generated;
  } catch {
    return make();
  }
}

/**
 * Instant / guest login (no password), saved by the backend.
 * Leave email empty to get a private guest account for this browser.
 * Fails if the email already belongs to a real (password / Google) account.
 */
export async function signInInstant(name?: string, email?: string): Promise<User> {
  const finalEmail = (email || '').trim() || deviceGuestEmail();
  const finalName = (name || '').trim() || 'Guest';
  try {
    return startLocalSession(await authApi.guest(finalName, finalEmail));
  } catch (err: any) {
    throw toAuthError(err);
  }
}

/** Sign in with email and password. */
export async function signInWithEmail(email: string, pass: string): Promise<User> {
  try {
    return startLocalSession(await authApi.login(email.trim(), pass));
  } catch (err: any) {
    throw toAuthError(err);
  }
}

/** Create an account with email and password. */
export async function signUpWithEmail(email: string, pass: string, name: string): Promise<User> {
  try {
    return startLocalSession(await authApi.register(email.trim(), pass, name));
  } catch (err: any) {
    throw toAuthError(err);
  }
}

/** Log out: closes the session on the backend (saved as a logout event). */
export async function logOut(): Promise<void> {
  try {
    if (getSessionToken()) {
      await authApi.logout().catch((err) => console.warn('Backend logout warning:', err?.message || err));
    }
  } finally {
    setSessionToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ACTIVE_USER_KEY);
    }
    notifyAuthListeners(null);
  }
}

/** Listen to sign-in changes. Restores the saved session and checks it with the backend. */
export function onAuthChange(callback: (user: User | null) => void) {
  authListeners.push(callback);

  const localUser = getLocalActiveUser();
  callback(localUser);

  // Confirm the saved session is still valid (not logged out / expired).
  if (getSessionToken()) {
    authApi
      .me()
      .then((res) => {
        const user = toAppUser(res.user);
        localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
        callback(user);
      })
      .catch((err) => {
        if (err?.status === 401) {
          setSessionToken(null);
          localStorage.removeItem(ACTIVE_USER_KEY);
          callback(null);
        }
        // Network error: keep the local user so the app still works offline.
      });
  } else if (localUser) {
    // Saved user without a backend session (e.g. from an old Firebase build): sign out.
    localStorage.removeItem(ACTIVE_USER_KEY);
    callback(null);
  }

  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx !== -1) authListeners.splice(idx, 1);
  };
}

/** This user's login / logout history from the backend. */
export async function getLoginHistory(limit = 50): Promise<AuthEvent[]> {
  const res = await authApi.history(limit);
  return res.events;
}

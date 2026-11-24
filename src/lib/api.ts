/**
 * Small client for the Python (FastAPI) backend.
 * In dev, Vite proxies /api to http://localhost:8000 (see vite.config.ts).
 * For a separate backend host, set VITE_API_URL, e.g. https://api.example.com
 */
import { deviceAccounts, isDeviceOnlySite } from './deviceAccounts';

const API_BASE: string = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'healthmeta_session_token';

/** True on a github.io link with no backend: accounts then live only in this browser. */
export const DEVICE_ONLY: boolean =
  typeof window !== 'undefined' && isDeviceOnlySite(API_BASE, window.location.hostname);

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: session lives only in memory for this tab */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getSessionToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...options, headers });
  } catch {
    throw new ApiError('Cannot reach the server. Please check your connection and try again.', 0);
  }

  const isJson = (res.headers.get('content-type') || '').includes('json');
  if (!isJson) {
    // A web page answered instead of our API: the backend is not running at this address.
    throw new ApiError('The Health Meta server is not available right now. Please try again in a moment.', res.ok ? 502 : res.status);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg: string = data?.detail || data?.error || `Request failed (${res.status})`;
    if (Array.isArray(data?.detail)) {
      // FastAPI validation errors
      msg = data.detail
        .map((d: any) => (d?.loc?.includes('password') ? 'Password must be at least 6 characters.' : d?.msg))
        .filter(Boolean)
        .join(' ');
    }
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export interface BackendUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  provider: 'password' | 'google' | 'guest';
  createdAt?: string;
  lastLoginAt?: string;
  loginCount?: number;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  expiresAt: string;
  user: BackendUser;
}

export interface AuthEvent {
  id: number;
  event: 'register' | 'login' | 'login_failed' | 'logout';
  email: string;
  provider: string;
  detail: string;
  ipAddress: string;
  userAgent: string;
  sessionId: number | null;
  createdAt: string;
}

const serverAuthApi = {
  register: (email: string, password: string, name: string) =>
    apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  google: (accessToken: string) =>
    apiFetch<AuthResponse>('/api/auth/google', { method: 'POST', body: JSON.stringify({ accessToken }) }),
  guest: (name: string, email: string) =>
    apiFetch<AuthResponse>('/api/auth/guest', { method: 'POST', body: JSON.stringify({ name, email }) }),
  logout: () => apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => apiFetch<{ success: boolean; user: BackendUser }>('/api/auth/me'),
  history: (limit = 50) =>
    apiFetch<{ success: boolean; count: number; events: AuthEvent[] }>(`/api/auth/history?limit=${limit}`),
};

const deviceAuthApi: typeof serverAuthApi = {
  register: deviceAccounts.register,
  login: deviceAccounts.login,
  google: () => Promise.reject(new ApiError('Google sign-in needs the server. Please use email and password.', 503)),
  guest: deviceAccounts.guest,
  logout: () => deviceAccounts.logout(getSessionToken()),
  me: () => deviceAccounts.me(getSessionToken()),
  history: (limit = 50) => deviceAccounts.history(getSessionToken(), limit),
};

export const authApi = DEVICE_ONLY ? deviceAuthApi : serverAuthApi;

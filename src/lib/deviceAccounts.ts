/**
 * Accounts kept only in this browser.
 *
 * GitHub Pages can only serve files, so a github.io link with no backend configured
 * has nowhere to send a signup (GitHub answers 405). On such a link, and only there,
 * accounts are kept in this browser instead. They are NOT in the SQL database.
 * As soon as the site is built with VITE_API_URL, the real backend is used.
 */
import type { AuthEvent, AuthResponse, BackendUser } from './api';

interface StoredAccount {
  user: BackendUser;
  salt?: string;
  hash?: string;
}

interface Store {
  accounts: Record<string, StoredAccount>;
  sessions: Record<string, string>; // token -> email
  events: AuthEvent[];
}

const STORE_KEY = 'healthmeta_device_accounts';
const ITERATIONS = 210_000;
const SESSION_DAYS = 30;

/** True on a github.io page that was built without a backend address. */
export function isDeviceOnlySite(apiBase: string, hostname: string): boolean {
  return !apiBase && /(^|\.)github\.io$/i.test(hostname);
}

export class DeviceAccountError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { accounts: s.accounts || {}, sessions: s.sessions || {}, events: s.events || [] };
    }
  } catch {
    /* unreadable: start empty */
  }
  return { accounts: {}, sessions: {}, events: [] };
}

function save(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    throw new DeviceAccountError('This browser is blocking storage, so the account cannot be saved.', 0);
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

/** One-way password hash; the typed password is never stored. */
async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS },
    key,
    256
  );
  return hex(new Uint8Array(bits));
}

function cleanEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new DeviceAccountError('Please enter a valid email address.', 422);
  }
  return e;
}

function addEvent(store: Store, event: AuthEvent['event'], email: string, provider: string, detail = ''): void {
  store.events.unshift({
    id: (store.events[0]?.id || 0) + 1,
    event,
    email,
    provider,
    detail,
    ipAddress: '',
    userAgent: navigator.userAgent,
    sessionId: null,
    createdAt: new Date().toISOString(),
  });
  store.events = store.events.slice(0, 200);
}

function startSession(store: Store, account: StoredAccount): AuthResponse {
  const now = new Date();
  const token = `device.${randomHex(24)}`;
  account.user = {
    ...account.user,
    lastLoginAt: now.toISOString(),
    loginCount: (account.user.loginCount || 0) + 1,
  };
  store.sessions = { [token]: account.user.email }; // one signed-in account per browser
  addEvent(store, 'login', account.user.email, account.user.provider);
  save(store);
  return {
    success: true,
    token,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString(),
    user: account.user,
  };
}

function newUser(email: string, name: string, provider: BackendUser['provider']): BackendUser {
  return {
    uid: `device_${randomHex(8)}`,
    displayName: name.trim() || email.split('@')[0],
    email,
    photoURL: '',
    provider,
    createdAt: new Date().toISOString(),
    loginCount: 0,
  };
}

function accountFor(store: Store, token: string | null): StoredAccount {
  const email = token ? store.sessions[token] : undefined;
  const account = email ? store.accounts[email] : undefined;
  if (!account) throw new DeviceAccountError('Please sign in again.', 401);
  return account;
}

export const deviceAccounts = {
  async register(emailIn: string, password: string, name: string): Promise<AuthResponse> {
    const email = cleanEmail(emailIn);
    if (password.length < 6) throw new DeviceAccountError('Password must be at least 6 characters.', 422);
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const store = load();
    const existing = store.accounts[email];
    if (existing && existing.user.provider !== 'guest') {
      throw new DeviceAccountError('This email is already registered. Please sign in.', 409);
    }
    const account: StoredAccount = { user: newUser(email, name, 'password'), salt, hash };
    store.accounts[email] = account;
    addEvent(store, 'register', email, 'password');
    return startSession(store, account);
  },

  async login(emailIn: string, password: string): Promise<AuthResponse> {
    const email = cleanEmail(emailIn);
    const found = load().accounts[email];
    const ok = Boolean(found?.salt && found.hash && (await hashPassword(password, found.salt)) === found.hash);
    const store = load();
    const account = store.accounts[email];
    if (!ok || !account) {
      addEvent(store, 'login_failed', email, 'password', account ? 'wrong password' : 'no such account');
      save(store);
      throw new DeviceAccountError(
        account
          ? 'Invalid email or password.'
          : 'No account with this email in this browser. Accounts on this link stay on the device where they were created.',
        401
      );
    }
    return startSession(store, account);
  },

  async guest(name: string, emailIn: string): Promise<AuthResponse> {
    const email = cleanEmail(emailIn);
    const store = load();
    let account = store.accounts[email];
    if (account && account.user.provider !== 'guest') {
      throw new DeviceAccountError('This email has an account. Please sign in with your password.', 409);
    }
    if (!account) {
      account = { user: newUser(email, name, 'guest') };
      store.accounts[email] = account;
    }
    return startSession(store, account);
  },

  async me(token: string | null) {
    return { success: true, user: accountFor(load(), token).user };
  },

  async logout(token: string | null) {
    const store = load();
    const email = token ? store.sessions[token] : undefined;
    if (token && email) {
      delete store.sessions[token];
      addEvent(store, 'logout', email, store.accounts[email]?.user.provider || '');
      save(store);
    }
    return { success: true };
  },

  async history(token: string | null, limit: number) {
    const store = load();
    const { email } = accountFor(store, token).user;
    const events = store.events.filter((e) => e.email === email).slice(0, limit);
    return { success: true, count: events.length, events };
  },
};

/**
 * Per-account browser storage.
 *
 * Profile, meals, workouts, streak and notification data are saved in localStorage.
 * Each signed-in account gets its own copy (key suffixed with the account email),
 * so a new account never sees the data of whoever used this browser before.
 * Signed-out ("guest") data uses the plain key, which also keeps data saved by older builds.
 */
export const GUEST_OWNER = 'guest';
const ACTIVE_USER_KEY = 'calai_active_user';

/** Storage owner for a user: their email (stable across login methods), else uid. */
export function ownerOf(user: { email?: string | null; uid?: string | null } | null | undefined): string {
  if (!user) return GUEST_OWNER;
  const id = (user.email || user.uid || '').trim().toLowerCase();
  return id || GUEST_OWNER;
}

/** Owner of the account currently signed in on this browser. */
export function currentOwner(): string {
  if (typeof window === 'undefined') return GUEST_OWNER;
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    return ownerOf(raw ? JSON.parse(raw) : null);
  } catch {
    return GUEST_OWNER;
  }
}

export function scopedKey(base: string, owner: string = currentOwner()): string {
  return owner === GUEST_OWNER ? base : `${base}::${owner}`;
}

export function readJson<T>(base: string, owner?: string): T | null {
  try {
    const raw = localStorage.getItem(scopedKey(base, owner));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(base: string, value: unknown, owner?: string): void {
  try {
    localStorage.setItem(scopedKey(base, owner), JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to save ${base}:`, err);
  }
}

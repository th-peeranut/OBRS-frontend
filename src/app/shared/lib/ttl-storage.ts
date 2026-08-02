/**
 * OBRS-903: localStorage entries that carry an explicit lifetime.
 *
 * Two things in the booking flow have to survive a hop through the customer's
 * e-mail client — the post-login return URL and the pre-login trip selection —
 * and that hop lands in a **new tab**. `sessionStorage` is per-tab, so it can
 * carry neither: the tab that read the return URL was never the tab `AuthGuard`
 * wrote it in, so the value was simply absent and login fell back to the home
 * route with no error anywhere.
 *
 * localStorage crosses tabs, but it also outlives the intent — a selection
 * restored a day later points at seats somebody else has since bought. So every
 * value written through here carries `savedAt` and is read back through a TTL:
 * an expired entry is REMOVED and reads as absent, never returned "just this
 * once". `version` is checked on the same read, so a shape change ships a new
 * number and the old payload is dropped instead of being parsed into the new
 * interface.
 *
 * Every access is wrapped in try/catch. Nothing stored here is required for
 * correctness — a private-mode or quota failure must degrade to "no value", the
 * exact state the flow already handles.
 */
export interface TtlEnvelope<T> {
  version: number;
  /** epoch ms at write time; a write REFRESHES it, so the window is sliding. */
  savedAt: number;
  value: T;
}

export function writeWithTtl<T>(key: string, value: T, version: number): void {
  try {
    const envelope: TtlEnvelope<T> = { version, savedAt: Date.now(), value };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Private mode / quota exceeded — the caller keeps working from its
    // in-memory copy and simply loses the cross-tab hand-off.
  }
}

/**
 * Returns the stored value, or `null` when it is absent, expired, of another
 * version, or unparseable. Any of those also REMOVES the key: a value this
 * function refused once must not be sitting there to be refused again.
 */
export function readWithTtl<T>(key: string, ttlMs: number, version: number): T | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }

  if (raw === null) {
    return null;
  }

  let envelope: Partial<TtlEnvelope<T>> | null;
  try {
    envelope = JSON.parse(raw) as Partial<TtlEnvelope<T>>;
  } catch {
    clearTtl(key);
    return null;
  }

  if (
    !envelope ||
    typeof envelope !== 'object' ||
    envelope.version !== version ||
    typeof envelope.savedAt !== 'number' ||
    envelope.value === undefined
  ) {
    clearTtl(key);
    return null;
  }

  // A `savedAt` in the future (clock moved, or a hand-edited entry) counts as
  // expired rather than as "valid for the next 3 hours". localStorage is
  // user-editable, so the age check has to be bounded on BOTH sides.
  const age = Date.now() - envelope.savedAt;
  if (age < 0 || age > ttlMs) {
    clearTtl(key);
    return null;
  }

  return envelope.value as T;
}

export function clearTtl(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage itself is unreachable.
  }
}

import { clearTtl, readWithTtl, writeWithTtl } from './ttl-storage';

const KEY = 'obrs.spec.ttl';
const VERSION = 1;
const TTL = 30 * 60 * 1000;

/** Rewrites `savedAt` rather than mocking the clock — the age check under test
 *  reads that field, so this exercises the real path instead of a stand-in. */
function ageBy(ms: number): void {
  const envelope = JSON.parse(localStorage.getItem(KEY) as string) as {
    savedAt: number;
  };
  envelope.savedAt -= ms;
  localStorage.setItem(KEY, JSON.stringify(envelope));
}

describe('ttl-storage (OBRS-903)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('round-trips a value inside the window', () => {
    writeWithTtl(KEY, { a: 1 }, VERSION);
    expect(readWithTtl<{ a: number }>(KEY, TTL, VERSION)).toEqual({ a: 1 });
  });

  it('crosses the tab boundary: the value lives in localStorage, not sessionStorage', () => {
    writeWithTtl(KEY, '/passenger-info', VERSION);

    sessionStorage.clear(); // what a new tab amounts to for storage purposes

    expect(readWithTtl<string>(KEY, TTL, VERSION)).toBe('/passenger-info');
  });

  it('returns null past the TTL — and REMOVES the entry so it cannot be re-offered', () => {
    writeWithTtl(KEY, 'stale', VERSION);
    ageBy(TTL + 1000);

    expect(readWithTtl<string>(KEY, TTL, VERSION)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('still returns the value one millisecond inside the TTL', () => {
    writeWithTtl(KEY, 'fresh', VERSION);
    ageBy(TTL - 1);

    expect(readWithTtl<string>(KEY, TTL, VERSION)).toBe('fresh');
  });

  it('treats a savedAt in the FUTURE as expired, not as valid for longer', () => {
    // A user-editable store plus a clock that can move backwards: bounding the
    // age on one side only would turn either into an entry that never expires.
    writeWithTtl(KEY, 'from-the-future', VERSION);
    ageBy(-60 * 60 * 1000);

    expect(readWithTtl<string>(KEY, TTL, VERSION)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('drops a payload written by another version instead of parsing it', () => {
    writeWithTtl(KEY, { oldShape: true }, VERSION);

    expect(readWithTtl(KEY, TTL, VERSION + 1)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('survives a truncated / hand-edited entry', () => {
    localStorage.setItem(KEY, '{"version":1,"savedAt":');

    expect(readWithTtl(KEY, TTL, VERSION)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('rejects a bare value that never went through the envelope', () => {
    // The pre-OBRS-903 shape: a plain string under the same key. It has no
    // savedAt, so accepting it would be accepting an entry with no lifetime.
    localStorage.setItem(KEY, '"/passenger-info"');

    expect(readWithTtl<string>(KEY, TTL, VERSION)).toBeNull();
  });

  it('reads as absent after clearTtl', () => {
    writeWithTtl(KEY, 'x', VERSION);
    clearTtl(KEY);

    expect(readWithTtl<string>(KEY, TTL, VERSION)).toBeNull();
  });
});

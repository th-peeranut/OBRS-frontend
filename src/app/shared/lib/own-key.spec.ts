import { hasOwnKey } from './own-key';

// Every `Object.prototype` member an attacker or a buggy backend could name.
// The first two survive a `.toLowerCase()` normalize; the rest only matter at a
// call site that does not normalize — which is most of the error-code mappers.
const PROTOTYPE_MEMBERS = [
  'constructor',
  '__proto__',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
];

describe('hasOwnKey', () => {
  const MAP: Record<string, string> = { alpha: 'A', beta: 'B' };

  it('accepts a key the map actually declares', () => {
    expect(hasOwnKey(MAP, 'alpha')).toBeTrue();
    expect(hasOwnKey(MAP, 'beta')).toBeTrue();
  });

  it('rejects a key the map simply does not have', () => {
    expect(hasOwnKey(MAP, 'gamma')).toBeFalse();
    expect(hasOwnKey(MAP, '')).toBeFalse();
  });

  PROTOTYPE_MEMBERS.forEach((member) => {
    it(`rejects inherited member "${member}"`, () => {
      expect(hasOwnKey(MAP, member)).toBeFalse();
    });
  });

  // These four assertions are the whole reason this file exists: they document
  // that the idioms hasOwnKey replaces are NOT equivalent to it. If any of them
  // ever flips, JavaScript changed, not us.
  it('pins the two idioms it replaces as genuinely broken', () => {
    expect('constructor' in MAP).withContext('`in` walks the prototype chain').toBeTrue();
    expect(MAP['constructor'] ?? 'FALLBACK')
      .withContext('`??` sees the Object function as present')
      .not.toBe('FALLBACK');
    expect(MAP['constructor'] || 'FALLBACK')
      .withContext('`||` sees the Object function as truthy')
      .not.toBe('FALLBACK');
    expect(typeof MAP['constructor'])
      .withContext('what the caller was handed instead of a string')
      .toBe('function');
  });

  it('is unaffected by a key an attacker planted as an OWN property', () => {
    // `__proto__` assigned through a literal is the setter, not an own key —
    // but `Object.defineProperty` makes it own, and then it IS a legitimate
    // entry. The guard answers "did this map declare it", not "is the name
    // scary", and that is the correct question.
    const planted: Record<string, string> = {};
    Object.defineProperty(planted, '__proto__', { value: 'P', enumerable: true });
    expect(hasOwnKey(planted, '__proto__')).toBeTrue();
    expect(hasOwnKey({}, '__proto__')).toBeFalse();
  });

  it('survives a map with no prototype at all', () => {
    const bare = Object.create(null) as Record<string, string>;
    bare['alpha'] = 'A';
    // `bare.hasOwnProperty(...)` would throw here — the .call() form is why
    // this helper is written the way it is.
    expect(hasOwnKey(bare, 'alpha')).toBeTrue();
    expect(hasOwnKey(bare, 'constructor')).toBeFalse();
  });
});


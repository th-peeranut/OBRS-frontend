/**
 * OBRS-601: the one safe way to look a runtime string up in an object-literal
 * map.
 *
 * Every object literal inherits from `Object.prototype`, so the two idioms this
 * codebase reached for by reflex are both holes:
 *
 * ```ts
 * MAP[key] ?? FALLBACK          // MAP['constructor'] is the Object FUNCTION —
 * (key && MAP[key]) || FALLBACK // non-nullish AND truthy, so neither fires
 * key in MAP                    // 'constructor' in MAP === true
 * ```
 *
 * The caller then holds a function where it expected a record or a string. What
 * happens next is never a clean fallback: `translate.instant(fn)` throws inside
 * an error handler, `grants.forEach` throws inside a route guard, or a bogus
 * i18n key reaches the screen verbatim.
 *
 * Reachability depends on normalization. Lower-casing the key first leaves only
 * `constructor` and `__proto__` (the rest become `tostring`, `valueof`, ...);
 * an un-normalized key admits all eight `Object.prototype` members. Neither is
 * a set worth reasoning about per call site — use this instead.
 *
 * Written as a **type predicate** so it also removes the `as SomeUnion` cast
 * the unguarded version needed. That cast was the tell: it asserted at compile
 * time exactly the thing that was false at runtime.
 *
 * First bite: OBRS-427, where the *fix* for a raw-i18n-key defect used
 * `key in MAP` and thereby produced `PARCEL_TRACKING.STATUS.CONSTRUCTOR` — a
 * key in no locale bundle, i.e. the very symptom the card existed to prevent.
 */
export function hasOwnKey<T extends object>(map: T, key: string): key is keyof T & string {
  return Object.prototype.hasOwnProperty.call(map, key);
}

# 28. `hasOwnKey()` — object-literal maps must not be indexed by a raw runtime string

Date: 2026-07-21
Status: Accepted
Card: OBRS-601 (spun off by OBRS-427)

## Context

Every object literal inherits from `Object.prototype`. The three idioms this
codebase reached for by reflex all therefore admit inherited members:

```ts
key in MAP                    // 'constructor' in MAP === true
MAP[key] ?? FALLBACK          // MAP['constructor'] is the Object FUNCTION —
(key && MAP[key]) || FALLBACK // non-nullish AND truthy, so neither fires
```

The caller is then holding a function where it expected a record or a string.
No branch reports an error, because as far as every guard on the path is
concerned the lookup succeeded.

This was not theoretical. OBRS-427's **fix** for a raw-i18n-key defect used
`key in MAP` and thereby emitted `PARCEL_TRACKING.STATUS.CONSTRUCTOR` — a key
present in no locale bundle, which ngx-translate renders to a customer
verbatim. The fix manufactured the exact symptom the card existed to prevent,
and it was caught in review, not by the test suite: a slug-based suite never
generates these inputs.

A sweep of `src/` then found the same shape in **23 places**, in five
clusters:

| Cluster | Key origin | Normalized? | Reachable members |
|---|---|---|---|
| 18 error-code lookups (17 → i18n key, 1 → icon glyph) | `error.error.errorCode`, raw server text | no | all 8 |
| `parcelPaymentFlag` | `bookingStatus`, server text | `.toLowerCase()` | `constructor`, `__proto__` |
| `AuthService.ROLE_GRANTS[role]` | `localStorage['auth_roles']` | `.toLowerCase()` | `constructor`, `__proto__` |
| `detailStatusValuesFor()` | `report.status`, raw server text | no | all 8 |
| `SESSION_EXPIRED_MESSAGE[appLanguage]` | `localStorage['app_language']` | no | all 8 |

The last row was **missed by the first sweep and added at Scrutinize**. It is
the one locale-keyed map in the repo whose key is *not* narrowed to the
`en\|th\|zh` union before the lookup (`auth.interceptor.ts` reads localStorage
raw, deliberately, to avoid a `LanguageService` DI cycle) — so the blanket
"locale keys are a locally computed literal union" rationale below covers every
locale map except this one. Symptom: Swal rejects a non-string title, so the
force-logout dialog opens blank.

Consequences ranged from cosmetic to app-wide:

- An error mapper returns the `Object` function; `translate.instant(fn)` throws
  on `.split('.')` **inside an error handler**, so the toast is lost *and* the
  statements after it (`dialogParcel = null`, `store.refresh()`) never run,
  leaving a dialog open over stale state.
- `hasAnyRole()` takes the `if (grants)` branch and throws on
  `grants.forEach`. It is called from every route guard and the navbar, so a
  single hand-edited localStorage entry breaks navigation. The correct handling
  ("an unrecognised role only matches itself") was already written in the
  `else` — the unguarded lookup just skipped past it.

`as SomeUnion` casts sat on several of these lookups. The cast was the tell: it
asserted at compile time precisely the thing that was false at runtime.

## Decision

Add `shared/lib/own-key.ts` exporting **`hasOwnKey(map, key)`**, a type
predicate over `Object.prototype.hasOwnProperty.call()`. Written as a predicate
so it both closes the hole and retires the cast the unguarded version needed.

Add **`mapApiErrorCode(errorCode, knownCodes, fallbackKey)`** to
`shared/lib/api-error-code.ts` — the other half of ADR-0022. That ADR
consolidated *reading* the wire code; this consolidates *choosing a
translation* for it, which eighteen call sites had open-coded in three
superficially different but identically broken shapes. Fifteen become one-line
delegations, each keeping its own name, signature and return type, exactly as
ADR-0022 did.

Three helpers (`change-seat-error`, `change-stop-error`,
`vehicle-inspection-error`) fall through past the lookup into an
`HttpFallbackTier` branch rather than a flat generic return. Those are **not**
flattened onto `mapApiErrorCode`; only their `if` condition gains `hasOwnKey`.
Flattening them would have changed behavior.

`AuthService.ROLE_GRANTS[role]` is guarded with `hasOwnKey` — the access-model
change this ADR exists to record. **The access model itself is unchanged**: no
role gains or loses a grant, and `hasAnyRole()`'s result is identical for every
input that previously did not throw. The change is strictly that a planted role
name now reaches the documented `else` instead of crashing.

## Consequences

- One guard, one place. 23 sites converted; 6 `Record`-keyed lookups audited
  and deliberately left alone because their key is a locally computed literal
  union (`resolveFleetVehicleStatus()` over booleans, a hardcoded locale
  ternary) with no `as` cast anywhere in the chain — see the OBRS-601 card for
  the per-site table.
- `detailStatusValuesFor()` additionally gained a `?? []`-equivalent fallback.
  It had **none**, so any status the FE union does not know yet threw on
  `.includes()` and blanked the detail modal. Different failure, same lookup.
- Behavior-preserving: **zero spec files were edited to make anything pass**.
  New specs were added, which is the opposite signal. (ADR-0022's warning.)
- Not fixed, and named here so the next reader does not think the sweep was
  exhaustive: `stopsLookup[code] ?? null` (reschedule/change-stop dialogs) and
  `seatGenders[label]` / `seatOwners[label]` (passenger-seat components, both
  the `?? ''` and the `label in ...` form). All are keyed by server-enumerated
  stop codes / seat labels, so reaching them needs a stop literally named
  `constructor`. Left as-is rather than padding the diff.
- A lint rule would beat a convention here. None exists yet; until then the
  probe tests in `own-key.spec.ts` pin the three broken idioms as broken, so a
  reader who wonders why the helper exists gets the answer from a failing
  assertion rather than from prose.

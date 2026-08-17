# UX-OBRS-699 — Owner-editable cancel/reschedule policy (settings tab)

**Card:** OBRS-699 · **FE worktree:** `OBRS-frontend-wt-obrs-699-cancel-reschedule-policy-config`
**FE base:** `ao/obrs-699-cancel-reschedule-policy-config` @ `bcf3d354` (measured: `git rev-parse --abbrev-ref HEAD` + `git log -1 --format=%h`)
**Input spec:** `docs/sessions/SPEC-OBRS-699.md` in the BE worktree — §3 (API), §7 (FE), **§11 LOCKED DECISIONS D-1..D-4** (supersedes §10.2).

> **Provenance rule.** Every claim about existing code below carries `file:line` and was read on
> this worktree at `bcf3d354`. Anything not opened is written as **NOT VERIFIED**.

---

## 0. What is locked before any design begins

| Locked by | Item |
|---|---|
| SPEC §0.4 / §7 | A **tab inside `/admin/settings`**, not a standalone route |
| brief + SPEC §7.0(a) | Template is **`parcel-share-config`** (owner-scoped, per-field flags), form/validator shape from `booking-policy-config` |
| SPEC §3 | DTO flags are **`*Overridden`**, not `*Configured` |
| SPEC §3 | Rates are **`BigDecimal` 0.00–1.00 on the wire**, not percentages |
| SPEC §3 / BR-7 | PUT and DELETE are **all seven keys as a unit** — no PATCH, no per-key delete |
| SPEC §11 D-2 | BE rejects `400` when `cancelRefundRateEarly < cancelRefundRateLate` ⇒ UI needs **client hint AND a server-error surface** |
| SPEC §11 D-3 | Bounds: `0..168` / `0..168` / `1..365` / `1..720` / rate `0.00..1.00` @ 2dp / `0..10000` |
| SPEC §11 D-4 | Customer surfaces read per-booking DTO fields, never `/api/cancellation-policy` |

### 0.1 Naming mismatch — recorded, not fixed (brief requirement)

The frontend has only ever seen the `*Configured` suffix: `ParcelShareOwnerConfigDto` declares
`driverPctConfigured` / `salespersonPctConfigured` at
`src/app/services/admin/admin-api.service.ts:2513-2518` (verified — read at those lines). This card
introduces the **first `*Overridden` fields in the FE**, because the owner locked OBRS-730's shape.

⇒ `OwnerCancelReschedulePolicyDto` uses `*Overridden` **verbatim**. FE **must not** rename them to
`*Configured` on the way in (SPEC §7.0(c)). Unifying the two suffixes is a separate card. This
paragraph is the record the brief asked for.

---

## 1. New routes / pages

No hand-written route. `src/app/modules/admin/admin.module.ts:306-337` generates the child route,
`:412-416` generates the legacy redirect, and `system-settings-page.component.ts:44-50` builds the
rendered strip (`SYSTEM_SETTINGS_TABS.filter(tab => authService.hasAnyRole([...tab.requiredRoles]))`,
read) — all from `SYSTEM_SETTINGS_TABS`. **One array entry is the whole routing change.**

```
/admin/settings/cancel-reschedule-policy
  → admin/pages/cancel-reschedule-policy-config/cancel-reschedule-policy-config-page.component
/admin/cancel-reschedule-policy-config   (legacy redirect, auto-generated from legacyPath)
```

New entry for `src/app/modules/admin/pages/system-settings/system-settings-tabs.ts`:

```ts
{
  // OBRS-699: owner-only. Appended to the owner-only block (parcel-share,
  // driver-cash-rates) rather than inserted into it, so the OBRS-960 pair keeps
  // its shipped adjacency and only the two tabs after this one shift index.
  path: 'cancel-reschedule-policy',
  legacyPath: 'cancel-reschedule-policy-config',
  labelKey: 'ADMIN.PAGES.CANCEL_RESCHEDULE_POLICY_CONFIG',
  subtitleKey: 'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SUBTITLE',
  requiredRoles: ['owner'],
  component: CancelReschedulePolicyConfigPageComponent,
}
```

**Position: index 5** — immediately after `driver-cash-rates` (`system-settings-tabs.ts:131-139`) and
before `notification-messages` (`:140-162`). This honours both invariants stated in that file's own
comments: `booking-policy` stays first (`:83-86`) and `history` stays last (`:163-165`).
`requiredRoles: ['owner']` matches `parcel-share` (`:128`) and SPEC §3.1, where ADMIN is refused by
`getCurrentOwnerId()`.

`SYSTEM_SETTINGS_ROLES` (`:185-187`) is derived — nothing to edit there.

**Two pinned literals must move with it** (both are deliberately frozen, both fail otherwise):

- `system-settings-page.component.spec.ts:66-91` — add `'cancel-reschedule-policy': ['owner'],` to
  `ROLES_BEFORE_OBRS_702`, with a one-line comment in the style of the OBRS-960/OBRS-1308 entries
  (a NEW tab, never a standalone route ⇒ "before" is its own roles at creation).
- `src/app/modules/admin-shell-tab-strip-wrap.spec.ts:23-31` — `TAB_LABELS` is a hand-written EN
  label array (`'Booking Policy' … 'Config Change History'`, read). Add the new label. That spec
  rebuilds the real strip markup at fixed widths and asserts **how many rows it wraps into** (its
  own header, `:18-21`, says it deliberately asserts container width, never a label's px width,
  because Sarabun may not have loaded). An 8th label therefore widens the strip and its row
  expectations must be **re-measured, not assumed**. **This is why the EN label is short** —
  `"Cancel & Reschedule"` (19 chars) sits between `"Driver Cash Rates"` (17) and
  `"Notification Messages"` (21), so the added width is one ordinary tab, not an outlier.

---

## 2. Component hierarchy

```
CancelReschedulePolicyConfigPageComponent            (smart, standalone: false — AdminModule)
  ├─ app-admin-refresh-hint                          (existing shared; selector at
  │                                                   admin-refresh-hint.component.ts:11)
  └─ app-config-source-badge (dumb) × 7              inputs: [overridden: boolean]
                                                     outputs: none
```

**Only one new dumb component, and it earns its place.** The badge renders 7 times, it is the single
element whose colour this card introduces, and SPEC §7.6 makes any new text-carrying element a
WCAG-gate trigger (`override-cancel-modal.component.spec.ts` carries 6 contrast specs using
`.admin-shell.is-dark`, verified at `:474` — `shell.className = dark ? 'admin-shell theme-admin is-dark' : …`).
One component = **one** element to measure in light and dark instead of seven copies that can drift.

Everything else stays a single smart component, exactly like the two templates
(`parcel-share-config-page.component.ts:34`, `booking-policy-config-page.component.ts:45`). The page
is one form posting one payload; splitting it into three "group" components would give three dumb
components no state of their own and one shared `FormGroup` threaded through them.

### 2.1 Supporting files (not components)

| File | Role | Modelled on |
|---|---|---|
| `cancel-reschedule-policy-config.store.ts` | SWR store, `extends AdminCollectionStore<OwnerCancelReschedulePolicyDto>` | `parcel-share-config.store.ts:16-31` (verified, 31 lines) |
| `cancel-reschedule-policy-config-page.validators.ts` | the **3 cross-field** validators (BR-4a, BR-4b, BR-5) | `booking-policy-config-page.validators.ts` (its own comment: "no shared validators location exists — every component defines its own locally") |

The per-field integer validator is **imported, not copied**: `integerRangeValidator(min, max)` from
`../booking-policy-config/booking-policy-config-page.validators` (read in full — it returns
`required` / `notInteger` / `outOfRange {min,max}`, which is exactly the three-message contract this
page needs for all 7 fields). Cross-page imports under `pages/` are already the idiom:
`parcel-share-config-page.component.ts:14` imports `confirmDiscardUnsavedSettings` from
`../system-settings/unsaved-settings-prompt`. Writing a third copy of the same function is the drift
its own header warns about.

---

## 3. Layout — three cards, one form, one Save

```
┌ section.admin-page-intro ─────────────────────────────────────────┐
│  loading text / load-failed text / <app-admin-refresh-hint>       │
│  policy-source line:  ALL_DEFAULT | MIXED | ALL_CUSTOM            │
└───────────────────────────────────────────────────────────────────┘
<form [formGroup]="form" (ngSubmit)="save()">        ← ONE form spans all three cards
 ┌ section.admin-card  GROUP.CANCEL ──────────────────────────────┐
 │  admin-form-grid:  cancelWindowHours  [badge]                  │
 │                    cancelRefundRateEarly (%)  [badge]          │
 │                    cancelRefundRateLate  (%)  [badge]          │
 │  .full → coherence hint EARLY_RATE_NOT_BELOW_LATE              │
 └────────────────────────────────────────────────────────────────┘
 ┌ section.admin-card  GROUP.RESCHEDULE ──────────────────────────┐
 │  admin-form-grid:  rescheduleWindowHours      [badge]          │
 │                    rescheduleMaxDaysAhead     [badge]          │
 │                    rescheduleFeeLateThb (THB) [badge]          │
 └────────────────────────────────────────────────────────────────┘
 ┌ section.admin-card  GROUP.BOUNDARY ────────────────────────────┐
 │  GROUP.BOUNDARY_INTRO (muted prose — why one key drives both)  │
 │  admin-form-grid:  earlyWindowHours           [badge]          │
 │  .full → coherence hints EARLY_ABOVE_CANCEL / …_RESCHEDULE     │
 └────────────────────────────────────────────────────────────────┘
 ┌ section.admin-card  (form footer) ─────────────────────────────┐
 │  TAKEOVER_WARNING  (only while inheritedCount > 0)             │
 │  [ Save ]  ← the ONE primary button on this screen             │
 │  SAVE_REJECTED banner (persistent server error)                │
 └────────────────────────────────────────────────────────────────┘
</form>
┌ section.admin-card  RESET ────────────────── (only when overriddenCount > 0) ┐
│  RESET.TITLE / RESET.BODY / [ RESET.BTN ]  ← secondary role, OUTSIDE the form │
│  RESET.FAILED inline                                                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Why three groups and not one flat list of seven.** SPEC §2.3 is the whole argument: `early_window_hours`
is *not* a cancel key — `RescheduleService.java:624` reads it too, which is why the SA refused PM's
`cancel_early_window_hours` name. A flat list, or a two-group cancel/reschedule split, forces that key
into one column and re-tells the wrong mechanism the SA just rejected. Its own card, with
`GROUP.BOUNDARY_INTRO` above it, is the layout that matches the code.

**Why one `<form>` across three cards.** BR-7: PUT writes all seven or none. Three forms with three
Save buttons would be three primary buttons (design-system §4 forbids it) advertising a partial write
the API does not offer.

Classes are the existing ones — `admin-page-intro`, `admin-card` + `admin-card-head`,
`admin-form-grid`, `admin-form-field` / `.full`, `admin-field`, `admin-form-label`, `admin-required`,
`admin-error`, `admin-muted`, `admin-skeleton admin-skeleton--sm`, `admin-btn` / `admin-btn-primary` —
all read in `parcel-share-config-page.component.html:1-98` and
`booking-policy-config-page.component.html`.

---

## 4. Forms

### 4.1 `cancelReschedulePolicyForm` — controls

Every control is a plain `<input type="number" class="admin-field">`. **Not `p-inputNumber`** and not
any PrimeNG widget: design-system §5 makes `.admin-field` the pill base for *every* admin
`<input>` (text/date/number/email), and both templates this card copies use the bare element
(`booking-policy-config-page.component.html`, `parcel-share-config-page.component.html:40-51`).
Introducing PrimeNG's number widget here would be a new pattern with no need behind it.

There is **no select on this page**, so design-system §3.1 (`app-admin-dropdown`, field-name
placeholder, no pre-seeded default) is satisfied vacuously — stated explicitly so review can confirm
it rather than assume it.

| # | Field (control name) | Element | HTML attrs | Client validator | Wire field | BE constraint (§3 / D-3) | i18n label key |
|---|---|---|---|---|---|---|---|
| 1 | `cancelWindowHours` | `input[type=number].admin-field` | `min="0" max="168" step="1" inputmode="numeric" required` | `integerRangeValidator(0, 168)` | `cancelWindowHours` | `@NotNull @Min(0) @Max(168)` | `…CANCEL_WINDOW_HOURS_LABEL` |
| 2 | `cancelRefundRateEarlyPct` | same | `min="0" max="100" step="1" inputmode="numeric" required` | `integerRangeValidator(0, 100)` | `cancelRefundRateEarly` **(÷100)** | `@DecimalMin("0.00") @DecimalMax("1.00") @Digits(1,2)` | `…CANCEL_REFUND_RATE_EARLY_LABEL` |
| 3 | `cancelRefundRateLatePct` | same | `min="0" max="100" step="1" inputmode="numeric" required` | `integerRangeValidator(0, 100)` | `cancelRefundRateLate` **(÷100)** | same as #2 | `…CANCEL_REFUND_RATE_LATE_LABEL` |
| 4 | `rescheduleWindowHours` | same | `min="0" max="168" step="1" inputmode="numeric" required` | `integerRangeValidator(0, 168)` | `rescheduleWindowHours` | `@NotNull @Min(0) @Max(168)` | `…RESCHEDULE_WINDOW_HOURS_LABEL` |
| 5 | `rescheduleMaxDaysAhead` | same | `min="1" max="365" step="1" inputmode="numeric" required` | `integerRangeValidator(1, 365)` | `rescheduleMaxDaysAhead` | `@NotNull @Min(1) @Max(365)` | `…RESCHEDULE_MAX_DAYS_AHEAD_LABEL` |
| 6 | `rescheduleFeeLateThb` | same | `min="0" max="10000" step="1" inputmode="numeric" required` | `integerRangeValidator(0, 10000)` | `rescheduleFeeLateThb` | `@NotNull @Min(0) @Max(10000)` | `…RESCHEDULE_FEE_LATE_THB_LABEL` |
| 7 | `earlyWindowHours` | same | `min="1" max="720" step="1" inputmode="numeric" required` | `integerRangeValidator(1, 720)` | `earlyWindowHours` | `@NotNull @Min(1) @Max(720)` | `…EARLY_WINDOW_HOURS_LABEL` |

`inputmode="numeric"` is required by the design-system review rubric (`docs/design-system.md:552-554`,
"numeric/phone/email inputs set the matching `type` **and** `inputmode`"). Neither template carries it
today — this is the rubric applied to new code, not a change to theirs.

Every field also gets, copied from `booking-policy-config-page.component.html`:
`<small class="admin-muted" id="<name>-helper">` with its `_HELPER` key, `[attr.aria-invalid]`,
`[attr.aria-describedby]="describedBy(name)"` (`booking-policy-config-page.component.ts:174-177` —
helper id always, error id only while invalid), and `<span class="admin-required">*</span>`.

Error message resolution reuses `errorKey()` / `errorParams()`
(`booking-policy-config-page.component.ts:152-169`) unchanged ⇒ `ADMIN.VALIDATION.REQUIRED` (en.json:599),
`ADMIN.VALIDATION.WHOLE_NUMBER` (:611), `ADMIN.VALIDATION.INTEGER_RANGE` (:614, `{{min}}`/`{{max}}`).
**No new per-field validation strings are needed.**

### 4.2 ⚠ Design decision: the two rate fields are entered as **whole percent**, converted at the component boundary

The wire stays exactly as SPEC §3 locks it — `BigDecimal` `0.00`–`1.00`. Only the *input* is percent.

- **Why.** `80` is the number the owner already sees in this product everywhere: `refund-policy.component.ts`
  is named in `PublicCancellationPolicyRespDto.java:41-44` as the one place that turns `0.80` into
  `"80%"`, and `e2e/tests/obrs-942-non-manual-cancel.spec.ts:80` asserts `refundRatePercent: '80%'`
  (both quoted from SPEC §3 / §7.6 — **the e2e line was not opened by me**, NOT VERIFIED at line level).
  Asking an owner to type `0.8` to publish "80%" makes the human do the unit conversion.
- **The cost, measured not guessed.** `@Digits(integer=1, fraction=2)` admits exactly the two-decimal
  rates. Whole percent `0..100` ↔ two-decimal rate `0.00..1.00` is a **bijection** — the input can
  express every value the backend accepts and no value it rejects. Nothing is lost.
- **The bonus.** `max="100" step="1"` makes the classic fat-finger (`80` submitted as the rate `80`,
  rejected `400` by `@DecimalMax("1.00")`) unreachable from the UI.
- **Conversion sites are exactly two**, both in the smart component and both unit-tested:
  `applyFormValues()` → `Math.round(dto.cancelRefundRateEarly * 100)`;
  `buildPayload()` → `pct / 100` emitted with 2 decimals.

Flagged as a UX decision, not a spec change: no DTO field is renamed and nothing in §3 moves.

### 4.3 Cross-field validators (new file, `FormGroup`-level)

| Validator | Rule | Source | Error key on the group |
|---|---|---|---|
| `earlyWindowAboveCancelWindow` | `earlyWindowHours > cancelWindowHours` | BR-4 | `earlyNotAboveCancel` |
| `earlyWindowAboveRescheduleWindow` | `earlyWindowHours > rescheduleWindowHours` | BR-4 | `earlyNotAboveReschedule` |
| `earlyRateNotBelowLateRate` | `cancelRefundRateEarlyPct >= cancelRefundRateLatePct` | BR-5 / **D-2** | `earlyRateBelowLate` |

Each returns `null` while either operand is blank/non-numeric, so a half-typed form shows a *field*
error, never a confusing cross-field one. Each is a separate `ValidatorFn` with its own test — SPEC T-3
requires one failing case per reason, and the same discipline applies on this side.

Precedent for a cross-field message living beside the fields it constrains:
`ADMIN.PARCEL_SHARE_CONFIG.SUM_EXCEEDS_100` (`public/i18n/en.json:2005`), rendered in an
`.admin-form-field.full` at `parcel-share-config-page.component.html:79-85`.

---

## 5. The heart: separating "the owner set this" from "this is inherited"

This is the failure the brief names — an owner opens the tab, presses Save, and seven values that
were *following* the platform default become seven permanent overrides that no longer move when the
platform does. Three mechanisms, layered, because no single one closes it.

### 5.1 Per-field badge — `app-config-source-badge`

Rendered inside each `<label>`, after the label text:

| State | Markup | Text key |
|---|---|---|
| `overridden === false` | `<span class="admin-status is-neutral">` | `…SOURCE.DEFAULT` — EN "Platform default" |
| `overridden === true` | `<span class="admin-status is-info">` | `…SOURCE.CUSTOM` — EN "Your setting" |

- **Tokens, not new hex.** `.admin-status.is-neutral` (`src/styles/admin-theme.scss:1766`) and
  `.admin-status.is-info` (`:1750`) both exist and both carry a dark-mode override per the
  design-system status table (`docs/design-system.md:81-97`) — `.is-neutral` "plain grey, inactive/unset",
  `.is-info` "neutral blue-grey". Neither implies success or a problem, which is right: being
  overridden is a *fact*, not a verdict. Nothing new is added to the legend, so §2.4's
  "check the new colour against the full legend" is satisfied by not introducing one.
- **Never hue alone.** Both variants carry text (rubric `docs/design-system.md:542-544`). The badge is
  also `aria-label`led with the same string so a screen reader gets the field's source, not a bare chip.
- **Vocabulary is not invented.** It matches the wording the config-change-history tab already ships:
  `ADMIN.CONFIG_CHANGE_HISTORY.SCOPE.PLATFORM` = "Platform default (all owners)" (`en.json:1700`) and
  `SCOPE.OWNER` (`:1701`). Same product concept ⇒ same words.

### 5.2 Page-level source line (`admin-page-intro`)

Derived from `overriddenCount` over the seven flags:

| Condition | Key | EN |
|---|---|---|
| `overriddenCount === 0` | `…STATE.ALL_DEFAULT` | "Every value below is the platform default. Nothing here is yours yet." |
| `0 < overriddenCount < 7` | `…STATE.MIXED` | "{{count}} of 7 values are yours; the rest still follow the platform default." |
| `overriddenCount === 7` | `…STATE.ALL_CUSTOM` | "All 7 values are your own policy and no longer follow the platform default." |

The MIXED arm is not decorative: PUT/DELETE move all seven together (BR-7), so today a mixed state can
only arrive from data written outside this UI — and a UI that renders it as "all default" would be
lying about four fields. Rendering the truth costs one `@if`.

### 5.3 The takeover warning + confirm — what actually stops the accidental override

- **Save is disabled while `form.pristine`.** Existing idiom, verified at
  `parcel-share-config-page.component.html:91` (`[disabled]="isSaving || form.invalid || form.pristine || …"`).
  This alone already makes "open the tab, press Save" impossible.
- **The real trap is the second-order one:** the owner edits *one* field, and PUT writes *seven*
  (BR-7), silently converting the other six. So while `inheritedCount > 0` **and** the form is dirty,
  a persistent line sits directly above Save:

  `…TAKEOVER_WARNING` — EN: *"Saving writes all 7 values as your own. The {{count}} still marked
  “Platform default” will stop following the platform and will only change when you change them here."*

  Styled with `--admin-warning-bg` + `--admin-warning-text` as a **pair on one element**, exactly like
  `.parcel-share-config-warning` (`parcel-share-config-page.component.scss:12-19`) — design-system
  §2.4.0 forbids using the chip's `-text` half as a standalone foreground, and the token gate
  `scripts/check-admin-theme-tokens.mjs` (invariant 4) enforces it.
- **And a confirm on the transition itself.** `save()` calls `AlertService.confirm({title, text,
  confirmButtonText, cancelButtonText})` (`alert.service.ts:133`) **only when `inheritedCount > 0`** —
  i.e. only on the save that actually changes the inheritance relationship. Once all seven are already
  the owner's, a routine edit gets no dialog; nagging on every save is how a dialog stops being read.

### 5.4 The "go back to the platform default" affordance — **page-level, and it has to be**

The brief asks for a reasoned choice between field-level and page-level. It is not a preference:

**The DELETE endpoint drops all seven override rows as a unit** (SPEC §3, DELETE: *"drops all seven
override rows for the caller as a unit, mirroring how PUT writes all seven together"*). There is no
per-key delete and BR-7 explicitly forbids adding one. A per-field "use default" link would therefore
either (a) be unimplementable, or (b) be faked client-side by PUT-ing the platform value into that
field — which writes an override row holding the default, the exact opposite of what the control
promises, and permanently detaches that field from the platform. **Page-level it is**, and the reason
is recorded here so a later reviewer does not "improve" it into a per-field control.

Placement and behaviour:

- Its own `admin-card` **below and outside the `<form>`** — it is not a form action, and putting it
  inside would give the form a second button competing with Save.
- **Rendered only when `overriddenCount > 0`.** With nothing overridden there is nothing to reset, and
  a permanently-visible disabled button invites the click it then refuses.
- **Role: secondary — bare `admin-btn`, not `admin-btn-primary` and not `admin-btn-danger`**
  (design-system §4). Not primary: the page's one primary is Save. Not danger: the action is
  *reversible in one step* (re-enter the values and save) and destroys no customer-visible record —
  the danger role is reserved for irreversible deletes.
- **Guarded by `AlertService.confirm()`** with the `REPAIR.CONFIRM_*` shape already proven on the
  template page (`parcel-share-config-page.component.ts:183-191`; keys at `en.json:2011-2014`), whose
  text states *what will change* rather than asking "are you sure".
- On success it calls `store.mutate(() => response.data)` then `store.refresh()`, and `form.reset(...)`
  with the returned platform values, so the form ends **pristine** — otherwise the unsaved-changes
  guard would fire on the very next tab switch about changes the user did not make.

There is genuinely no precedent to copy: SPEC §7.0(b) measured
`grep 'RESET_TO_DEFAULT|USE_DEFAULT|PLATFORM_DEFAULT|resetToDefault' public/i18n/en.json` → only the
unrelated `RESET_PASSWORD`. Every string in §7's `RESET.*` block is authored here in three languages.

---

## 6. User flows

1. **Owner opens the tab.** Store fetches → skeleton rows → seven fields fill with the *effective*
   values, each wearing its badge. Header line says which of the three states the policy is in.
2. **Owner edits one number.** Form goes dirty → Save enables → the takeover warning appears if
   anything is still inherited → any violated cross-field rule shows its hint immediately and keeps
   Save disabled.
3. **Owner presses Save with an invalid form.** `markAllAsTouched()` → `AlertService.warning('ADMIN.VALIDATION.FORM_INVALID')`
   → focus moves to the first invalid control (`focusFirstInvalidControl()`,
   `booking-policy-config-page.component.ts:208-216`, extended to seven `@ViewChild` refs in the
   declared field order). No request is sent.
4. **Owner presses Save with a valid form and something still inherited.** Confirm dialog → on cancel,
   nothing happens and the form stays dirty → on confirm, PUT.
5. **PUT succeeds.** `form.markAsPristine()` → `AlertService.success('ADMIN.MESSAGES.UPDATED')` →
   `store.mutate()` with the response (the response is the *re-read*, per SPEC §3, so the badges flip
   to "Your setting" from server truth, never from an optimistic guess) → `store.refresh()`.
6. **PUT is rejected 400.** §7 below.
7. **Owner presses "Use the platform default".** Confirm → DELETE → all badges flip to
   "Platform default", header line flips to ALL_DEFAULT, the reset card disappears, form is pristine.
8. **Owner switches tab with unsaved edits.** `CanDeactivateGuard` (wired for every tab at
   `admin.module.ts:322`) → `confirmDiscardUnsavedSettings(form, alertService, translate)`
   (`unsaved-settings-prompt.ts:24-39`, reused unchanged, no new strings).
9. **ADMIN (not owner) reaches the URL.** The tab is not in their strip (`requiredRoles: ['owner']`),
   and a direct URL hit gets `403` from `getCurrentOwnerId()` (SPEC §3.1) → the load fails → the
   `LOAD_FAILED` text renders. No blank card.

---

## 7. States

| State | Trigger | What renders |
|---|---|---|
| **Loading (first)** | `isRefreshing && !store.hasValue` | `ADMIN.COMMON.LOADING` (en.json:565) + **7** `div.admin-skeleton.admin-skeleton--sm` rows. Form not mounted. No `p-progressSpinner` — this codebase's admin pages use skeletons + `app-admin-refresh-hint`, verified in both templates. |
| **Background revalidate** | `isRefreshing && store.hasValue` | `<app-admin-refresh-hint [refreshing] [failed] [loading]>` only. Form stays mounted; **only pristine controls are patched** (`applyFormValues(data, true)`, `booking-policy-config-page.component.ts:218-235`) so a mid-edit value is never overwritten. |
| **Load failed, no cached value** | `error$ && !store.hasValue` | `…LOAD_FAILED` in `p.admin-muted`. Form not mounted. |
| **Load failed, cached value present** | `error$ && store.hasValue` | `app-admin-refresh-hint [failed]="true"` — stale data stays usable. |
| **Loaded** | `!isLoading && config` | Three cards + footer; reset card iff `overriddenCount > 0`. |
| **Client-invalid** | any control invalid **or** any cross-field error | per-field `small.admin-error[role=alert]`, cross-field hint in its group's `.full` cell, Save disabled. |
| **Saving** | `isSaving` | Save shows `ADMIN.COMMON.SAVING` (:587) and is `[disabled]` — rubric `docs/design-system.md:539-541`, no second click. |
| **Saved** | PUT 200 | success toast, badges re-read from the response, form pristine. |
| **Rejected 400 — per field** | see below | field marked invalid + inline message. |
| **Rejected 400 — cross-field / other** | see below | toast **and** a persistent banner. |
| **Resetting** | `isResetting` | reset button `[disabled]`, label `…RESET.RUNNING`. |
| **Reset failed** | DELETE non-2xx | `…RESET.FAILED` inline in the reset card (`p.admin-error`), mirroring `repairErrorMessage` at `parcel-share-config-page.component.html:117-119`. |

### 7.1 The 400 path — both halves, as D-2 requires

`extractApiErrorMessage()` (`src/app/shared/lib/api-error.ts:43-65`, read in full) returns **only**
`error.error.message` or a plain-text body. It does **not** read field errors. The field-error reader
is a **separate** exported function in the same file: `apiFieldErrors(error): Record<string,string>`
at `:171-191`, which walks `error.error.errors[]` and keys by `field`. Both are needed here:

```
catch (error):
  fieldErrors = apiFieldErrors(error)                      // api-error.ts:171
  for (field, reason) of fieldErrors:
      control = form.get(mapWireFieldToControl(field))     // rate fields map *Pct
      control?.setErrors({ server: reason })               // rendered via ADMIN.VALIDATION.SERVER_FIELD_ERROR
  message = extractApiErrorMessage(error)                  // api-error.ts:43
            || translate.instant('ADMIN.MESSAGES.SAVE_FAILED')
  alertService.error(message)                              // alert.service.ts:82  ← transient
  this.serverErrorMessage = message                        // ← PERSISTENT banner
```

- **Per-field** (`400 VALIDATION_ERROR`, a bean-validation bound): reuses the existing
  `ADMIN.VALIDATION.SERVER_FIELD_ERROR` = *"The server rejected this value: {{reason}}"*
  (`en.json:606`) — no new key. `errorKey()` gains one branch: `hasError('server')` →
  `SERVER_FIELD_ERROR`, with `{ reason }` params.
- **Cross-field** (`400 POLICY_INCOHERENT`, BR-4/BR-5 — the D-2 case): the server's translated message
  arrives in `error.error.message` from the BE keys in SPEC §3.2 and is shown **twice on purpose**:
  a toast (existing idiom, `booking-policy-config-page.component.ts:199-202`) **and** a persistent
  banner under Save (`data-testid="cancel-reschedule-policy-server-error"`). A toast alone leaves an
  owner staring at a form that refused to save with no reason on screen — and D-2 explicitly requires
  a server-error surface, not just the client hint.
- `serverErrorMessage` clears on the next `valueChanges` emission, so a stale rejection never sits
  next to an edit that fixed it.

The client hint is **not** a substitute for either: BR-4/BR-5 are enforced on the server (§5), and
the hint exists so the owner is not made to round-trip to learn it.

### 7.2 State machine

```
                 ┌──────────┐  fetch ok           ┌──────────────┐
   (enter tab) → │ LOADING  │ ──────────────────→ │   LOADED     │ ←──┐
                 └────┬─────┘                     │  (pristine)  │    │
                      │ fetch fail                └──┬────────┬──┘    │
                      ↓                              │ edit   │       │ 200 (mutate+refresh,
              ┌───────────────┐                      ↓        │       │  reset → pristine)
              │  LOAD_FAILED  │             ┌────────────────┐│       │
              └───────────────┘             │ DIRTY_INVALID  ││       │
                (refresh-hint if cached)    └───────┬────────┘│       │
                                             fix ↕  │        ↓        │
                                            ┌───────┴──────────┐      │
                                            │   DIRTY_VALID    │      │
                                            └───┬──────────────┘      │
                                       submit   │                     │
                        inheritedCount>0 → CONFIRM ─cancel→ DIRTY_VALID
                                                │ confirm             │
                                                ↓                     │
                                          ┌──────────┐  200           │
                                          │  SAVING  │ ──────────────-┘
                                          └────┬─────┘
                                          400  │
                                               ↓
                                      ┌──────────────────┐
                                      │ SAVE_REJECTED    │ (banner + field errors;
                                      └────────┬─────────┘  clears on next edit)
                                               └──→ DIRTY_INVALID / DIRTY_VALID

   LOADED ──(overriddenCount>0, click reset)──→ CONFIRM_RESET ──→ RESETTING ──200──→ LOADED(pristine)
                                                     │                  └──err──→ RESET_FAILED
                                                  cancel → LOADED

   any state, route change with form.dirty → CanDeactivateGuard → confirmDiscardUnsavedSettings()
```

---

## 8. Store / service changes (this app has **no NgRx** on the admin side)

The admin module uses the SWR `AdminCollectionStore` base
(`src/app/modules/admin/shared/admin-collection-store.ts:31` — `data$`/`refreshing$`/`error$`/`hasValue`
+ `refresh()`/`mutate()`), not NgRx actions/effects/selectors. Verified: `parcel-share-config.store.ts`
and `booking-policy-config.store.ts` are both 30-ish-line subclasses. This card follows that, and
adds **no** NgRx artefacts.

### 8.1 `admin-api.service.ts` — three methods + two interfaces

Placed beside the OBRS-960 block (`:2350-2364`, read) and following it byte-for-byte in shape.
`deleteRequest<T>(url): Observable<ResponseAPI<T>>` already exists at `:1252`, so DELETE can return
the re-read DTO with no new plumbing.

```ts
// ── OBRS-699: owner settings — cancel/reschedule policy ─────────────────
getCancelReschedulePolicyOwnerConfig(): Observable<ResponseAPI<OwnerCancelReschedulePolicyDto>>
  GET    `${this.baseUrl}/private/owner/configs/cancel-reschedule-policy`

updateCancelReschedulePolicyOwnerConfig(payload: CancelReschedulePolicyReqDto)
  PUT    `${this.baseUrl}/private/owner/configs/cancel-reschedule-policy`

resetCancelReschedulePolicyOwnerConfig(): Observable<ResponseAPI<OwnerCancelReschedulePolicyDto>>
  DELETE `${this.baseUrl}/private/owner/configs/cancel-reschedule-policy`
```

```ts
/** GET/PUT/DELETE /api/private/owner/configs/cancel-reschedule-policy — OBRS-699.
 *  NOTE the suffix: `*Overridden`, matching OwnerBookingPolicyRespDto (OBRS-730),
 *  NOT the `*Configured` this frontend uses for parcel-share (OBRS-960). Owner-locked
 *  2026-08-17; do not rename on the way in. Unifying the two is a separate card. */
export interface OwnerCancelReschedulePolicyDto {
  cancelWindowHours: number;            cancelWindowHoursOverridden: boolean;
  rescheduleWindowHours: number;        rescheduleWindowHoursOverridden: boolean;
  rescheduleMaxDaysAhead: number;       rescheduleMaxDaysAheadOverridden: boolean;
  earlyWindowHours: number;             earlyWindowHoursOverridden: boolean;
  /** 0.0–1.0 rate, NOT a percentage (SPEC §3). The form shows whole percent; the
   *  component converts. */
  cancelRefundRateEarly: number;        cancelRefundRateEarlyOverridden: boolean;
  cancelRefundRateLate: number;         cancelRefundRateLateOverridden: boolean;
  rescheduleFeeLateThb: number;         rescheduleFeeLateThbOverridden: boolean;
}

export type CancelReschedulePolicyReqDto = Omit<
  OwnerCancelReschedulePolicyDto,
  `${string}Overridden`
>;   // the 7 values only — the PUT body carries no flags and no key parameter (SPEC §3)
```

### 8.2 Store

```ts
@Injectable({ providedIn: 'root' })
export class CancelReschedulePolicyConfigStore
  extends AdminCollectionStore<OwnerCancelReschedulePolicyDto> {
  protected async fetch() { …throw on a missing response body… }   // parcel-share-config.store.ts:24-30
}
```

---

## 9. i18n keys to add

Bundles: `public/i18n/{en,th,zh}.json` — the three are **line-for-line aligned**, so each block goes in
at the same line numbers in all three.

### 9.1 `ADMIN.PAGES` (block `en.json:492-529`; insert after `DRIVER_CASH_RATES`, `en.json:527`)

| Key | EN | TH | ZH |
|---|---|---|---|
| `ADMIN.PAGES.CANCEL_RESCHEDULE_POLICY_CONFIG` | Cancel & Reschedule | ยกเลิก/เลื่อนเที่ยว | 取消与改签 |

(Kept short on purpose — see §1, `admin-shell-tab-strip-wrap.spec.ts` `TAB_LABELS`.)

### 9.2 `ADMIN.CONFIG_CHANGE_HISTORY.KEYS` — the one missing label (SPEC §7.2)

Six of the seven keys are already labelled at `en.json:1716-1722` (`cancel_window_hours`,
`cancel_refund_rate_early`, `cancel_refund_rate_late`, `reschedule_window_hours`,
`reschedule_max_days_ahead`, `reschedule_fee_late_thb`). Only the new key is missing. Resolution is
by prefix — `config-change-history-page.mappers.ts:18,34-41`, `ADMIN.CONFIG_CHANGE_HISTORY.KEYS.` +
the key with dots sanitised; a miss degrades to the raw string `early_window_hours`, which is the
defect SPEC §7.2 warns about. **No TS change — one line per bundle.**

| Key | EN | TH | ZH |
|---|---|---|---|
| `…KEYS.early_window_hours` | Early/late boundary (hours) | เส้นแบ่ง early/late (ชั่วโมง) | 早鸟/临期分界（小时） |

### 9.3 `ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.*` — new block

Modelled on `ADMIN.BOOKING_POLICY_CONFIG` (`en.json:1660-1667`): always a `SUBTITLE`, always a
`LOAD_FAILED`, then `<FIELD>_LABEL` / `<FIELD>_HELPER` pairs.

| Key | EN | TH | ZH |
|---|---|---|---|
| `SUBTITLE` | Set your own cancellation and reschedule rules. Anything you do not set follows the platform default. | ตั้งกฎการยกเลิกและการเลื่อนเที่ยวของคุณเอง ค่าที่ยังไม่ได้ตั้ง จะใช้ค่ากลางของแพลตฟอร์ม | 设置您自己的取消与改签规则。未设置的项目将沿用平台默认值。 |
| `LOAD_FAILED` | Unable to load the cancel/reschedule policy. | ไม่สามารถโหลดนโยบายการยกเลิก/เลื่อนเที่ยวได้ | 无法加载取消/改签政策。 |
| `STATE.ALL_DEFAULT` | Every value below is the platform default. Nothing here is yours yet. | ค่าทั้งหมดด้านล่างเป็นค่ากลางของแพลตฟอร์ม ยังไม่มีค่าไหนที่คุณตั้งเอง | 以下所有数值均为平台默认值，您尚未自行设置任何一项。 |
| `STATE.MIXED` | {{count}} of 7 values are yours; the rest still follow the platform default. | คุณตั้งเอง {{count}} จาก 7 ค่า ที่เหลือยังใช้ค่ากลางของแพลตฟอร์ม | 7 项中有 {{count}} 项由您设置，其余仍沿用平台默认值。 |
| `STATE.ALL_CUSTOM` | All 7 values are your own policy and no longer follow the platform default. | ทั้ง 7 ค่าเป็นนโยบายของคุณเอง ไม่ตามค่ากลางของแพลตฟอร์มแล้ว | 全部 7 项均为您自己的政策，不再跟随平台默认值。 |
| `SOURCE.DEFAULT` | Platform default | ค่ากลางของแพลตฟอร์ม | 平台默认 |
| `SOURCE.CUSTOM` | Your setting | คุณตั้งเอง | 您的设置 |
| `SOURCE.ARIA` | Value source: {{source}} | ที่มาของค่า: {{source}} | 数值来源：{{source}} |
| `GROUP.CANCEL` | Cancellation | การยกเลิก | 取消 |
| `GROUP.RESCHEDULE` | Reschedule | การเลื่อนเที่ยว | 改签 |
| `GROUP.BOUNDARY` | Early / late boundary | เส้นแบ่ง early / late | 早鸟／临期分界 |
| `GROUP.BOUNDARY_INTRO` | One boundary drives both sections: it decides which refund rate a cancellation gets AND whether a reschedule pays a fee. It must be larger than both windows above, or the late rate and the late fee can never apply. | เส้นแบ่งเส้นเดียวนี้คุมทั้งสองส่วน คือใช้ตัดสินว่าการยกเลิกจะได้อัตราคืนเงินแบบไหน และการเลื่อนเที่ยวต้องเสียค่าธรรมเนียมหรือไม่ ค่านี้ต้องมากกว่าช่วงปิดรับทั้งสองด้านบน มิฉะนั้นอัตราแบบ late และค่าธรรมเนียมแบบ late จะไม่มีวันถูกใช้ | 同一条分界线同时决定两件事：取消时适用哪一档退款比例，以及改签是否收费。它必须大于上面两个截止时段，否则 late 比例与 late 费用永远不会生效。 |
| `CANCEL_WINDOW_HOURS_LABEL` | Cancellation closes (hours before departure) | ปิดรับการยกเลิก (ชั่วโมงก่อนออกเดินทาง) | 取消截止（发车前小时数） |
| `CANCEL_WINDOW_HOURS_HELPER` | After this point a customer can no longer cancel. Enter 0 to allow cancelling right up to departure. | เลยจุดนี้แล้วลูกค้าจะยกเลิกไม่ได้อีก ใส่ 0 หากต้องการให้ยกเลิกได้จนถึงเวลาออกรถ | 超过此时间点后顾客将无法再取消。填 0 表示直到发车前都可取消。 |
| `CANCEL_REFUND_RATE_EARLY_LABEL` | Refund rate — early cancellation (%) | อัตราคืนเงิน — ยกเลิกแบบ early (%) | 退款比例 — 早鸟取消（%） |
| `CANCEL_REFUND_RATE_EARLY_HELPER` | Percentage refunded when the customer cancels earlier than the early/late boundary below. | เปอร์เซ็นต์ที่คืนให้ เมื่อลูกค้ายกเลิกก่อนถึงเส้นแบ่ง early/late ด้านล่าง | 顾客在下方早鸟／临期分界之前取消时的退款百分比。 |
| `CANCEL_REFUND_RATE_LATE_LABEL` | Refund rate — late cancellation (%) | อัตราคืนเงิน — ยกเลิกแบบ late (%) | 退款比例 — 临期取消（%） |
| `CANCEL_REFUND_RATE_LATE_HELPER` | Percentage refunded when the customer cancels at or after the early/late boundary. It cannot be higher than the early rate. | เปอร์เซ็นต์ที่คืนให้ เมื่อลูกค้ายกเลิกตั้งแต่เส้นแบ่ง early/late เป็นต้นไป ต้องไม่สูงกว่าอัตราแบบ early | 顾客在早鸟／临期分界当刻或之后取消时的退款百分比，不得高于早鸟比例。 |
| `RESCHEDULE_WINDOW_HOURS_LABEL` | Reschedule closes (hours before departure) | ปิดรับการเลื่อนเที่ยว (ชั่วโมงก่อนออกเดินทาง) | 改签截止（发车前小时数） |
| `RESCHEDULE_WINDOW_HOURS_HELPER` | After this point a customer can no longer move the trip. The same value also governs seat changes and stop changes. Enter 0 to allow it right up to departure. | เลยจุดนี้แล้วลูกค้าจะเลื่อนเที่ยวไม่ได้อีก ค่านี้ใช้คุมการเปลี่ยนที่นั่งและการเปลี่ยนจุดขึ้น-ลงด้วย ใส่ 0 หากต้องการให้ทำได้จนถึงเวลาออกรถ | 超过此时间点后顾客无法再改签。此数值同时管控换座位与换上下车点。填 0 表示直到发车前都可操作。 |
| `RESCHEDULE_MAX_DAYS_AHEAD_LABEL` | Max days ahead for reschedule | เลื่อนไปข้างหน้าได้ไม่เกิน (วัน) | 改签最多可提前天数 |
| `RESCHEDULE_MAX_DAYS_AHEAD_HELPER` | How far past the original departure date a customer may move the trip, in days. | ลูกค้าเลื่อนเที่ยวไปได้ไกลสุดกี่วัน นับจากวันเดินทางเดิม | 顾客可将行程改到原出发日期之后最多多少天。 |
| `RESCHEDULE_FEE_LATE_THB_LABEL` | Late reschedule fee (THB) | ค่าธรรมเนียมเลื่อนเที่ยวแบบ late (บาท) | 临期改签费（泰铢） |
| `RESCHEDULE_FEE_LATE_THB_HELPER` | Flat fee charged when a reschedule is requested at or after the early/late boundary. Before the boundary there is no fee. Enter 0 for no fee at all. | ค่าธรรมเนียมแบบเหมาจ่าย เก็บเมื่อขอเลื่อนเที่ยวตั้งแต่เส้นแบ่ง early/late เป็นต้นไป ถ้าขอก่อนเส้นแบ่งจะไม่มีค่าธรรมเนียม ใส่ 0 หากไม่ต้องการเก็บเลย | 在早鸟／临期分界当刻或之后申请改签时收取的固定费用；分界之前不收费。填 0 表示完全不收费。 |
| `EARLY_WINDOW_HOURS_LABEL` | Early / late boundary (hours before departure) | เส้นแบ่ง early / late (ชั่วโมงก่อนออกเดินทาง) | 早鸟／临期分界（发车前小时数） |
| `EARLY_WINDOW_HOURS_HELPER` | Earlier than this counts as early: the early refund rate applies and a reschedule pays no fee. At or after it counts as late. | เร็วกว่าค่านี้ถือเป็น early คือได้อัตราคืนเงินแบบ early และเลื่อนเที่ยวไม่เสียค่าธรรมเนียม ตั้งแต่ค่านี้เป็นต้นไปถือเป็น late | 早于此数值视为早鸟：适用早鸟退款比例，改签不收费；到达或晚于此数值则视为临期。 |
| `COHERENCE.EARLY_ABOVE_CANCEL` | The early/late boundary must be greater than the cancellation window, otherwise the late refund rate can never apply. | เส้นแบ่ง early/late ต้องมากกว่าช่วงปิดรับการยกเลิก มิฉะนั้นอัตราคืนเงินแบบ late จะไม่มีวันถูกใช้ | 早鸟／临期分界必须大于取消截止时段，否则 late 退款比例永远不会生效。 |
| `COHERENCE.EARLY_ABOVE_RESCHEDULE` | The early/late boundary must be greater than the reschedule window, otherwise the late reschedule fee can never apply. | เส้นแบ่ง early/late ต้องมากกว่าช่วงปิดรับการเลื่อนเที่ยว มิฉะนั้นค่าธรรมเนียมแบบ late จะไม่มีวันถูกเรียกเก็บ | 早鸟／临期分界必须大于改签截止时段，否则 late 改签费永远不会被收取。 |
| `COHERENCE.EARLY_RATE_NOT_BELOW_LATE` | The early refund rate must be at least the late refund rate — cancelling sooner may not refund less. | อัตราคืนเงินแบบ early ต้องไม่น้อยกว่าแบบ late — ยกเลิกเร็วกว่าต้องไม่ได้เงินคืนน้อยกว่า | 早鸟退款比例不得低于 late 比例——越早取消不应退得更少。 |
| `TAKEOVER_WARNING` | Saving writes all 7 values as your own. The {{count}} still marked "Platform default" will stop following the platform and will only change when you change them here. | การบันทึกจะเขียนทั้ง 7 ค่าเป็นค่าของคุณเอง อีก {{count}} ค่าที่ยังขึ้นว่า "ค่ากลางของแพลตฟอร์ม" จะเลิกตามค่ากลาง และจะเปลี่ยนก็ต่อเมื่อคุณมาแก้ที่นี่เท่านั้น | 保存会将全部 7 项写为您自己的设置。仍标记为"平台默认"的 {{count}} 项将不再跟随平台，今后只有您在此修改时才会变动。 |
| `SAVE_CONFIRM_TITLE` | Take over the whole policy? | ใช้นโยบายของคุณเองทั้งชุด? | 要接管整套政策吗？ |
| `SAVE_CONFIRM_TEXT` | All 7 values become yours, including the {{count}} you did not change. They will stop following the platform default. You can hand them back at any time with "Use the platform default". | ทั้ง 7 ค่าจะกลายเป็นของคุณ รวม {{count}} ค่าที่คุณไม่ได้แก้ด้วย และจะเลิกตามค่ากลางของแพลตฟอร์ม คุณคืนกลับได้ทุกเมื่อด้วยปุ่ม "กลับไปใช้ค่ากลางของแพลตฟอร์ม" | 全部 7 项都将成为您的设置，包括您未修改的 {{count}} 项，并将不再跟随平台默认值。您随时可以通过"改用平台默认值"交还。 |
| `SAVE_CONFIRM_BTN` | Save as my policy | บันทึกเป็นนโยบายของฉัน | 保存为我的政策 |
| `SAVE_REJECTED` | The server rejected this policy and nothing was saved. | เซิร์ฟเวอร์ปฏิเสธนโยบายนี้ ยังไม่มีการบันทึกใด ๆ | 服务器拒绝了此政策，未保存任何内容。 |
| `RESET.TITLE` | Use the platform default | กลับไปใช้ค่ากลางของแพลตฟอร์ม | 改用平台默认值 |
| `RESET.BODY` | Hands all 7 values back to the platform default. From then on they follow the platform whenever it changes, until you set your own again. | คืนทั้ง 7 ค่ากลับไปใช้ค่ากลางของแพลตฟอร์ม จากนั้นค่าจะเปลี่ยนตามค่ากลางทุกครั้งที่ค่ากลางเปลี่ยน จนกว่าคุณจะตั้งเองอีกครั้ง | 将全部 7 项交还平台默认值。此后每当平台默认值变动，您的设置也随之变动，直到您再次自行设置。 |
| `RESET.BTN` | Use the platform default | ใช้ค่ากลางของแพลตฟอร์ม | 改用平台默认值 |
| `RESET.RUNNING` | Handing back... | กำลังคืนค่า... | 正在交还… |
| `RESET.CONFIRM_TITLE` | Hand the policy back to the platform? | คืนนโยบายกลับไปใช้ค่ากลาง? | 要把政策交还给平台吗？ |
| `RESET.CONFIRM_TEXT` | Your 7 values are removed and the platform default takes over immediately, for every trip you sell. Bookings already made are not changed. | ค่าทั้ง 7 ของคุณจะถูกลบ และค่ากลางของแพลตฟอร์มจะมีผลทันทีกับทุกเที่ยวที่คุณขาย การจองที่เกิดขึ้นแล้วจะไม่ถูกเปลี่ยน | 您的 7 项设置将被移除，平台默认值立即对您售出的所有班次生效。已完成的订单不受影响。 |
| `RESET.CONFIRM_BTN` | Use the platform default | ใช้ค่ากลางของแพลตฟอร์ม | 改用平台默认值 |
| `RESET.DONE` | The platform default is in use again. | กลับมาใช้ค่ากลางของแพลตฟอร์มแล้ว | 已恢复使用平台默认值。 |
| `RESET.FAILED` | Could not hand the policy back. Nothing was changed. | คืนนโยบายกลับไม่สำเร็จ ยังไม่มีการเปลี่ยนแปลงใด ๆ | 交还政策失败，未做任何更改。 |

### 9.4 Reused, **not** re-authored (all verified in `en.json`)

`ADMIN.COMMON.LOADING` (:565) · `ADMIN.COMMON.SAVE` (:586) · `ADMIN.COMMON.SAVING` (:587) ·
`ADMIN.COMMON.CANCEL` (:585) · `ADMIN.VALIDATION.REQUIRED` (:599) · `ADMIN.VALIDATION.WHOLE_NUMBER` (:611) ·
`ADMIN.VALIDATION.INTEGER_RANGE` (:614) · `ADMIN.VALIDATION.SERVER_FIELD_ERROR` (:606) ·
`ADMIN.VALIDATION.FORM_INVALID` (:610) · `ADMIN.MESSAGES.UPDATED` (:621) · `ADMIN.MESSAGES.SAVE_FAILED` (:623) ·
`ADMIN.SYSTEM_SETTINGS.UNSAVED_CHANGES_{TITLE,TEXT,CONFIRM,CANCEL}` (:1737-1740).

No `DECIMAL_RANGE`-style key is needed — §4.2's whole-percent input means all seven fields are
integers and `INTEGER_RANGE` covers every one.

---

## 10. Accessibility — must pass light **and** dark (brief requirement 6)

`override-cancel-modal.component.spec.ts` carries 6 WCAG contrast specs that mount the component
inside a real `.admin-shell.is-dark` and compute ratios with `getComputedStyle`
(verified at `:474`; helpers in `src/app/testing/contrast.ts` — `rgba`, `fgOf`, `effectiveBg`
compositing walk, `contrast`, `AA_NORMAL_TEXT = 4.5`, `AA_LARGE_TEXT = 3.0`). The same measurement
is required of everything this card introduces.

Elements that must be measured in **both** themes, each with its own `it()` (a validator/element
covering several reasons needs one test per reason):

1. `app-config-source-badge` `.is-neutral` — text on the badge's own fill.
2. `app-config-source-badge` `.is-info` — same.
3. The takeover warning — `--admin-warning-bg` + `--admin-warning-text` **together on one element**.
4. `.admin-error` messages (per-field and cross-field) on `.admin-card`.
5. The persistent `SAVE_REJECTED` banner.
6. `small.admin-muted` helper text on `.admin-card` — the ratio `override-cancel-modal` already
   proved is easy to get wrong (its `dt`/`dd` pair).

**Never verify dark mode by eye** — design-system §2.4.0. Use `effectiveBg` so a translucent ancestor
does not flatter the number, and if any new colour is introduced it needs an `.admin-shell.is-dark`
value or a `DARK_EXEMPT` entry in `scripts/check-admin-theme-tokens.mjs`. This design introduces **no
new token** precisely to keep that surface small.

Other a11y requirements:

- `aria-describedby` binds the helper id always and the error id only while invalid
  (`booking-policy-config-page.component.ts:174-177`) — an error element must not be announced before
  it exists.
- Every error element is `role="alert"`.
- Cross-field hints are `role="alert"` and live in `.admin-form-field.full` inside the group they
  constrain, so they are read after the fields they are about.
- Focus moves to the first invalid control on a failed submit — the deliberate difference
  `booking-policy-config-page.component.ts:32-38` records versus reminder-config, extended to 7 refs.
- The badge is not colour-only: it carries text plus `SOURCE.ARIA`.

---

## 11. Files the frontend must touch

### 11.1 New

| File | Notes |
|---|---|
| `src/app/modules/admin/pages/cancel-reschedule-policy-config/cancel-reschedule-policy-config-page.component.ts` | smart page |
| `…/cancel-reschedule-policy-config-page.component.html` | §3 layout |
| `…/cancel-reschedule-policy-config-page.component.scss` | `:host { display: block }` (OBRS-775 host-box rule, `parcel-share-config-page.component.scss:4-6`) + the takeover-warning chip-pair block |
| `…/cancel-reschedule-policy-config-page.component.spec.ts` | incl. the 12 contrast specs (6 elements × 2 themes) |
| `…/cancel-reschedule-policy-config.store.ts` (+ `.spec.ts`) | `parcel-share-config.store.{ts,spec.ts}` shape |
| `…/cancel-reschedule-policy-config-page.validators.ts` (+ `.spec.ts`) | the 3 cross-field validators, one test per reason |
| `…/config-source-badge/config-source-badge.component.{ts,html,scss}` | dumb, `@Input() overridden: boolean` |

### 11.2 Edited — the settings tab

| File | Change |
|---|---|
| `src/app/modules/admin/pages/system-settings/system-settings-tabs.ts` | +1 entry at index 5 (§1) + its import |
| `src/app/modules/admin/pages/system-settings/system-settings-page.component.spec.ts:66-91` | `+ 'cancel-reschedule-policy': ['owner']` in `ROLES_BEFORE_OBRS_702` |
| `src/app/modules/admin/admin.module.ts` | import (`:79` block) + `declarations` (`:489` block) for **both** new components |
| `src/app/services/admin/admin-api.service.ts` | 3 methods after `:2364`; 2 interfaces after `:2522` |
| `public/i18n/{en,th,zh}.json` | §9.1 (`:527` area), §9.2 (`:1716-1722` area), §9.3 (new block near `:1660`) |
| `src/app/modules/admin-shell-tab-strip-wrap.spec.ts` | `TAB_LABELS` +1 (`:25-31`) |

### 11.3 Edited — the five hardcoded constants (SPEC §7.3, all five re-verified by grep on this worktree)

| # | Declaration | Value | Consumers (measured) |
|---|---|---|---|
| 1 | `src/app/shared/interfaces/my-booking.interface.ts:257` `RESCHEDULE_WINDOW_HOURS` | 2 | `my-bookings.component.ts:14,485` · `reschedule-dialog.component.ts:17,477` |
| 2 | `src/app/shared/interfaces/reschedule.interface.ts:111` `RESCHEDULE_MAX_DAYS_AHEAD` | 60 | `reschedule-dialog.component.ts:25,481` · `cancel-booking-modal.component.ts:19,83` |
| 3 | `…/bookings/override-cancel-modal/override-cancel-modal.component.ts:72` `CANCEL_WINDOW_HOURS` (module-private) | 2 | `:205` only |
| 4 | `src/app/shared/interfaces/change-seat.interface.ts:68` `CHANGE_SEAT_WINDOW_HOURS` | **4 — wrong** | `my-bookings.component.ts:20,538` |
| 5 | `src/app/shared/interfaces/change-stop.interface.ts:69` `CHANGE_STOP_WINDOW_HOURS` | **4 — wrong** | `my-bookings.component.ts:21,584` |

The doc-comments at `my-booking.interface.ts:246-256` and `reschedule.interface.ts:100-111` both name
**OBRS-699** as the card that removes them and both call themselves *"⚠️ DUPLICATE OF BACKEND STATE"*
(read verbatim). **The comments go with the constants** — leaving a stale "OBRS-699 will fix this"
comment behind a shipped fix is the DEV-GOTCHAS:69 defect family.

`my-bookings.component.ts:500-502` and `:554-555` already record the 4h-vs-2h drift in prose; those
paragraphs go too, since #4 and #5 collapse onto `reschedule_window_hours` = **2**.

**Blast radius: 4 component files** — `my-bookings.component.ts` (3 of 5),
`reschedule-dialog.component.ts` (2), `cancel-booking-modal.component.ts` (1),
`override-cancel-modal.component.ts` (1, self-contained).

### 11.4 ⛔ Where the customer surfaces get their numbers — and the one open dependency

SPEC §7.5 + D-4 are binding and they cut against the obvious shortcut:

- The owner endpoint this card adds feeds **the settings tab only**. A customer is not an owner and
  can never call `/api/private/owner/configs/**`.
- **The public `/api/cancellation-policy` is NOT the answer either**, even though it is already wired
  (`src/app/services/cancellation-policy/cancellation-policy.service.ts:56-65`; DTO at `:23-41`,
  read — it carries exactly `cancelWindowHours`, `earlyWindowHours`, `refundRateEarly`,
  `refundRateLate`, `manualRefundDueDays`). Those are **platform** values (SPEC §0.3), so using them
  would show every operator's staff the platform window regardless of whose trip the booking rides
  on — the very defect this card exists to remove.
- **FE must not derive any of these numbers client-side** (SPEC §7.5, verbatim).

⇒ each surface reads its number from the per-booking response it **already consumes**:

| Surface | Number | Source |
|---|---|---|
| `override-cancel-modal.component.ts:205` | cancel window | prefer the existing absolute **`cancellationDeadline`** on `CancellationPolicyRespDto` (SPEC §7.5: `CancellationService.java:123` computes it as `earliestDeparture.minusHours(cancelWindowHours)`) — an absolute instant beats an hours constant and is owner-correct with no new field |
| `reschedule-dialog.component.ts:477,481` (date-picker bounds, built **before** any estimate call) | `rescheduleWindowHours`, `rescheduleMaxDaysAhead` | **BE dependency, D-4** — filled into an existing per-booking DTO |
| `my-bookings.component.ts:485,538,584` (list-level eligibility for reschedule / change seat / change stop) | `rescheduleWindowHours` | **BE dependency, D-4** — same key drives all three (`ChangeSeatService.java:328`, `ChangeStopService.java:336`, quoted from SPEC §7.3, **NOT VERIFIED** — backend files, not opened by me) |
| `cancel-booking-modal.component.ts:83` | `rescheduleMaxDaysAhead` | **BE dependency, D-4** |

> ⚠️ **OPEN DEPENDENCY — FE is blocked on this and must not guess.** SPEC §3 specifies the *owner
> config* contract only. It does **not** name which per-booking DTO gains `rescheduleWindowHours` /
> `rescheduleMaxDaysAhead`, nor the field names. D-4 locks the *approach* ("fill an existing
> per-booking DTO", precedent `CancellationPolicyRespDto.manualRefundDueDays`) but not the target.
> **Backend must publish the exact DTO + field names before the FE touches constants 1, 2, 4, 5.**
> Inventing them here would be a UX doc dictating an API contract.

**AC-3 fallbacks (SPEC §7.4): exactly one per number, equal to the backend default —
cancel-window `2`, reschedule-window `2` (⚠ *not* 4 — constants #4 and #5 collapse onto this), and
max-days-ahead `60`.** A fallback stricter than the real policy hides sellable inventory silently.

### 11.5 e2e — the gate lane, not `ng test` (SPEC §7.6; e2e files **NOT VERIFIED** by me)

`npm run e2e:gate` is the merge gate and nothing local runs it. `playwright.gate.config.ts:258` maps
every non-localhost host to `NOTFOUND`, so **any unstubbed policy fetch dies hard** and an "eligible"
arm silently renders ineligible — vacuous, not red. Per SPEC §7.6, the FE must in the same commit:

- add the new route to `e2e/tests/route-smoke.spec.ts`;
- add a policy stub to `e2e/tests/obrs-813-cancel-offers-reschedule.spec.ts` (named the single most
  likely breakage) and `e2e/tests/obrs-942-non-manual-cancel.spec.ts`;
- expect churn in `obrs-702-capture.spec.ts`, `obrs-775-geometry.spec.ts`, `obrs-1308-capture.spec.ts`,
  `obrs-1331-capture.spec.ts` (8th tab changes every tab-strip screenshot);
- leave `e2e/tests/obrs-627-refund-policy.spec.ts` **exactly as it is** — it stubs deliberately
  non-shipped values so it can detect a regression to a hardcoded fallback.

---

## 12. Design-system conformance

**Reused patterns.** `admin-page-intro` / `admin-card` + `admin-card-head` / `admin-form-grid` /
`admin-form-field(.full)` / `admin-field` (§5 pill) / `admin-form-label` / `admin-required` /
`admin-error` / `admin-muted` / `admin-skeleton--sm`; `app-admin-refresh-hint`
(`admin-refresh-hint.component.ts:11`); `.admin-status.is-neutral` (`admin-theme.scss:1766`) and
`.is-info` (`:1750`) from the §2.4 status legend; `AlertService.success/warning/error/confirm`
(`alert.service.ts:77/110/82/133`) — **never `Swal.fire()` directly**; `AdminCollectionStore` SWR
contract; `confirmDiscardUnsavedSettings` (`unsaved-settings-prompt.ts:24-39`);
`integerRangeValidator`; `errorKey`/`errorParams`/`describedBy`/`focusFirstInvalidControl`
(`booking-policy-config-page.component.ts:152-177, 208-216`); the chip-pair-on-one-element warning
block (`parcel-share-config-page.component.scss:12-19`, §2.4.0).

**New patterns — three, each with its justification and its locking spec.**

1. **`app-config-source-badge` — a per-field "platform default vs your setting" indicator.** No such
   pattern exists (Explore grep over `docs/design-system.md` for `default|Override|inherit` found
   only the dropdown "no pre-seeded default" rule and CSS overrides — nothing about inheritance
   display). Justification: without it the owner cannot tell inherited from owned, which is the
   documented OBRS-730 failure this card exists to prevent. It introduces **no new token** (reuses
   two legend entries) and no new hue. *Locking spec:* `config-source-badge.component.spec.ts` +
   the 2 contrast `it()`s in §10; if it is reused, promote it to `docs/design-system.md` §2.4 as a
   state-indicator row.
2. **A page-level "use the platform default" (DELETE) affordance.** SPEC §7.0(b) measured that no
   reset control exists anywhere in the admin UI. Justification: the DELETE endpoint is new and
   nothing else in the app un-sets a config. Constrained to existing idioms — secondary
   `admin-btn`, `AlertService.confirm()` in the `REPAIR.CONFIRM_*` shape, inline persistent failure
   text. *Locking spec:* the reset arm of the page spec (confirm-cancel does nothing; success leaves
   the form pristine; failure renders `RESET.FAILED` and leaves values untouched).
3. **A persistent server-rejection banner alongside the existing error toast.** Every other admin
   form shows the toast only. Justification: **D-2** requires a server-error surface for a
   cross-field rejection the client hint cannot always pre-empt, and a toast that has faded leaves
   the owner with a form that refused to save and no reason on screen. *Locking spec:* a page-spec
   case asserting the banner survives the toast and clears on the next `valueChanges`.

**Confirm.**
- **Selects:** none on this page ⇒ the `app-admin-dropdown` contract (placeholder-header, no
  pre-seeded default, §3.1) is not engaged. No other dropdown is introduced.
- **One primary per screen:** exactly one `admin-btn-primary` — Save. Reset is secondary and lives
  outside the form; there is no third button.
- **Tokens, not raw hex:** every colour is a `var(--admin-*)`; no new token, no `#` literal.
- **Single title surface:** the tab supplies `labelKey` + `subtitleKey` only; the page header comes
  from the route `data` generated at `admin.module.ts:314-318`. The component renders no page `<h1>`.
- **i18n:** every user-facing string has a key, and every key in §9 is authored in **en / th / zh**.
  No number is written into a translation string (the OBRS-564 rule quoted in
  `cancellation-policy.service.ts:20-22`: *"a policy number a customer reads is NEVER hardcoded in a
  translation file"*).

---

## 13. What this document deliberately does not decide

- **The per-booking DTO field names for the customer surfaces** — §11.4, BE's to publish under D-4.
- **Whether `manual_refund_due_days` becomes owner-configurable** — closed by **D-1**: it stays
  platform, it is not one of the seven, and this tab must not show it.
- **Unifying `*Overridden` / `*Configured`** — §0.1, a separate card.

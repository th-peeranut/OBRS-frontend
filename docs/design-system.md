# OBRS Frontend — Design System

> **Status:** governed source of truth. This file is **read before any UI work** by
> `obrs-ux` (designs against it), `obrs-frontend` (builds against it), and
> `obrs-scrutinize` (reviews against the rubric in §11). It exists to stop the
> recurring one-line UX hotfixes: each papercut becomes a **token, a component
> contract, or a locking spec** here — once — so the next change physically can't
> reintroduce it.

This is a **contract**, not a style inventory. Where it says MUST, a reviewer should
block a violation and (where noted) a spec test should fail CI.

---

## 0. How this document is used

- **`obrs-ux`** references the tokens/components/contracts below instead of
  re-deciding cosmetics per feature. Any **new** pattern (a control, a color role, a
  layout that isn't here) needs an explicit one-line justification in the UX spec —
  see §12.
- **`obrs-frontend`** builds only with the canonical components and tokens. **No raw
  hex, no inline color, no hand-rolled dropdown.** Reuse the shared primitive.
- **`obrs-scrutinize`** runs the §11 rubric against the diff. Cosmetic drift (off-palette
  color, wrong button role, dropdown without a placeholder, second copy of a title)
  is a finding even when the logic is correct.
- **`obrs-reporter`** promotes a UI papercut that recurs 2+ times into a **rule here
  (plus a locking spec)** — not just a prose note in `CORE.md`.

---

## 1. Current reality & known debt (read this first)

The app does **not** yet have one palette. Three "primary" colors coexist and the
brand green is untokenized:

| Source | Token / value | Where it's used |
|---|---|---|
| `src/styles/variables.scss` | `$primary-blue: #4bc2f7`, `$secondary-blue: #4069b8`, `$text-primary: #4069b8` | SCSS partials, older components |
| `src/styles/admin-theme.scss` | `--accent: #4dbeef`, `--accent-strong: #006687`, `--accent-contrast: #fff` | admin shell, `.admin-btn-primary`, admin dropdowns |
| raw Bootstrap | `#0d6efd` (btn-primary), `btn-outline-primary` | staff module (e.g. Create Schedule **Confirm**, walk-in actions) |
| **untokenized** | the **forest green** on the staff "Sell" button and "Walk-in Sales" heading | staff sell flow — **not a token; must be promoted (§13)** |

The visible symptoms in the Create Schedule modal alone: the **Confirm** button is
Bootstrap blue `#0d6efd`, the **calendar** button is a different blue, the **Sell**
button is green, and the date/time fields are **pill-shaped** while the dropdowns are
**square-cornered**. Four unrelated decisions on one screen.

> **The rule going forward (§2–§5) is the target.** Don't mass-rewrite existing
> screens to chase it — but **every new or touched control MUST use the canonical
> token/component/role below**, and §13 tracks the consolidation debt.

---

## 2. Design tokens

> **The full value catalog is [`design-tokens.md`](./design-tokens.md)** — the concrete
> color, **type, spacing, radius, elevation, and motion** scales (seeded in
> `variables.scss`). This section defines the *color roles*; that file is the lookup
> table for every scale. New/touched code references a token there, never a raw px/hex.

**Rule:** components reference **tokens**, never raw hex. SCSS uses the
`variables.scss` `$vars`; runtime-themed surfaces (admin/dark) use the
`--accent*` CSS custom properties so light/dark switch for free.

### 2.1 Canonical semantic roles

These are the *meanings* every UI must map to. The concrete values are being
consolidated (§13); use the **role**, and if the role has no token yet, add one
rather than inlining a hex.

| Role | Meaning | Current binding |
|---|---|---|
| `brand` | the shell's primary identity color (**per-shell**, §2.3) | customer `$brand-customer`; admin `var(--accent)`; staff shell-layout green |
| `accent` | interactive/affordance color on themed shells | `--accent` / `--accent-strong` |
| `surface` | page & card background | `$primary-white`, `--surface*` |
| `text` | body text | `$text-black`, `$text-softblack` |
| `muted` | secondary/placeholder text | `$text-lightgrey` |
| `danger` | destructive / error | SCSS `$text-red: #cb393a`; admin runtime `--admin-danger-bg` / `--admin-danger-text` / `--admin-danger-border` |
| `border` | hairlines, input borders | `$primary-grey` |

### 2.4 Status/state color token inventory (the "status table")

Every `.admin-status.is-*` role in the codebase, so a new status color can be
checked for a collision against the **full** legend (§11 rubric), not just the
token it's copied from:

| Class | Tokens | Meaning | Notes |
|---|---|---|---|
| `.is-success` | `--admin-success-bg` / `--admin-success-text` | resolved / positive | name is historical — resolves to **blue**, not green (§13 debt). |
| `.is-warning` | `--admin-warning-bg` / `--admin-warning-text` | needs attention | |
| `.is-danger` | `--admin-danger-bg` / `--admin-danger-text` | rejected / error | also the §2.1 `danger` role's runtime binding. |
| `.is-accepted` | `--admin-accepted-bg` / `--admin-accepted-text` | accepted (usability reports) | green. |
| `.is-info` | `--admin-inreview-bg` / `--admin-inreview-text` | in-review | neutral **blue-grey**; light bg + dark text. **Has a dark-mode override** (OBRS-256, `admin-theme.scss:240-243`, inverts to bg `#29323d`/text `#c7d3de`, ≈8.6:1) — this row previously (incorrectly) said "no dark-mode override"; corrected during OBRS-424 review after the stale claim was cited as evidence in that card's UX spec. |
| `.is-owner-accepted` | `--admin-owner-accepted-bg` / `--admin-owner-accepted-text` | `owner_accepted` usability-report status (OBRS-527) — the owner-screened stage that sits BETWEEN `in_review` and `accepted` (platform adoption) | **teal/mint** — a new hue (none of the seven existing statuses were free): reusing `.is-info` would blend into `in_review`, reusing `.is-accepted` would make the chip indistinguishable from the status whose whole point is now being separate. Light bg `#b8f2e6` / dark text `#003d33` ≈9.85:1; **has a dark-mode override** (`--admin-owner-accepted-bg: #1b3b35` / `--admin-owner-accepted-text: #9fedde`, ≈9.07:1) — a one-sided override is the exact OBRS-86 bug (text-only override on an unchanged bg gave ~1.3:1), so both sides change together in each theme. Also splits the WS badge count that used to be keyed on `acceptedReportCount`: the admin sidebar badge now counts `owner_accepted`, and `accepted` is in nobody's badge. |
| `.is-neutral` | `--admin-neutral-bg` / `--admin-neutral-text` | inactive/unset state (e.g. boarding-list "Not boarded", OBRS-130) | plain **grey** (no blue cast) — distinct from `.is-info`'s blue-grey; light bg + dark text. **Has a dark-mode override** (OBRS-100, `admin-theme.scss:211-214`, inverts to bg `#333b42`/text `#cdd8df`) — same correction as `.is-info` above. |
| `.is-delayed` | `--admin-delayed-bg` / `--admin-delayed-text` | schedule ETA-delayed indicator (boarding-list trip header, OBRS-272) | **violet** — a schedule-level DERIVED state (off `delayedDepartureDateTime`, never a status code; `status` stays `scheduled`), so it needs its own role rather than reusing `.is-info`(departed)/`.is-success`(arrived)/`.is-neutral`(scheduled)/`.is-warning`(reserved — also the resolved `theme-admin` accent, §11). **Has a dark-mode override** since OBRS-520 (`--admin-delayed-bg: #3b2f5c` / `--admin-delayed-text: #ddd6fe`, ≈8.7:1) — this row previously said "no dark-mode override, same self-contained-chip reasoning as `.is-accepted`", which was wrong: `#ede9fe` is a *near-white* lavender, not a saturated pastel, and it pixel-sampled as the lightest chip on the whole dark shell (rgb(237,233,254)). It takes the same recessed dark violet as `.is-duplicate`, whose light values it already shares by PO decision. |
| `.is-duplicate` | `--admin-duplicate-bg` / `--admin-duplicate-text` | `duplicate` usability-report status (OBRS-376) | **violet** — same light-mode values as `.is-delayed` but a distinct token (PO decision, 2026-07-16): `duplicate` originally reused `.is-neutral`, colliding with OBRS-378's `dismissed` (both rendered as identical grey chips), and `.is-delayed` was ruled out as a reuse target because it's semantically the unrelated "trip delayed" pill. **Unlike `.is-delayed`, this ONE HAS a dark-mode override** (`--admin-duplicate-bg: #3b2f5c` / `--admin-duplicate-text: #ddd6fe`, ≈8.7:1) — `.is-delayed` skipping it renders as a near-white lavender blob on the dark shell, the exact OBRS-100 bug; don't copy that gap for new violet tokens. |

#### 2.4.0 Chip tokens vs surface tokens — and why "no new hex" is not "dark-safe" (OBRS-520)

The `*-bg`/`*-text` pairs above are **chip** tokens: a light fill with dark text
on it, read as a unit. They are legible on the dark shell without an override —
pixel-sampled on the real dark admin page: success 6.75:1, warning 7.44:1,
danger 7.24:1, accepted 9.77:1.

A **surface** token is different: a colour used as standalone text, an icon, or
a border directly on `--admin-surface-card`. A chip's `*-text` value is chosen to
sit on its own light `*-bg`, so reusing it as a surface colour puts dark ink on a
dark card. That is a separate role and it gets its own token:

| Surface role | Token | Light | Dark |
|---|---|---|---|
| danger foreground (`.admin-btn-danger`, `.admin-required`, inline errors) | `--admin-danger-fg` | `#93000a` | `#ffb4ab` |
| danger recessed fill (danger hover states) | `--admin-danger-surface` | `#ffdad6` | `#4a1512` |
| success foreground (the usability-reports "notified" pill) | `--admin-success-fg` | `#154c85` | `#a8c8ff` |

**The trap this section exists to close.** The `.admin-btn-danger` row above used
to say it "composes the existing tokens (**no new hex**)", and that was read as
"therefore it is safe in dark mode". Those are different properties. A `var()`
that resolves to exactly one light-toned value in both themes introduces no new
hex *and* is broken in dark mode. Measured before OBRS-520, `.admin-btn-danger`
rendered `#93000a` on `#1d2226` at **1.71:1** — the "Un-board" and "Reject"
labels were effectively invisible — and every `.admin-required` asterisk across
19 admin forms with them.

**Rules**

- Using a colour as standalone text/icon/border on the shell? Reach for a
  `*-fg` token, never a chip's `*-text`.
- Adding an `--admin-*` token? It needs an `.admin-shell.is-dark` value, or an
  entry in `DARK_EXEMPT` in `scripts/check-admin-theme-tokens.mjs` stating why
  it does not. `npm run test:theme-tokens` fails otherwise, in CI before
  `npm ci`. It also fails on a `var(--admin-*)` pointing at a token nobody ever
  declared — CSS treats that as a silent fallback, which is how a sticky table
  header stayed a bright band on the dark archive table.
- **Never verify dark mode by eye.** Sample the rendered pixel and compute the
  contrast ratio. Both bugs above survived multiple reviews by people looking
  right at them.

#### 2.4.1 `parcel_delivery_status` → token mapping (OBRS-305)

The 7 renderable `parcel_delivery_status` slugs (`ParcelDeliveryListItemDto`/
`ParcelTrackRespDto.deliveryStatus`, staff delivery-list + public tracking
timeline) map 1:1 onto the 7 tokens above — **no new hex, no forked chip
look**. Resolved by `parcelDeliveryStatusChip()`
(`shared/lib/parcel-delivery-status.ts`), locked by
`parcel-delivery-status.spec.ts` (every slug maps to a distinct token):

| `parcel_delivery_status` slug | Token | Rationale |
|---|---|---|
| `accepted` | `.is-accepted` | first positive state after intake — green, matches its existing "accepted" meaning. |
| `in_transit` | `.is-warning` | active/in-progress, reads as "needs attention" while en route. |
| `arrived_notified` | `.is-info` | waiting-for-pickup, matches `.is-info`'s existing "in-review"/waiting semantics. |
| `collected` | `.is-success` | terminal positive outcome — `.is-success` resolves to **blue** (its own note above: "historical name, resolves to blue not green"), i.e. "resolved", not literally "succeeded in green". |
| `left_at_stop` | `.is-delayed` | an off-happy-path exception state — reuses the existing distinct violet rather than inventing an 8th token. |
| `unclaimed_returned` | `.is-neutral` | a dormant/inactive terminal outcome, matching `.is-neutral`'s existing "inactive/unset" meaning. |
| `rejected` | `.is-danger` | terminal negative outcome. |

(`created` — the 8th seeded lookup slug — is never surfaced as a chip:
consigned intake sets the row directly to `accepted`.)

### 2.3 Brand is per-shell (decision)

The app has **three shell identities** and intentionally keeps them distinct —
customer (cyan-blue), admin (teal `--accent`), staff (green). There is **one
semantic token per shell**, defined in `src/styles/variables.scss`:
- `$brand-customer` / `$brand-customer-strong` — the home/booking blue.
- **admin** — runtime-themed via `var(--accent)` / `var(--accent-strong)` in
  `admin-theme.scss` (so light/dark switch for free); not a SCSS var.
- **staff** — the brand green lives in the staff shell-layout topbar; pending
  extraction into `$brand-staff` (§13).

New/touched UI references the shell token; raw hexes migrate incrementally (§13).
This was a deliberate choice over one global brand color — the shells are meant to
look different.

### 2.2 Rules

- **MUST NOT** introduce a new raw hex in a component. If you need a color, it must
  resolve to a token in §2.1 (add the token if missing).
- **MUST NOT** use `btn-primary` / `#0d6efd` Bootstrap defaults on themed surfaces —
  they bypass the accent system and produce the third-blue problem above.
- Dark mode comes from the `--accent*` CSS vars + `dark-theme.scss`. A new colored
  element MUST read a CSS var (or a token that maps to one), **never** a fixed hex,
  or it won't theme. (See `CORE.md`: "Never put an element's only styling inside a
  `@media` block" — same failure class.)

---

## 3. Form controls — canonical components

There are **three** dropdown implementations in the repo. Pick the canonical one;
do not add a fourth.

| Need | Canonical component | Notes |
|---|---|---|
| **Select / dropdown in a form** | **`app-admin-dropdown`** | The only one with the placeholder-header contract (§3.1). Inputs: `[options]`, `[placeholder]`, `valueKey`, `labelKey`, `[icon]`, `[disabled]`, `formControlName`. |
| Localized name dropdown (stop/route pickers with i18n labels) | `app-dropdown-obrs` | Legacy Bootstrap dropdown; **no placeholder support**. Keep only where it's already wired for localized names; do **not** use for new plain selects. **Exception (OBRS-433):** a plain select on a **customer-shell** page that must not import `AdminSharedModule`/`AdminModule` (a lazy-module-boundary violation — `app-admin-dropdown` lives there and its styling depends on `--admin-*` vars only defined inside `.admin-shell`) may use the standalone `app-dropdown-obrs` instead, imported directly into that feature module's `imports`. See `docs/adr/0023-my-reports-customer-page.md`. Still **not** for a new select inside an admin/staff page — `app-admin-dropdown` remains canonical there. |
| Date / time | PrimeNG `p-calendar` (date), the existing time control | Keep the **single input shape** (§5). |
| **Export trigger** (download current view as CSV/Excel) | **`app-export-button`** (`src/app/shared/components/export-button/`) | Presentational, self-sufficient: `[datasetKey]`, `[requiredRole]`, `[params]`. Renders a **secondary** `admin-btn` (never `admin-btn-primary` — exporting is a supporting action) that opens a `p-menu[popup]` with CSV / Excel items, following the trigger-popup pattern already used by `walk-in-trip-browser.component` (not `p-splitButton` — unused in this codebase). **Hidden** (not disabled) when `authService.hasAnyRole([requiredRole])` is false, matching the staff-layout/navbar role-gating precedent. Success is silent (the browser download is the confirmation); errors branch on `ExportError.errorCode` via `AlertService.error()`. See `docs/adr/0001-export-button-component.md`. |
| **Rich-content popup** (a trigger button opening a stateful, scrollable list — not a flat command menu) | **`p-overlayPanel`** | First used by `app-notification-bell` (OBRS-317) for the owner/staff notification inbox: `p-menu[popup]`'s `MenuItem[]` shape can't carry a row's message/timestamp/read-state/click-handler, so `p-overlayPanel` hosts the dumb `app-notification-inbox-panel` (→ `app-notification-inbox-row`) instead, keeping the same trigger-toggles-a-floating-panel model as the `app-export-button` precedent above (`appendTo="body"`). Use `p-menu[popup]` when the popup is a flat list of commands; reach for `p-overlayPanel` when it's a stateful list. See `docs/adr/0018-notification-inbox-overlay-panel-and-root-service-state.md`. |

### 3.1 Dropdown contract (this is what the Vehicle Type bug violated)

Every form select **MUST**:

1. Use `app-admin-dropdown` (or a component that renders the same placeholder-header).
2. Pass a `[placeholder]` equal to the **field's name** (e.g. `Vehicle Type`,
   `Vehicle`, `Driver`) — the component renders it as the top, selectable header row
   with a checkmark when nothing is chosen.
3. **MUST NOT pre-seed a default value** unless the spec explicitly requires one.
   The control starts **empty**, showing the placeholder, so the user makes an
   explicit choice — identical to every sibling field.

> **Anti-pattern (Figure 2):** the Create Schedule modal seeded `vehicleType` with
> `van` while `vehicle` and `driver` started empty. Result: Vehicle Type showed
> `Van` in its resting state while its siblings showed their field-name placeholder —
> inconsistent, and it let the user "confirm" a value they never picked. **All
> selects in a form behave identically: placeholder first, no silent default.**

**Lock:** a spec asserting that, on open with no selection, each select renders its
placeholder (not an option value). See §12 for the locking-spec convention.

---

## 4. Buttons — semantic roles

One color = one meaning. Never pick a button color for looks.

| Role | When | Class |
|---|---|---|
| **Primary** | the one main action of a screen/modal (Confirm, Save, Sell) | the **brand** filled button (`admin-btn admin-btn-primary` on admin; the brand-green primary on staff) |
| **Secondary** | cancel / back / dismiss | outlined or neutral (`admin-btn`, or `btn-outline-*`) |
| **Destructive** | delete / irreversible | `danger` role (red `$text-red`); on an admin/staff themed surface use **`.admin-btn.admin-btn-danger`** (OBRS-130) — composes `--admin-danger-fg`/`--admin-danger-border`, same shape as `.admin-btn`, just themed to read as destructive. Used for a row-level reversal action (e.g. boarding-list "Un-board") that isn't a full delete-confirm. |
| **Link** | inline navigation, low emphasis | `btn btn-link p-0` |

**Rules**

- A modal has **exactly one** primary button. In Create Schedule, **Confirm** is the
  primary (brand), **Back** is secondary — they MUST NOT be two unrelated blues/greys
  picked ad hoc.
- The same action wears the same color everywhere. "Sell" and "Confirm" are both the
  brand primary; they should not be green in one place and `#0d6efd` blue in another.
- **MUST NOT** use raw `btn-primary` (Bootstrap blue) on a themed surface — use the
  brand/accent primary.

---

## 5. Inputs, shape, spacing

- **One input shape: pill (decision).** Single-line form controls are fully-rounded
  **pills** (`border-radius: 999px`), matching the date/time fields. `app-admin-dropdown`
  renders its trigger as a pill (`admin-dropdown.component.scss`) and the shared
  `.admin-field` base (every admin `<input>` — text/date/number/email/…) is now a pill
  too (`admin-theme.scss`, OBRS-122). New/touched single-line inputs use the pill shape —
  don't reintroduce a square-cornered control. (Open dropdown *menus*/popups stay
  rounded-rectangles; only the resting control is a pill.)
- **Multi-line exception: textareas use a moderate radius, not the pill.** A literal
  999px pill reads wrong on a tall multi-line box, so `textarea.admin-field` uses a
  **moderate 12px** radius (`admin-theme.scss`, OBRS-122). This is the one deliberate
  departure from the pill; keep single-line and multi-line consistent to these two.
- Hairlines/dividers use `$primary-grey` via the shared `hr` rule (already global in
  `styles.scss`) — don't redefine border colors per component.
- Font is **Sarabun** globally (set on `*` in `styles.scss`); icons are **Material
  Symbols Outlined** (`.material-symbols-outlined`). Don't import a second icon set.

---

## 6. Modals / dialogs

- Open **optimistically** — never gate a modal's visibility on an awaited fetch
  (SIT GETs are ~2s; the user sees a blank). Flip the open flag synchronously,
  populate from the row in hand, patch detail into pristine-only controls when it
  arrives. (`CORE.md`: "Modals/overlays must open optimistically.")
- Alerts go through **`AlertService`**, never `Swal.fire()` directly. The global
  `.swal2-container { z-index: 1400 }` rule keeps alerts above modals — don't
  override it downward.
- **Non-blocking transient hints** (e.g. validation guidance where the user should
  stay in place) use `AlertService.toast()`. Components must not call
  `Swal.mixin()` or `Swal.fire()` directly.
- One primary button (§4); close affordance top-right (`×`) **and** a secondary
  Back/Cancel.

---

## 7. Page titles — single surface

The admin/staff shell topbar renders the **route-driven** title (and subtitle) from
route `data.titleKey` / `subtitleKey`. A page **MUST NOT** also render its own
`<h2>/<h3>` title — that paints the title twice, often with different wording.
New shell pages set the route keys and render **neither** in the body.
(`CORE.md` #29/#42/#43.) **Lock with a spec** asserting the heading renders once.

---

## 8. Home navigation — the logo is the Home link

The logo itself is the Home link: `<a routerLink="/home"><img logo></a>` with an
`aria-label`. There is **no separate Home button/menu item** on any shell. On a
colored bar the logo renders white via `filter: brightness(0) invert(1)`.
(`CORE.md`, user decisions #15/#16/#20.) **Lock with a spec** asserting the logo
links to `/home` and no separate `a[href="/home"]` Home button exists.

---

## 9. Internationalization

- **No hardcoded user-facing strings** — every label/message has an ngx-translate key.
- A new key **MUST land in all three locale files** — `public/i18n/en.json`,
  `th.json`, `zh.json` — in the **same commit**. A missing key renders as its raw
  string with no build error; `COMMON.*` is highest-risk. (`CORE.md`, Confirmed.)
- Error handling branches on **`error.error.errorCode`** (stable UPPER_SNAKE), never
  the localized `message`. (`CORE.md`.)

---

## 10. Shared component conventions

- **Print-only content: CDK Portal teleport-to-body, not a `visibility:hidden`
  reveal rule (OBRS-100).** When a screen needs to print one element in
  isolation from surrounding shell chrome, teleport a dedicated
  `<ng-template>` to a `document.body` child via `DomPortalOutlet` +
  `TemplatePortal` (`@angular/cdk/portal`), then gate visibility with a
  marker class: `.the-marker-class { display:none; } @media print { body >
  *:not(.the-marker-class) { display:none !important } .the-marker-class {
  display:block !important } }`. This is immune to ancestor
  `position`/`overflow`/`transform` (which breaks the classic
  `visibility:hidden` + absolutely-positioned-reveal trick) and to
  body-appended overlays (`p-menu[appendTo="body"]`, SweetAlert2's
  `.swal2-container`) that a shell-scoped selector can't reach. Teardown must
  be idempotent and bound to both `afterprint` **and** `ngOnDestroy` (a
  leaked body node otherwise survives navigating away mid-print-dialog). See
  `docs/adr/0015-boarding-manifest-print-isolation.md` (first usage,
  `BoardingListComponent.printManifest()`) — reuse this pattern for the next
  print feature rather than reinventing the reveal-rule idiom.
- **Don't fork or mutate a shared component's contract** to add a per-surface need —
  extend it with an optional, null-default `@Input()` so existing call sites stay
  byte-identical. (`CORE.md`: seat components, walk-in reuse.) **Seat-attribute
  badges (OBRS-362)** follow this exact precedent: `seatAttributes: Record<string,
  ('WHEELCHAIR'|'EXTRA_LEGROOM')[]> | null = null` on `passenger-seat-van`/`-bus`,
  same shape as `seatOwners`/`seatGenders`.
- **Seat-label normalization: one canonical util, `shared/lib/seat-label.ts`
  (`normalizeSeatNumber`)** (OBRS-362). A UI seat label (`'A1'`, `'B12'`) is matched
  against the backend's plain-numeric seat keys by stripping non-digit characters —
  this used to be forked (a private copy in `passenger-seat-van.component.ts`, an
  inline regex in `PassengerInfoComponent`). New seat-label matching reuses this
  util; don't re-derive the regex.
- **Don't mutate `@Input` arrays** — derive via a getter returning a new array;
  `.push()/.sort()/.splice()` on an `@Input` ref corrupts the parent. (`CORE.md`,
  Confirmed.)
- The shared lang switcher's **visual** scope has churned repeatedly: to make every
  surface adopt a per-context style, **promote the `:host-context()` override to the
  default and delete the override** — don't bolt on more per-surface rules. A restyle
  that reverses a prior explicit scope decision needs a previewed confirmation first.
  (`CORE.md`, Confirmed.)

---

## 11. Review rubric (for `obrs-scrutinize` and the verify glance)

Run this against any UI diff (and during the live-verify screenshot glance):

- [ ] **Color:** no new raw hex; colors map to §2 tokens/roles. No `btn-primary`/
      `#0d6efd` on a themed surface. New colored elements read a CSS var (theme-safe).
- [ ] **Dropdowns:** every form select uses `app-admin-dropdown`, passes a
      field-name `[placeholder]`, and does **not** pre-seed a default (§3.1).
- [ ] **Buttons:** exactly one primary per modal/screen; role↔color correct (§4).
- [ ] **Shape:** inputs use the single shape; no new pill-vs-rect mix (§5).
- [ ] **Title:** rendered once, by the shell topbar, not duplicated in the body (§7).
- [ ] **Home:** logo is the only Home link; no separate Home button (§8).
- [ ] **i18n:** no hardcoded strings; new keys in en/th/zh; errors branch on
      `errorCode` (§9).
- [ ] **Shared components:** extended (optional null-default input), not forked;
      `@Input` arrays not mutated (§10).
- [ ] **Status/state colors:** a new status/state pill color must read **distinctly**
      against the **active accent variant's** resolved values (the admin shell is always
      `theme-admin`, so `--accent*` resolves to *orange* there — it collides with
      `new`/`is-warning`) **and** against the full existing status legend — never trust a
      token's literal name (`--admin-success-*` is actually blue). Use a **fixed
      `--admin-*` status token**, not the runtime `--accent*`; light bg + dark text with
      **no one-sided dark-mode override** (overriding only the text kills contrast on the
      unchanged bg). (OBRS-86 accent-collision + dark-contrast bugs.)
- [ ] **Optimistic-open modals:** every control the modal patches after the fetch/cache
      resolves is **pristine-guarded** (dirty-flag reset at the top of open, seeded on the
      cache-hit branch, gated by the stale-response guard) so a late response can't clobber
      an in-progress edit. (§6; CORE.md — recurred 3× on the usability-report detail modal.)
- [ ] **New pattern?** justified in the UX spec and locked with a spec test (§12).

---

## 12. Adding or changing a pattern

A genuinely new pattern (a control, a color role, a layout not covered here) is
allowed, but:

1. **Justify it** in the UX spec in one line — why an existing pattern doesn't fit.
2. **Add it here** (a row in the relevant table) so the next feature reuses it.
3. **Lock it with a spec** when it encodes a rule that's been broken before — the
   ones marked "Lock with a spec" above are non-negotiable. Pattern: a `*.spec.ts`
   assertion that fails on the old (wrong) behavior and passes on the new, e.g.
   `expect(host.querySelectorAll('a[href="/home"]').length).toBe(1)` for §8.

This is how a recurring papercut stops recurring: it graduates from a hotfix to an
enforced rule with a test behind it.

**New pattern log:**

- **Full-section empty state** (OBRS-209, `AppVehicleMaintenancePanelComponent`):
  when a `200 + []` response's empty state deserves more than one muted `<tr>`,
  render a centered icon/title/body block that **replaces the whole table
  section** (not a zero-row table under a banner), styled only with
  `var(--admin-muted)` / `var(--admin-text)` (see `vehicle-maintenance-panel.component.scss`).
  Reuse this for the next list page that needs a richer empty state instead of
  inventing a third variant.

- **Right-aligned money columns** (OBRS-231, `EodSalesReportPageComponent`): a scoped
  `.eod-report-money { text-align: right; font-variant-numeric: tabular-nums; }` class for
  a table whose whole purpose is cash-drawer reconciliation, where columns of numbers need
  to scan/sum visually — left-aligned text (the existing convention, e.g. Reports' Revenue
  column) defeats that. No new color/token; apply only to genuinely money-shaped columns
  (not counts like Bookings/Tickets). Reuse this class for the next reconciliation-style
  table instead of inventing a second right-align convention.

- **Bespoke static-token button on a dark-theme-exempt surface** (OBRS-269,
  `.ticket-nav-btn` on the e-ticket card/page's "Navigate to pickup" button): the
  e-ticket paper is intentionally exempt from dark theming (`dark-theme.scss` §15
  paper look), so this button is styled with fixed `$primary-blue`/`$primary-white`
  SCSS tokens — never the runtime `--accent*` vars — matching the sibling
  `.ticket-leg-heading`/`.trip-estimate` static-token rules already on that surface.
  Reuse this precedent for the next control added to the ticket paper instead of
  reaching for a themed token that won't apply there.

- **Expandable per-row detail** (OBRS-231, `EodSalesReportPageComponent`'s `byMethod`
  breakdown): no accordion-row precedent existed in any admin table. Built from two
  already-themed primitives, not a new control — `.admin-icon-btn` +
  `.material-symbols-outlined` (`expand_more`/`expand_less`, the same chevron-button shape
  as pagination controls) toggles a sibling `<tr>` with `[attr.colspan]` spanning every
  column, containing a `flex-wrap` list of chips on `var(--admin-surface-soft)` (the same
  "structural, not data" surface already used for `admin-table thead`). Collapsed by
  default per row; expand state is page-local (not store state) and is cleared whenever
  the underlying row array's identity changes (a new fetch), so it never survives a filter
  change. Reuse this pattern for the next table that needs row-level drill-down instead of
  introducing a modal or a second navigation level. **Reused as-is** for
  `RefundVoidReportPageComponent`'s cancelled/expired breakdown (OBRS-98), keyed by
  `row.date` instead of a synthetic salesperson id.

- **Compact inline info-hint button** (OBRS-98, `RefundVoidReportPageComponent`'s
  Refunded card): a KPI card needed a short definitional tooltip ("gross, before fees")
  next to its muted label. The canonical `.admin-icon-btn` is 36px, sized for a table's
  chevron toggle — too large inline next to a small label. Rather than a new control,
  `.refund-void-info-btn` is a **size-only** override (22px, smaller icon glyph) of
  `.admin-icon-btn`, keeping its color/hover tokens untouched; exposed via `[title]` +
  `[attr.aria-label]` (no new tooltip component). Reuse this modifier for the next
  KPI-card hint instead of introducing a tooltip directive.

- **Notification bell + `p-overlayPanel` inbox, root-service state** (OBRS-317,
  `AppNotificationBellComponent`): the owner/staff topbar's notification bell opens a
  `p-overlayPanel` (§3's new "Rich-content popup" row) hosting a stateful list —
  `AppNotificationInboxPanelComponent` → `AppNotificationInboxRowComponent` — rather
  than `p-menu[popup]`'s flat `MenuItem[]`. Its unread-count/list state lives in a
  root `NotificationInboxService` (plain `BehaviorSubject`s, no NgRx — NgRx here is
  scoped to the customer booking modules), mirroring `BadgeSocketService`'s
  idempotent-`connect()`/`count$` shape and `AdminCollectionStore`'s
  clear-on-logout-via-`authStatus$` pattern. The corner badge is a **position-only**
  modifier (`.notification-bell-badge`) of the existing `.admin-nav-badge` recipe —
  reused verbatim, not re-derived. See
  `docs/adr/0018-notification-inbox-overlay-panel-and-root-service-state.md`. Reuse
  `p-overlayPanel` for the next back-office popup that needs to host a stateful list,
  and the root-service shape for the next cross-cutting back-office signal.

- **`.admin-kpi-icon.is-danger`** (OBRS-98, `RefundVoidReportPageComponent`'s Voided
  card): completes the `is-success`/`is-warning` KPI-icon modifier set with the existing
  `--admin-danger-bg`/`--admin-danger-text` tokens (§2.4) — no new color, added to
  `admin-theme.scss` alongside its siblings rather than a page-local rule, so the next
  KPI card needing a danger tone doesn't re-derive it.

- **Mandatory notes rendered independent of `contentState`** (OBRS-98,
  `RefundVoidReportPageComponent`'s basis/partition notes): every prior report page
  (`ReportsPageComponent`, `EodSalesReportPageComponent`) gates its captions inside the
  loading/empty/data-only sections, so they disappear in the invalid-range/error states
  along with the table. This page's basis note ("bucketed by processed date, not booking
  date") and partition note ("Voided = Cancelled + Expired") are regulatory/definitional,
  not data-dependent, so they render **unconditionally** — no `*ngIf` on `contentState`
  at all. Reuse this only for a note that stays true regardless of whether the current
  fetch succeeded; a note that describes the *data* (like the basis captions above)
  should stay gated with its section.

- **OPEN-seating passenger-count card in place of a leg's seat map** (OBRS-323,
  `PassengerInfoFormComponent`): a schedule with `seatingMode: 'OPEN'` has no fixed
  seat to pick, so that leg's seat map/active-passenger-chip-row/leg-label are hidden
  and replaced with an inline count card — current count, "เหลือ X ที่นั่ง" (reusing
  the existing `SCHEDULE_BOOKING.SEAT_REMAIN`/`SEAT_UNIT` keys, not a duplicate), and
  +/- icon-buttons. The +/- markup and disabled-state visuals are reused from
  `DropdownObrsPassengerComponent`'s `.count-section` (same class names, scoped by
  Angular's default view encapsulation — no bleed), but bound to the
  `passengerData` FormArray directly via `addOpenSeatPassenger()`/
  `removeOpenSeatPassenger()`, not a `DropdownPassenger[]` — the two controls keep
  separate contracts. Each leg branches independently (`isOpenSeatingOutbound$`/
  `isOpenSeatingReturn$`), so a round trip can mix an OPEN outbound with an ASSIGNED
  return; the shared "Seat selection" card title/hint is dropped only when every leg
  on the booking is OPEN. See `docs/adr/0019-open-seating-passenger-count-card-per-leg-branch.md`.
  Reuse this pattern (the `openSeatCountCard` template + add/remove methods) for the
  next passenger-count stepper outside the home-page search filter, instead of
  reaching for `DropdownObrsPassengerComponent` (adult/kid-split,
  `ControlValueAccessor`-shaped — a different contract) or inventing a third one.

- **Inline `admin-modal-backdrop` dialog inside a `shared/` component** (OBRS-272,
  `BoardingListComponent`'s delay-ETA dialog): the first `*ngIf`-gated
  `.admin-modal-backdrop`/`.admin-modal` dialog owned by a component declared in
  `SharedModule` rather than a lazy feature module — same component-local-state
  pattern as every other admin modal (no separate component, no NgRx), just hosted
  somewhere new. This required moving `AdminModalBackdropDirective` from
  `AdminModule` into `SharedModule` (declare + export) so a `shared/` component can
  reach it without `SharedModule` reaching into a lazy feature module (a cycle,
  since `AdminModule`/`StaffModule` both already import `SharedModule`). See
  `docs/adr/0017-schedule-delay-control-and-modal-backdrop-relocation.md`. Reuse
  this precedent — directive lives in `SharedModule`, dialog markup stays inline —
  for the next `shared/`-component modal instead of re-litigating the module home.

- **Cross-shell reuse of `.admin-status.is-*` tokens on a customer-shell page**
  (OBRS-305, `ParcelTrackingPageComponent`'s status chip): the public parcel
  tracking page has no `.admin-shell` ancestor, so the `--admin-*-bg`/`-text`
  custom properties `.admin-status.is-*` reads (only ever defined inside
  `.admin-shell`, admin-theme.scss) would otherwise resolve to nothing. Rather
  than fork a second status-chip look for this one customer page, the
  component's own `:host` re-declares the SAME custom-property **values**
  already bound to those roles in `admin-theme.scss` (no new hex — see §2.4.1)
  scoped to this component instead of `.admin-shell`, and mirrors the existing
  `.admin-shell.is-dark` overrides under `:host-context(body.is-dark)` (this
  app's public dark-mode class, dark-theme.scss) instead of
  `.admin-shell.is-dark`. The `.admin-status.is-*` markup/classes themselves
  are reused byte-identical to the staff delivery-list. Reuse this re-scoping
  idiom for the next customer-shell surface that needs a staff/admin status
  chip rather than duplicating the token values into a new class name.

- **Phone-first sticky top/bottom bars around a scrollable `FormArray`** (OBRS-312,
  `InspectionPageComponent`): the driver weekly inspection form has no desktop
  precedent to follow — 23 rows scrolling under a phone viewport (375–414px) needed
  the vehicle/odometer/progress context and the single Submit action to survive the
  scroll. `position: sticky` (not `fixed`, so it stays inside the shell's own scroll
  container) on a top strip and a `bottom: 0` bar, both on `--admin-surface-card`
  (the card token — `--admin-surface`, the page-bg token, would blend into the
  background instead of reading as chrome). Each row carries `scroll-margin-top`
  matching the top strip's height so the incomplete-row `scrollIntoView()` highlight
  doesn't tuck the target under the sticky strip. Reuse this pattern for the next
  phone-first data-entry form with a long list and one persistent primary action.
  **Owner review correction (real screenshots), two follow-ups baked into the
  same pattern:**
  1. The shared shell topbar (`.admin-topbar`) is ALSO `position: sticky; top: 0`
     with a higher z-index — a strip that ALSO hardcodes `top: 0` renders directly
     underneath it, invisible, once actually scrolled (worst on a short/
     keyboard-squeezed viewport, where the topbar's wrapped title also grows
     taller). The strip must instead **measure the topbar's live rendered height**
     and bind its own `top` (and each row's `scroll-margin-top`) to that value,
     recomputed on resize/language change — never a second hardcoded `top: 0`
     sibling to an already-sticky shell element. This is a page-local fix (reading
     the shared topbar's height, not changing it) — see ADR 0023.
  2. The global "Report Issue" FAB (`position: fixed; bottom: 24px; right: 24px`)
     can sit on top of a page's own `bottom: 0` sticky bar. Reserve right-side
     padding on the bar (mirroring the FAB's own mobile breakpoint) so the
     bar's primary action never shares a tap target with the FAB, rather than
     touching the shared FAB component.

  The verdict toggle inside the form (2-segment OK/Needs-repair) is the one
  net-new visual. **Superseded design, corrected post-review:** it originally used
  PrimeNG's raw `p-selectButton`, hand-themed via `::ng-deep .p-highlight`, which
  left the UNSELECTED segments on PrimeNG's own white `.p-button` background —
  invisible as "correct" until a real dark-mode screenshot showed a wall of white
  boxes. Now two plain `.admin-btn` elements (`.inspection-verdict-btn`) — the SAME
  primitive `boarding-list.component.scss`'s Board/Un-board action already uses,
  so the unselected state gets dark-mode theming for free with zero rules (no
  `::ng-deep`, no dependency on PrimeNG's internal DOM order). The SELECTED state
  still reads the `--admin-success-*`/`--admin-danger-*` status tokens (§2.4) in
  light mode; in dark mode the pair is **inverted** (the `-text` token becomes the
  background, the `-bg` token becomes the foreground) — those tokens deliberately
  have no dark override at chip scale (§2.4's `.is-accepted` note), but a
  full-width button is not chip scale, and inverting preserves the exact same
  (already AA-passing) contrast ratio while avoiding both a new hex and a change
  to the shared token file. See
  `docs/adr/0023-weekly-vehicle-inspection-mobile-form-and-switchable-window-filter.md`.
  **Reuse `.admin-btn`-based hand-rolled toggles (not raw PrimeNG `p-button`/
  `p-selectButton`) for the next 2-or-3-segment choice control that needs
  per-segment semantic coloring** — PrimeNG's own button primitives have no
  dark-mode-aware base styling anywhere in this codebase.

- **Switchable time-window filter, not a hard query bound** (OBRS-312,
  `AppVehicleInspectionPanelComponent`'s pending-review filter): the owner
  inspection-history tab defaults to the current + previous Bangkok ISO week
  (`isWithinRecentIsoWeeksBangkok`, `shared/lib/inspection-week.ts`) with a
  client-side "Show all" toggle removing the window entirely — deliberately never a
  hard-bound backend query param. A rejected defect (owner decided it's not worth
  repairing) writes nothing, so it stays flagged pending forever, identically to a
  genuinely ignored one; the 2-week default lets the rejected case age out of the
  everyday view while "Show all" still surfaces the ignored one. A hard-bound query
  would make both cases disappear identically, defeating the indicator's purpose.
  Reuse this switchable-filter shape (not a query-param window) for the next
  "pending forever unless acted on" indicator.
- **Incremental "Load more" button for a low-volume customer-shell list**
  (OBRS-433, `MyReportsComponent`): the reporter's own usability-report list
  is low-volume/casual browsing, not a back-office table, so it does NOT use
  `app-admin-paginator` (the page-number control every admin list uses).
  Instead `MyReportsStore.loadMore()` fetches the next server page and
  APPENDS it to the cached content (never replaces, no page-number/back
  state) via `AdminCollectionStore.mutate()` — a subclass-only addition, the
  base class itself is unchanged. The button is the established
  `.btn-secondary` recipe (`$brand-customer-strong`, outlined — the
  account/my-bookings precedent), centered below the list, and hides once the
  cached page is the last page. See `docs/adr/0023-my-reports-customer-page.md`.
  Reuse this idiom for the next low-volume customer-shell list instead of
  reaching for `app-admin-paginator` or a NgRx slice.

- **Cross-shell status-chip reuse needs only ONE `:host` declaration per
  render tree, not per component** (OBRS-433, `MyReportsComponent` /
  `MyReportDetailModalComponent`): extends the `ParcelTrackingPageComponent`
  idiom (OBRS-305) above — because CSS custom properties inherit down the
  real DOM tree regardless of Angular's emulated view encapsulation, only the
  outermost customer-shell component needs to re-declare the 7
  `--admin-*-bg`/`-text` values at its `:host`; any DOM descendant (including
  a child component rendered via `*ngIf`, like the detail modal here) reads
  the inherited values for free and needs no copy of its own. See
  `docs/adr/0023-my-reports-customer-page.md`.

- **Move-up/move-down/move-to-top/move-to-bottom buttons as a list-reorder
  mechanism, in place of drag-and-drop** (OBRS-509, `InspectionItemsPageComponent`'s
  checklist-item reorder): no `cdkDrag`/`p-orderList`/`pReorderableRow` exists
  anywhere in this codebase, and a ~23-row admin table overflowing one
  viewport makes "scroll vs. drag" a real gesture conflict on tablet. Four
  `.admin-icon-btn` buttons per row give a one-step nudge and a one-click jump
  to either end; each is natively focusable/operable, so there's no separate
  keyboard/ARIA affordance to design on top. Paired with a monotonic
  per-request sequence number (`latestReorderSeq`) as the out-of-order-
  **response** guard for a no-debounce, immediate-PUT-per-click write, plus a
  `reorderPending` flag gating the page's `store.data$` subscription so an
  unrelated background emission can't clobber the just-clicked local order
  mid-flight. See `docs/adr/0025-inspection-items-admin-reorder-buttons-and-icon-only-retire-restore.md`.
  Reuse this shape for the next reorderable admin list instead of reaching
  for `cdkDrag`/`p-orderList` as a first instinct.

- **`.admin-icon-btn` Retire/Restore, no color, no chip on active rows, in
  place of a toggle** (OBRS-509, same page): completes the retire-not-delete
  pattern `.admin-btn-danger`'s §4 entry describes for a *destructive-reading*
  row action — here the row action is explicitly **not** meant to read as
  destructive (retiring is reversible and preserves history), so it uses the
  same already-measured-dark-safe `.admin-icon-btn` the Edit button beside it
  uses, with only the glyph (`visibility_off`/`visibility`) distinguishing
  it — no new token, no new `.is-dark` rule. Went through two rejected
  intermediate designs first (`p-inputSwitch`, then `.admin-btn-danger`/
  `.is-success`), both for the identical "no `.is-dark` override exists for
  this token" reason one level down — full writeup in the ADR above. Reuse
  `.admin-icon-btn` (not `p-inputSwitch`, not a color-modified `.admin-btn`)
  for the next "off but not deleted" row action.

- **CDK Portal print isolation reused for a second surface** (OBRS-305,
  `ParcelWaybillPageComponent.printWaybill()`): the exact
  `docs/adr/0015-boarding-manifest-print-isolation.md` recipe
  (`DomPortalOutlet`/`TemplatePortal` teleport to `document.body`, a
  `body.<feature>-printing` marker class gating a global `@media print` hide
  rule, idempotent teardown bound to both `afterprint` and `ngOnDestroy`) —
  copied with a new marker-class pair (`.parcel-waybill-print-portal` /
  `body.parcel-waybill-printing`) rather than reusing the boarding-manifest's
  marker classes (a shared marker would let a boarding-manifest print and a
  waybill print interfere if ever triggered concurrently). Reuse this idiom
  (new marker-class pair per print surface) for the next print feature.

- **Leaflet + MapTiler tiles as a second mapping stack, alongside `@angular/google-maps`**
  (OBRS-424, `FleetMapPanelComponent`): the only existing map component
  (`RouteMapPanelComponent`) is Google-specific and booking-coupled, and the
  pre-decided direction (OBRS-301, `IMPLEMENTATION_CHECKLIST.md`) commits
  Leaflet for the customer-facing layer 2 (OBRS-425/426) — building layer 1 on
  Google would force layer 2 to either pay or be rewritten, so layer 1 builds
  on the same stack layer 2 needs. The owner decided the tile provider is
  **MapTiler**, not raw OSM tiles — **not for cost** (both are ฿0 at this
  card's volume; Google Dynamic Maps' 10,000-free-load/month tier isn't close
  to being reached by a 6-vehicle staff tool), but because (a) it avoids the
  Google-vs-Leaflet fork above and (b) the existing `mapsApiKey` is
  referrer-restricted with a documented `localhost` failure mode that would
  have obstructed this card's own local QA. Two mapping libraries now coexist
  in the bundle (accepted — never used on the same page; Leaflet is materially
  smaller). The tile request URL is composed in one function
  (`fleetMapTileUrl(key)`); the MapTiler key itself is normal multi-file
  `environment.*.ts` plumbing (§4.3 of `UX-OBRS-424-fleet-live-map.md`),
  mirrored exactly off the existing `mapsApiKey` shape — including its
  empty-key degradation getter (`showMap` → `canShowMap`), since
  `environment.base.ts` ships an empty key by default and CI/fresh clones hit
  that path every time. Dark-mode tiles deliberately stay **light** in both
  themes, same precedent as the Google map (`dark-theme.scss:562-565`) — and
  that choice is a **prerequisite**, not incidental, for the marker-fill
  pattern below (marker colors have no dark override of their own; they're
  only legible because they always sit on a light tile). MapTiler's
  attribution terms require both MapTiler and OpenStreetMap credited with the
  link **visible** (not collapsed behind Leaflet's "i" toggle) — never disable
  `attributionControl`. The key is visible in tile request URLs in the browser
  network tab; that's inherent to client-side tile requests and is mitigated
  by domain restriction in the MapTiler dashboard, not by hiding it — don't
  flag it as a leak. See `docs/adr/0024-leaflet-fleet-live-map.md`. Reuse
  Leaflet+MapTiler (not `@angular/google-maps`, not raw OSM tiles) for the next
  internal/high-frequency map feature; if a future card wants dark tiles, add
  dark-mode overrides to `--admin-success-*`/`--admin-warning-*`/`--admin-danger-*`
  FIRST (they currently have none — see the `.is-success`/`.is-warning`/`.is-danger`
  rows in §2.4, which coexist safely with this pattern only because tiles stay
  light).

- **Ordered-ladder status resolver for booleans with a backend-documented
  implication relationship, not a flat per-flag lookup** (OBRS-424,
  `resolveFleetVehicleStatus()`, `shared/lib/fleet-vehicle-status.ts`): the
  fleet-position contract's four booleans aren't independent —
  `stale` is `true` whenever `positionKnown` is `false` (backend
  `FleetPositionService.java:47`), and `deviceOnline` is only meaningful once
  `positionKnown` is confirmed true (`:49`). The flat `Record`-lookup shape used
  by `parcel-delivery-status.ts` (one slug → one token) can't express that
  without checking flags in the wrong order — which silently renders every
  never-reported/not-tracked vehicle as a false "device offline" state (a
  correctness bug caught by `obrs-scrutinize`, not a cosmetic one). Instead, a
  single function evaluates checks **top to bottom, first match wins**, with
  the ordering dependency documented inline. Every consumer (map panel, side
  list) shares this ONE `resolveFleetVehicleStatus()` call, so they can never
  disagree about which state a given row is in; a second, separate derived
  predicate (`FLEET_STATUS_HAS_MARKER`) is read by the map panel ONLY, to
  decide marker eligibility — the side list has no notion of "has marker" at
  all, since it renders every vehicle regardless. Reuse this "ordered ladder,
  shared resolver, map-only marker predicate" shape for the next status
  derived from booleans with a documented implication relationship between
  them, instead of a flat lookup table.

- **Marker fill/halo from a status token's `-text`/`-bg` pair** (OBRS-424,
  `FleetMapPanelComponent`): a map pin needs one legible solid color, unlike a
  `.admin-status` chip's two-tone pill. Rather than a new hex, markers reuse the
  same `--admin-*-text`/`--admin-*-bg` CSS vars already bound to each status
  role (§2.4), assigning `-text` to the marker's fill and `-bg` to its halo —
  the same tokens, a different visual role. **Conditional, not unconditional:**
  legible in dark mode only because tiles stay light (see the Leaflet entry
  above) — `--admin-success-*`/`--admin-warning-*`/`--admin-danger-*` (the
  three tokens markers actually use) have no dark-mode override at all, unlike
  `--admin-neutral-*`/`--admin-inreview-*` (§2.4, corrected above). Reuse this
  fill/halo split for the next map-marker feature (OBRS-425/426) — and carry
  its light-tiles precondition forward with it, don't assume it "just works" on
  a different surface.

- **Leaflet + MapTiler extended to the first customer-facing map surface**
  (OBRS-426, `TripTrackPanelComponent` / `TripTrackMapComponent`, the
  my-bookings "where is my bus" tracker): the OBRS-424 entry above scoped its
  reuse instruction to the next *internal/high-frequency* map feature; this
  card is customer-facing and low-frequency, so it stands on its own
  justification rather than inheriting that one — see
  `docs/adr/0026-leaflet-customer-trip-map.md`. Two changes ride along:
  (1) the tile URL/attribution composer moves one level up, from
  `modules/staff/pages/fleet-map/fleet-map.constants.ts` to
  `shared/lib/map-tiles.ts` (`mapTileUrl()` / `MAP_TILE_ATTRIBUTION`), with
  the old names re-exported unchanged so OBRS-424 stays byte-identical;
  (2) the Leaflet marker itself uses its OWN CSS custom-property names
  (`--trip-track-marker-*`), never `--admin-*` directly — unlike the
  `.admin-status` CHIP re-declaration precedent (`ParcelTrackingPageComponent`
  below), a Leaflet marker's HTML is injected outside Angular's template
  compiler, so a future edit copying `FleetMapPanelComponent`'s marker code
  verbatim (reading `--admin-success-text` etc., which resolve to nothing
  outside `.admin-shell`) would fail invisibly — using distinct names with
  the SAME copied values, and asserting their absence in a unit test, closes
  that specific silent-failure class rather than merely re-declaring the
  admin names once more. The STALE marker (BR-11) swaps both the fill/halo
  variable NAMES and adds a dashed halo + 0.55 opacity — never merely an
  additive class on the live token. Reuse this "own token names, values
  copied, never `--admin-*` on Leaflet-injected marker HTML" pattern for the
  next map marker built for a customer-shell surface.

- **`lastFetchedAt$` on `AdminCollectionStore`** (OBRS-424,
  `admin-collection-store.ts`): every SWR-backed page needs an honest way to
  say "the backend call is failing, this is how old the shown data actually
  is" — distinct from any per-row staleness the payload itself might carry
  (conflating the two was flagged as the same category error the fleet-map
  card itself is designed to avoid for `stale` vs. `deviceOnline`). The base
  class had no such signal, and deriving one page-locally from `data$`'s
  replay-on-resubscribe (`BehaviorSubject`) would lie on re-entry after a long
  gap. Added once, additively (`lastFetchedAtSubject`, stamped in `run()`'s
  success branch only), so every existing subclass is unaffected and the next
  page needing a "data might be behind" banner doesn't re-derive it.

---

- **Opt-in `searchable` flag on a shared CVA dropdown, borderless embedded
  search input inside an already-open popup** (OBRS-562,
  `DropdownGroupObrsComponent`, `app-dropdown-group-obrs`): the 3 booking
  pages' origin/destination station pickers needed search/filter, but 1 of the
  component's 7 real instances (`parcel-trip-form`'s `scheduleId` picker) must
  keep rendering byte-identical to before. `@Input() searchable: boolean =
  false` (§10's "extend with an optional, false-default `@Input()`, not
  fork") — set `true` only on the 6 station pickers. The search box is a
  borderless input embedded in the already-open `.dropdown-menu` popup (same
  category as a PrimeNG internal filter box, §5's "one input shape: pill"
  standalone-control rule doesn't apply to it), sticky-positioned above the
  option list (`position: sticky; top: 0`) above a panel bounded by
  `max-height: 60vh; overflow-y: auto` — a sticky row means nothing without a
  bounded, scrollable list. That bound arrived independently in OBRS-561
  (which also covers `.dropdown-menu-border`, which 562 had missed); on merge,
  562 kept 561's landed rule rather than tightening it to its own
  `min(360px, 60vh)`. Query match is
  case-insensitive substring against the **same localized string `getValue()`
  renders**, precomputed once per `options`/language change into a
  `Map<option, searchKey>` — never a template getter (the component runs
  default CD, and `getValue()`'s multi-shape localization fallback chain is
  too expensive to re-run every tick). Reuses `SHARED.NO_CONTENT` for the
  zero-match state (no second i18n key). Not built on PrimeNG `p-dropdown
  [filter]` (already used by `/staff/sell`, a different CVA/binding contract)
  — see `docs/adr/0027-searchable-station-dropdown-extends-bespoke-cva.md`.
  Net simplification alongside the new feature: the component's previous
  custom outside-click listener (a second, desync-prone source of truth for
  `isDropdownOpen`) is deleted in favor of Bootstrap's own
  `shown.bs.dropdown`/`hidden.bs.dropdown` events, listened for on the
  **toggle button** specifically (Bootstrap fires them on `this._element`,
  the button — not the host, not `.dropdown-menu`). Reuse the `searchable`
  `@Input()` + precomputed-searchKey-Map shape for the next opt-in filter row
  on a shared CVA-style dropdown, instead of reaching for `p-dropdown
  [filter]` or forking a second component.

- **Transparent-background outline pill for a customer-shell repeatable
  quick-pick action** (OBRS-575, `RecentRoutesQuickPickComponent`'s
  `.recent-route-btn` on the Home search form): no existing component is "a
  repeatable, tap-to-prefill-two-fields button that isn't a dropdown option, a
  KPI hint, or an icon-only row action." `MyReportsComponent`'s `.btn-secondary`
  (OBRS-433) has the right **color recipe** (border + text
  `$brand-customer-strong`) but the wrong **background** — solid
  `$primary-white`, with no dark-mode override anywhere, which would repeat the
  "white box on a dark card" failure the design system already flags for
  `p-selectButton` (§12, OBRS-312) on this page's `.booking-card` (which DOES
  have a dark override, `$dk-bg-soft`, OBRS-217). Fix: background
  **`transparent`**, so it always inherits whatever the ancestor card
  background is in either theme. ⚠️ **Transparent background is necessary but
  NOT sufficient — this pattern still needs its own dark-mode block.** The
  card's first draft claimed *"zero new dark-mode CSS required, because there is
  nothing to override"*; that reasoned only about the **background** and left
  border + label at `$brand-customer-strong` (#4069b8), which measures
  **2.79:1** on `$dk-bg-soft` — below AA for text (4.5:1) **and** for a border
  (3:1). Exactly the OBRS-520 lesson: composing existing tokens with no new hex
  is not the same as dark-safe. `dark-theme.scss` §6 therefore repoints both to
  `$dk-accent` (7.4:1) and inverts hover onto `$dk-bg` instead of `$text-white`
  (white on `$dk-accent` is only 2.0:1).
  `border-radius: $radius-xl` matches this same
  page's `.btn-search` pill rather than `MyReportsComponent`'s `$radius-sm`.
  `min-height: 40px` (below `.btn-search`'s 52px — a secondary/optional action,
  not the page's primary). Light-mode hover/focus fills with
  `$brand-customer-strong` + white text — the standard outline-button inversion,
  no new token. Reuse this transparent-bg recipe **together with its dark block**
  (not `MyReportsComponent`'s white-bg recipe) for the next customer-shell
  repeatable chip/tag control.

## 13. Consolidation debt (tracked, not yet enforced retroactively)

These are the known fragmentations. Each should be closed by a future change that
promotes a value into a token and points existing call sites at it — **don't** big-bang
rewrite, but **do** resolve the relevant item whenever you touch a screen that hits it.

- [x] **Brand model decided: per-shell** (§2.3). Semantic tokens added in
      `variables.scss` (`$brand-customer*`); admin uses `var(--accent)`. The three
      "primary" colors are kept distinct **by design** — not unified into one.
- [x] **Raw `#0d6efd` (Bootstrap blue) repointed to the shell accent** (OBRS-122): the
      staff walk-in passenger-type tiles + trip-browser selection (`walk-in-center-panel`,
      `walk-in-trip-browser`) and the admin routes selected-row (`routes-page`) now use
      `var(--accent-strong)` / `var(--accent-soft)`, which cascade from `.admin-shell`
      (theme-staff = teal-green, theme-admin = orange) — theme-safe, no raw hex.
      **Still open:** non-admin `btn-primary` (Bootstrap blue) on staff/customer surfaces
      (sell, staff-schedules, my-bookings) — a per-template class swap,
      incremental "when you touch the file" work, not a sweep.
      **boarding-list closed** (OBRS-130): the row-level Board/Un-board actions now use
      `.admin-btn.admin-btn-small` / `.admin-btn.admin-btn-small.admin-btn-danger` instead
      of raw `btn-primary`/`btn-outline-secondary` — themed, no raw hex. Deliberately
      **not** `.admin-btn-primary`: a repeated per-row action isn't "the one main action
      of the screen" (§4), so it stays a neutral/danger row action, not a promoted primary.
- [x] **Admin danger hexes tokenized** (OBRS-122): `.admin-error` / `.admin-required`
      → `var(--admin-danger-text)`, `.admin-field.is-invalid` → new
      `--admin-danger-border` CSS var (both in `admin-theme.scss`) — the §2 `danger`
      role, runtime-themed, no raw hex.
- [x] **Staff brand color: carried by the runtime `theme-staff --accent*` tokens**
      (OBRS-122). The staff topbar/chrome moved to the shared `.admin-shell` with the
      teal-green `theme-staff` accent, so there is **no separate untokenized green hex**
      to extract into a `$brand-staff` SCSS var; the staff shell identity is the
      accent-variant system (like admin), consistent with §2.3. The Bootstrap `btn-success`
      green on the Sell / Walk-in actions is left as `btn-*` convergence debt (below),
      not a raw hex.
- [ ] **Converge dropdowns** on `app-admin-dropdown`; retire ad-hoc selects, keep
      `app-dropdown-obrs` only for localized-name pickers.
- [x] **One input shape done: pill** (§5, OBRS-122). `app-admin-dropdown` trigger and
      the shared `.admin-field` single-line base are `border-radius: 999px`; `textarea`
      is the moderate-12px multi-line exception. No square-vs-pill mix left on admin
      inputs.
- [x] **§3.1 locking specs added** (sell-page cold-open + admin create modals). §7/§8
      locks: verify/​add when next touching those shells.
- [x] **`.admin-status.is-neutral` + `.admin-btn-danger` added** (OBRS-130): a plain-grey
      `--admin-neutral-*` pair (distinct from the blue-grey `--admin-inreview-*`) for an
      "unset/inactive" state, and a danger-role button composed from the existing
      `--admin-danger-text`/`--admin-danger-border` tokens — both runtime-themed, no new
      hex. See §2.4 and §4.

---

_Seeded from `src/styles/variables.scss`, `src/styles/admin-theme.scss`, the
`app-admin-dropdown` contract, and the UI lessons in
`obrs-agent-office/.claude/agent-office/memory/CORE.md`._

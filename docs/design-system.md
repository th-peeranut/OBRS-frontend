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
| `.is-info` | `--admin-inreview-bg` / `--admin-inreview-text` | in-review | neutral **blue-grey**; light bg + dark text, no dark-mode override. |
| `.is-neutral` | `--admin-neutral-bg` / `--admin-neutral-text` | inactive/unset state (e.g. boarding-list "Not boarded", OBRS-130) | plain **grey** (no blue cast) — distinct from `.is-info`'s blue-grey; light bg + dark text, no dark-mode override. |

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
| Localized name dropdown (stop/route pickers with i18n labels) | `app-dropdown-obrs` | Legacy Bootstrap dropdown; **no placeholder support**. Keep only where it's already wired for localized names; do **not** use for new plain selects. |
| Date / time | PrimeNG `p-calendar` (date), the existing time control | Keep the **single input shape** (§5). |
| **Export trigger** (download current view as CSV/Excel) | **`app-export-button`** (`src/app/shared/components/export-button/`) | Presentational, self-sufficient: `[datasetKey]`, `[requiredRole]`, `[params]`. Renders a **secondary** `admin-btn` (never `admin-btn-primary` — exporting is a supporting action) that opens a `p-menu[popup]` with CSV / Excel items, following the trigger-popup pattern already used by `walk-in-trip-browser.component` (not `p-splitButton` — unused in this codebase). **Hidden** (not disabled) when `authService.hasAnyRole([requiredRole])` is false, matching the staff-layout/navbar role-gating precedent. Success is silent (the browser download is the confirmation); errors branch on `ExportError.errorCode` via `AlertService.error()`. See `docs/adr/0001-export-button-component.md`. |

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
| **Destructive** | delete / irreversible | `danger` role (red `$text-red`); on an admin/staff themed surface use **`.admin-btn.admin-btn-danger`** (OBRS-130) — composes the existing `--admin-danger-text`/`--admin-danger-border` tokens (no new hex), same shape as `.admin-btn`, just themed to read as destructive. Used for a row-level reversal action (e.g. boarding-list "Un-board") that isn't a full delete-confirm. |
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
  byte-identical. (`CORE.md`: seat components, walk-in reuse.)
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

---

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

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

**Rule:** components reference **tokens**, never raw hex. SCSS uses the
`variables.scss` `$vars`; runtime-themed surfaces (admin/dark) use the
`--accent*` CSS custom properties so light/dark switch for free.

### 2.1 Canonical semantic roles

These are the *meanings* every UI must map to. The concrete values are being
consolidated (§13); use the **role**, and if the role has no token yet, add one
rather than inlining a hex.

| Role | Meaning | Current binding |
|---|---|---|
| `brand` | the product's primary identity color | **staff green (to be tokenized, §13)** |
| `accent` | interactive/affordance color on themed shells | `--accent` / `--accent-strong` |
| `surface` | page & card background | `$primary-white`, `--surface*` |
| `text` | body text | `$text-black`, `$text-softblack` |
| `muted` | secondary/placeholder text | `$text-lightgrey` |
| `danger` | destructive / error | `$text-red: #cb393a` |
| `border` | hairlines, input borders | `$primary-grey` |

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
| **Destructive** | delete / irreversible | `danger` role (red `$text-red`) |
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

- **One input shape.** Pick the rounded-rectangle used by the dropdowns and apply it
  to text inputs, date, and time too. The pill-shaped date/time fields next to
  square dropdowns (Create Schedule) is a **drift** — new/touched inputs use the
  single shape; don't add a second.
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

---

## 13. Consolidation debt (tracked, not yet enforced retroactively)

These are the known fragmentations. Each should be closed by a future change that
promotes a value into a token and points existing call sites at it — **don't** big-bang
rewrite, but **do** resolve the relevant item whenever you touch a screen that hits it.

- [ ] **Unify the three "primary" blues** (`#4bc2f7` / `#4dbeef` / `#0d6efd`) into one
      accent token; repoint staff-module raw Bootstrap usages.
- [ ] **Tokenize the staff brand green** (Sell button / "Walk-in Sales" heading) — it's
      the actual brand color and currently exists only as inline values.
- [ ] **Converge dropdowns** on `app-admin-dropdown`; retire ad-hoc selects, keep
      `app-dropdown-obrs` only for localized-name pickers.
- [ ] **One input shape** — reconcile pill date/time vs rectangular dropdowns.
- [ ] Add the locking specs called out in §3.1, §7, §8.

---

_Seeded from `src/styles/variables.scss`, `src/styles/admin-theme.scss`, the
`app-admin-dropdown` contract, and the UI lessons in
`obrs-agent-office/.claude/agent-office/memory/CORE.md`._

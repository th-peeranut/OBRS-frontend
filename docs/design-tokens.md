# OBRS Frontend — Design Tokens

> **Reference catalog.** This is the concrete value layer — the color, type, spacing,
> radius, elevation, and motion scales. The **rules** for how to use them (semantic
> roles, the dropdown contract, one-primary-button, the review rubric) live in
> [`design-system.md`](./design-system.md); that document is the governance contract,
> this one is the lookup table it points at.

> **Status: seeded, migrating.** The scales below are **derived from an audit of the
> current codebase**, not invented — each row notes how many hardcoded occurrences it
> consolidates. The tokens are defined in `src/styles/variables.scss`; existing raw
> values migrate to them **incrementally, when you touch a file** (same policy as
> design-system §13 for colors — don't big-bang rewrite). New/touched code MUST use the
> token, not a fresh hardcoded value.

Audit baseline (2026-07-08): **330** hardcoded `font-size`, **187** `border-radius`,
**77** `box-shadow`, **76** `:hover`, plus hundreds of `padding`/`gap` values — none
tokenized before this document.

---

## 1. Color

Colors are already tokenized in `variables.scss` (and, for admin, as runtime CSS vars).
This section is the catalog; the **semantic roles** (which color means "brand" vs
"danger" vs "muted") are defined in design-system §2 — use the role, not the raw hex.

### 1.1 Palette (existing `variables.scss`)

| Token | Value | Role (design-system §2) |
|---|---|---|
| `$primary-blue` | `#4bc2f7` | customer brand (`$brand-customer`) |
| `$secondary-blue` | `#4069b8` | customer brand-strong |
| `$primary-black` | `#0d1525` | — |
| `$text-black` | `#353c44` | body text |
| `$text-softblack` | `#535968` | body text (soft) |
| `$text-lightblack` | `#757a86` | secondary text |
| `$text-lightgrey` | `#989ba4` | muted / placeholder |
| `$text-red` | `#cb393a` | **danger** |
| `$primary-grey` | `#babdc3` | border / hairline |
| `$primary-lightgrey` | `#dddee1` | border (light) |
| `$primary-white` | `#fff` | surface |
| admin `--accent` | `#4dbeef` | admin accent (CSS var, themable) |
| admin `--accent-strong` | `#006687` | admin accent-strong (CSS var) |
| staff brand green | _untokenized_ | staff brand — pending `$brand-staff` (§13) |

### 1.2 Interaction states (hover / active / focus) — **the current gap**

There is **no state-color token** today; the 76 `:hover` rules each darken/tint ad hoc.
Canonical rule going forward:

- **Hover:** shift the base color one step (e.g. `$primary-blue` → `$secondary-blue`), or
  overlay `rgba(0,0,0,.04)` on neutral surfaces. Do **not** invent a new hex.
- **Active/pressed:** the base color's `-strong` variant (customer `$secondary-blue`;
  admin `var(--accent-strong)`).
- **Focus:** the focus ring in §5 (`$shadow-focus`), never an outline color picked ad hoc.

---

## 2. Typography

Font family is **Sarabun** globally (set on `*` in `styles.scss`); icons are **Material
Symbols Outlined** (design-system §5). This section adds the **scale**, which did not
exist before.

### 2.1 Font size (consolidates 330 hardcoded values)

| Token | Value | rem | Replaces (hardcoded count) |
|---|---|---|---|
| `$font-size-xs` | `12px` | 0.75 | 11px(16), 12px(47) |
| `$font-size-sm` | `14px` | 0.875 | 13px(32), 14px(46) |
| `$font-size-base` | `16px` | 1.0 | 16px(54) — body default |
| `$font-size-md` | `18px` | 1.125 | 18px(44) |
| `$font-size-lg` | `20px` | 1.25 | 20px(12), 22px(5) |
| `$font-size-xl` | `24px` | 1.5 | 24px(6) |
| `$font-size-2xl` | `30px` | 1.875 | 30px(4) |

Off-scale one-offs (15px, 26px…) round to the nearest step when touched.

### 2.2 Font weight (consolidates `600×54, 700/bold×65, 500×18, 800×16, 400×11`)

| Token | Value |
|---|---|
| `$font-weight-regular` | `400` |
| `$font-weight-medium` | `500` |
| `$font-weight-semibold` | `600` |
| `$font-weight-bold` | `700` (use instead of the keyword `bold`) |
| `$font-weight-extrabold` | `800` |

### 2.3 Line height

| Token | Value | Use |
|---|---|---|
| `$line-height-tight` | `1.2` | headings, single-line labels |
| `$line-height-base` | `1.5` | body copy (target; current usage clusters at 1/1.2/1.8 — migrate toward 1.5) |
| `$line-height-relaxed` | `1.8` | long-form paragraphs |

---

## 3. Spacing (4px grid — consolidates the padding/gap sprawl)

Padding and gap already cluster on a 4px grid (`4,8,12,16,20,24,32,40` dominate). Use
these; the off-grid `6px`/`10px`/`14px` values migrate to the nearest step when touched.

| Token | Value | Typical use |
|---|---|---|
| `$space-3xs` | `4px` | icon gap, tight inline |
| `$space-2xs` | `8px` | control inner padding, small gaps |
| `$space-xs` | `12px` | default gap between items |
| `$space-sm` | `16px` | card/section inner padding (most common) |
| `$space-md` | `20px` | — |
| `$space-lg` | `24px` | section padding |
| `$space-xl` | `32px` | block spacing |
| `$space-2xl` | `40px` | page-section rhythm |

---

## 4. Radius (consolidates 187 hardcoded values)

| Token | Value | Use |
|---|---|---|
| `$radius-sm` | `8px` | chips, small controls (8px×31) |
| `$radius-md` | `12px` | cards, modals (10px×18, 12px×13) |
| `$radius-lg` | `16px` | large cards (16px×10) |
| `$radius-xl` | `24px` | hero/panel corners (24px×33) |
| `$radius-pill` | `999px` | **the single input shape** (design-system §5); pills, badges |
| `$radius-circle` | `50%` | avatars, icon buttons |

---

## 5. Elevation (shadows — consolidates 77 ad-hoc `box-shadow`s)

Two families exist: **focus rings** (accent-colored) and **drop shadows** (neutral).

| Token | Value | Use |
|---|---|---|
| `$shadow-focus` | `0 0 0 3px rgba(75,194,247,.2)` | focus ring on customer surfaces; admin uses `0 0 0 3px var(--accent-soft)` |
| `$shadow-sm` | `0 1px 2px rgba(13,21,37,.06)` | subtle lift (list rows, inputs) |
| `$shadow-md` | `0 4px 12px rgba(13,21,37,.08)` | cards, dropdown menus |
| `$shadow-lg` | `0 10px 22px rgba(0,102,135,.18)` | modals, popovers (grounded in existing value) |

Focus rings MUST use `$shadow-focus` / the admin accent variant, never a hand-picked
`rgba`. New colored shadows read a token or a CSS var so they theme (design-system §2.2).

---

## 6. Motion (consolidates `0.15s×20, 0.2s×20, 0.3s×11, …`)

| Token | Value | Use |
|---|---|---|
| `$duration-fast` | `150ms` | hover/color transitions, small state changes |
| `$duration-base` | `200ms` | the default — dropdowns, toggles |
| `$duration-slow` | `300ms` | panel/sidebar expand, larger movement |
| `$easing-standard` | `ease` | default enter/exit |
| `$easing-emphasized` | `cubic-bezier(.2,0,0,1)` | expressive expand/collapse |

**Rules code alone can't express (the reason a token doc exists):**
- Direction: overlays/menus animate **downward from their trigger**; the sidebar expands
  **rightward**. Keep motion consistent with the element's spatial origin.
- Respect reduced motion: gate non-essential transitions behind
  `@media (prefers-reduced-motion: no-preference)` when adding new ones.

---

## 7. How this relates to `design-system.md`

- **`design-system.md`** = the contract: semantic roles, component contracts (dropdown,
  buttons, modals), the review rubric, the "add a pattern" process. A reviewer blocks on it.
- **`design-tokens.md`** (this file) = the values those rules resolve to. When
  design-system says "use the brand primary" or "one input shape," the concrete token is here.
- Adding a **new token** follows the same discipline as a new pattern (design-system §12):
  justify it, add the row here, seed it in `variables.scss`. Don't inline a fresh hex/px.

_Scales derived from a 2026-07-08 audit of `src/**/*.scss`. Seeded in
`src/styles/variables.scss`; migration is incremental per design-system §13._

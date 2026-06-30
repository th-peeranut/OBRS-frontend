# Tech Debt: PrimeNG 17 → 18 Upgrade

**Status:** Not started · scoped 2026-06-30
**Current:** `primeng@17.18.15`, `@angular/core@18.1.5` (Angular supports PrimeNG 18 — not the blocker)
**Driver:** Move from the compiled `lara-light-blue/theme.css` model to the v18 runtime
**design-token engine** (`@primeng/themes` + `definePreset`), enabling token-based theming
and dark mode. Also unlocks clean mapping of external design-system tooling onto a PrimeNG preset.

## Surface area

41 `p-*` usages across 14 templates + ~70 `::ng-deep`/`.p-*` overrides across 10 SCSS files.
Two components carry almost all the risk; the rest are mechanical.

| Component | Count | v18 change |
|---|---|---|
| `p-calendar` | 14 | Deprecated → renamed `p-datepicker` |
| `p-tabView`/`p-tabPanel` | 3 + 8 | Deprecated → `Tabs`/`TabList`/`Tab`/`TabPanels`/`TabPanel` (structural rewrite) |
| `p-button` | 6 | Minor |
| `p-progressSpinner` | 3 | Minor |
| `p-selectButton` | 2 | Minor option API |
| `p-badge` | 2 | Minor |
| `p-menu`, `p-inputNumber`, `p-card` | 1 each | Minor |

## 🔴 `p-calendar` → `p-datepicker` (14 usages, 8 modules)

Rename `<p-calendar>` → `<p-datepicker>`; verify `[timeOnly]` / `hourFormat` time-only mode survives.

| Template | Lines | Notes |
|---|---|---|
| `home/components/home-booking/home-booking.component.html` | 58, 87 | customer booking funnel |
| `schedule-booking/components/schedule-booking-filter/schedule-booking-filter.component.html` | 55, 84 | booking search |
| `payment/components/payment-creditcard/payment-creditcard.component.html` | 78 | payment path |
| `admin/pages/schedules/schedules-page.component.html` | 67, 484, 503 | admin schedule CRUD |
| `staff/pages/staff-schedules/staff-schedules-page.component.html` | 102, 108 | incl. `[timeOnly]` |
| `staff/pages/sell/sell-page.component.html` | 93, 99 | staff sell; incl. `[timeOnly]` |
| `staff/components/walk-in-trip-browser/walk-in-trip-browser.component.html` | 7 | |
| `staff/components/trip-details-edit/trip-details-edit-form/trip-details-edit-form.component.html` | 27 | |

**Module swaps** (`CalendarModule` from `primeng/calendar` → `DatePickerModule` from `primeng/datepicker`):

- `staff/staff.module.ts:3,96`
- `admin/admin.module.ts:3,98`
- `schedule-booking/schedule-booking.module.ts:5,53`
- `payment/payment.module.ts:4,49`
- `home/home.module.ts:5,64`
- `passenger-info/passenger-info.module.ts:3,42` — ⚠️ STALE: imports CalendarModule but no `<p-calendar>` in its templates; verify and delete
- `review-schedule-booking/review-schedule-booking.module.ts:3,38` — ⚠️ STALE: same; verify and delete
- `staff/components/trip-details-edit/trip-details-edit-form/trip-details-edit-form.component.spec.ts:8,47` — test fixture

## 🔴 `p-tabView`/`p-tabPanel` → `Tabs` composition (11 usages, 2 modules)

Structural rewrite: `p-tabView` + `p-tabPanel` → `p-tabs` › `p-tablist`(`p-tab`) + `p-tabpanels`(`p-tabpanel value=…`).
Header text (`[header]`) moves out of the panel into `<p-tab>`.

| Template | Lines | Notes |
|---|---|---|
| `home/components/route-map/route-map-home/route-map-home.component.html` | tabView 68 (panels 70, 89); tabView 169 (panels 172, 199, 228) | two TabViews, 5 panels — route-map UI |
| `staff/components/walk-in-center-panel/walk-in-center-panel.component.html` | tabView 10 (panels 13, 163, 191) | uses `(onChange)="onTabChange($event.index)"` — handler must be reworked to the v18 `value` model |

**Module swaps** (`TabViewModule` from `primeng/tabview` → `TabsModule` from `primeng/tabs`):

- `staff/staff.module.ts:5,98`
- `home/home.module.ts:7,66`

## 🟡 Theming layer (the real work, ~70% of effort)

- `angular.json:48-49` and `137-138` — remove `lara-light-blue/theme.css` + `primeng.min.css`;
  install `@primeng/themes`; switch to `providePrimeNG({ theme: definePreset(Lara, …) })` in app config.
- ~70 `::ng-deep .p-*` overrides across 10 SCSS files target v17's compiled lara class structure.
  v18 regenerates component internals from CSS variables — a fraction will break and need re-pointing
  (e.g. `.p-calendar` → `.p-datepicker`, `.p-tabview` → `.p-tabs`) or replacing with token overrides.
- Re-validate the three custom shells + dark mode + runtime `--accent` vars
  (`styles/variables.scss`, `styles/admin-theme.scss`, `styles/dark-theme.scss`) against the new token base.
  See `docs/design-system.md`.

## Sequencing & effort

1. `ng update primeng@18` + run the official `@primeng/migrate-v18` schematic (auto-handles many renames,
   NOT the deep CSS or the TabView restructure).
2. Manual: TabView → Tabs rewrite (2 files) + rework `walk-in-center-panel` `onTabChange` to `value` model.
3. Verify all 14 datepicker conversions — booking + admin/staff schedule flows are revenue-critical.
4. Theming: wire `@primeng/themes` + preset, then triage the ~70 deep overrides shell-by-shell.
5. Regression: booking funnel, admin schedules, staff sell/walk-in, dark mode.

**Estimate:** ~2–4 focused days; ~70% in step 4 (theming/override triage), not the renames.
**Risk concentration:** booking & schedule date pickers (money paths) and the route-map tabs.

## Decision note

Don't upgrade *for* design-tooling fit. Upgrade if runtime/token-based theming and dark mode are wanted
anyway; cleaner external-tool (e.g. `definePreset`) mapping is then a side benefit.

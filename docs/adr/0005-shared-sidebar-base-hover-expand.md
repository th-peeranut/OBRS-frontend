# ADR 0005: Shared SidebarLayoutBaseComponent with Hover-Overlay/Pin Interaction

**Date:** 2026-06-26
**Status:** Accepted

## Context

The OBRS app has two layout shells (`AdminLayoutComponent`, `StaffLayoutComponent`) that share identical sidebar chrome. Before this change each component duplicated:
- Sidebar collapse state, localStorage, toggle logic
- Router-driven page title subscription
- Theme subscription
- Profile-menu close / document-click handler
- Escape key handler
- `userInitials` getter
- `onLogout` (parameterised only by one key difference)

Additionally, the original UX used a click-to-collapse chevron mounted on the topbar edge. QA discovered this was hard to hit on narrow viewports and created confusion about whether the sidebar was collapsing or navigating.

## Decision

**Extract a shared abstract directive base** (`SidebarLayoutBaseComponent`) that both layout components extend. All shared logic (hover-expand state, pin/localStorage, route subscription, theme, profile menu, keyboard handlers) lives in the base. Children supply only:
- `logoutSuccessKey`, `defaultTitleKey`, `defaultSubtitleKey` (abstract readonly fields)
- Feature-specific nav items, role checks, and per-component initial title keys

**Replace click-to-collapse with hover-to-expand + PIN:**
- Desktop resting state: 76px icon rail (always in flow — no layout reflow).
- Hover or keyboard focus into the sidebar → expands as an overlay (280px, z-index 30) that floats over the content without reflowing it.
- Mouse-leave collapses after a 120ms hover-intent delay (prevents flicker on cursor drift).
- A pin button (push_pin icon) at the top of the nav locks the sidebar open. When pinned, the sidebar switches from overlay mode to reserved-column mode (content reflows, sidebar is a permanent 280px flex child).
- localStorage key `obrs-sidebar-collapsed` is re-interpreted: `'0'` = pinned open, `'1'` or absent = icon rail. Existing users who toggled to "expanded" (stored `'0'`) transition to "pinned". Users who never toggled (absent) now see the hover-expand model.

## Rationale

1. **DRY**: ~100 lines of duplicated lifecycle and interaction code removed. Future changes to sidebar behaviour (e.g., keyboard shortcuts, new hover delay) require editing exactly one file.
2. **Better UX**: Hover-to-expand is a well-established pattern (VS Code, Notion, Linear) that avoids an explicit click to see labels. The pin affordance preserves power-user intent without sacrificing screen real estate for casual users.
3. **Predictable layout**: The 76px stub always reserves the column; the overlay never causes content jump. Only the explicit pin action causes a reflow (and persists it to localStorage).
4. **Angular 18 inject() in abstract base**: Constructor injection in abstract classes forces every child to declare a large `super(router, route, ...)` call that grows with every new dep. `inject()` fields in the `@Directive()` base cleanly express "these deps belong to the base." Children contribute nothing to DI unless they add their own unique deps. **Note:** this is a deliberate, localized exception to the repo's general "constructor DI" convention (CLAUDE.md) — it applies only to this shared abstract base, where constructor DI would otherwise force a brittle `super(...)` chain in both child layouts. Feature components continue to use constructor DI.

## Consequences

- Children must call `super.ngOnInit()` from their own `ngOnInit` (after building nav items).
- `isSidebarCollapsed` and `toggleSidebarCollapse()` are removed. Any code that referenced them outside these two components (e.g., a future feature test) will need updating.
- Existing users who had the sidebar expanded (stored `'0'`) are silently migrated to "pinned." This is intentional and low-risk (the previous UX and the new pinned state are visually equivalent).
- Mobile hamburger drawer (`is-sidebar-open`, `toggleSidebar`, `closeSidebar`) is unchanged.
- The `COLLAPSE_MENU` / `EXPAND_MENU` i18n keys are kept for forward-compatibility; they are no longer referenced in the active templates but may be re-used by a future mobile-specific affordance.

---

## Amendment: Switched to Always-Reserved-Column Model

**Date:** 2026-06-30
**Status:** Supersedes the hover-overlay + pin model above for desktop ≥1101px.

### Problem (what went wrong with the original decision)

The hover-overlay expansion (`position: absolute`, `z-index: 30`) caused the sidebar panel to float over the page content. On `/admin/dashboard`:
- The topbar page title ("Dashboard", z-index 35) rendered on top of the overlay panel.
- KPI cards and the Recent Bookings table bled through the translucent `rgba(…, 0.95)` panel background.
- The content column began at `76px` (the rail width) regardless of the expanded panel state — it was never reflowed, so the main area permanently lost space without the UI acknowledging it.

The root cause is that an overlay model (absolute positioning, translucency, z-index stacking) is fundamentally incompatible with wanting "no visible overlap" — any opacity < 1, or any content behind a z-index-elevated panel, produces the bleed.

### Decision (2026-06-30)

**Switch to an always-reserved-column model.** The sidebar is ALWAYS an in-flow `flex` child. Two states, toggled by an explicit click:

- **Expanded (default for new users):** `flex: 0 0 280px`, solid `var(--admin-surface-soft)` background, labels visible. `is-sidebar-pinned` class on `.admin-shell`. `localStorage('obrs-sidebar-collapsed') = '0'`.
- **Collapsed (icon rail):** `flex: 0 0 76px`, labels hidden. No `is-sidebar-pinned`. `localStorage = '1'`.

The hover-expand handlers (`onSidebarMouseEnter`, `onSidebarMouseLeave`, `onSidebarFocusIn`, `onSidebarFocusOut`), the collapse timer, and `isSidebarExpanded` are removed from `SidebarLayoutBaseComponent`. The `is-expanded` class is removed from both templates.

The formerly "pin" button becomes the expand/collapse toggle. Its icon changes from `push_pin` to `chevron_left` / `chevron_right`; its aria-label uses the existing `COLLAPSE_MENU` / `EXPAND_MENU` i18n keys (which were already present for forward-compat as noted above).

**Migration safety:** `'0'` = expanded and `'1'` = collapsed are unchanged. The only change is that an absent key now defaults to expanded (was: icon-rail). Old users who stored `'0'` (was "pinned") stay expanded. Old users who stored `'1'` stay on the rail. New users see expanded.

### Consequences of the amendment

- `isSidebarExpanded` field and all hover/focus handlers removed — no behaviour change risk (they only drove the overlay).
- The `[class.is-expanded]` template binding is gone from both layouts.
- CSS: `.admin-sidebar-panel` is now `position: relative` with `var(--admin-surface-soft)` (solid). The `.admin-sidebar.is-expanded` CSS rules are replaced with `.admin-shell.is-sidebar-pinned` rules (same selectors, same values — only the selector host changed).
- Tests: the mouseenter/mouseleave async timer test is removed; new tests assert the expanded-by-default state and the toggle/persist cycle.
- E2E: `e2e/tests/sidebar-hover-expand.spec.ts` rewritten to assert always-reserved-column ACs (no hover, content never overlapped, toggle visible in both states).
- Mobile (`≤1100px`) hamburger drawer: **unchanged**.

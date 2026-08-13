# ADR 0038 — `SystemSettingsTab.children?: Route[]`: the first sub-routed `/admin/settings` tab

**Date:** 2026-08-13
**Status:** Accepted
**Branch:** `ao/obrs-1308-notification-message-override`

## Context

OBRS-1308 adds owner-editable notification message overrides with admin
approval. Per the locked UX/system specs, this lands as ONE new entry in
`SYSTEM_SETTINGS_TABS` (`system-settings-tabs.ts`) — `path:
'notification-messages'` — consistent with AC9 and every prior tab added to
`/admin/settings` since OBRS-702.

Every existing tab is a single leaf page. This one is not: it needs FOUR
distinct screens under its own path —

| Path under `.../notification-messages/` | Component |
|---|---|
| `` (index) | owner list |
| `edit/:messageCode/:locale` | owner edit screen |
| `reviews` | admin queue |
| `reviews/:id` | admin review + approve/reject |

— and, critically, the admin review-detail screen is not only reached by
clicking through the queue: the notification bell's `NOTIF_MSG_OVERRIDE_PENDING`
row does `router.navigate(['/admin/settings/notification-messages/reviews', id])`
directly, from a completely different part of the shell. That rules out
internal `*ngSwitch` state driven by a query param (the pattern every other
multi-view admin page in this codebase uses) — a query param isn't a URL the
bell can deep-link into with `:id` as a real route segment, and a query-param
switch has no way to redirect/back-button/bookmark to a specific review the
way a real child route does.

## Decision: `children?: Route[]` on `SystemSettingsTab`, optional and generator-injected

```ts
export interface SystemSettingsTab {
  // ...existing fields unchanged...
  readonly children?: Route[];
}
```

`undefined` for every tab but this one. The route generator in
`admin.module.ts` (the `SYSTEM_SETTINGS_TABS.map(...)` building
`adminRoutes`'s `settings` children) spreads it in:

```ts
...(tab.children
  ? { children: tab.children.map((child) => ({ ...child, data: { ...data, ...child.data } })) }
  : {}),
```

Two things this buys, verified rather than assumed:

1. **Every existing tab's generated route is byte-identical to before.**
   `tab.children` is `undefined` for all six pre-existing tabs, so the spread
   produces `{}` — no `children` key appears on their route object at all,
   same as pre-OBRS-1308. AC9 holds: still one array entry, still no
   hand-added top-level route/redirect/tab-strip entry — this is the SAME
   generator, extended with an optional field, not a second generation path.

2. **The generator injects the parent tab's own `data` into each child**,
   rather than each child declaring its own `titleKey`/`subtitleKey`/
   `requiredRoles`. This is the part Scrutinize caught before this ADR was
   written, and it is the entire reason this decision needed a spec-level
   fix rather than shipping as "just add `children` to the interface":
   `SidebarLayoutBaseComponent.getDeepestRoute()`
   (`shared/sidebar-layout/sidebar-layout-base.component.ts:242-248`) walks
   `route.firstChild` to the bottom of the activated route tree and reads
   `snapshot.data['titleKey']`/`['subtitleKey']` off THAT deepest route —
   falling back to `ADMIN.PAGES.DEFAULT`/the shell's default subtitle when
   absent. Every tab before this one is a leaf, so "deepest activated route"
   and "the tab's own route" were always the same object, and the generator's
   own `data` (set once per tab) was what `getDeepestRoute()` read. The
   moment a tab gains children, that stops being true: the deepest activated
   route while a child is open is the CHILD, not the tab. A child route with
   no `data` of its own makes `getDeepestRoute()` fall through to the generic
   default — every notification-messages sub-page would have rendered
   "Admin Dashboard" (or whatever `ADMIN.PAGES.DEFAULT` resolves to) instead
   of "System Settings", silently contradicting this feature's own
   single-title-surface claim (design-system §7).

   Injecting the data in the generator, in ONE place, rather than
   hand-writing `data: { titleKey: 'ADMIN.PAGES.SYSTEM_SETTINGS', ... }` on
   each of the four child route literals in `system-settings-tabs.ts`, means
   a future child of this tab (or a future second sub-routed tab) cannot
   drift from its parent's title/subtitle/roles by a copy-paste slip — there
   is nowhere for that copy to live.

## Why not a query-param switch (the existing pattern for every other multi-view admin page)

Considered and rejected for the reason stated in Context: the bell's
click-through target is a real URL segment (`reviews/:id`), not app-internal
state. A query-param switch can express "which view is active" but not "which
review id, navigable to from outside the page's own render tree, with its own
back-button/bookmark semantics" without reinventing what Angular's router
children already do for free.

## Why not a second top-level route (bypassing `SYSTEM_SETTINGS_TABS` entirely)

Would violate AC9 directly (`no hand-added route/redirect/tab-strip entry`)
and reintroduce exactly the drift `SYSTEM_SETTINGS_TABS` was built (OBRS-702)
to eliminate: a route, a tab-strip entry and an access level that can each be
edited independently and quietly disagree. The whole point of the single
source array is that a new tab cannot ship routed-but-not-rendered,
rendered-but-unguarded, or access-drifted from its own guard — carving out an
exception for the one tab that happens to need children would defeat that for
exactly the case most likely to need it again.

## Access model — unchanged, not touched by this ADR

`notification-messages`' own `requiredRoles: ['admin', 'owner']` gates the
whole tab exactly like every other tab (matches the backend owner
controller — `hasRole('OWNER')`, which `ROLE_GRANTS` admits `ADMIN` into).
The `reviews`/`reviews/:id` children carry NO route-level guard narrower than
that — the admin-only approve/reject surface underneath them is gated at the
COMPONENT level (`authService.getRoles().includes('admin')`, the raw,
un-expanded read — see `auth.service.ts:287-305` vs. `hasAnyRole()`'s
`ROLE_GRANTS` expansion at 307-339), first line of `ngOnInit`, before any
store or API call. This ADR does not touch `ROLE_GRANTS`, `auth.guard.ts`, or
any access-gating mechanism — it is purely a routing/generator shape change.
See the system spec's AC5 and the review-queue/detail page components' own
doc comments for the access-model reasoning.

## Locking spec

`system-settings-notification-messages-routes.spec.ts` — asserts, off the
REAL generated `adminRoutes` (not a hand-mirrored copy):

- every tab route whose `path !== 'notification-messages'` has no `children`
  key at all (byte-identical to before);
- `notification-messages`'s `children` match the four-path table above
  exactly;
- deep-linking a child and reading its resolved `data.titleKey`/
  `subtitleKey` returns `ADMIN.PAGES.SYSTEM_SETTINGS` / this tab's own
  `subtitleKey` — the one regression `system-settings-page.component.spec.ts`
  cannot see, since it never activates a child route.

## Consequences

- The `SystemSettingsTab` contract has one new optional field. Every
  existing tab object and every existing spec that iterates
  `SYSTEM_SETTINGS_TABS` is unaffected (`children` reads as `undefined`,
  matching the interface's default).
- A future tab needing its own sub-routes (a second admin/owner split
  surface, say) has a precedent to follow instead of re-deriving this from
  scratch or reaching for a query-param switch that can't deep-link.
- The generator function in `admin.module.ts` is now slightly more than a
  one-line `.map()` — it computes `data` once per tab and conditionally
  spreads `children`. This is a readability cost accepted in exchange for the
  single-injection-point guarantee above.

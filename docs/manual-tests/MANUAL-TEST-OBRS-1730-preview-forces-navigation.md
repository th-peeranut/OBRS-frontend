# MANUAL TEST — OBRS-1730: entering a view-as preview navigates off a route the previewed role cannot pass

Worktree `OBRS-frontend-wt-obrs-1730`, branch `ao/obrs-1730-preview-forces-navigation`, on top of
`origin/dev` @ `0d6cf1ec` (the OBRS-1721 merge). Executed by the agent against the live SIT backend —
not handed to the user.

## Setup

`ng serve --configuration sit --port 4713`. Login used: the seeded `admin@system.local` — the same
account OBRS-1721 used, and the only one that reproduces the defect (an admin is the only holder
whose preview target, `owner`, loses a page: `/admin/lookups` and `/admin/roles`, ADR-0040).

A fresh worktree needs `src/environments/environment.local.ts` (gitignored) — copied in from the main
`OBRS-frontend` clone for this run.

⚠️ SIT's Koyeb instance was cold: `GET /actuator/health` took **80.0 s** (measured,
`curl -w '%{time_total}'`) on the first hit and the first two login attempts timed out on the
spinner. Every interaction after the warm-up was normal speed. Not a defect, recorded so the next
run does not chase it.

## Cases

| # | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | The defect (owner's report) | As `admin@system.local`, open `/admin/lookups` and let it load | `Lookup` + `บทบาท` in the sidebar, 91 lookup values rendered | **MATCH** — `OBRS-1730-01-BEFORE-admin-on-lookups.jpg` |
| 2 | Preview as owner from that page | Profile menu → `ดูในมุมมองของ…` → `ผู้ประกอบการ` | The Lookup page is **left**: URL becomes `/`, the banner "กำลังดูในมุมมองของ: ผู้ประกอบการ / ข้อมูลยังเป็นของบัญชีคุณเอง" is up with its `ออกจากมุมมองนี้` button. Before this card the URL stayed `/admin/lookups` and the page body stayed on screen under the banner | **MATCH** — `OBRS-1730-02-AFTER-preview-owner-pushed-to-home.jpg`, and the DOM read back `url: "http://localhost:4713/"` with the banner text above |
| 3 | Control — no over-firing | Exit preview, open `/admin/users` (an admin page an owner **may** see), preview as `ผู้ประกอบการ` again | Stays on `/admin/users`; banner up; `Lookup`/`บทบาท` gone from ข้อมูลหลัก, leaving `ผู้ใช้` / `ยานพาหนะ` / `เส้นทาง` / `จุดจอด` | **MATCH** — `OBRS-1730-03-CONTROL-admin-users-stays.png`, DOM read back `url: "http://localhost:4713/admin/users"` |
| 4 | Leaving a preview still does not navigate (OBRS-1721, unchanged) | Click `ออกจากมุมมองนี้` on `/` | Banner gone, no navigation | **MATCH** — observed live between cases 2 and 3; pinned as a unit spec |

**Case 3's screenshot is cropped to the sidebar on purpose.** `/admin/users` lists real seeded users
with e-mail addresses and phone numbers; the crop carries the banner and the nav — everything the
case is about — and no personal data.

## Falsification — the specs fail without the fix

The 5 new specs would be worthless if they passed either way. Commenting out the two lines that
navigate (`auth.service.ts`, the `if (!this.currentRouteAllowsPreviewedRole())` block) and re-running:

```
TOTAL: 2 FAILED, 48 SUCCESS   (auth.service.spec.ts)
  Expected spy navigateByUrl to have been called with: …   ×2
```

Exactly the two positive-redirect cases fail; the three negative ones (control route, un-previewable
role, exit) stay green, which is what says they are not asserting the redirect by accident. The file
was restored from a byte-copy afterwards (`grep -c PROBE` → 0).

## Scrutinize finding, self-fixed (< 30 lines)

The walk read `firstChild` only, which is the primary outlet's branch — a route sitting in a named
(secondary) outlet would never be visited. **Dormant, not live**: `grep -rn "outlet:" src/app` is
empty, no route in this app declares one, and the suite was green either way. It was fixed anyway
because the failure direction is *fail-open* — a page the previewed role cannot pass staying on
screen, which is precisely the defect this card exists to remove — and because this repo has
already paid for the same trap once: `src/app/shared/lib/analytics-route-scope.ts`'s `childrenOf()`
prefers `children` for exactly this reason. Changed to a BFS queue preferring `snapshot.children`,
falling back to `snapshot.firstChild` when `children` is empty (the same fallback rule
`childrenOf()` uses, so the spec doubles that build only the primary chain still work unmodified).

## Results

### `npx tsc -p tsconfig.json --noEmit`
Exit 2, **13 errors, all pre-existing and all under `e2e/`** (`global-setup.ts` + 10 spec files).
**0 under `src/app`.**

### `npx ng test --watch=false --browsers=ChromeHeadless`
`TOTAL: 6701 SUCCESS`, exit 0 — 6696 on `origin/dev` before this card, plus this card's 5 specs.
Run **twice**: once before the Scrutinize review and again on the tree that is actually being
pushed, after the self-fix above. Same 6701 both times.

## Verdict

All 4 cases match, live against the real SIT backend as a real logged-in admin. The behaviour now
agrees with what a page refresh has always done: `auth.guard.ts` sends the same admin to the same
`getHomeRoute()` when they reload `/admin/lookups` mid-preview. Ready for PR.

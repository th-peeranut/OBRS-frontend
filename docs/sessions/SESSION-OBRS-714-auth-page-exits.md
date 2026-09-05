# SESSION OBRS-714 — public auth pages are dead ends

**Status: In Review, waiting on the owner.** Do not merge or close from here — the owner reviews the
card, then merges and moves it to Done.

| | |
| --- | --- |
| Card | [OBRS-714](https://nj-phuyaipu.atlassian.net/browse/OBRS-714) — In Review |
| PR | [th-peeranut/OBRS-frontend#412](https://github.com/th-peeranut/OBRS-frontend/pull/412) → `dev` |
| Branch / commit | `ao/obrs-714-auth-page-exits` @ `e1359251` |
| Base | `origin/dev` @ `5950c448` |
| Worktree | `../OBRS-frontend-wt-obrs-714` (still present; claim lock still held) |
| Lock | `.locks/ao__obrs-714-auth-page-exits.lock` |
| Lane | local — frontend only, **nothing deployed**, SIT untouched |
| Run | queue (OBRS-1505), 2026-09-05, unattended |

## What shipped

`AuthHomeLinkComponent` (shared) wraps the brand logo in `routerLink="/"` at all 10 logo sites across
the 8 public auth pages, and `otp-validate` gains a text exit to `/login-mobile` in its normal state.
`nav-reachability.spec.ts` gains the public-auth half of the OBRS-543 sweep. No new i18n keys.

## Facts this run established at real cost

- **The card's frame held, with one correction.** `otp-validate` is no longer literally exit-less:
  OBRS-1072 added `goToRegister()` and `goToEditPhoneNumber()` — but both render only under
  `*ngIf="phoneNotRegistered"`, so the normal OTP state still had zero in-tab anchors. The card's
  conclusion is unchanged; its stated reason was out of date.
- **The transitive rule alone is not a gate.** Removing one page's exit stayed green at 26/26 because
  that page still reached `/` through a sibling. The per-page direct-exit spec is what actually fails.
- **The sweep could not see the success screens.** `register` and `forget-password` *replace* the whole
  screen (`registrationEmailSent` / `linkSent`), logo included; the sweep only rendered the default
  branch. Found by scrutinize, closed, mutation-proved.
- **`<ng-content>` projection is load-bearing, not style.** `.logo-section .logo-img` sizing lives in
  each *page's* stylesheet. Moving the `<img>` into the child template would give it the child's
  encapsulation attribute and silently drop the sizing. Verified live: `130×56` on `/login`,
  `200×87` on `/register`, centring offset 0.
- **BEFORE/AFTER stills of `/login` are byte-identical** — the fix moves no pixel. Keyboard focus is
  the evidence that works.

## Tried and rejected

- Reading raw template text in the spec — Angular 21 + the esbuild karma builder has no `fs`,
  no `raw-loader`, no `require.context`. Rendering the real components is the honest substitute.
- Measuring all 8 pages from one page via same-origin iframes — the app breaks the iframe out to top.
- Same via `history.pushState` + synthetic `popstate` — the router follows it, but the sweep wedged
  the renderer. Per-page `page.goto` in Playwright is what worked.
- `ReactiveFormsModule` in the spec's TestBed — `formControlName` on a schema-stubbed PrimeNG control
  throws NG01203. Omitted deliberately; nothing asserted depends on a live form.

## Open item for the owner

AC-2 named `/login` as an *example* target for the otp text exit; it points at `/login-mobile`
instead, because AC-2's own rationale is "the user mistyped their number" and `/login-mobile` is the
phone-number form. One `routerLink` at `otp-validate.component.html:87` if "back" meant "home".
Full options/trade-off table is in the Jira comment.

## Resume steps

1. Owner reviews OBRS-714 (6 attachments + the measurement comment) and PR #412.
2. On their go-ahead: `git -C ../OBRS-frontend fetch origin dev`, merge `origin/dev` into the
   worktree, re-run `npx ng test`, push, `gh pr merge 412 --repo th-peeranut/OBRS-frontend --merge
   --delete-branch`.
3. Transition OBRS-714 to Done, then `release-task.ps1 -RepoDir ../OBRS-frontend -Card OBRS-714`,
   then `safe-worktree-remove.ps1 -Worktree ../OBRS-frontend-wt-obrs-714`.

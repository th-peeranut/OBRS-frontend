# UX-OBRS-509 — Owner-facing admin CRUD for the vehicle inspection checklist master list

**Card:** https://nj-phuyaipu.atlassian.net/browse/OBRS-509
**Reads against:** `docs/spec/SPEC-OBRS-509-inspection-items-admin.md` rev 2 (LOCKED) — this document
does not restate anything that spec already fixed (store base class, route path, nav placement,
API contracts, write sequences, error codes). It cites those by section number and designs the
screen: layout, interaction, states, i18n, light/dark, and accessibility.

**Design-system conformance is enforced by `docs/design-system.md`** — every choice below maps to
an existing §2–§10 token/component/role. The new patterns this screen introduces (reorder-by-button;
an explicit Retire/Restore row action in place of a toggle) are each justified under §12's rule and
logged as new-pattern candidates in §11.

**Revision note (this file was revised once, against Scrutinize R1 findings):** the reorder write
mechanism (§3.2.2) was rewritten from a debounce+single-flight design to an immediate-PUT +
monotonic-sequence-number design after Scrutinize found the debounce version could silently drop a
write on navigation and left the `rows` array unguarded against background store emits;
`p-inputSwitch` (originally specified for the active toggle, §4.2) was replaced with an explicit
Retire/Restore button pair after Scrutinize found it has no dark-mode coverage anywhere inside
`.admin-shell` in this codebase. Both corrections are detailed inline at §0, §3.2.2, and §4.2.

---

## 0. Verification log (what was read, not assumed)

| Claim | Verified at |
|---|---|
| SA spec fixes store base class, route, nav section, write sequences | `SPEC-OBRS-509…md` §6–§6.2 |
| Jira card scope (owner comment, 2026-07-19) matches the SA spec's §2 reorder addition 1:1 | `mcp__atlassian__getJiraIssue` OBRS-509, comment 10604 |
| No dropdown needed on this screen (no select control in scope) — §3.1's dropdown contract is N/A here | This screen has zero `<select>`-shaped fields: code (text), labels (text ×3), active (retire/restore button), order (buttons). Confirmed by reading the full SA API contract §3.3/3.4 — no enum field exists on the DTO. |
| Closest structural precedent: `LookupSettingsPageComponent` (list + create/edit modal + per-locale label fields, `admin-modal-backdrop`, `admin-form-grid`) | `lookup-settings-page.component.html/.ts` (read in full) |
| Closest per-row-independent-save precedent: `CargoCapacityPageComponent` (row saves independently, no FormArray, pristine-guard via a touched-id set) | `cargo-capacity-page.component.ts` (read in full) |
| **REVISED** — `p-inputSwitch` is **not** dark-safe inside `.admin-shell` and is **not used** on this page. Its only dark rules in the whole repo are scoped to `.npref-row` (notification-preferences, outside the admin shell); `jump-seat-config`'s own code comment says verbatim "no size/color overrides here" — that page has exactly one switch, this page would have had 23. Same reasoning error as OBRS-312's ~46 solid-white boxes. | `dark-theme.scss:781-796` (`.npref-row .p-inputswitch…` rules only); `jump-seat-config-page.component.scss:5-6` (comment) |
| Corrected precedent for the retire/restore action: `.admin-btn.admin-btn-small` (forward action, no confirm) / `.admin-btn.admin-btn-small.admin-btn-danger` (reversal action, confirm-gated) — the exact Board/Un-board shape, already shipped on the dark admin/staff shell and closed as debt | `boarding-list.component.html:322-337`; classes defined at `admin-theme.scss:747-820` (`.admin-btn` base + `.is-dark .admin-btn` border override at `:764-766`, `.admin-btn-danger` composing `--admin-danger-text`/`--admin-danger-border` at `:812-820`); closed-debt status confirmed at `docs/design-system.md` §13 ("`.admin-status.is-neutral` + `.admin-btn-danger` added (OBRS-130)… both runtime-themed, no new hex") |
| `.admin-icon-btn` is 36×36, themed via `--accent-soft`/`--accent-strong`, dark-mode covered (`.is-dark .admin-icon-btn`) | `src/styles/admin-theme.scss:607-633` |
| `.admin-status.is-neutral` is the existing token for "inactive/unset", **with both a light and an explicit dark value** (`--admin-neutral-bg`/`-text` defined once in the light `:root` block and again inside `.admin-shell.is-dark`) — genuinely dark-safe, not just var-shaped | `src/styles/admin-theme.scss:35-36` (light), `:212-213` (`.admin-shell.is-dark` override); `docs/design-system.md` §2.4 |
| `AdminCollectionStore.rerunRequested`/`.inFlight` are `private` and not exposed on the public API (`data$`/`refreshing$`/`error$`/`value`/`hasValue`/`clear()`/`mutate()`/`refresh()`) — **cannot actually be reused** by page code; the original spec's "reuse" claim was a hand-copied shape, not a real dependency | `src/app/modules/admin/shared/admin-collection-store.ts:16-114` (read in full) |
| `AlertService.confirm()` exists (title/text/confirmButtonText/cancelButtonText, `isConfirmed` boolean) — usable for the retire confirmation | `src/app/shared/services/alert.service.ts:65-85` |
| The per-domain `extractApiErrorCode()` + `map*ErrorCode()` idiom (never branch on `message`) | `src/app/shared/lib/api-error-code.ts`, `schedule-status-error.ts` (read in full) |
| `ADMIN.VALIDATION.REQUIRED`, `ADMIN.VALIDATION.FORM_INVALID`, `ADMIN.COMMON.{LOADING,NO_DATA,ACTIONS,EDIT,CANCEL,SAVE,SAVING,UPDATING}`, `ADMIN.MESSAGES.{UPDATED,CREATED,SAVE_FAILED}` already exist and are reused, not re-added | seen live in `lookup-settings-page.component.html/.ts`, `cargo-capacity-page.component.html/.ts`, `jump-seat-config-page.component.html` |
| No `cdkDrag`/`p-orderList`/any drag-reorder exists anywhere in this codebase today | `grep -r "cdkDrag\|CdkDrag\|p-orderList\|pReorderableRow\|DragDropModule"` → 0 hits |
| No admin nav item or route uses a `delete` icon on this feature family; the sibling `lookup-settings` page **does** show a trash icon per row — this screen deliberately does not (AC#4) | `lookup-settings-page.component.html:91-98` (trash icon precedent, NOT reused here — see §5) |
| `dark-theme.scss` excludes `.admin-shell`; `admin-theme.scss` is the runtime-themed source for everything this page uses | design-system §1, confirmed no new raw hex needed anywhere in this spec |

---

## 1. New routes / pages

- `/admin/inspection-items` → `InspectionItemsPageComponent`
  (`src/app/modules/admin/pages/inspection-items/inspection-items-page.component.ts`)

Route data — **already fixed by the SA spec, cited not restated**: `canActivate:[AuthGuard]`,
`data:{ requiredRoles:['owner'], titleKey:'ADMIN.PAGES.INSPECTION_ITEMS', subtitleKey:'ADMIN.INSPECTION_ITEMS.SUBTITLE' }`
(SPEC §6). Nav item lives in the `'master'` section next to Vehicles, gated
`authService.hasAnyRole(['owner'])`, mirroring the `cargo-capacity` nav-item block in
`admin-layout.component.ts:116-128` exactly (same conditional-push shape, same section).
`descriptionKey` reuses `ADMIN.INSPECTION_ITEMS.SUBTITLE` (matches every other nav item's
"descriptionKey = the route's own subtitleKey" convention).

**Title surface — confirmed against a sibling page before specifying.** Every page in this repo's
admin module (`cargo-capacity-page.component.html`, `lookup-settings-page.component.html`,
`jump-seat-config-page.component.html` — all read in full) starts directly with
`<section class="admin-page-intro">` and renders **no** `<h2>`/`<h3>` page title of its own; the
shell topbar owns it via the route's `titleKey`. `InspectionItemsPageComponent`'s template follows
the identical shape — the first element in the body is `<section class="admin-page-intro">`, not a
heading.

---

## 2. Component hierarchy

**One smart page component. No dumb children.** This matches every existing admin CRUD page of
comparable size in this codebase — `CargoCapacityPageComponent`, `LookupSettingsPageComponent`,
`JumpSeatConfigPageComponent` — none of which decompose into presentational sub-components for a
~20-40-row single-table screen. Splitting this into child components would be a new decomposition
pattern with no precedent and no benefit at this scale; the SA spec's own file list
(`inspection-items-page.component.*`, `inspection-items.store.ts`, `inspection-items.mappers.*`)
already assumes this shape.

```
InspectionItemsPageComponent (smart)
  ├─ owns: rows[] (view model, current-locale-resolved for the Labels column),
  │        itemForm (FormGroup: code, translations FormArray[3])
  ├─ template renders inline:
  │    · admin-page-intro (persistent AC#4 hint + refresh-hint + Add button)
  │    · admin-table (order/code/labels/status/actions columns)
  │    · admin-modal-backdrop → item form modal (create/edit, shared markup, mode-switched)
  │    · AlertService.confirm() for the retire action (no separate modal component —
  │      same idiom as every other confirm-before-destructive-ish action in this app,
  │      e.g. vehicle-delete-modal's sibling confirm dialogs)
  ├─ reads: InspectionItemsStore (extends AdminCollectionStore<AdminInspectionItemDto[]>,
  │         per SPEC §6 — cited, not redesigned)
  └─ uses: inspection-items.mappers.ts (pure: locale resolution, row view-model, reorder-array math)
           inspection-item-error.ts (NEW, mirrors schedule-status-error.ts — see §8)
```

No `@Input`/`@Output` boundary exists because there is no child component. If a future card grows
this page enough to need one (e.g., the label editor becomes reusable elsewhere), extract it then —
not preemptively here.

---

## 3. The list + reorder surface

### 3.1 Layout

Single `admin-card` > `admin-table-wrap` > `admin-table`, columns:

| # | Column | i18n key | Content |
|---|---|---|---|
| 1 | Order | `ADMIN.INSPECTION_ITEMS.COL_ORDER` | the row's 1-based position + 4 move buttons (§3.2) |
| 2 | Code | `ADMIN.INSPECTION_ITEMS.COL_CODE` | `<code>{{ item.code }}</code>`, same rendering as `lookup-settings`'s slug column |
| 3 | Labels | `ADMIN.INSPECTION_ITEMS.COL_LABELS` | `admin-cell-stack` of all 3 locales, "EN: …", "TH: …", "ZH: …" — reused verbatim from `lookup-settings-page.component.html:76-79`'s stacked-label idiom, extended from 2 lines to 3. Showing all three (not just the UI's current language) matters here specifically because completeness-at-a-glance is the safety property (§8.3 of the hard problems) — the owner should be able to audit that the ZH row genuinely reads like a checklist item, not a raw code slug, without opening the modal for all 23 rows. |
| 4 | Status | `ADMIN.INSPECTION_ITEMS.COL_STATUS` | `.admin-status.admin-status--icon`, `[class.is-success]="row.active"` / `[class.is-neutral]="!row.active"` showing `ACTIVE_BADGE`/`RETIRED_BADGE` — the identical dual-chip shape as `boarding-list`'s Boarded/Not-boarded column (`boarding-list.component.html:306-313`), not a new chip pattern |
| 5 | Actions | `ADMIN.COMMON.ACTIONS` | `.admin-icon-btn` Edit (pencil), plus **one** row-action button: `.admin-btn.admin-btn-small.admin-btn-danger` "Retire" when `row.active`, or `.admin-btn.admin-btn-small` "Restore" when not — mutually exclusive `*ngIf`, exact shape of `boarding-list`'s Board/Un-board pair (`boarding-list.component.html:322-337`). **No trash icon, no delete control of any kind.** (AC#4 — see §5) |

Retired rows are **not** filtered out, hidden behind a toggle, or moved to a second section — they
render in the same single ordered list, in their normal position, because their `displayOrder`
value is exactly as load-bearing as an active row's (SPEC §3.5's bolded point). A retired row is
visually distinguished by:
- the Status chip switching to `.is-neutral`/`RETIRED_BADGE` (§2.4's documented "inactive/unset
  state" role, with a real light **and** dark token pair — `admin-theme.scss:35-36` / `:212-213` —
  not a new color)
- its Labels cell rendered with `.admin-muted` instead of default text color

Its Order-column move buttons stay **fully interactive** — retiring an item does not freeze its
position, because the reorder payload must include it (SPEC §3.5). Its Actions cell swaps Retire
for Restore, per the table above.

### 3.2 Reordering — the hard problem

**Decision: move-up / move-down / move-to-top / move-to-bottom icon buttons. No drag-and-drop.**
This is the one new pattern in this spec (design-system §12 requires the one-line justification —
given here, logged at the end of this document).

**Why not drag-and-drop**, weighed against the SA spec's own framing (23 rows, laptop-or-tablet,
scrolling-while-dragging called out explicitly):
1. **Zero precedent in this codebase.** `grep` across the whole FE tree found no `cdkDrag`,
   `p-orderList`, or `pReorderableRow` usage anywhere — this would be the first drag-reorder
   interaction in the app. `@angular/cdk` is already a dependency (used for the print-portal idiom,
   design-system §10), so `DragDropModule` costs no new package — but it is still a wholly new
   *interaction pattern* with no local example to copy, no established visual language for a drag
   handle/ghost/drop-indicator, and no existing spec test shape to model a lock on.
2. **Scrolling while dragging is a real, named failure mode here**, not a hypothetical: 23 rows at
   typical admin-table row height overflow one viewport, so a drag gesture needs autoscroll near
   the viewport edge — a second interaction to get right on top of the first, doubled on a touch
   surface where "drag to reorder" and "scroll the list" are the same gesture vocabulary and
   frequently get misread as each other.
3. **Move buttons are accessible by construction, not by an added fallback.** The prompt asks for
   "the accessible non-drag path too" — with buttons as the *only* mechanism, there is no separate
   path to design: a `<button>` is natively focusable and operable via Enter/Space/tap, on laptop
   and tablet alike, with zero extra work.
4. Reordering here is a low-frequency admin task on a slowly-growing 23-row list, not a
   high-frequency power-user workflow — the interaction cost of "a few extra clicks for a big jump"
   (mitigated by the top/bottom buttons below) is acceptable, and correctness/predictability matters
   more than gesture fluency.

**Controls, per row, in the Order column:**
- `arrow_upward` / `arrow_downward` — swap with the adjacent row (one step)
- `keyboard_double_arrow_up` / `keyboard_double_arrow_down` — jump to the very top / very bottom of
  the full list (so moving item 23 to position 1 is one click, not 22)
- Top row: `arrow_upward` and `keyboard_double_arrow_up` disabled. Bottom row: the down pair
  disabled. Each button carries `[attr.aria-label]` interpolating the item's current-locale label
  (`ADMIN.INSPECTION_ITEMS.MOVE_UP` etc., §6) so a screen reader announces "Move Engine oil up", not
  a bare icon name.
- Buttons are **not** disabled while a reorder call is in flight — a click is a deliberate act and
  is never blocked; correctness under overlapping in-flight requests is handled by the sequencing
  rule in §3.2.2, not by freezing the UI.

#### 3.2.1 Local state model

Every move action (single-step or jump) is a **pure array operation** on the in-memory `rows`
array: remove the row, reinsert at the target index, then recompute every row's `displayOrder` as
its new 1-based array index. This is why retired rows staying in the array (not filtered out) is
load-bearing for the mechanism, not just for visibility — the recomputed sequence is dense `1..N`
over the *whole* array by construction, satisfying SPEC §3.5's payload shape with no separate
bookkeeping.

The click **updates the on-screen row order immediately** (this is this feature's equivalent of the
SA spec's "apply locally on drop" — see the flagged wording conflict in §9) so the UI never lags
behind the click, matching the optimistic-apply half of SPEC §6.1's write sequence.

#### 3.2.2 Network: one PUT per click, no debounce, no single-flight queue — REVISED (Scrutinize R1)

The debounce-plus-`rerunRequested`-mirror design this section previously specified is **deleted
outright**, for four compounding reasons Scrutinize found, not one:

1. **Silent data loss on navigation.** A pending debounced write torn down by `takeUntil(destroy$)`
   on route change cancels the PUT with no error and no server write — and since this app has no
   `RouteReuseStrategy`, navigating away mid-edit is the *normal* case, not an edge case. The root
   cache would keep holding the pre-reorder order with nothing telling the owner their reorder
   never reached the server.
2. **The `rerunRequested` branch was unreachable by any user action** (the original text admitted
   this: "not a race the user can trigger by hand") — an untestable branch is a defect class on its
   own, and its cure (freezing ~92 controls for the debounce+flight window) directly fought §3.2.1's
   goal that the UI never lag behind a click.
3. **It was not actually "reuse."** `AdminCollectionStore.rerunRequested`/`.inFlight` are `private`
   and expose nothing a page can hook into (§0) — the old text copied the *shape* of that internal
   loop and mislabeled it a shared mechanism. A reorder rerun also needs to carry a payload, which
   `refresh()`'s argument-less `fetch()` loop cannot do regardless.
4. The debounce path also never canceled its own timer on error, leaving local and server state
   diverged with a write still pending.

**Replacement — immediate PUT per click, reconciled by a monotonic sequence number:**

1. The component holds one field: `private latestReorderSeq = 0;` (plus `reorderPending = false`
   for the guard in rule 3.2.2a below — not for disabling anything).
2. Every move click (§3.2.1's local array update) is followed **immediately** by incrementing
   `latestReorderSeq`, capturing `const seq = this.latestReorderSeq;`, setting
   `this.reorderPending = true;`, and sending `PUT /reorder` there and then — no timer, no queue.
   Overlapping requests from a burst of clicks are expected and are not prevented.
3. Each response handler's **first line** is the guard: `if (seq !== this.latestReorderSeq) { return; }`
   — a response for a request that a later click has already superseded is dropped unread. Only the
   response matching the *current* `latestReorderSeq` (i.e., the most recently issued request) is
   allowed to touch state. This is the "one real hazard" (out-of-order responses) called out
   directly — nothing else needs guarding, because SPEC §4.7 already establishes the full-list PUT
   as idempotent, so a superseded request completing late and being ignored loses nothing: the
   winning (latest) request already carries the complete final intent.
4. **On the winning success:** set `this.reorderPending = false;` **before** calling
   `store.mutate(() => response.data)` — ordering matters, because `mutate` synchronously fires the
   `data$` emission that rule 3.2.2a below is gating on; the guard must already be open when that
   emission lands.
5. **On the winning error:** set `this.reorderPending = false;` **before** calling
   `store.refresh()`, for the identical reason, then `AlertService.error()` with the message
   resolved from `errorCode` via `mapInspectionItemErrorCode()` (§8) — never the localized
   `message` (design-system §9, SPEC §6.2).
6. While any reorder request is outstanding, show the inline `REORDER_SAVING` caption in
   `admin-page-intro` (reusing the slot `app-admin-refresh-hint` occupies elsewhere) — not a
   blocking spinner/modal, and not gating any button's clickability.

This is a small, fully testable state machine (~10 lines): every branch above is reachable by a
real double-click, and the guard condition can be asserted directly in a spec by resolving two
mocked PUT calls out of order and checking only the second (by issue order) response's data wins.

**3.2.2a — the explicit rule the store-emission clobber requires:**

> **While `reorderPending` is `true`, the page's `store.data$` subscription MUST NOT replace
> `rows`.** The only two places allowed to update `rows` while a reorder is outstanding are the
> winning success and winning error handlers above (steps 4/5) — both of which flip
> `reorderPending` to `false` immediately before triggering the emission they intend to accept.
> Any other `store.data$` emission arriving while `reorderPending` is `true` (e.g., the background
> `refresh()` tail of an unrelated create/edit save landing mid-reorder, per SPEC §6.1's "background
> `refresh()`" after every write) is dropped for `rows`-update purposes — it would otherwise revert
> the just-clicked local order to a stale one before the reorder's own request even resolves.

This mirrors, at the `rows` level, the exact pristine-guard already specified for `itemForm` in
§4.1.2 (never rebuild the modal's form from a background emission) — the same failure class
(a stale background refresh clobbering in-progress local state) reapplied to the array the move
buttons mutate, which the original version of this document protected `itemForm` from but left
`rows` open to.

#### 3.2.3 Accessibility path — restated as one path, not two

Because the only reorder mechanism is buttons, the "accessible path" the SA spec's hard-problem
list asks for is not a parallel affordance to design — it *is* the affordance. Concretely: every
move control is a real `<button type="button">` (never a `div` with a click handler), reachable by
Tab in row order (order → code → labels → active → edit, top to bottom), each with an
`aria-label`, and disabled state conveyed by the native `disabled` attribute (which both suppresses
the click and correctly reports as unavailable to assistive tech) — no separate keyboard handler or
ARIA-only affordance layered on top.

---

## 4. Forms

### 4.1 Item form (create / edit) — one modal, mode-switched

Reuses `lookup-settings-page.component.html`'s modal shell **verbatim**: `admin-modal-backdrop` +
`adminModalBackdrop` directive + `admin-modal` + `admin-modal-title` + `admin-modal-subtitle` +
`admin-form-grid` + `admin-modal-actions`, with exactly one primary button (Save) and one secondary
(Cancel) — design-system §4/§6, no new modal chrome invented.

**Opens optimistically, trivially — there is nothing to gate on a fetch for.** `GET /manage`
(SPEC §3.2) already returns every row's full 3-locale `translations` up front, so unlike other
optimistic-modal precedents in this app (which patch in late-arriving detail after opening), Edit
here has **no secondary per-row fetch at all** — the modal is built synchronously from the row
already held in `rows`. The rubric's "pristine-guard every control the modal patches after the
fetch resolves" (design-system §11) is satisfied by construction: nothing patches in after open.

| Field | Component | Type | Validation | i18n key (label) |
|---|---|---|---|---|
| Code | `<input class="admin-field">` | string | `Validators.required`, `Validators.maxLength(50)`, `Validators.pattern(/^[a-z0-9_-]+$/)` (mirrors `lookup-settings`'s slug pattern exactly; server does `trim().toLowerCase()` itself per SPEC §3.3, this is early feedback only) — **disabled in edit mode** (§4.1.1) | `ADMIN.INSPECTION_ITEMS.CODE_FIELD_LABEL` |
| Labels[en] | `<input class="admin-field">` inside `translations` `FormArray[0]` | string | `Validators.required` | `ADMIN.INSPECTION_ITEMS.LABEL_EN` |
| Labels[th] | same, `FormArray[1]` | string | `Validators.required` | `ADMIN.INSPECTION_ITEMS.LABEL_TH` |
| Labels[zh] | same, `FormArray[2]` | string | `Validators.required` | `ADMIN.INSPECTION_ITEMS.LABEL_ZH` |

`active` is **not** a modal field — see §4.2. It is not omitted from the request: the modal's submit
handler reads the current row's already-known `active` value (create defaults `true`, matching
SPEC §3.3's server default; edit carries forward the row's current value) into the POST/PUT body
alongside code + translations, since both endpoints require the full shape (SPEC §3.3/§3.4). No
extra fetch or extra field is needed for this — the value is already sitting in `rows`.

#### 4.1.1 `code` read-only after create (SPEC §5.5, cited)

Create modal: `code` is a live required text field. Edit modal: `code` renders `disabled` (visually
`.admin-field` with the disabled treatment already defined for that class — no new state to add)
with a `CODE_READONLY_HINT` caption underneath explaining why. This is FE-only discouragement, not
a backend rule — the PUT body still includes the row's current `code` unmodified, and the backend
is not asked to reject a changed one (SPEC §5.5 is explicit that hard-rejecting would be an
unspecified behavior change).

#### 4.1.2 The 3-locale editor — the hard problem

**Structure:** `translations` is a `FormArray` of exactly 3 fixed `FormGroup`s
(`{ locale: string, label: FormControl<string> }`), always ordered `en, th, zh` — matching the
`/manage` response's mapper-guaranteed sort (SPEC §3.2). The array's **length never changes** for
this feature (no per-item add/remove of a locale row — set equality is enforced server-side as
"exactly `{en,th,zh}}", SPEC §5.4), so the SA spec's "patch groups in place when the item count is
unchanged; rebuild only on genuine add/remove" (SPEC §6.2) collapses to a stricter, simpler rule
for this screen specifically:

> **The `translations` FormArray is built exactly once per modal-open (inside `openCreateModal()`
> / `openEditModal()`), and is never rebuilt or reactively re-patched from a background
> `store.data$` emission while the modal is open.**

This is the direct fix for the exact bug that hit this same feature once already (OBRS-312, cited
in SPEC §6.2: "one of them on this very feature"). Concretely: `ngOnInit`'s subscription to
`store.data$` (which re-emits on every background `refresh()` — e.g., the tail of a reorder cycle
completing while an edit modal happens to be open) updates only `this.rows` (the table's view
model), and must not reach into `this.itemForm`. `openEditModal(row)` snapshots the row's id at
open time for the PUT call; if the row were somehow gone from a later emission (not reachable in
practice — no delete exists, SPEC §5.1), the submit simply proceeds against the snapshotted id and
lets a `404 VEHICLE_INSPECTION_ITEM_ERROR_ID_NOT_FOUND` surface through the normal error path
(§8) rather than adding defensive code for a path nothing in this feature can trigger.

**Making the all-three-required rule obvious *before* save, not just on a failed attempt:**
- A persistent line directly under the modal subtitle, **not** gated on any field's touched state:
  `LOCALES_REQUIRED_HINT` ("All three languages are required before you can save.") — visible the
  instant the modal opens, before the user has touched anything.
- Each of the 3 label fields still gets its own inline `admin-error` on blur/submit-attempt
  (reusing `ADMIN.VALIDATION.REQUIRED`, not a new per-locale error key — one missing field looks
  exactly like lookup-settings' existing required-field error, no new visual vocabulary).
- Submit-time guard mirrors `lookup-settings`'s `submitLookup()` exactly: `if (itemForm.invalid) {
  itemForm.markAllAsTouched(); await alertService.warning(translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
  return; }` — a visible warning, never a silent return (SPEC §6.2, design-system implicit rule).
- Save button is **not** permanently disabled while the form is invalid (that pattern doesn't exist
  anywhere else in this app's admin forms and would be a new, undiscoverable "why can't I click
  this" state) — it stays clickable, and clicking with missing fields triggers the guard above.

### 4.2 Active/retired — a Retire/Restore row action, not a switch (REVISED — no `p-inputSwitch`)

**`p-inputSwitch` is not used anywhere on this page.** Scrutinize found that its only dark-mode
rule in this codebase is scoped to `.npref-row` (notification preferences, outside `.admin-shell`)
and that `jump-seat-config`'s own code comment says verbatim "no size/color overrides here" — that
page carries exactly one switch, unstyled beyond PrimeNG's defaults, and reads fine only because
nobody has looked at it on a dark admin shell yet. This page would have put 23 switches there. That
is precedent-by-usage mistaken for precedent-by-rule — the same reasoning error that produced
OBRS-312's ~46 solid-white boxes, this card's direct parent, and would have been its 4th occurrence
(§0).

**Replacement: an explicit Retire/Restore text button**, in the Actions cell alongside Edit (§3.1),
reusing `boarding-list`'s Board/Un-board pair verbatim in shape (`boarding-list.component.html:322-337`):

- **Active row → "Retire" button**, `.admin-btn.admin-btn-small.admin-btn-danger`, mirroring
  Un-board's role exactly (a reversal action, styled with the danger role, confirm-gated).
- **Retired row → "Restore" button**, plain `.admin-btn.admin-btn-small`, mirroring Board's role
  exactly (a forward/reactivating action, no confirm needed).
- Both classes are real, shipped, dark-covered tokens — `.admin-btn`'s base + `.is-dark .admin-btn`
  border override (`admin-theme.scss:747-766`), `.admin-btn-danger` composing the already-dark-safe
  `--admin-danger-text`/`--admin-danger-border` pair (`:812-820`) — and this exact class combination
  is already live on the dark admin/staff shell today via `boarding-list`'s Un-board button, closed
  as debt in `docs/design-system.md` §13. Nothing new is being asked of the theme.

This also directly serves AC#4 (§5): retiring is now phrased as an explicit, named, confirm-gated
**action** ("Retire") rather than a state you flip — reading much closer to "this is the mechanism
for retiring" than a switch ever could, and it removes the switch-vs-delete ambiguity a toggle
control invites entirely.

**Turning OFF (Retire):** gated behind `AlertService.confirm()` (`RETIRE_CONFIRM_TITLE`/`TEXT`/
`BUTTON`, §6) — this is also a primary mechanism for AC#4 (§5). **Turning ON (Restore):** no
confirmation, immediate — reactivating is not the action a user needs protecting from, matching
Board's no-confirm precedent.

**Network model — not optimistic-flip-first, matching the switch design this replaces:** the
clicked button disables (that row only, a plain per-row `savingIds`/`Record<number, boolean>` flag,
`cargo-capacity` precedent) the instant the confirm resolves `true` (or immediately for Restore),
the PUT is sent with the row's current code + translations + the flipped `active` (full-shape body,
SPEC §3.4), and the Status chip / Actions button only flip once the response confirms it
(`store.mutate` patches the row) — on error nothing visually changes, just `AlertService.error()`.
A row-level action that flips and then flips back on failure would read as a flicker on a control
representing "is this item trustworthy/live"; the reorder list's zero-lag local feedback (§3.2) is
a deliberately different choice for a different reason (a continuous multi-click sequence, not a
single consequential action) — same sequencing tools (`store.mutate`, `store.refresh`), applied at
a different point in each flow because each control means something different to the user.

---

## 5. Making AC#4 obvious (no delete, anywhere)

**Lead with the structural guarantee, not the visual one — it's the one that actually holds.**
`AdminApiService` gets no delete method added for this feature, and the backend has no
`@DeleteMapping` on `VehicleInspectionItemController` (SPEC §5.1). A trash icon copied onto this
screen from a sibling page would therefore have **nothing to call** — there is no client method and
no endpoint for it to reach. That is a structural absence, not a UI convention that a future edit
could silently erode; the three signals below make it *discoverable*, but the API-surface gap is
what makes it *durable*.

**The `lookup-settings` modal shell this spec reuses (§4.1) carries a full delete feature that must
not be copied along with it.** Scrutinize swept for a context menu, swipe action, keyboard shortcut,
and separate route, and found none — the surface is closed as long as these four are excluded:

1. The trash icon button, `lookup-settings-page.component.html:95`
2. The delete-confirm modal block, `lookup-settings-page.component.html:183-195`
3. The component members `isDeleteModalOpen` / `openDeleteModal()` / `closeDeleteModal()` /
   `confirmDelete()`, `lookup-settings-page.component.ts:41,153,158,215`
4. The call site `adminApiService.deleteLookup(...)`, `lookup-settings-page.component.ts:225`

None of the four exist on `InspectionItemsPageComponent`, `InspectionItemsStore`, or the
`AdminApiService` methods this feature adds (SPEC §7's four methods: `getInspectionItemsForManage`,
`createInspectionItem`, `updateInspectionItem`, `reorderInspectionItems` — no fifth, delete, method).

**Three additional, reinforcing (not primary) signals:**

1. **Absence in the rendered template.** The Actions column has exactly Edit + Retire/Restore
   (§4.2) — no fifth control.
2. **A persistent explanatory hint**, rendered unconditionally in `admin-page-intro` (i.e., not
   gated on loading/error/data state — the same "definitional note renders independent of
   `contentState`" precedent as `RefundVoidReportPageComponent`'s basis/partition notes,
   design-system §12): `RETIRE_HINT`, which states in one place that (a) there is no delete, (b)
   retiring only hides the item from the driver's next inspection, (c) it stays reorderable, and
   (d) history is unaffected.
3. **The retire confirmation dialog's own copy** (§4.2) restates the reversibility and
   history-safety at the exact moment of the action, not just once on page load.

---

## 6. i18n keys to add

All under `ADMIN.INSPECTION_ITEMS.*` plus the one `ADMIN.PAGES.*` key, **all three locale files**
(`en.json`, `th.json`, `zh.json`), same commit (design-system §9, SPEC §7 "Frontend › Change").
Thai values are written as natural Thai prose, not transliteration.

| Key | EN | TH | ZH |
|---|---|---|---|
| `ADMIN.PAGES.INSPECTION_ITEMS` | Inspection Checklist Items | รายการตรวจสภาพรถ | 车辆检查项目 |
| `ADMIN.INSPECTION_ITEMS.SUBTITLE` | Manage the labels, order, and active status of the vehicle inspection checklist | จัดการป้ายกำกับ ลำดับ และสถานะการใช้งานของรายการตรวจสภาพรถ | 管理车辆检查清单的标签、顺序和启用状态 |
| `ADMIN.INSPECTION_ITEMS.TABLE_TITLE` | Checklist items | รายการตรวจสภาพ | 检查项目 |
| `ADMIN.INSPECTION_ITEMS.ADD` | Add item | เพิ่มรายการ | 新增项目 |
| `ADMIN.INSPECTION_ITEMS.ADD_TITLE` | Add checklist item | เพิ่มรายการตรวจสภาพ | 新增检查项目 |
| `ADMIN.INSPECTION_ITEMS.EDIT_TITLE` | Edit checklist item | แก้ไขรายการตรวจสภาพ | 编辑检查项目 |
| `ADMIN.INSPECTION_ITEMS.LOCALES_REQUIRED_HINT` | All three languages (English, Thai, Chinese) are required before you can save. | ต้องกรอกป้ายกำกับให้ครบทั้ง 3 ภาษา (อังกฤษ ไทย จีน) ก่อนจึงจะบันทึกได้ | 保存前必须填写全部三种语言(英文、泰文、中文)的标签。 |
| `ADMIN.INSPECTION_ITEMS.RETIRE_HINT` | There's no delete here. Turning an item off just retires it — it disappears from the driver's next inspection, but stays reorderable in this list, and every past inspection record keeps showing its original label. Turn it back on anytime. | หน้านี้ไม่มีการลบถาวร การปิดใช้งานรายการคือการ "เลิกใช้" เท่านั้น รายการจะไม่แสดงในแบบฟอร์มตรวจสภาพรถของคนขับครั้งถัดไป แต่ยังคงจัดลำดับในหน้านี้ได้ และประวัติการตรวจเก่าทุกใบยังแสดงป้ายกำกับเดิมเสมอ เปิดใช้งานกลับเมื่อไรก็ได้ | 此页面没有永久删除功能。关闭某一项只是将其"停用"——它不会出现在司机下一次的检查表单中,但仍可在此列表中调整顺序,并且所有过去的检查记录都会继续显示其原始标签。您可以随时重新启用。 |
| `ADMIN.INSPECTION_ITEMS.COL_ORDER` | Order | ลำดับ | 顺序 |
| `ADMIN.INSPECTION_ITEMS.COL_CODE` | Code | รหัส | 代码 |
| `ADMIN.INSPECTION_ITEMS.COL_LABELS` | Labels | ป้ายกำกับ | 标签 |
| `ADMIN.INSPECTION_ITEMS.COL_STATUS` | Status | สถานะ | 状态 |
| `ADMIN.INSPECTION_ITEMS.ACTIVE_BADGE` | Active | ใช้งาน | 启用 |
| `ADMIN.INSPECTION_ITEMS.RESTORE_BTN` | Restore | เปิดใช้งาน | 恢复启用 |
| `ADMIN.INSPECTION_ITEMS.CODE_FIELD_LABEL` | Code | รหัส | 代码 |
| `ADMIN.INSPECTION_ITEMS.CODE_READONLY_HINT` | Code can't be changed here after creation, to avoid confusion. It's only an internal fallback identifier and never affects saved inspection history. | หลังสร้างแล้ว ไม่สามารถแก้รหัสนี้ผ่านหน้าจอนี้ได้ เพื่อลดความสับสน รหัสนี้ใช้เป็นเพียงตัวสำรองภายในเท่านั้น ไม่มีผลต่อประวัติการตรวจที่บันทึกไว้แล้ว | 创建后无法在此页面修改代码,以避免混乱。该代码仅作为内部备用标识,不会影响已保存的检查记录。 |
| `ADMIN.INSPECTION_ITEMS.CODE_PATTERN_ERROR` | Lowercase letters, numbers, underscore, or hyphen only | ใช้ได้เฉพาะตัวพิมพ์เล็ก ตัวเลข ขีดล่าง หรือขีดกลางเท่านั้น | 仅限小写字母、数字、下划线或连字符 |
| `ADMIN.INSPECTION_ITEMS.LABEL_EN` | English label | ป้ายกำกับภาษาอังกฤษ | 英文标签 |
| `ADMIN.INSPECTION_ITEMS.LABEL_TH` | Thai label | ป้ายกำกับภาษาไทย | 泰文标签 |
| `ADMIN.INSPECTION_ITEMS.LABEL_ZH` | Chinese label | ป้ายกำกับภาษาจีน | 中文标签 |
| `ADMIN.INSPECTION_ITEMS.RETIRED_BADGE` | Inactive | ปิดใช้งาน | 已停用 |
| `ADMIN.INSPECTION_ITEMS.MOVE_UP` | Move {{label}} up | เลื่อน {{label}} ขึ้น | 将{{label}}上移 |
| `ADMIN.INSPECTION_ITEMS.MOVE_DOWN` | Move {{label}} down | เลื่อน {{label}} ลง | 将{{label}}下移 |
| `ADMIN.INSPECTION_ITEMS.MOVE_TOP` | Move {{label}} to top | เลื่อน {{label}} ไปบนสุด | 将{{label}}移到最前 |
| `ADMIN.INSPECTION_ITEMS.MOVE_BOTTOM` | Move {{label}} to bottom | เลื่อน {{label}} ไปล่างสุด | 将{{label}}移到最后 |
| `ADMIN.INSPECTION_ITEMS.REORDER_SAVING` | Saving order… | กำลังบันทึกลำดับ… | 正在保存顺序… |
| `ADMIN.INSPECTION_ITEMS.RETIRE_CONFIRM_TITLE` | Retire this item? | ปิดใช้งานรายการนี้? | 要停用此项目吗? |
| `ADMIN.INSPECTION_ITEMS.RETIRE_CONFIRM_TEXT` | It will no longer appear in the driver's next inspection. Past inspection records are unaffected, and you can turn it back on anytime. | รายการนี้จะไม่แสดงในแบบฟอร์มตรวจสภาพรถของคนขับครั้งถัดไป ประวัติการตรวจเดิมจะไม่ได้รับผลกระทบ และเปิดใช้งานกลับเมื่อไรก็ได้ | 该项目将不再出现在司机下一次的检查表单中。过去的检查记录不受影响,您可以随时重新启用。 |
| `ADMIN.INSPECTION_ITEMS.RETIRE_CONFIRM_BUTTON` | Retire | ปิดใช้งาน | 停用 |
| `ADMIN.INSPECTION_ITEMS.LOAD_FAILED` | Failed to load the checklist items. | โหลดรายการตรวจสภาพไม่สำเร็จ | 加载检查项目失败。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.LOCALES_INVALID` | Labels must include exactly English, Thai, and Chinese — no more, no fewer. | ป้ายกำกับต้องมีครบและมีเฉพาะภาษาอังกฤษ ไทย และจีน เท่านั้น | 标签必须且只能包含英文、泰文和中文三种语言。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.CODE_TAKEN` | That code is already used by another item. | รหัสนี้ถูกใช้โดยรายการอื่นแล้ว | 该代码已被其他项目使用。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.ID_NOT_FOUND` | This item no longer exists. Refreshing the list. | ไม่พบรายการนี้แล้ว กำลังรีเฟรชรายการ | 该项目已不存在,正在刷新列表。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.REORDER_MISSING_IDS` | The reorder didn't include every item. Refreshing to the last saved order. | การจัดลำดับใหม่ไม่ครบทุกรายการ กำลังคืนค่าเป็นลำดับล่าสุดที่บันทึกไว้ | 重新排序未包含所有项目,正在恢复为最近保存的顺序。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.REORDER_UNKNOWN_ID` | The reorder referenced an item that no longer exists. Refreshing to the last saved order. | การจัดลำดับใหม่อ้างถึงรายการที่ไม่มีอยู่แล้ว กำลังคืนค่าเป็นลำดับล่าสุดที่บันทึกไว้ | 重新排序引用了不存在的项目,正在恢复为最近保存的顺序。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.REORDER_DUPLICATE_ID` | The reorder had a duplicate item. Refreshing to the last saved order. | การจัดลำดับใหม่มีรายการซ้ำกัน กำลังคืนค่าเป็นลำดับล่าสุดที่บันทึกไว้ | 重新排序中出现重复项目,正在恢复为最近保存的顺序。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.REORDER_INVALID_SEQUENCE` | The order got out of sync. Refreshing to the last saved order. | ลำดับไม่ตรงกันกับระบบ กำลังคืนค่าเป็นลำดับล่าสุดที่บันทึกไว้ | 顺序与系统不同步,正在恢复为最近保存的顺序。 |
| `ADMIN.INSPECTION_ITEMS.ERROR.GENERIC` | Something went wrong. Please try again. | เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง | 出现问题,请重试。 |

**Note:** `RETIRE_CONFIRM_BUTTON` is deliberately reused for **two** surfaces — the confirm dialog's
primary button *and* the row's Retire action button (§4.2) — both literally read "Retire" in all
three languages, so this is intentional reuse, not a near-duplicate needing its own key.

**Reused, not re-added** (already exist, confirmed live in sibling pages): `ADMIN.COMMON.LOADING`,
`ADMIN.COMMON.NO_DATA`, `ADMIN.COMMON.ACTIONS`, `ADMIN.COMMON.EDIT`, `ADMIN.COMMON.CANCEL`,
`ADMIN.COMMON.SAVE`, `ADMIN.COMMON.SAVING`, `ADMIN.COMMON.UPDATING`, `ADMIN.VALIDATION.REQUIRED`,
`ADMIN.VALIDATION.FORM_INVALID`, `ADMIN.MESSAGES.UPDATED`, `ADMIN.MESSAGES.CREATED`,
`ADMIN.MESSAGES.SAVE_FAILED`.

---

## 7. User flows

1. **Owner opens the page** → shell topbar shows the route-driven title/subtitle → skeleton rows
   render while `store.refresh()` runs in the background (or the cached list renders instantly on
   re-entry, per `AdminCollectionStore`'s stale-while-revalidate contract) → the persistent
   `RETIRE_HINT` and `LOCALES_REQUIRED_HINT`-adjacent explanatory copy is visible immediately,
   before any data loads.

2. **Owner adds a new item** → clicks `ADD` (the one `admin-btn-primary` on this screen) → modal
   opens instantly (no fetch) with all 4 fields empty → fills code + all 3 labels → clicks Save →
   if any of the 3 labels is empty, `markAllAsTouched()` + warning toast, modal stays open → once
   valid, `POST`, button shows `SAVING`, on success the new row appears immediately via
   `store.mutate` (appended, server-assigned `displayOrder = max+1` per SPEC §3.3 puts it last),
   modal closes, `ADMIN.MESSAGES.CREATED` toast, background `refresh()`.

3. **Owner edits a label** → clicks the row's Edit icon → modal opens instantly, pre-filled from
   the in-memory row (code disabled + hint shown) → changes e.g. the Thai label → Save → `PUT`,
   `store.mutate` replaces that row with the response, `ADMIN.MESSAGES.UPDATED` toast. Old
   inspection records are untouched (SPEC §5.2, already true, no FE action needed) — nothing in
   this flow can alter history.

4. **Owner retires an item** → clicks its row's "Retire" button → `AlertService.confirm()` with
   `RETIRE_CONFIRM_TITLE`/`TEXT`/`BUTTON` → confirms → that row's button disables → `PUT` with the
   row's current code+translations+`active:false` → on success the Status chip flips to
   `RETIRED_BADGE`/`is-neutral`, the Actions cell swaps to "Restore", labels go muted, the row stays
   in its exact position, `ADMIN.MESSAGES.UPDATED` toast. The driver's **next** inspection form
   omits it (SPEC §5.2, no FE change) — reversible any time via the "Restore" button, no
   confirmation needed to turn back on.

5. **Owner reorders the list** → clicks a move button on some row (single-step or jump) → row
   visibly moves in the table immediately → `PUT /reorder` fires **immediately**, that same click
   (no debounce) → inline `REORDER_SAVING` shows while any reorder request is outstanding → on the
   winning (latest-issued) response's success the list is replaced with the server's authoritative
   order → on the winning response's failure, the whole list snaps back to server truth via
   `refresh()` and an error toast resolved from `errorCode` explains why (§3.2.2, §8). A burst of
   quick clicks fires overlapping requests; only the response matching the most recently issued
   click is applied, the rest are dropped.

6. **Owner looks for a delete button** → finds none — the Actions column has only Edit and
   Retire/Restore, and the persistent `RETIRE_HINT` at the top of the page already told them
   retiring is the mechanism (§5) — so this "flow" ends at the Retire button in flow 4, by design.
   Even a hypothetically copied trash icon would have nothing to call (§5).

---

## 8. States

- **Loading (first entry, no cache yet):** `admin-skeleton-row` × 6 in the table body, same shape
  as `lookup-settings`/`cargo-capacity`'s skeleton rows (`admin-skeleton`, `admin-skeleton--sm`).
- **Stale-while-revalidate (re-entry with cache):** cached rows render instantly; `app-admin-refresh-hint`
  shows the background-refresh state (reused component, no new one).
- **Empty** (23 seeded rows means this is practically unreachable, but still specified per
  convention): `admin-empty-row` with `ADMIN.COMMON.NO_DATA` — reused key.
- **Load error, no cache:** `errorMessage` = `ADMIN.INSPECTION_ITEMS.LOAD_FAILED`, rendered in
  `admin-page-intro` exactly like `cargo-capacity`'s `errorMessage` slot.
- **Row save in flight (create/edit):** Save button text swaps to `ADMIN.COMMON.SAVING` and
  disables; modal stays open until resolution.
- **Retire/Restore in flight:** that row's action button disables (`savingIds` record, per-row,
  cargo-capacity precedent) until its PUT resolves.
- **Reorder in flight:** move buttons stay clickable (§3.2, §3.2.2 — deliberately not disabled);
  `REORDER_SAVING` caption shows in `admin-page-intro` while any reorder request is outstanding,
  and `rows` is guarded against unrelated background `store.data$` emissions for the same window
  (§3.2.2a).
- **Error, any write:** `AlertService.error()` with the message resolved via
  `mapInspectionItemErrorCode(extractInspectionItemErrorCode(error))` (§9) — **never** the raw
  `message` field. Reorder errors additionally trigger `store.refresh()` to reconcile the visible
  order back to the server (§3.2.2), only for the response matching the latest-issued request.
- **Success, any write:** `AlertService.success()` with `ADMIN.MESSAGES.{CREATED|UPDATED}`
  (reused keys) for create/edit/retire; no toast is specified for reorder success beyond the
  `REORDER_SAVING` caption clearing — a toast on every settled reorder burst would be noisy for
  what's often a multi-click sequence ending in one save.

---

## 9. Conflicts / deviations from the SA spec — flagged, not papered over

1. **"Apply locally on drop" (SPEC §6.1) presumes a drag gesture; this spec specifies buttons, not
   drag.** The mechanics SPEC §6.1 fixes — apply locally, `PUT`, `store.mutate` the authoritative
   result on success, `store.refresh()` + error alert on failure — are preserved exactly (§3.2.2),
   and are now an even closer literal match than the first draft of this document: each click fires
   its `PUT` immediately (no debounce — see the §3.2.2 rewrite), so "on drop" reads as "on each
   click" with no batching layer in between. Recommend reading SPEC §6.1's "drop" as shorthand for
   "the reorder commit point," which this spec's button interaction satisfies without a literal drop
   event. No backend contract is affected either way — `/reorder` receives the same shape regardless
   of how the FE arrived at it.
2. **`409 DATA_INTEGRITY_VIOLATION` is mapped to the generic fallback (`ERROR.GENERIC`), not a
   dedicated key**, because SPEC §3.5 itself documents it as "a constraint backstop, unreachable
   through the API if the 400 guards are correct" and a generic code potentially shared across
   unrelated features elsewhere in the app. Giving it a feature-specific message here would imply
   a distinguishing case that isn't real; recommend this stay bucketed as generic unless it's ever
   actually observed in the wild.
3. **No conflict found, but worth flagging as a scope edge:** the SA spec doesn't say whether a
   *background* `store.refresh()` triggered by something unrelated (e.g., a browser tab regaining
   focus, if that's ever wired up elsewhere) could land while the create/edit modal is open. This
   spec's answer (§4.1.2) is that the modal's form is never rebuilt from such an emission — only
   `rows` updates. If a future card adds a focus-triggered refresh to `AdminCollectionStore`
   globally, this page's modal isolation already covers it; no follow-up needed.

Nothing else in the SA spec's fixed decisions (store base class, route, nav placement, endpoint
shapes, error codes, business rules) required a design-level departure.

---

## 10. Files to add (frontend, additive to SPEC §7's list)

SPEC §7 already lists `inspection-items-page.component.*`, `inspection-items.store.*`,
`inspection-items.mappers.*`, the `admin-api.service.ts` methods/DTOs, the route, and the nav item.
This spec adds one file family, following the `schedule-status-error.ts` precedent exactly (§0):

- `src/app/shared/lib/inspection-item-error.ts` (+ `.spec.ts`) — `mapInspectionItemErrorCode()`
  (the 7-entry table in §6's `ERROR.*` rows + `GENERIC` fallback) and
  `extractInspectionItemErrorCode()` (delegates to the existing `extractApiErrorCode()`, per
  `api-error-code.ts` — no new extraction logic, just the per-domain wrapper every other error
  family already has).

No dedicated `*.validators.ts` file is needed (unlike `cargo-capacity`) — the code/label validation
is plain `Validators.required`/`maxLength`/`pattern`, matching `lookup-settings`'s inline approach,
not `cargo-capacity`'s bespoke numeric-parsing rules.

---

## 11. Design-system conformance

- **Reused patterns:** `app-admin-refresh-hint`, `admin-page-intro`/`admin-card`/`admin-table`/
  `admin-table-wrap`/`admin-cell-stack`/`admin-skeleton-row`/`admin-empty-row` (list shell,
  `cargo-capacity`+`lookup-settings` precedent); `admin-modal-backdrop`+`adminModalBackdrop`+
  `admin-modal`+`admin-form-grid` (modal shell, `lookup-settings` precedent, minus the four
  delete-surface members enumerated in §5); `.admin-status.admin-status--icon` with
  `.is-success`/`.is-neutral` (the Status chip, `boarding-list`'s Boarded/Not-boarded dual-chip
  precedent, `boarding-list.component.html:306-313`); `.admin-btn.admin-btn-small` /
  `.admin-btn.admin-btn-small.admin-btn-danger` (Restore/Retire row actions, `boarding-list`'s
  Board/Un-board precedent, `boarding-list.component.html:322-337`, dark coverage verified at
  `admin-theme.scss:747-820` — §0); `.admin-icon-btn` (Edit action, pagination-chevron precedent
  per design-system §3, dark coverage at `admin-theme.scss:607-633`); `admin-btn`/`admin-btn-primary`
  (Add button, Save button — one primary on the page, one primary per modal);
  `AlertService.{success,error,warning,confirm}` — never `Swal.fire()` directly;
  `extractApiErrorCode()` — never branch on `message`; `AdminCollectionStore` (`mutate`/`refresh`/
  `data$`/`refreshing$`/`error$`) exactly as SPEC §6 fixes it, its **public** surface only — the
  reorder sequencing in §3.2.2 is this feature's own monotonic-counter guard, not a reuse of the
  store's private `rerunRequested`/`inFlight` fields (§0 corrects the first draft's mislabeled claim
  here).
- **New patterns:**
  1. **Move-up/move-down/move-to-top/move-to-bottom buttons as the reorder mechanism**, in place of
     drag-and-drop — justified in §3.2 (no drag precedent anywhere in this codebase;
     scrolling-while-dragging is a real failure mode on a 23-row list on tablet; buttons are
     accessible without a separate fallback path).
  2. **An explicit Retire/Restore row-action button pair in place of a toggle control**, justified
     in §4.2 (`p-inputSwitch` has no dark coverage inside `.admin-shell` anywhere in this codebase —
     §0 — so a toggle here would be this card's own OBRS-312-shaped defect; the Board/Un-board
     button pair is both already dark-safe and reads more clearly as "an action," reinforcing AC#4).
  3. **A monotonic per-request sequence number as the out-of-order-response guard** for a
     no-debounce, immediate-PUT reorder flow (§3.2.2) — justified there: the SA spec's own
     idempotent-full-list-PUT design (SPEC §4.7) means a superseded request can simply be ignored
     rather than queued or debounced.

  **Locking-spec candidates** (recommend adding to design-system §12's pattern log once the FE
  implementation lands):
  - Reorder: a component spec asserting (a) clicking "up" on row *i* swaps it with row *i-1* and
    recomputes a dense `1..N` across the *whole* array including retired rows, (b) the top row's
    up/top buttons and the bottom row's down/bottom buttons are `disabled`, and (c) resolving two
    mocked `PUT /reorder` calls out of order results in only the later-issued call's response being
    applied (the §3.2.2 sequence guard).
  - **No-delete (AC#4):** the SPEC §8 "Frontend" test-plan item this spec had not yet surfaced here —
    a DOM assertion that no delete-shaped control (button, icon, or route) exists anywhere in the
    rendered template, asserted on the DOM rather than the component class (matching SPEC §8's own
    phrasing for this exact check).
- **Confirm:** no `app-admin-dropdown`/select control exists on this screen (§0) — the dropdown
  contract is not applicable here, not silently skipped. One primary button per screen (Add) and
  per modal (Save). No raw hex — every color used (`.admin-status.is-success`/`.is-neutral`,
  `.admin-btn`, `.admin-btn-danger`, `.admin-icon-btn`) is an existing runtime-themed token,
  re-verified against an actual dark rule on disk for each, not against another page's usage (§0):
  `.admin-icon-btn` at `admin-theme.scss:607-633` (explicit `.is-dark` override at `:621-623`);
  `.admin-btn`/`.admin-btn-primary`/`.admin-btn-small`/`.admin-btn-danger` at `:747-820` (`.is-dark
  .admin-btn` border override at `:764-766`; `-primary`/`-danger` read theme-swapped `--accent*`/
  `--admin-danger-*` vars); `.is-success`/`.is-neutral` at `:1199-1230`, with `.is-neutral` carrying
  an explicit light **and** dark value pair (`:35-36`, `:212-213`). `p-inputSwitch` is **not** used
  (§4.2). Single title surface — the page renders no `<h2>/<h3>` of its own (§1, verified against
  three sibling pages). Keys added to `en.json`/`th.json`/`zh.json` in the same commit (§6).

##UX_COMPLETE##

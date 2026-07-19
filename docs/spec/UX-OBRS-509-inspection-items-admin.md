# UX-OBRS-509 — Owner-facing admin CRUD for the vehicle inspection checklist master list

**Card:** https://nj-phuyaipu.atlassian.net/browse/OBRS-509
**Reads against:** `docs/spec/SPEC-OBRS-509-inspection-items-admin.md` rev 2 (LOCKED) — this document
does not restate anything that spec already fixed (store base class, route path, nav placement,
API contracts, write sequences, error codes). It cites those by section number and designs the
screen: layout, interaction, states, i18n, light/dark, and accessibility.

**Design-system conformance is enforced by `docs/design-system.md`** — every choice below maps to
an existing §2–§10 token/component/role. The one genuinely new pattern (reorder-by-button) is
justified under §12's rule and logged as a new-pattern candidate at the end of this document.

---

## 0. Verification log (what was read, not assumed)

| Claim | Verified at |
|---|---|
| SA spec fixes store base class, route, nav section, write sequences | `SPEC-OBRS-509…md` §6–§6.2 |
| Jira card scope (owner comment, 2026-07-19) matches the SA spec's §2 reorder addition 1:1 | `mcp__atlassian__getJiraIssue` OBRS-509, comment 10604 |
| No dropdown needed on this screen (no select control in scope) — §3.1's dropdown contract is N/A here | This screen has zero `<select>`-shaped fields: code (text), labels (text ×3), active (switch), order (buttons). Confirmed by reading the full SA API contract §3.3/3.4 — no enum field exists on the DTO. |
| Closest structural precedent: `LookupSettingsPageComponent` (list + create/edit modal + per-locale label fields, `admin-modal-backdrop`, `admin-form-grid`) | `lookup-settings-page.component.html/.ts` (read in full) |
| Closest per-row-independent-save precedent: `CargoCapacityPageComponent` (row saves independently, no FormArray, pristine-guard via a touched-id set) | `cargo-capacity-page.component.ts` (read in full) |
| Toggle control precedent: `p-inputSwitch`, already used and already dark-safe | `jump-seat-config-page.component.html:24` |
| `.admin-icon-btn` is 36×36, themed via `--accent-soft`/`--accent-strong`, dark-mode covered (`.is-dark .admin-icon-btn`) | `src/styles/admin-theme.scss:607-633` |
| `.admin-status.is-neutral` is the existing token for "inactive/unset" (boarding-list "Not boarded" is its precedent) | `docs/design-system.md` §2.4 |
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
  │    · admin-table (order/code/labels/active/actions columns)
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
| 4 | Active | `ADMIN.INSPECTION_ITEMS.COL_ACTIVE` | `p-inputSwitch`, per-row `savingIds` disable (cargo-capacity precedent) |
| 5 | Actions | `ADMIN.COMMON.ACTIONS` | one `.admin-icon-btn` — Edit (pencil) only. **No trash icon.** (AC#4 — see §5) |

Retired rows are **not** filtered out, hidden behind a toggle, or moved to a second section — they
render in the same single ordered list, in their normal position, because their `displayOrder`
value is exactly as load-bearing as an active row's (SPEC §3.5's bolded point). A retired row is
visually distinguished by:
- an `.admin-status.is-neutral` chip reading the `RETIRED_BADGE` key next to its code (§2.4's
  documented "inactive/unset state" role — the *precedent-defined* use of this exact token, not a
  new color)
- its Labels cell rendered with `.admin-muted` instead of default text color

Its Order-column move buttons and its Active switch stay **fully interactive** — retiring an item
does not freeze its position, because the reorder payload must include it (SPEC §3.5).

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
- All four buttons in the whole table are `[disabled]` while a reorder network call is in flight
  (§3.2.2) — never mid-flight-clickable, to keep exactly one authoritative payload in transit.

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

#### 3.2.2 Network: debounce + single-flight, not one PUT per click

An owner reordering a checklist plausibly fires several move clicks in a burst (e.g., walking an
item from position 20 to position 3 via four top-jump-adjacent clicks). Firing a `PUT /reorder`
per click would race multiple full-list payloads against each other. Instead:

1. Every move action marks the list "order-dirty" and (re)starts a **500ms trailing debounce**.
2. When the debounce elapses with no further move action, send `PUT /reorder` with the *current*
   local array's `{id, displayOrder}` for every row (SPEC §3.5's exact body shape).
3. If a new move action arrives **while a PUT is in flight**, it still updates the local array and
   UI instantly (buttons are disabled during flight per §3.2 — so this can only happen from a
   click queued in the same tick as the response lands, not a race the user can trigger by hand,
   but the mechanism is specified defensively): mark `rerunRequested = true` and send exactly one
   more PUT once the in-flight one resolves. This mirrors `AdminCollectionStore.refresh()`'s own
   `rerunRequested`/`inFlight` shape (`admin-collection-store.ts:80-110`) — reusing an established
   in-repo idiom for "coalesce bursts into the final state" rather than inventing a new one.
4. While the debounce is pending, show nothing extra (the local reorder already reads as "done" to
   the user). Once the actual `PUT` is in flight, show a small inline `REORDER_SAVING` caption in
   the `admin-page-intro` area (reusing the same slot `app-admin-refresh-hint` occupies elsewhere)
   — not a blocking spinner/modal.
5. **On success:** `store.mutate(() => response.data)` — the server's full, authoritative,
   newly-ordered list replaces the local one (SPEC §6.1, cited exactly).
6. **On error:** `store.refresh()` — every row snaps back to the last known server truth — plus
   `AlertService.error()` with the message resolved from the response's `errorCode` via the new
   `mapInspectionItemErrorCode()` (§8), **never** the localized `message` string (design-system §9,
   SPEC §6.2).

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

### 4.2 Active toggle — table-row action, not a modal field

Each row's `p-inputSwitch` fires its own independent write, mirroring `CargoCapacityPageComponent`'s
row-level-save shape (no FormArray involved, plain per-row `savingIds`/`Record<number, boolean>`
state) rather than folding into the create/edit form. Rationale: toggling active is a fast,
frequent, single-purpose action (unlike editing 3 labels, which is a deliberate multi-field edit
worth a modal) — collapsing it into the modal would force opening a form to flip one switch.

**Turning OFF (retiring):** gated behind `AlertService.confirm()` — this is also the primary
mechanism for AC#4 (§5). **Turning ON (reactivating):** no confirmation, immediate — reactivating
is not the action a user needs protecting from.

**Network model — deliberately *not* the same optimistic-flip-first shape as reorder:** the switch
is disabled (not yet flipped) the instant the confirm dialog resolves `true`, the PUT is sent with
the row's current code + translations + the flipped `active` (full-shape body, SPEC §3.4), and the
switch only visually flips once the response confirms it (`store.mutate` patches the row) — on
error the switch stays exactly where it was, with `AlertService.error()`. This is intentionally more
conservative than the reorder flow: a toggle that visually flips and then flips back on failure
reads as a flicker on a control the user reads as an "is this trustworthy/live" state, whereas the
reorder list's continuous-drag-like feel benefits from zero-lag local feedback. Both choices reuse
existing sequencing tools (`store.mutate`, `store.refresh`) — the difference is only *when* the
local view updates relative to the network call, matched to what each control represents.

---

## 5. Making AC#4 obvious (no delete, anywhere)

Three reinforcing signals, none of them a new component:

1. **Absence is the primary signal.** The Actions column has exactly one icon button (Edit). The
   closest sibling pattern in this codebase, `lookup-settings-page.component.html:91-98`, *does*
   render a trash icon per row — this screen deliberately omits it. Call this out explicitly in the
   PR/review: an implementer copying the lookup-settings modal shell (as this spec tells them to)
   must not also copy its delete-icon-button and delete-confirm-modal blocks.
2. **A persistent explanatory hint**, rendered unconditionally in `admin-page-intro` (i.e., not
   gated on loading/error/data state — the same "definitional note renders independent of
   `contentState`" precedent as `RefundVoidReportPageComponent`'s basis/partition notes,
   design-system §12): `RETIRE_HINT`, which states in one place that (a) there is no delete, (b)
   retiring only hides the item from the driver's next inspection, (c) it stays reorderable, and
   (d) history is unaffected. This is the single most direct answer to "users will look for a
   delete button" — it tells them, before they go looking, what the actual control does instead.
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
| `ADMIN.INSPECTION_ITEMS.COL_ACTIVE` | Active | ใช้งาน | 启用 |
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

4. **Owner retires an item** → flips its Active switch off → `AlertService.confirm()` with
   `RETIRE_CONFIRM_TITLE`/`TEXT`/`BUTTON` → confirms → switch disables → `PUT` with the row's
   current code+translations+`active:false` → on success switch flips off, row gains the
   `RETIRED_BADGE` chip and muted labels, stays in its exact position, `ADMIN.MESSAGES.UPDATED`
   toast. The driver's **next** inspection form omits it (SPEC §5.2, no FE change) —
   reversible any time via the same switch with no confirmation needed to turn back on.

5. **Owner reorders the list** → clicks a move button on some row (single-step or jump) → row
   visibly moves in the table immediately → after a settling debounce (or immediately if idle),
   `PUT /reorder` fires with every row's id+displayOrder (active and retired) → inline
   `REORDER_SAVING` shows during the call → on success the list is replaced with the server's
   authoritative order → on failure, the whole list snaps back to server truth via `refresh()`
   and an error toast resolved from `errorCode` explains why (§8).

6. **Owner looks for a delete button** → finds none — the Actions column has only Edit, and the
   persistent `RETIRE_HINT` at the top of the page already told them retiring is the mechanism
   (§5) — so this "flow" ends at the Active switch in flow 4, by design.

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
- **Active-toggle in flight:** that row's `p-inputSwitch` disables (`savingIds` record, per-row,
  cargo-capacity precedent) until the PUT resolves.
- **Reorder in flight:** all 4 move buttons across every row disable; `REORDER_SAVING` caption
  shows in `admin-page-intro`.
- **Error, any write:** `AlertService.error()` with the message resolved via
  `mapInspectionItemErrorCode(extractInspectionItemErrorCode(error))` (§9) — **never** the raw
  `message` field. Reorder errors additionally trigger `store.refresh()` to reconcile the visible
  order back to the server (§3.2.2).
- **Success, any write:** `AlertService.success()` with `ADMIN.MESSAGES.{CREATED|UPDATED}`
  (reused keys) for create/edit/retire; no toast is specified for reorder success beyond the
  `REORDER_SAVING` caption clearing — a toast on every settled reorder burst would be noisy for
  what's often a multi-click sequence ending in one save.

---

## 9. Conflicts / deviations from the SA spec — flagged, not papered over

1. **"Apply locally on drop" (SPEC §6.1) presumes a drag gesture; this spec specifies buttons, not
   drag.** The mechanics SPEC §6.1 fixes — apply locally, `PUT`, `store.mutate` the authoritative
   result on success, `store.refresh()` + error alert on failure — are preserved exactly (§3.2.2).
   Only the *triggering gesture* changes: "on drop" becomes "on each move-button click, debounced
   to one settled request." Recommend reading SPEC §6.1's "drop" as shorthand for "the reorder
   commit point," which this spec's button interaction satisfies without a literal drop event. No
   backend contract is affected either way — `/reorder` receives the same shape regardless of how
   the FE arrived at it.
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
  `admin-modal`+`admin-form-grid` (modal shell, `lookup-settings` precedent, minus its delete-icon/
  delete-modal blocks — see §5); `p-inputSwitch` (`jump-seat-config` precedent, already dark-safe);
  `.admin-status.is-neutral` (§2.4's documented inactive/unset role, boarding-list precedent);
  `.admin-icon-btn` (Edit action, pagination-chevron precedent per design-system §3); `admin-btn`/
  `admin-btn-primary` (Add button, Save button — one primary on the page, one primary per modal);
  `AlertService.{success,error,warning,confirm}` — never `Swal.fire()` directly;
  `extractApiErrorCode()` — never branch on `message`; `AdminCollectionStore` (`mutate`/`refresh`/
  `data$`/`refreshing$`/`error$`) exactly as SPEC §6 fixes it; the `rerunRequested`/`inFlight`
  single-flight shape from `AdminCollectionStore.refresh()`, reused for the reorder debounce
  (§3.2.2) instead of inventing a second coalescing mechanism.
- **New pattern:** **move-up/move-down/move-to-top/move-to-bottom buttons as the reorder
  mechanism**, in place of drag-and-drop — justified in §3.2 (no drag precedent anywhere in this
  codebase; scrolling-while-dragging is a real failure mode on a 23-row list on tablet; buttons are
  accessible without a separate fallback path). **Locking-spec candidate:** a component spec
  asserting (a) clicking "up" on row *i* swaps it with row *i-1* and recomputes a dense `1..N`
  across the *whole* array including retired rows, and (b) the top row's up/top buttons and the
  bottom row's down/bottom buttons are `disabled`. Recommend adding this row to design-system §12's
  pattern log once the FE implementation lands, so the next reorderable-list feature in this app
  reuses buttons-not-drag by default instead of re-deciding.
- **Confirm:** no `app-admin-dropdown`/select control exists on this screen (§0) — the dropdown
  contract is not applicable here, not silently skipped. One primary button per screen (Add) and
  per modal (Save). No raw hex — every color used (`.admin-status.is-neutral`, `.admin-btn`,
  `.admin-icon-btn`, `p-inputSwitch`) is an existing runtime-themed token, specified for **both**
  light and dark because all of them already carry dark-mode coverage in `admin-theme.scss`
  (confirmed at §0 — `.admin-icon-btn`'s `.is-dark` override; `p-inputSwitch` already used
  dark-clean in `jump-seat-config`; `.is-neutral` documented dark-safe in design-system §2.4). Single
  title surface — the page renders no `<h2>/<h3>` of its own (§1, verified against three sibling
  pages). Keys added to `en.json`/`th.json`/`zh.json` in the same commit (§6).

##UX_COMPLETE##

import {
  InspectableVehicleDto,
  InspectionItemSubmission,
  InspectionVerdict,
  SubmitVehicleInspectionPayload,
  VehicleInspectionItemDto,
} from '../../../../services/staff/staff-api.service';
import { groupContiguousByCategory } from '../../../../shared/lib/vehicle-inspection-category';

// Pure mappers/formatters for InspectionPageComponent (OBRS-312), following the
// pattern established by vehicle-maintenance.mappers.ts / schedules.mappers.ts:
// no Angular/service dependencies, so these stay unit-testable without a
// component harness.

export interface InspectionItemRow {
  itemId: number;
  /** The master list's CURRENT label (already locale-resolved server-side —
   * NOT an i18n key, never hardcode/mirror into the locale bundles). */
  label: string;
  displayOrder: number;
  /** OBRS-530: the stable enum CODE (e.g. `'TIRES'`) — groups rows by vehicle
   * zone. See `groupRowsByCategory` below. */
  category: string;
  /** OBRS-530: the backend enum's declaration-order position (1-based) — THE
   * sort key for group order (SPEC D2). */
  categoryOrder: number;
}

/** OBRS-530: one contiguous run of `InspectionItemRow`s sharing a `category`,
 * carrying each row's FLAT index into the original sorted array (the
 * `itemsFormArray`/`itemRows` index — see `groupRowsByCategory`'s doc below
 * for why this must never be a per-group-local index). */
export interface InspectionGroup {
  category: string;
  labelKey: string;
  rows: { row: InspectionItemRow; flatIndex: number }[];
}

/**
 * Partitions the ALREADY-SORTED flat `rows` array (sorted by
 * `(categoryOrder, displayOrder, itemId)` — see `toActiveItemRows`) into
 * CONTIGUOUS RUNS by `category`, carrying each row's flat index.
 *
 * Thin wrapper over the shared `groupContiguousByCategory` (OBRS-553 lifted
 * this walk out so the admin history-detail grouping could reuse the SAME
 * never-`filter()` algorithm instead of a second copy) — see that function's
 * doc for why a `filter()`-per-category rewrite silently corrupts
 * `itemsFormArray.at(flatIndex)` indexing. FE-T1 below still pins the
 * flattened `flatIndex` sequence as exactly `0, 1, ..., N-1`.
 */
export function groupRowsByCategory(rows: readonly InspectionItemRow[]): InspectionGroup[] {
  return groupContiguousByCategory(rows, (row) => row.category);
}

/** Per-group "X/Y" counter (e.g. "ยาง 2/2") — `rowValues` is indexed
 * identically to `itemRows`/`itemsFormArray` (both built from the same
 * `toActiveItemRows` order), so `rowValues[flatIndex]` is always the value
 * for `group.rows[i].row`, never a mismatched one. */
export function countGroupCompleted(
  group: InspectionGroup,
  rowValues: readonly InspectionRowValue[]
): { done: number; total: number } {
  const total = group.rows.length;
  const done = group.rows.reduce(
    (count, { flatIndex }) => (rowValues[flatIndex]?.verdict != null ? count + 1 : count),
    0
  );
  return { done, total };
}

export interface InspectionRowValue {
  itemId: number;
  /** design-system §3.1: starts `null` on every row — no pre-seeded default. */
  verdict: InspectionVerdict | null;
  note: string;
}

export interface Option {
  code: string;
  label: string;
}

/** design-system §3.1: the vehicle picker's options — plain `{code, label}`,
 * no pre-seeded selection (the component's FormControl starts `null`). */
export function toVehicleOptions(vehicles: InspectableVehicleDto[]): Option[] {
  return vehicles.map((vehicle) => ({ code: String(vehicle.id), label: vehicle.label }));
}

/** Active checklist rows ordered by `(categoryOrder, displayOrder, itemId)`
 * (OBRS-530 SPEC D2 — group order first, then displayOrder within the group)
 * — inactive items (retired mid-week, or simply not yet enabled) never appear
 * as a row to fill in.
 *
 * ⚠️ RISK-2: this sort is the ONLY thing standing between the backend's
 * grouped order and a silently ungrouped UI. `mergeRowValues` below calls this
 * SAME function internally, so the FormArray build order and `itemRows`'
 * render order always agree — changing the sort here re-orders both at once. */
export function toActiveItemRows(items: VehicleInspectionItemDto[]): InspectionItemRow[] {
  return items
    .filter((item) => item.active)
    .slice()
    .sort(
      (a, b) =>
        a.categoryOrder - b.categoryOrder || a.displayOrder - b.displayOrder || a.id - b.id
    )
    .map((item) => ({
      itemId: item.id,
      label: item.label,
      displayOrder: item.displayOrder,
      category: item.category,
      categoryOrder: item.categoryOrder,
    }));
}

/**
 * Rebuilds the row-value list for the (possibly changed) active item set,
 * carrying forward any already-entered verdict/note for an itemId that's
 * still active. Used both for the initial load (`previousValues` empty) and
 * for the `INSPECTION_ITEM_INACTIVE` recovery path (silently re-fetch items,
 * preserve entries for itemIds still active — see design-system error table).
 */
export function mergeRowValues(
  activeItems: VehicleInspectionItemDto[],
  previousValues: ReadonlyMap<number, InspectionRowValue>
): InspectionRowValue[] {
  return toActiveItemRows(activeItems).map((row) => {
    const previous = previousValues.get(row.itemId);
    return previous
      ? { itemId: row.itemId, verdict: previous.verdict, note: previous.note }
      : { itemId: row.itemId, verdict: null, note: '' };
  });
}

/** Count of rows with a chosen verdict — feeds the "ตรวจแล้ว X / 23" progress pill. */
export function countCompletedRows(rows: readonly InspectionRowValue[]): number {
  return rows.filter((row) => row.verdict !== null).length;
}

/** Index of the first row with no verdict chosen yet, or -1 if every row is
 * complete. Drives the incomplete-submit scroll-to-and-highlight behavior
 * (submit is never DISABLED for this — only while actually submitting). */
export function findFirstIncompleteRowIndex(rows: readonly InspectionRowValue[]): number {
  return rows.findIndex((row) => row.verdict === null);
}

/** Index of the first `needs_repair` row whose mandatory note is blank —
 * mirrors the backend's `INSPECTION_NOTE_REQUIRED` gate client-side. */
export function findFirstMissingNoteRowIndex(rows: readonly InspectionRowValue[]): number {
  return rows.findIndex((row) => row.verdict === 'needs_repair' && row.note.trim() === '');
}

/**
 * The locked payload builder (OBRS-312 contract) — `note` is ALWAYS a string,
 * never `null`, even for an untouched/OK row. Callers must have already
 * verified every row has a non-null verdict (see `findFirstIncompleteRowIndex`)
 * — a row still carrying `null` here throws rather than silently coercing it,
 * since the backend has no representation for "no verdict".
 */
export function buildInspectionPayload(
  odometerKm: number,
  notes: string,
  rows: readonly InspectionRowValue[]
): SubmitVehicleInspectionPayload {
  const items: InspectionItemSubmission[] = rows.map((row) => {
    if (row.verdict === null) {
      throw new Error(`buildInspectionPayload: itemId ${row.itemId} has no verdict`);
    }
    return {
      itemId: row.itemId,
      verdict: row.verdict,
      note: (row.note ?? '').trim() || '',
    };
  });

  const trimmedNotes = notes.trim();
  return {
    odometerKm,
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    items,
  };
}

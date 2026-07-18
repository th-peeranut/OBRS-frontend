import {
  InspectableVehicleDto,
  InspectionItemSubmission,
  InspectionVerdict,
  SubmitVehicleInspectionPayload,
  VehicleInspectionItemDto,
} from '../../../../services/staff/staff-api.service';

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

/** Active checklist rows ordered by `displayOrder` — inactive items (retired
 * mid-week, or simply not yet enabled) never appear as a row to fill in. */
export function toActiveItemRows(items: VehicleInspectionItemDto[]): InspectionItemRow[] {
  return items
    .filter((item) => item.active)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((item) => ({ itemId: item.id, label: item.label, displayOrder: item.displayOrder }));
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

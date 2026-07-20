import {
  VehicleInspectionDetailItemDto,
  VehicleInspectionListItemDto,
} from '../../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';
import { isWithinRecentIsoWeeksBangkok } from '../../../../../shared/lib/inspection-week';
import {
  CategoryGroup,
  groupContiguousByCategory,
} from '../../../../../shared/lib/vehicle-inspection-category';

// Pure mappers for AppVehicleInspectionPanelComponent (OBRS-312), following
// the pattern established by vehicle-maintenance.mappers.ts: no Angular/HTTP
// dependencies, every locale-dependent value an explicit parameter.

export interface InspectionHistoryRow {
  id: number;
  inspectedAt: string;
  inspectedAtDisplay: string;
  inspectedByName: string;
  odometerKm: number;
  defectCount: number;
  defectChipToken: 'is-success' | 'is-danger';
  pendingMaintenance: boolean;
}

export function toInspectionHistoryRow(
  dto: VehicleInspectionListItemDto,
  dateLang: string | null | undefined
): InspectionHistoryRow {
  return {
    id: dto.id,
    inspectedAt: dto.inspectedAt,
    inspectedAtDisplay: formatDisplayDateTime(dto.inspectedAt, dateLang),
    inspectedByName: dto.inspectedByName ?? '-',
    odometerKm: dto.odometerKm,
    defectCount: dto.defectCount,
    defectChipToken: dto.defectCount > 0 ? 'is-danger' : 'is-success',
    pendingMaintenance: !!dto.pendingMaintenance,
  };
}

/**
 * The pending filter: default view is the current + previous Bangkok ISO
 * week (`weeksBack=1`); `showAll=true` removes the window entirely.
 *
 * This is a deliberately **switchable client-side filter, never a hard query
 * bound** — a rejected defect (the owner judged it not worth repairing)
 * writes nothing, so it stays `pendingMaintenance: true` forever. The 2-week
 * default lets a REJECTED defect age out of the default view, while "show
 * all" still surfaces a genuinely IGNORED one. A hard-bound query would make
 * an ignored defect disappear exactly like a rejected one — indistinguishable,
 * which defeats the point of the indicator.
 */
export function filterInspectionRowsByWindow<T extends { inspectedAt: string }>(
  rows: readonly T[],
  showAll: boolean,
  now: Date = new Date(),
  weeksBack = 1
): T[] {
  if (showAll) {
    return rows.slice();
  }
  return rows.filter((row) => isWithinRecentIsoWeeksBangkok(row.inspectedAt, weeksBack, now));
}

export interface InspectionDetailRow {
  itemId: number;
  /** The label AS INSPECTED (immutable history) — never the master list's
   * current label, which may have since changed. */
  itemLabelSnapshot: string;
  verdict: 'ok' | 'needs_repair';
  verdictChipToken: 'is-success' | 'is-danger';
  note: string;
  /** OBRS-553: the category AS INSPECTED (frozen at submit time, same
   * principle as `itemLabelSnapshot`) — a later re-group of the master
   * checklist must not reshuffle a sheet a driver already signed. */
  categorySnapshot: string;
}

/** OBRS-553: one contiguous run of `InspectionDetailRow`s sharing a
 * `categorySnapshot`, carrying each row's flat index — see
 * `groupContiguousByCategory` for why this must never be built with
 * `filter()`. */
export type InspectionDetailGroup = CategoryGroup<InspectionDetailRow>;

/**
 * OBRS-553: the server is authoritative for row order (it sorts by
 * `categorySnapshot`'s declaration order, then `displayOrderSnapshot`, then
 * `id` — see `SNAPSHOT_ORDER` on the backend) — the FE does NOT re-sort here.
 * It maps the response 1:1, then the presentational chip-token derivation.
 *
 * ⚠️ Was: "Detail rows are already ordered by `displayOrder` per the API
 * contract" — false as of OBRS-553. The read path no longer orders by the
 * MASTER item's live `displayOrder` at all (that field can differ from what
 * was true when this sheet was submitted); it orders by the frozen
 * `categorySnapshot`/`displayOrderSnapshot` pair instead.
 */
export function toInspectionDetailRows(
  items: readonly VehicleInspectionDetailItemDto[]
): InspectionDetailRow[] {
  return items.map((item) => ({
    itemId: item.itemId,
    itemLabelSnapshot: item.itemLabelSnapshot,
    verdict: item.verdict,
    verdictChipToken: item.verdict === 'needs_repair' ? 'is-danger' : 'is-success',
    note: item.note ?? '',
    categorySnapshot: item.categorySnapshot,
  }));
}

/** OBRS-553: groups the already-server-ordered detail rows into contiguous
 * per-`categorySnapshot` runs for the section-header rendering in the
 * history detail modal — reuses the SAME never-`filter()` walk as the driver
 * form's `groupRowsByCategory` (OBRS-530), never a second copy of it. */
export function groupDetailRowsByCategory(
  rows: readonly InspectionDetailRow[]
): InspectionDetailGroup[] {
  return groupContiguousByCategory(rows, (row) => row.categorySnapshot);
}

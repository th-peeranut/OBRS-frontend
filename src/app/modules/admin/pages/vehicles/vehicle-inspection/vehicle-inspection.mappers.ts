import {
  VehicleInspectionDetailItemDto,
  VehicleInspectionListItemDto,
} from '../../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';
import { isWithinRecentIsoWeeksBangkok } from '../../../../../shared/lib/inspection-week';

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
}

/** Detail rows are already ordered by `displayOrder` per the API contract —
 * no re-sort needed, just the presentational chip-token derivation. */
export function toInspectionDetailRows(
  items: readonly VehicleInspectionDetailItemDto[]
): InspectionDetailRow[] {
  return items.map((item) => ({
    itemId: item.itemId,
    itemLabelSnapshot: item.itemLabelSnapshot,
    verdict: item.verdict,
    verdictChipToken: item.verdict === 'needs_repair' ? 'is-danger' : 'is-success',
    note: item.note ?? '',
  }));
}

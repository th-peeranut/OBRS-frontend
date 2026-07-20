import {
  AdminInspectionItemDto,
  AdminInspectionItemTranslationDto,
  InspectionItemReorderReqDto,
} from '../../../../services/admin/admin-api.service';
import { categoryLabelKey } from '../../../../shared/lib/vehicle-inspection-category';

// Pure mappers/formatters/reorder-array-math extracted from
// InspectionItemsPageComponent (OBRS-509), mirroring cargo-capacity-page.mappers.ts /
// lookup-settings-page.mappers.ts's split of locale-dependent view logic and
// pure list operations away from the component. No Angular/service
// dependencies — every value is an explicit parameter.

export interface InspectionItemRow {
  id: number;
  code: string;
  displayOrder: number;
  active: boolean;
  /** OBRS-530: stable enum CODE (e.g. `'TIRES'`) — see
   * `AdminInspectionItemDto` for the wire-shape doc. */
  category: string;
  categoryOrder: number;
  labelEn: string;
  labelTh: string;
  labelZh: string;
}

export function translationLabel(
  translations: AdminInspectionItemTranslationDto[],
  locale: string
): string {
  return translations.find((translation) => translation.locale === locale)?.label ?? '';
}

export function toInspectionItemRow(item: AdminInspectionItemDto): InspectionItemRow {
  return {
    id: item.id,
    code: item.code,
    displayOrder: item.displayOrder,
    active: item.active,
    category: item.category,
    categoryOrder: item.categoryOrder,
    labelEn: translationLabel(item.translations, 'en'),
    labelTh: translationLabel(item.translations, 'th'),
    labelZh: translationLabel(item.translations, 'zh'),
  };
}

export type InspectionItemLocale = 'en' | 'th' | 'zh';

/** OBRS-529: the list table's single locale-aware label cell. Mirrors the
 * backend's own `TranslationUtil.resolveLabel` fallback ladder exactly
 * (selected locale -> `en` -> the raw slug) so the two never disagree: a row
 * missing the selected locale's translation (or missing it AND `en`) still
 * renders something, never a blank cell. Pure function — the caller (the
 * component) is responsible for re-invoking it whenever the selected locale
 * changes, so this alone can't silently become a one-time read. */
export function resolveInspectionItemLabel(
  row: Pick<InspectionItemRow, 'code' | 'labelEn' | 'labelTh' | 'labelZh'>,
  locale: InspectionItemLocale
): string {
  const byLocale: Record<InspectionItemLocale, string> = {
    en: row.labelEn,
    th: row.labelTh,
    zh: row.labelZh,
  };
  return byLocale[locale] || row.labelEn || row.code;
}

// OBRS-530: the backend already returns "/manage" ordered by
// `(categoryOrder, displayOrder, id)` (SPEC D2 — `VehicleInspectionItemService
// .EFFECTIVE_ORDER`) — this re-sort is NO LONGER just a defensive belt (never
// trust wire order alone). It is now LOAD-BEARING: `isCategoryHeaderRow` below
// assumes `rows` is already partitioned into
// contiguous per-category runs, and every move-button bound (`moveRowUp` etc.)
// assumes the same. A background refresh (or any future caller) skipping this
// re-sort would silently un-group the table with no error.
export function toInspectionItemRows(items: AdminInspectionItemDto[]): InspectionItemRow[] {
  return [...items]
    .sort(
      (a, b) =>
        a.categoryOrder - b.categoryOrder || a.displayOrder - b.displayOrder || a.id - b.id
    )
    .map(toInspectionItemRow);
}

/**
 * OBRS-530: is `rows[index]` the FIRST row of its contiguous category run?
 * Drives the group header `<tr>` inserted just before it. Walks the single
 * already-sorted `rows` array by comparing a row to its immediate
 * predecessor — deliberately NOT a second sorted/grouped structure (the
 * template's existing `*ngFor="let row of rows; let i = index"` + move-button
 * indices stay untouched; this only adds one more boolean check per row).
 */
export function isCategoryHeaderRow(rows: readonly InspectionItemRow[], index: number): boolean {
  return index === 0 || rows[index - 1].category !== rows[index].category;
}

// Removes the item at fromIndex and reinserts it at toIndex, computed against
// the ORIGINAL array's indices — i.e. toIndex is where the item should land
// counting the array with the item still present (matches every caller
// below, which picks toIndex from the pre-move array).
function moveItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...array];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}

// Recomputes every row's displayOrder as its new 1-based array index — dense
// `1..N` over the WHOLE array (retired rows included), per SPEC §3.5. THE
// GLOBAL renumber is unchanged by OBRS-530 (locked D2: `reorder()`'s
// whole-table dense validation is untouched) — only the move functions'
// BOUNDS below become group-scoped.
function renumberDisplayOrder(rows: InspectionItemRow[]): InspectionItemRow[] {
  return rows.map((row, index) => ({ ...row, displayOrder: index + 1 }));
}

/**
 * OBRS-530: the [start, end] index range of `index`'s own contiguous
 * category run within the already-sorted `rows` array — expands outward from
 * `index` by comparing immediate neighbors, never a separate grouped
 * structure. Every move function below clamps to this range instead of the
 * whole array, so a move can only permute rows WITHIN one group; the array
 * stays group-contiguous, and the next `(categoryOrder, displayOrder)` re-sort
 * (FE-T2) reproduces the exact array a within-group move produced.
 */
function categoryRunBounds(rows: InspectionItemRow[], index: number): { start: number; end: number } {
  const category = rows[index].category;
  let start = index;
  while (start > 0 && rows[start - 1].category === category) {
    start -= 1;
  }
  let end = index;
  while (end < rows.length - 1 && rows[end + 1].category === category) {
    end += 1;
  }
  return { start, end };
}

/** Swap with the row immediately above, WITHIN the same category group. No-op
 * (same array reference) at the top of the row's group — callers must also
 * disable the button via `canMoveUp`/`canMoveDown`, this is the defensive
 * second guard. (In a single-group table this degenerates to "top of the
 * whole array", the pre-OBRS-530 behavior.) */
export function moveRowUp(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index < 0 || index >= rows.length) {
    return rows;
  }
  const { start } = categoryRunBounds(rows, index);
  if (index <= start) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, index - 1));
}

/** Swap with the row immediately below, WITHIN the same category group. No-op
 * at the bottom of the row's group. */
export function moveRowDown(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index < 0 || index >= rows.length) {
    return rows;
  }
  const { end } = categoryRunBounds(rows, index);
  if (index >= end) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, index + 1));
}

/** Jump to the FIRST position within this group in a single click (not row 1
 * of the table). No-op if already there. */
export function moveRowToTop(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index < 0 || index >= rows.length) {
    return rows;
  }
  const { start } = categoryRunBounds(rows, index);
  if (index <= start) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, start));
}

/** Jump to the LAST position within this group in a single click (not row N
 * of the table). No-op if already there. */
export function moveRowToBottom(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index < 0 || index >= rows.length) {
    return rows;
  }
  const { end } = categoryRunBounds(rows, index);
  if (index >= end) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, end));
}

/** Builds the `/reorder` request body from the current `rows` array — the
 * WHOLE list, active and retired alike (SPEC §3.5). */
export function toReorderPayload(rows: InspectionItemRow[]): InspectionItemReorderReqDto {
  return {
    items: rows.map((row) => ({ id: row.id, displayOrder: row.displayOrder })),
  };
}

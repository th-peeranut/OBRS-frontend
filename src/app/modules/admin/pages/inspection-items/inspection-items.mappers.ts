import {
  AdminInspectionItemDto,
  AdminInspectionItemTranslationDto,
  InspectionItemReorderReqDto,
} from '../../../../services/admin/admin-api.service';

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
    labelEn: translationLabel(item.translations, 'en'),
    labelTh: translationLabel(item.translations, 'th'),
    labelZh: translationLabel(item.translations, 'zh'),
  };
}

// SPEC §3.2: "/manage" is already ordered `displayOrder ASC, id ASC` by the
// backend — this re-sort is a defensive belt (never trust wire order alone)
// so a background refresh always renders rows in a stable, correct sequence.
export function toInspectionItemRows(items: AdminInspectionItemDto[]): InspectionItemRow[] {
  return [...items]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
    .map(toInspectionItemRow);
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
// `1..N` over the WHOLE array (retired rows included), per SPEC §3.5.
function renumberDisplayOrder(rows: InspectionItemRow[]): InspectionItemRow[] {
  return rows.map((row, index) => ({ ...row, displayOrder: index + 1 }));
}

/** Swap with the row immediately above. No-op (same array reference) at the
 * top — callers must also disable the button via `canMoveUp`/`canMoveDown`,
 * this is the defensive second guard. */
export function moveRowUp(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index <= 0 || index >= rows.length) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, index - 1));
}

/** Swap with the row immediately below. No-op at the bottom. */
export function moveRowDown(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index < 0 || index >= rows.length - 1) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, index + 1));
}

/** Jump to position 1 (array index 0) in a single click. No-op if already there. */
export function moveRowToTop(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index <= 0 || index >= rows.length) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, 0));
}

/** Jump to the last position in a single click. No-op if already there. */
export function moveRowToBottom(rows: InspectionItemRow[], index: number): InspectionItemRow[] {
  if (index < 0 || index >= rows.length - 1) {
    return rows;
  }
  return renumberDisplayOrder(moveItem(rows, index, rows.length - 1));
}

/** Builds the `/reorder` request body from the current `rows` array — the
 * WHOLE list, active and retired alike (SPEC §3.5). */
export function toReorderPayload(rows: InspectionItemRow[]): InspectionItemReorderReqDto {
  return {
    items: rows.map((row) => ({ id: row.id, displayOrder: row.displayOrder })),
  };
}

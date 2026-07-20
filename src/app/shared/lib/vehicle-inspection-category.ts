// OBRS-530: the 7 vehicle-inspection checklist groups (D1 — enum + i18n JSON, no
// new table/translation table). Shared by BOTH the driver form
// (inspection-page.mappers.ts, groupRowsByCategory) and the admin master-list
// editor (inspection-items.mappers.ts, the category selector + group header
// rows) so the i18n namespace and the declaration-order list exist in exactly
// ONE place, never redeclared per feature.
//
// Order here is UI-display-list order only (drives the admin CREATE/EDIT
// dropdown's option order, since a brand-new item has no `categoryOrder` from
// the backend yet). It intentionally mirrors the backend
// `EVehicleInspectionCategory` enum's declaration order (SPEC D2/GROUP
// ASSIGNMENT table) so the two never visibly disagree, but it is NOT the
// source of truth for sorting already-fetched rows — every fetched
// `VehicleInspectionItemDto`/`AdminInspectionItemDto` already carries its own
// server-computed `categoryOrder`, and `toActiveItemRows`/`toInspectionItemRows`
// sort by THAT field, never by this list's index.
export const VEHICLE_INSPECTION_CATEGORIES: readonly string[] = [
  'ENGINE_FLUIDS',
  'TIRES',
  'LIGHTING',
  'DRIVING',
  'CABIN',
  'SAFETY_DOCS',
  'WALKAROUND',
];

/** The single i18n key builder for a category's display name — both the driver
 * form's group section header and the admin table's group header row/category
 * dropdown option resolve a category code through this SAME function, so the
 * namespace can't drift between the two surfaces. */
export function categoryLabelKey(category: string): string {
  return `ADMIN.INSPECTION_ITEMS.CATEGORY.${category}`;
}

/** One contiguous run of rows sharing a category, carrying each row's FLAT
 * index into the original array — see `groupContiguousByCategory`'s doc for
 * why this must never be a per-group-local index. */
export interface CategoryGroup<T> {
  category: string;
  labelKey: string;
  rows: { row: T; flatIndex: number }[];
}

/**
 * OBRS-530 (`groupRowsByCategory`, driver form) / OBRS-553 (admin history
 * detail) share this ONE grouping algorithm — parameterized by `categoryOf`
 * since the two callers' row shapes name their category field differently
 * (`InspectionItemRow.category` vs `InspectionDetailRow.categorySnapshot`),
 * never forked into two copies of the same walk.
 *
 * Partitions an ALREADY-SORTED flat `rows` array into CONTIGUOUS RUNS by
 * `categoryOf(row)`, carrying each row's flat index.
 *
 * MUST walk the sorted array and cut runs on a category change — NEVER
 * `filter()` per category. A filter-based implementation
 * (`rows.filter(r => categoryOf(r) === c).map((row, i) => ({row, flatIndex: i}))`)
 * looks correct (each group DOES get the right rows) but resets `flatIndex`
 * to 0 at the start of every group instead of continuing the running count —
 * so any caller indexing a parallel structure built by iterating the SAME
 * flat `rows` array once (e.g. the driver form's `itemsFormArray`) silently
 * points at the wrong entry for every row after the first group, with no
 * error anywhere. Callers' own tests pin the flattened `flatIndex` sequence
 * as exactly `0, 1, ..., N-1` — a filter-based implementation fails that
 * assertion immediately.
 */
export function groupContiguousByCategory<T>(
  rows: readonly T[],
  categoryOf: (row: T) => string
): CategoryGroup<T>[] {
  const groups: CategoryGroup<T>[] = [];

  rows.forEach((row, flatIndex) => {
    const category = categoryOf(row);
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup.category === category) {
      currentGroup.rows.push({ row, flatIndex });
    } else {
      groups.push({
        category,
        labelKey: categoryLabelKey(category),
        rows: [{ row, flatIndex }],
      });
    }
  });

  return groups;
}

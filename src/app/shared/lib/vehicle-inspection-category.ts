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

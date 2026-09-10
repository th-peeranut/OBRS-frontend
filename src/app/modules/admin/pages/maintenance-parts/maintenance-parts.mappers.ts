import { AdminMaintenancePartDto } from '../../../../services/admin/admin-api.service';
import { normalizeRegistryName } from '../../../../shared/lib/registry-name';

export type MaintenancePartKind = AdminMaintenancePartDto['kind'];

/**
 * OBRS-1613: the two kinds, in the order the registry's filter shows them.
 *
 * <p>Two and not one. The card's constraint 3 is explicit: labour must never collapse into a single
 * entry called "ค่าแรง", because the labour to change a belt and the labour to change the oil would
 * pile into one price history and get compared against each other — the exact mistake the card
 * exists to prevent. The kind is what keeps a specific labour entry ("ค่าแรงเปลี่ยนสายพาน") apart
 * from the part it is performed on.
 */
export const MAINTENANCE_PART_KIND_CODES: readonly MaintenancePartKind[] = [
  'PART',
  'LABOUR',
] as const;

/**
 * OBRS-1613: is this one of the 13 rows the system seeded, rather than one the owner typed?
 *
 * <p>`code` is the whole test and there is no second signal — see `AdminMaintenancePartDto`. Two
 * screens need the answer for two different reasons: the list marks a seeded row as translated, and
 * the rename dialog warns that saving will discard those translations for good.
 */
export function isSeededPart(part: Pick<AdminMaintenancePartDto, 'code'>): boolean {
  return part.code !== null;
}

/**
 * OBRS-1613: the name to put on screen, under the owner's 2026-08-25 ruling — the 13 seeded entries
 * keep their translations, anything the owner typed is Thai verbatim on every locale.
 *
 * <p>`translate` is passed in rather than injected so this stays a pure function the tests can pin
 * without a TestBed. It is `TranslateService#instant` at every call site.
 *
 * <p>The fallback matters: `instant` returns the KEY itself when a translation is missing, so a code
 * that ever stops having one would put `ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.ENGINE_OIL` in front of
 * an owner. Falling back to `name` shows the Thai the seed wrote, which is wrong in English but
 * readable — and readable-and-wrong beats an i18n key every time.
 */
export function maintenancePartLabel(
  part: Pick<AdminMaintenancePartDto, 'code' | 'name'>,
  translate: (key: string) => string
): string {
  if (part.code === null) {
    return part.name;
  }
  const key = `ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.${part.code}`;
  const translated = translate(key);
  return translated && translated !== key ? translated : part.name;
}

/**
 * OBRS-1613 AC2: whether what was typed is already on record — the test that decides between
 * "this one exists, we will reuse it" and letting the save through as a new entry.
 *
 * <p>Exact match on the normalized form. NOT a substring rule: "สายพาน" is a legitimate new entry
 * even while "สายพานราวลิ้น" is in the list, and refusing it because something merely CONTAINS it
 * would strand the owner with no way to record what the bill actually says.
 */
export function findMaintenancePartByExactName(
  parts: AdminMaintenancePartDto[],
  name: string
): AdminMaintenancePartDto | undefined {
  const needle = normalizeRegistryName(name);
  if (!needle) {
    return undefined;
  }
  return parts.find((part) => normalizeRegistryName(part.name) === needle);
}

/** OBRS-1613: name order, so the registry and every picker agree about where a row sits.
 * `localeCompare` with Thai first — the list is overwhelmingly Thai and the default ordering puts
 * every Thai name after every Latin one in an order no reader recognises. */
export function sortMaintenancePartsByName(
  parts: AdminMaintenancePartDto[]
): AdminMaintenancePartDto[] {
  return [...parts].sort((left, right) => left.name.localeCompare(right.name, 'th'));
}

/**
 * OBRS-1613: the rows a typed query should offer, matched on the NORMALIZED forms of both sides so
 * "สายพาน หน้าเครื่อง" finds "สายพานหน้าเครื่อง" — the same rule and the same reason as
 * `filterPayeesByQuery`. An empty query offers everything.
 *
 * <p>`label` is matched as well as `name`, and that is not belt-and-braces: the 13 seeded rows are
 * stored in Thai and DISPLAYED through i18n (owner ruling 2026-08-25), so on an English screen the
 * owner reads "Engine oil" and types "engine" — matching `name` alone would return nothing and put
 * "+ add engine" in front of a row that is already there, which is the duplicate this registry
 * exists to prevent.
 */
export function filterMaintenancePartsByQuery(
  parts: AdminMaintenancePartDto[],
  query: string,
  label: (part: AdminMaintenancePartDto) => string
): AdminMaintenancePartDto[] {
  const needle = normalizeRegistryName(query);
  if (!needle) {
    return parts;
  }
  return parts.filter(
    (part) =>
      normalizeRegistryName(part.name).includes(needle) ||
      normalizeRegistryName(label(part)).includes(needle)
  );
}

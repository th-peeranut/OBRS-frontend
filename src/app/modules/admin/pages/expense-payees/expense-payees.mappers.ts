import { AdminExpensePayeeDto } from '../../../../services/admin/admin-api.service';
import { normalizeRegistryName } from '../../../../shared/lib/registry-name';

export type PayeeType = AdminExpensePayeeDto['type'];

/** OBRS-1577: the three kinds, in the order the registry's filter tabs show them. */
export const PAYEE_TYPE_CODES: readonly PayeeType[] = ['GARAGE', 'FUEL_STATION', 'OTHER'] as const;

/**
 * OBRS-1577 AC5, client side: the same "are these two names one garage" rule the server applies,
 * so the form can tell whether what was typed is already on record WITHOUT a round trip per
 * keystroke.
 *
 * <p>OBRS-1613 moved the rule itself - and the whole rationale for every character in it - to
 * `shared/lib/registry-name.ts`, when the parts registry became the second screen that needs it.
 * The backend made the same move in the same card (`RegistryNameNormalizer.java`). Kept as a named
 * delegate rather than replaced at every call site: `normalizePayeeName` reads as what it does
 * here, and the two registries agreeing is now a property of the code instead of a thing two
 * people have to remember.
 */
export function normalizePayeeName(name: string): string {
  return normalizeRegistryName(name);
}

/**
 * OBRS-1577 decision 1 (owner, 2026-08-24): when a payee is added from inside the bill form, its
 * type is taken from the bill's own category rather than asked for — one fewer click in the middle
 * of typing a bill, and the button says out loud which type it is about to create.
 *
 * <p>Deliberately literal and deliberately narrow: REPAIR means a garage, FUEL means a petrol
 * station, and EVERY other category means OTHER. It is tempting to also map TIRE or INSPECTION to
 * GARAGE, and that temptation is what the measurement warns against — 5 real bills counted
 * 2026-08-24 (OBRS-1578) show only 2 of 5 payees are actually garages; the rest were a glass shop, a
 * battery shop and a gas-system company, all of which an owner books under REPAIR. Widening the
 * guess widens the error. The type is editable on the registry screen, which is the mitigation the
 * owner accepted when approving this.
 */
export function inferPayeeTypeFromCategory(category: string): PayeeType {
  if (category === 'REPAIR') {
    return 'GARAGE';
  }
  if (category === 'FUEL') {
    return 'FUEL_STATION';
  }
  return 'OTHER';
}

/**
 * OBRS-1577: the rows a typed query should offer. Matching runs on the NORMALIZED forms of both
 * sides, so "อู่เฮีย หน่อง" finds "อู่เฮียหน่อง" — the whole point of the field being a picker rather
 * than a text box. An empty query offers everything.
 */
export function filterPayeesByQuery(
  payees: AdminExpensePayeeDto[],
  query: string
): AdminExpensePayeeDto[] {
  const needle = normalizePayeeName(query);
  if (!needle) {
    return payees;
  }
  return payees.filter((payee) => normalizePayeeName(payee.name).includes(needle));
}

/**
 * OBRS-1577: whether what was typed is already on record — the test that decides between offering
 * the list and offering "add it". Exact match on the normalized form, NOT the substring rule
 * `filterPayeesByQuery` uses: "อู่เฮีย" is a legitimate new payee even while "อู่เฮียหน่อง" is in
 * the list, and refusing to add it because something merely CONTAINS it would strand the owner.
 */
export function findPayeeByExactName(
  payees: AdminExpensePayeeDto[],
  name: string
): AdminExpensePayeeDto | undefined {
  const needle = normalizePayeeName(name);
  if (!needle) {
    return undefined;
  }
  return payees.find((payee) => normalizePayeeName(payee.name) === needle);
}

/** OBRS-1577: name order, so the registry and the picker never disagree about where a row sits.
 * `localeCompare` with Thai first — the list is overwhelmingly Thai and the default ordering puts
 * every Thai name after every Latin one in an order no reader recognises. */
export function sortPayeesByName(payees: AdminExpensePayeeDto[]): AdminExpensePayeeDto[] {
  return [...payees].sort((left, right) => left.name.localeCompare(right.name, 'th'));
}

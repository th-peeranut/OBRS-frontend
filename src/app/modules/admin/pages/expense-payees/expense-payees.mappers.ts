import { AdminExpensePayeeDto } from '../../../../services/admin/admin-api.service';

export type PayeeType = AdminExpensePayeeDto['type'];

/** OBRS-1577: the three kinds, in the order the registry's filter tabs show them. */
export const PAYEE_TYPE_CODES: readonly PayeeType[] = ['GARAGE', 'FUEL_STATION', 'OTHER'] as const;

/**
 * OBRS-1577: every character that must not decide whether two typed names are the same garage.
 *
 * <p>⚠️ <b>This is a hand-maintained mirror of the backend's
 * `ExpensePayeeDtoService.INSIGNIFICANT_CHARS`, and nothing enforces the two stay equal.</b> The
 * backend is the authority — it owns `uq_expense_payees_owner_name` and its create is idempotent by
 * this rule — so a drift here is not a data defect but a UI lie: this copy decides whether the form
 * offers "add this payee" for a name that in fact already exists.
 *
 * <p>Three groups, and the last two are the ones a bare `\s` misses in BOTH languages:
 * <ul>
 *   <li>`\s` — but the two languages disagree on what it means. JavaScript's includes U+FEFF and
 *       excludes U+0085 (NEL); Java's, with `UNICODE_CHARACTER_CLASS`, is the reverse. Both
 *       characters are therefore named explicitly below in both files rather than left to `\s`.</li>
 *   <li>The zero-width family (U+200B–U+200D, U+2060) is not whitespace to Unicode at all. Thai has
 *       no inter-word space, so ZERO WIDTH SPACE is exactly how Thai text marks a word break — an
 *       invisible character no owner can see, delete, or be told about.</li>
 *   <li>U+FEFF, which rides on the front of anything pasted out of a UTF-8 file with a BOM.</li>
 * </ul>
 */
const INSIGNIFICANT_CHARS = /[\s\u0085\u200B-\u200D\u2060\uFEFF]+/gu;

/**
 * OBRS-1577 AC5, client side: the same "are these two names one garage" rule the server applies,
 * so the form can tell whether what was typed is already on record WITHOUT a round trip per
 * keystroke.
 *
 * <p>NFC first, and it is not decoration: a Thai syllable stacks marks on its base consonant, and
 * `อู่` is อ + SARA UU + MAI EK. Typed in the other order it renders IDENTICALLY and is a different
 * string, so without canonical composition the picker would show "not in the registry — add it?" for
 * a garage that is sitting in the list directly above the message.
 *
 * <p>`toLowerCase()` and not `toLocaleLowerCase()`: the locale-sensitive one lower-cases `I` to a
 * dotless `ı` under a Turkish locale, which would make the same name match differently depending on
 * the browser's language setting. The server pins `Locale.ROOT` for exactly this reason.
 */
export function normalizePayeeName(name: string): string {
  return name.normalize('NFC').replace(INSIGNIFICANT_CHARS, '').toLowerCase();
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

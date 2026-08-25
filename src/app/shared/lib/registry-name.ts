/**
 * OBRS-1613: the one "are these two typed names the same thing" rule, shared by every owner-editable
 * name registry on this frontend.
 *
 * <p>It was born inside `expense-payees.mappers.ts` for OBRS-1577 and lived there alone until this
 * card added a SECOND registry with the same dedup contract. Two copies of this regex is the failure
 * it exists to prevent, one level up: the payee list and the parts list would each decide "already on
 * record?" by their own rule, and the disagreement would only ever show up as a duplicate row nobody
 * typed twice. The backend made the same move in the same card — `RegistryNameNormalizer.java`, which
 * `ExpensePayeeDtoService` and `MaintenancePartDtoService` both delegate to.
 *
 * <p>⚠️ <b>This file and `RegistryNameNormalizer.java` are hand-maintained mirrors, and nothing
 * enforces the two stay equal.</b> The backend is the authority — it owns
 * `uq_expense_payees_owner_name` and `uq_maintenance_parts_owner_name`, and both its creates are
 * idempotent by this rule — so drift here is not a data defect but a UI lie: this copy decides
 * whether a form offers "add this" for a name that in fact already exists.
 *
 * <p>Three groups, and the last two are the ones a bare `\s` misses in BOTH languages:
 * <ul>
 *   <li>`\s` — but the two languages disagree on what it means. JavaScript's includes U+FEFF and
 *       excludes U+0085 (NEL); Java's, with `UNICODE_CHARACTER_CLASS`, is the reverse. Each file
 *       therefore names the character ITS OWN `\s` misses: U+0085 here, U+FEFF on the Java side.
 *       The two sets end up equal — brute-forced over every code point 0x0–0x10FFFF, zero
 *       disagreements — but they get there by naming different characters, so do not "add" U+0085
 *       to the Java pattern for symmetry; its `\s` already covers it.</li>
 *   <li>The zero-width family (U+200B–U+200D, U+2060) is not whitespace to Unicode at all. Thai has
 *       no inter-word space, so ZERO WIDTH SPACE is exactly how Thai text marks a word break — an
 *       invisible character no owner can see, delete, or be told about.</li>
 *   <li>U+FEFF, which rides on the front of anything pasted out of a UTF-8 file with a BOM.</li>
 * </ul>
 */
const INSIGNIFICANT_CHARS = /[\s\u0085\u200B-\u200D\u2060\uFEFF]+/gu;

/**
 * OBRS-1577 AC5 / OBRS-1613 AC2, client side: the same rule the server applies, so a form can tell
 * whether what was typed is already on record WITHOUT a round trip per keystroke.
 *
 * <p>NFC first, and it is not decoration: a Thai syllable stacks marks on its base consonant, and
 * `อู่` is อ + SARA UU + MAI EK. Typed in the other order it renders IDENTICALLY and is a different
 * string, so without canonical composition the picker would show "not in the registry — add it?" for
 * an entry that is sitting in the list directly above the message.
 *
 * <p>`toLowerCase()` and not `toLocaleLowerCase()`: the locale-sensitive one lower-cases `I` to a
 * dotless `ı` under a Turkish locale, which would make the same name match differently depending on
 * the browser's language setting. The server pins `Locale.ROOT` for exactly this reason.
 */
export function normalizeRegistryName(name: string): string {
  return name.normalize('NFC').replace(INSIGNIFICANT_CHARS, '').toLowerCase();
}

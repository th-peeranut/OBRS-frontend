/**
 * The one place a money amount is turned into a string for a user (OBRS-1592).
 * Every render site found by three passes of this card routes through it, and
 * `scripts/check-money-format.mjs` keeps the four forms it can SEE from coming
 * back - it cannot see a `.toFixed()` that reaches a template, so "single source
 * of truth" is the intent here, not a proven property of the tree. The standard shape puts the unit where each language actually
 * reads it, and shows satang only when there are satang:
 *   formatMoney(200,    'th') -> `200 บาท`      · formatMoney(1850, 'th') -> `1,850 บาท`
 *   formatMoney(199.5,  'th') -> `199.50 บาท`
 *   formatMoney(200,    'en') -> `THB 200`      · formatMoney(199.5, 'en') -> `THB 199.50`
 *   formatMoney(200,    'zh') -> `200泰铢`       (no space - CJK sets no space before the unit)
 *
 * WHY THIS EXISTS. Before this file there were four on-screen formats for one
 * amount (measured 2026-08-24): `Intl.NumberFormat('th-TH', {currency:'THB'})`
 * copied into 11 components printed `฿200.00`; the `| currency:'THB':'symbol'`
 * pipe printed the same in walk-in checkout; 13 admin/report screens ran
 * `Intl.NumberFormat('en-US', {currency})` and printed `THB 200.00`; and the
 * search page — and the whole booking / checkout / e-ticket flow, under five
 * differently-named `*_UNIT` keys that a `BAHT_UNIT` ban never saw — composed
 * the raw number with an i18n unit and printed `200 บาท` with no thousand
 * separator at all. A customer could be told
 * `฿200.00` on screen and `200.00 บาท` in the confirmation email a minute later.
 *
 * WHY THE UNIT IS NOT AN i18n KEY. Thai and Chinese put the unit AFTER the
 * number, English puts a code BEFORE it, and Chinese takes no space while Thai
 * does - that is a per-language PATTERN, not a per-language word, so a single
 * `BAHT_UNIT`-style key cannot express it (which is exactly why the backend
 * carries the whole pattern in `notification.currency.format` rather than a
 * unit word). `display-date-time.ts` (OBRS-178) set the precedent for keeping
 * such a pattern in code as a pure function: same reason, same shape, and it
 * stays unit-testable without a component harness.
 *
 * The `th` wording is not a new decision - OBRS-240 settled it on 2026-07-11
 * for every transactional email and SMS (`messages_th.properties`:
 * `{0} บาท`). This file is the screens catching up. `฿` is deliberately absent:
 * it is the one form a reader has to already recognise, and CLDR does not make
 * it the default for Thai-language OR Chinese-language output either (measured:
 * `zh-CN` defaults to `THB 200.00` and offers `200.00泰铢`; `฿200.00` is only
 * its opt-in `narrowSymbol`).
 *
 * THB is hard-coded rather than taken from the API. The 13 admin screens used
 * to read a `currency` field off the response, but every one of the backend's
 * 10 currency-emitting sites writes the literal `"THB"` and no other currency
 * code exists anywhere in that codebase (measured 2026-08-24), so the parameter
 * selected between one possibility and nothing.
 *
 * `lang` - UI language code; only the `th` / `zh` / other distinction matters.
 */

/** Amount with grouping, unit placed per `lang`. `0 บาท` for missing/unparsable input. */
export function formatMoney(
  value: number | string | null | undefined,
  lang?: string | null
): string {
  const amount = toFiniteAmount(value);
  const digits = hasSatang(amount) ? 2 : 0;

  // 'en-US' pins the grouping/decimal marks (`1,850.50`) instead of letting the
  // UI language pick them: th/en/zh all read that pair the same way, and the
  // backend already fixes them the same way (`CurrencyUtil` formats under
  // `Locale.ROOT`), so a screen and its confirmation email cannot drift apart.
  const number = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);

  const code = (lang || '').toLowerCase();
  if (code.startsWith('th')) {
    return `${number} บาท`;
  }
  if (code.startsWith('zh')) {
    return `${number}泰铢`;
  }
  return `THB ${number}`;
}

/** Coerces an amount-like value to a finite number, falling back to `0`. */
function toFiniteAmount(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

/**
 * Whether the amount still has a fractional part once rounded to the two
 * decimals money is counted in. Rounding first is what makes `199.999` render
 * as `200 บาท` rather than `200.00 บาท`: at two decimals there are no satang
 * left to show, and float noise below that is not information.
 */
function hasSatang(amount: number): boolean {
  return Math.round(amount * 100) % 100 !== 0;
}

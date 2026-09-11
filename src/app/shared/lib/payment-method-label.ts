/**
 * OBRS-1800 — the `EPaymentMethod` slug a payment record carries, turned into a
 * label a user can read.
 *
 * Two admin tables printed the raw slug instead (`qr_promptpay` on screen while the
 * UI was in Thai): they interpolated `row.paymentMethod` straight into the cell
 * while the column header beside it went through `| translate`.
 *
 * The labels are NOT new. Two dictionaries already carry all eight backend slugs in
 * th/en/zh, so this reads one of them rather than opening a third copy of the same
 * eight words. `ADMIN.EOD_REPORT.METHOD.*` is the one it reads, and the choice is not
 * taste: the booking-detail timeline drops this label into a translated sentence with
 * a parenthesised slot (`ได้รับการชำระเงิน ({{method}})`), and the other candidate
 * spells PromptPay `พร้อมเพย์ (QR)`, which renders there as `(พร้อมเพย์ (QR))`. A label
 * that has to compose inside somebody else's punctuation must not carry its own.
 *
 * `translate` is a plain `(key) => string` rather than a `TranslateService`, the
 * same shape `api-error.ts` uses — callers pass `k => this.translate.instant(k)`.
 *
 * ngx-translate echoes the key back when an entry is missing, so a slug the backend
 * ships before i18n catches up falls back to the raw slug instead of painting a
 * dotted key string into the table (the `eod-sales-report` guard, same reason).
 */
export function paymentMethodLabel(
  slug: string | null | undefined,
  translate: (key: string) => string
): string {
  const code = (slug ?? '').trim();
  if (!code) {
    return '';
  }
  const key = `ADMIN.EOD_REPORT.METHOD.${code.toUpperCase()}`;
  const translated = translate(key);
  return translated === key ? code : translated;
}

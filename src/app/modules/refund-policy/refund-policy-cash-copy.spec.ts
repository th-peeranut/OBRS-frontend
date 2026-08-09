import enI18n from '../../../../public/i18n/en.json';
import thI18n from '../../../../public/i18n/th.json';
import zhI18n from '../../../../public/i18n/zh.json';

/**
 * OBRS-1152 (item 2 / AC-1 / AC-4) — a gate on the PUBLISHED copy, not on the
 * component.
 *
 * `refund-policy.component.spec.ts` next door renders the page with stub
 * translations on purpose: its subject is interpolation and the language
 * switch, and it stays green no matter what the shipped bundle says. That is
 * exactly how `/refund-policy` came to promise two things the override cancel
 * door does not do, and nothing failed:
 *
 *  1. it lumped **cash** into the same bullet as PromptPay/bank transfer and
 *     said "during cancellation the system asks you for a bank account" — the
 *     override door never asks anyone (`CancellationService.isDestinationRequired`
 *     is false for the "CASH" method), and the counter door does not ask either
 *     because the salesperson hands the cash over on the spot; and
 *  2. it therefore described neither of the two real cash outcomes.
 *
 * Both cash lanes resolve to the same `refundMethod` literal "CASH"
 * (`CancellationService.java:271` / `:427`); `cashHandedOverNow` is the only
 * thing telling them apart:
 *
 *  - counter door (`cancelBooking`, true)      -> cash leaves the drawer now
 *  - override door (`adminCancelBooking`, false) -> still owed, staff phone for
 *    a bank account / PromptPay number and transfer it
 *
 * so the published page has to name both. These assertions read the REAL
 * bundles: if someone re-merges cash into the transfer bullet, or drops the
 * "you never have to travel here to collect it" guarantee that the counter
 * lane relies on being true, this suite goes red rather than the owner finding
 * out from a customer.
 */
describe('POLICY.REFUND.CONTENT_2 — published cash copy (OBRS-1152)', () => {
  const BUNDLES: ReadonlyArray<readonly [string, string]> = [
    ['en', (enI18n as any).POLICY.REFUND.CONTENT_2],
    ['th', (thI18n as any).POLICY.REFUND.CONTENT_2],
    ['zh', (zhI18n as any).POLICY.REFUND.CONTENT_2],
  ];

  // The exact labels the pre-OBRS-1152 bullet used to carry. Cash sharing a
  // bullet with the transfer methods IS the defect, so the wording is pinned
  // per-language rather than approximated.
  const MERGED_CASH_BULLET: Record<string, string> = {
    en: 'bank transfer and cash',
    th: 'การโอนเงิน และเงินสด',
    zh: '银行转账及现金',
  };

  // The cash bullet's own <strong> label.
  const CASH_LABEL: Record<string, string> = {
    en: '<strong>Cash</strong>',
    th: '<strong>เงินสด</strong>',
    zh: '<strong>现金</strong>',
  };

  // What the override lane owes the reader: we call you, you give us an
  // account, we transfer. The email says the same thing from the other side
  // (`notification.booking.cancelled.refund.cash_owed`).
  const CONTACT_YOU: Record<string, string> = {
    en: 'our staff contact you for a bank account or PromptPay number',
    th: 'เจ้าหน้าที่จะติดต่อท่านเพื่อขอบัญชีธนาคารหรือหมายเลขพร้อมเพย์',
    zh: '工作人员会联系您索取银行账户或 PromptPay 号码',
  };

  // The promise the COUNTER lane keeps and must not be deleted while fixing
  // the override lane — it is the sentence OBRS-627 put there.
  const NO_TRAVEL: Record<string, string> = {
    en: 'no cash refund that you must travel to collect in person',
    th: 'เราไม่มีการคืนเงินสดที่ท่านต้องเดินทางมารับด้วยตนเอง',
    zh: '我们没有需要您亲自前往领取的现金退款',
  };

  BUNDLES.forEach(([lang, content]) => {
    describe(lang, () => {
      it('gives cash its own bullet instead of the transfer bullet', () => {
        expect(content).toContain(CASH_LABEL[lang]);
        expect(content).not.toContain(MERGED_CASH_BULLET[lang]);
      });

      it('states the override outcome: we contact you and transfer it', () => {
        expect(content).toContain(CONTACT_YOU[lang]);
      });

      it('keeps the no-travel-to-collect guarantee', () => {
        expect(content).toContain(NO_TRAVEL[lang]);
      });
    });
  });

  it('all three bundles carry the same number of bullets', () => {
    const counts = BUNDLES.map(([, content]) => (content.match(/<li>/g) ?? []).length);
    expect(counts).toEqual([4, 4, 4]);
  });
});

// OBRS-629: the published identity of the parcel carriage terms.
//
// Same shape as privacy-policy.version.ts (OBRS-628) and business-policy.version.ts (OBRS-658,
// ADR-0125), deliberately, not a third invention: version constant here, version line on the page,
// append-only fingerprint ledger in scripts/check-i18n-parity.mjs.
//
// 1.0 is the first published wording. Before it there was NO parcel terms page at all while the
// service was already taking money (that is what OBRS-629 reports), so this version does not
// replace an earlier text and there is nothing to give notice OF — publishedOn == effectiveDate.
//
// ⚠️ The 500-baht liability ceiling in POLICY.PARCEL.LIABILITY is typed into the translation
// files, and that is correct here even though OBRS-564 forbids typing ENFORCED limits into i18n.
// The distinction: parcel.max_weight_kg is enforced by ParcelIntakeService, so a page repeating it
// can silently disagree with the code — POLICY.PARCEL.LIMITS therefore interpolates it from
// GET /api/parcel-policy. The 500 is a CONTRACT term with no enforcing code path anywhere (there
// is no claims engine; claims are settled at a counter in cash, clause 9), so there is nothing for
// it to drift away from. What protects it instead is the ledger below: changing the number changes
// the fingerprint and fails `npm run test:i18n` until a new version is published.
//
// Its origin, because a number in a contract must be traceable: ระเบียบและคู่มือรถร่วม บขส.
// พ.ศ. 2547 ข้อ 82, which binds us through clauses 10 and 12 of affiliate contract E-51-29.
// Recorded in obrs-agent-office `docs/regulatory/REGULATION-BKS-SHARED-BUS-2547.md`.
// Clause 3's closing sentence was rewritten on the same day 1.0 was drafted, and the ledger
// fingerprint corrected in place instead of opening a 1.1 -- 1.0 had not reached a reader yet
// (unmerged branch, no deploy). The reason for the rewrite is regulatory, not cosmetic: ระเบียบ
// ข้อ 80 forbids charging for a passenger's own baggage under 20 kg / 0.5 m³, so "must buy a seat
// of its own" described our fee as a baggage charge, which is the one description that conflicts
// with it. What actually happens -- confirmed by the owner 2026-08-16 -- is that there is no
// luggage hold at all: everything rides in the saloon, in free floor space or the aisle, and an
// over-size item is given a seat because it physically occupies one. The wording now says that.
export const PARCEL_POLICY_VERSION = '1.0';
export const PARCEL_POLICY_EFFECTIVE_DATE = '2026-08-16';

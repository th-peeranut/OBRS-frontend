// OBRS-658 AC 2 (ADR-0125): the published identity of the booking terms.
//
// Why a version at all: the text on /business-policy is a contract with a consumer. It carried no
// version and no date, so nothing on the site could answer "which wording was this ticket sold
// under?" — and because the prose is under no test that reads it, it could be reworded with no
// trace. The privacy notice hit the same wall in OBRS-628 and this is deliberately the same shape,
// not a second invention: version constant here, version line on the page, append-only fingerprint
// ledger in scripts/check-i18n-parity.mjs, and a nullable column recording what the customer saw.
//
// 1.0 is the wording as it stood on this date, published for the first time under an identifier. It
// is NOT a claim that the terms changed today, and it is NOT backfilled onto tickets sold earlier:
// bookings.booking_policy_version stays NULL for those, because they were sold from a page that
// carried no version line and saying otherwise would be a fabrication (V80, ADR-0125).
//
// EFFECTIVE_DATE is the date these terms are in force from. For 1.0 that is the publication date —
// nothing about the terms themselves changed, so there is nothing to give notice OF. That will not
// be true of the next entry: OBRS-656 makes the reschedule fee apply to every change, which is worse
// for a customer already holding a ticket, and ADR-0125 requires such a version to be published
// BEFORE it takes effect. The ledger enforces that (`worsensTerms: true` ⇒ publishedOn strictly
// before effectiveDate); the length of the notice is the owner's call on OBRS-656.
//
// ⚠️ Enforcement of the terms does NOT read this file. Fees and windows are computed live from
// system_configs, so an admin edit changes the terms for tickets already sold — stated in full in
// ADR-0125 "Consequence, stated plainly". The protection for an existing ticket holder is the
// announced effective date, not a frozen copy of the rules on their ticket.
//
// Enforced, not merely written down: check-i18n-parity.mjs fingerprints the Thai
// POLICY.BUSINESS.{TITLE,SALES_CHANNELS,CONTENT} text against BUSINESS_POLICY_LEDGER. Editing the
// terms without appending a ledger entry fails `npm run test:i18n`, and re-using a version number
// for different text collides with that version's own entry.
//
// 1.1 (OBRS-629 AC-5): items 4 and 5 now state that they cover baggage a passenger carries on
// board, and the page links to the parcel carriage terms. Read literally, the old wording refused
// liquids, fragile goods and oversized items outright — i.e. said we cannot carry parcels — while
// the site was already selling parcel carriage. Not a worsening: the same items are still refused
// in a passenger's hands. See BUSINESS_POLICY_LEDGER in scripts/check-i18n-parity.mjs.
export const BUSINESS_POLICY_VERSION = '1.1';
export const BUSINESS_POLICY_EFFECTIVE_DATE = '2026-08-16';

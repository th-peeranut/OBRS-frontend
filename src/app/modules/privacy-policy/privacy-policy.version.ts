// OBRS-628 AC-3: the published identity of the privacy notice.
//
// Why a version at all: consent is only meaningful against a specific text. The
// page carried no version and no date, so nothing on the site could answer
// "which wording did this customer agree to?" — and because the notice is not
// under any test that reads its prose, it could be reworded with no trace.
//
// EFFECTIVE_DATE is the date this VERSION IDENTIFIER was published, not a
// researched legal date. The prose itself is older (it predates every commit
// that touches this folder) and is still awaiting the owner's rewrite — AC 4-7
// of OBRS-628. That rewrite lands as 2.0 with its own date; do not edit the
// wording under 1.0.
//
// Enforced, not merely written down: `scripts/check-i18n-parity.mjs` keeps an
// append-only ledger of (version, effectiveDate, fingerprint) and fingerprints
// the Thai POLICY.PRIVACY.{TITLE,CONTENT_1,CONTENT_2} text. Editing the notice
// without bumping the version here fails `npm run test:i18n`, and re-using a
// version number for different text collides with its own ledger entry.
export const PRIVACY_POLICY_VERSION = '1.0';
export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026-07-22';

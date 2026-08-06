// OBRS-628 AC-3: the published identity of the privacy notice.
//
// Why a version at all: consent is only meaningful against a specific text. The
// page carried no version and no date, so nothing on the site could answer
// "which wording did this customer agree to?" — and because the notice is not
// under any test that reads its prose, it could be reworded with no trace.
//
// EFFECTIVE_DATE is the date the VERSION IDENTIFIER was published. For 1.0 that
// was all it could be: the prose predated every commit touching this folder and
// was still awaiting the owner's rewrite (OBRS-628 AC 4-7, carried to OBRS-631).
//
// 2.0 (OBRS-631) IS that rewrite, and its date is the date the new wording was
// published. What changed: 1.0 named no data-subject right, no processor, no
// retention period and no way to contact us. 2.0 covers PDPA sections 30-36 and
// 19, the categories of recipient and the transfers out of Thailand, a cookie
// list measured from the live site rather than copied from a blog, and retention
// expressed as dates instead of "as long as necessary".
//
// Still not covered, deliberately: in-vehicle camera recording (OBRS-676 — the
// provider, the country and the retention period are unknown, and a guessed
// number on a published notice is a false statement). The notice says so in
// section 10 rather than staying silent about it.
//
// Enforced, not merely written down: `scripts/check-i18n-parity.mjs` keeps an
// append-only ledger of (version, effectiveDate, fingerprint) and fingerprints
// the Thai POLICY.PRIVACY.{TITLE,CONTENT_1,CONTENT_2} text. Editing the notice
// without bumping the version here fails `npm run test:i18n`, and re-using a
// version number for different text collides with its own ledger entry.
// 2.1 (OBRS-1095) changes exactly one sentence: the telephone number in section
// 1. 2.0 told a data subject to call 09 0562 2019 to reach the managing partner
// about a section 30-36 request, and the owner confirmed that number is the Nong
// Chak ticket counter — a channel that can neither grant nor refuse the request,
// and therefore cannot deliver the 30-day answer the same notice promises. The
// footer keeps the counter number: that is the general "contact us" line, where
// the counter is the right destination.
//
// Bumping the version is not cosmetic. account-page.component shows the OBRS-632
// re-consent banner to every account whose recorded pdpaConsentVersion is not
// this string, so existing users will be asked to accept 2.1. That is the
// designed behaviour for PDPA section 19 — consent is against a specific text —
// and the cheapest moment to pay it is now, before the site goes on sale.
export const PRIVACY_POLICY_VERSION = '2.1';
export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026-08-06';

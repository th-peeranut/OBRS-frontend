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
//
// 2.2 (OBRS-1140) adds one bullet to section 6. Every retention period the notice
// listed was about data the customer gives us; none covered the record we keep
// ABOUT that data — export_audit_log, which stores which member of staff exported
// which dataset, when, and the search filters they typed to find it. Those
// filters are personal data (a phone number typed in to find one booking is a
// phone number), and until OBRS-1140 nothing deleted any of it. The notice now
// states both periods — filters at 90 days, the rest of the row at a year — and a
// nightly job enforces them, so the sentence is a description rather than an
// intention. The re-consent consequence above applies again, at the same price:
// the site is still not on sale.
// 2.3 (OBRS-1140 AC#4) adds the bullet 2.2's own reasoning implies. 2.2 covered the
// record we keep ABOUT a customer's data; this covers the data a customer hands us
// most directly and section 6 had simply never mentioned: the screenshots and text
// attached to a usability report. Section 2 has declared that collection since 2.0
// ("ภาพที่ท่านแนบมา"), submission is anonymous and needs no account, and nothing in
// the code had ever deleted one — deleteQuietly is compensation for a failed upload,
// not retention. Section 6 now states the window the owner decided on 2026-08-09:
// kept while the report is open, 90 days after it closes, and a two-year backstop for
// a report nobody ever triaged. Enforced nightly by UsabilityReportRetentionScheduler,
// so this is a description and not an intention.
//
// Same day as 2.2 and still a separate version: 2.2 shipped in its own commit, and one
// version identifier covering two different texts is exactly what the ledger exists to
// prevent. The re-consent consequence above applies again, at the same price — the site
// is still not on sale.
// The date is the 10th, not the 9th, and that is the ledger's rule rather than a typo:
// two versions sharing an effective date cannot be ordered by the only field a data
// subject can see. Nobody loses a day by it — prod serves no site yet (it answers 404)
// and the scheduled dev->sit promote does not run until Monday night.
export const PRIVACY_POLICY_VERSION = '2.3';
export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026-08-10';

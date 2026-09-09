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
// 2.4 (OBRS-1528 + OBRS-1366) is the first version published to fix statements that
// were simply not true of the running system, rather than to add something the notice
// had never covered. Three of them, and they ship as ONE version on the owner's
// decision of 2026-08-22: the ledger refuses to let one version cover two texts, so
// two separate fixes would have meant 2.4 and 2.5 and the re-consent above paid twice.
//
// What changed: the two sentences that pointed at the withdraw button "at the end of
// this page" as plain fact are now conditional on the site actually collecting —
// OBRS-1179 stops rendering that button wherever no measurement ID is configured,
// which is every build prod runs, so the notice was describing a control the reader
// could not find; the cookie paragraph no longer says consent alone makes _ga/_clck/
// _clsk appear, because with no ID configured `loadGa4()` returns early and nothing is
// set whatever the visitor answers; and section 2 no longer claims passenger type is
// used "to arrange seating and to apply the correct fare", which measurement on the
// code prod runs disproves twice over (OBRS-1366) — it is display-only, it is optional
// since OBRS-1357, and the list now includes the nun option OBRS-1365 shipped.
//
// The re-consent consequence above applies again. It is no longer free — prod serves a
// live site now, unlike at 2.2/2.3 — and that is the argument FOR one bump, not
// against fixing the text: an untrue notice is what consent would otherwise be
// recorded against.
// 2.5 — OBRS-1364 AC-4 + OBRS-1546, one bump for both.
//
// 2.4 told the reader passenger type is used "for display only" and "not used to
// arrange seating". OBRS-1364 makes that untrue the moment a schedule is set to
// `ASSIGNED`: `ScheduleService.getBlockedSeatsForPassengerType` closes the seats
// beside a conflicting occupant, and `BookingService.assignAutomaticSeats` avoids
// the same pairing on all three allocation paths. Under `OPEN` neither runs —
// `BookingService:684` nulls every seat before auto-assign is reachable — so the
// new sentence is written CONDITIONALLY ("เฉพาะรอบที่ระบุหมายเลขที่นั่ง"). That is
// deliberate: it is true today under OPEN and still true after ASSIGNED is switched
// on, which is what buys one bump instead of two. It also states the limits the code
// actually has — the auto-allocation is best-effort with a silent fallback, and a
// blank passenger type constrains nothing.
//
// ⚠️ The closure is in the BOOKING SCREEN, which is why the sentence says seats "may
// be closed to you" and not that the pairing cannot happen. `verifySeatAvailability`
// checks occupancy and nothing else, so a seat this rule greys out is still bookable
// by a walk-in POS sale or any other client. That is not a hole to plug: the owner
// decided on 2026-08-30 that nobody is ever refused a seat over this rule.
//
// ⚠️ What this bump does NOT settle: whether `monk`/`nun` is sensitive data under
// PDPA §26. Section 3 still lists no §26 basis, and that gap predates OBRS-1364 —
// the display purpose has the same exposure. Tracked as OBRS-1666, awaiting a
// lawyer's answer; do not read this version as an answer to it.
//
// OBRS-1546 rides along per the owner's 2026-08-22 decision (never ship it alone):
// sections 3 and 6 now carry the same "only while analytics is switched on"
// condition that 2.4 gave sections 7 and 8.
//
// The re-consent consequence above applies again — one banner on /account for every
// existing account. It buys a notice that is true both before and after the seating
// mode changes, against one that is already false the day a schedule flips.
// 2.6 (OBRS-1666) closes the gap 2.5's own note flagged and refused to answer.
//
// Section 3 declared a legal basis for every purpose the notice states - 24(3), 24(5), 24(6),
// 19 - and never once wrote 'section 26' or 'sensitive data', while section 2 collected
// passenger type including monk and nun. Those two answers state a religious status, and
// section 24 is expressly subject to section 26, so if they are section-26 data then the bases
// the notice named could not carry them and the notice was describing a lawfulness it did not
// have. The owner's decision of 2026-08-31 (AC-2 option b) does not wait for that legal
// question: it asks for explicit consent, which is correct whichever way the answer goes -
// required if section 26 applies, harmless over-compliance if it does not.
//
// What changed: section 2 says the two religious answers are collected ONLY with explicit
// consent given on the passenger-details page, and that refusing costs the traveller nothing
// because the type is then simply not recorded; section 3 gains the section-26 bullet it never
// had, naming both purposes (display + seating) against 'your explicit consent only'.
//
// Enforced rather than promised: the checkbox is per passenger, starts unticked and is reset to
// unticked on every change of type (a pre-ticked box is not explicit consent), and
// BookingService DROPS a monk/nun answer that arrives without a consent version rather than
// store it - PassengerReqDto.passengerTypeConsentVersion lands in tickets.
// passenger_type_consent_version (V133). A booking is never refused over this: the field has
// been optional since OBRS-1357.
//
// ⚠️ One half of the purpose this consent names is NOT running on `dev` today. Section 2's
// seating sentence arrived with 2.5, but OBRS-1364's backend was never merged (PR #293 is
// still open - OBRS-1687), so `blocked-seats` 404s and the frontend swallows it. 2.6 keeps
// seating in the new section-26 bullet on purpose: AC-2 option (b) requires the consent to
// name BOTH purposes, and asking again later would cost a second bump and a second re-consent
// banner. What makes that safe rather than untrue is OBRS-1687 AC-2, which forbids promoting
// `dev` to SIT/prod before #293 lands - so no reader ever meets this text while the sentence
// is false. If that card is closed any other way, this bullet has to be re-read before the
// promote, not after.
//
// The staff sell page ticks the same box on the passenger's behalf. Whether consent given by a
// clerk (or by a booker for a co-passenger) is valid consent is NOT settled here - it is
// OBRS-1666 AC-1, still with a lawyer. Do not read this version as an answer to it.
//
// The re-consent consequence above applies again - one banner on /account for every existing
// account - and it is the same trade 2.4 made: an untrue notice is what consent would otherwise
// be recorded against.
export const PRIVACY_POLICY_VERSION = '2.6';
export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026-08-31';

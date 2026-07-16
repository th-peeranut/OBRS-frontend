/**
 * A Thai mobile number as the user types it: `0[689]XXXXXXXX`.
 *
 * Mirrors the backend's `ThaiMsisdn.CANONICAL_PATTERN` (OBRS-409). The backend also accepts the
 * `66[689]XXXXXXXX` spelling on the wire, because ThaiBulkSMS takes either (ADR-0079) — this form
 * deliberately does not offer that choice. A Thai user typing their own number types the local
 * form, and the backend now stores only the canonical one anyway, so accepting a second spelling
 * here would buy nothing and hand people a way to type a number that renders back differently
 * from what they entered.
 *
 * Narrower than the `/^0\d{9}$/` used by the booking/passenger forms: `0[689]` are the real Thai
 * mobile prefixes, so `02...` (a Bangkok landline) is correctly rejected for a phone we will send
 * an OTP to. Those other forms still carry their own copy of a looser rule — unifying them is
 * OBRS-455, not this card.
 */
export const THAI_MOBILE_PATTERN = /^0[689]\d{8}$/;

import { AnalyticsParams, AnalyticsParamValue } from '../interfaces/analytics.interface';

/**
 * OBRS-867 AC-4 — nothing personal may leave with an analytics event.
 *
 * WHY THIS IS CODE AND NOT A RULE IN THE CARD
 * "don't send PII" is exactly the shape of instruction that holds until the
 * first hurried commit. The typed `AnalyticsParams` union already stops the
 * mistakes we make on purpose; this stops the ones we make by accident, at the
 * only moment that matters — after the payload is assembled and before a third
 * party receives it. Once a name reaches GA4 or Clarity it is on someone else's
 * disk and no commit of ours takes it back.
 *
 * WHY IT STRIPS INSTEAD OF THROWING
 * This function is pure and always returns a clean bag plus the list of what it
 * removed. The caller decides how loud to be: `AnalyticsService` logs the
 * violations and, on a non-production build, rethrows so a developer meets the
 * failure the same minute they cause it — while a production customer's
 * checkout is never interrupted by a measurement concern.
 *
 * WHY THE DENY LIST ERRS TOWARD BLOCKING
 * A false positive costs one missing chart column. A false negative costs a
 * PDPA incident. Where the two conflict, block. `name` is a substring rule for
 * that reason: it would also refuse a future `station_name`, which is a price
 * worth paying (and the census of parameters this app actually sends today,
 * listed in `analytics.interface.ts`, contains no such key).
 */

/**
 * Normalized keys that are refused outright. Compared after lowercasing and
 * stripping every non-alphanumeric character, so `seat_number`, `seatNumber`
 * and `SEAT-NUMBER` are all one entry.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  // identity
  'fullname',
  'displayname',
  'username',
  'title',
  // contact
  'emailaddress',
  'tel',
  'telephone',
  'address',
  'addressline',
  // government identifiers
  'citizenid',
  'nationalid',
  'idcard',
  'passportno',
  'passportnumber',
  // the ticket itself
  'seat',
  'seatno',
  'seatnumber',
  'seatnumbers',
  'ticket',
  'ticketno',
  'ticketnumber',
  'bookingref',
  'bookingreference',
  'bookingcode',
  'reference',
  'referenceno',
  'referencenumber',
  'qrreferencenumber',
  // dates of birth
  'dob',
  'birthdate',
  'birthday',
  // account / payment secrets
  'cardno',
  'cardnumber',
  'cvv',
  'password',
  'token',
  'authtoken',
  'accesstoken',
  'idempotencykey',
  // pseudonymous identifiers that re-identify a person by joining back to our DB
  'userid',
  'customerid',
  'actorid',
  'bookerid',
  'passengerid',
  'bookingid',
]);

/**
 * Normalized substrings that are refused wherever they appear in a key. Kept
 * short and unambiguous — every entry here is a word that has no innocent use
 * in a metric name.
 */
const FORBIDDEN_KEY_SUBSTRINGS: readonly string[] = [
  'name',
  'email',
  'phone',
  'mobile',
  'passport',
  'password',
  'citizen',
  'national',
  // `date_of_birth` normalizes to `dateofbirth`, which no exact entry catches —
  // the reason this list exists alongside the exact one.
  'birth',
];

/** Anything shaped like an email address, wherever it sits in the string. */
const EMAIL_SHAPE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * A Thai phone number once separators are stripped: `0812345678`,
 * `+66812345678`, `66812345678`. Anchored so an 8-digit date such as
 * `20260729` does not trip it.
 */
const THAI_PHONE_SHAPE = /^(?:\+?66|0)\d{8,9}$/;

/** A Thai national ID is exactly 13 digits. */
const NATIONAL_ID_SHAPE = /^\d{13}$/;

/** Any run of 9+ digits inside a longer string — no metric of ours looks like that. */
const LONG_DIGIT_RUN = /\d{9,}/;

/** The outcome of screening one parameter bag. */
export interface SanitizedAnalyticsParams {
  /** Everything that survived. Safe to hand to a provider as-is. */
  readonly params: Record<string, AnalyticsParamValue>;
  /**
   * Human-readable reasons, one per removed key. Empty means the bag was
   * clean. Never contains the offending *value* — that would just move the
   * leak into the console and, from there, into a pasted bug report.
   */
  readonly violations: readonly string[];
}

/** Thrown on non-production builds when a payload tried to carry PII. */
export class AnalyticsPiiError extends Error {
  constructor(eventName: string, violations: readonly string[]) {
    super(
      [
        `ANALYTICS PII REFUSED on '${eventName}' — OBRS-867 AC-4.`,
        ...violations.map((v) => `  - ${v}`),
        '',
        'The offending keys were stripped and nothing was sent for them. Fix the',
        'call site: analytics parameters must describe the STEP, never the person.',
      ].join('\n')
    );
    this.name = 'AnalyticsPiiError';
  }
}

/**
 * Screens one parameter bag. Pure — no logging, no throwing, no I/O — so it is
 * testable on its own and the policy can be asserted directly by a spec rather
 * than inferred from a service's behaviour.
 *
 * Removes, in this order: keys whose *name* is personal, values that are not a
 * GA4-safe primitive, and values whose *shape* is personal even under an
 * innocent key (a free-text field that happens to hold an email).
 * `null`/`undefined` values are dropped silently — an absent optional is not a
 * violation, just absent.
 */
export function sanitizeAnalyticsParams(
  params: AnalyticsParams | null | undefined
): SanitizedAnalyticsParams {
  const clean: Record<string, AnalyticsParamValue> = {};
  const violations: string[] = [];

  if (!params) {
    return { params: clean, violations };
  }

  // `Object.entries` walks own enumerable keys only, so a polluted prototype
  // cannot smuggle a key past this loop (OBRS-427/601 precedent).
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    const forbiddenKeyReason = describeForbiddenKey(key);
    if (forbiddenKeyReason) {
      violations.push(`'${key}' ${forbiddenKeyReason}`);
      continue;
    }

    if (!isAnalyticsPrimitive(value)) {
      violations.push(
        `'${key}' is a ${describeType(value)} — only string, number and boolean ` +
          'may be sent; an object would be stringified by the tag unpredictably.'
      );
      continue;
    }

    const forbiddenValueReason =
      typeof value === 'string' ? describeForbiddenValue(value) : null;
    if (forbiddenValueReason) {
      violations.push(`'${key}' holds a value that ${forbiddenValueReason}`);
      continue;
    }

    clean[key] = value;
  }

  return { params: clean, violations };
}

/** Why this key is refused, or `null` when it is allowed. */
function describeForbiddenKey(key: string): string | null {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (FORBIDDEN_KEYS.has(normalized)) {
    return 'is a personal-data field name (exact match on the deny list).';
  }

  const substring = FORBIDDEN_KEY_SUBSTRINGS.find((candidate) =>
    normalized.includes(candidate)
  );
  if (substring) {
    return `contains '${substring}', which never belongs in a metric name.`;
  }

  return null;
}

/** Why this string value is refused, or `null` when it is allowed. */
function describeForbiddenValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (EMAIL_SHAPE.test(trimmed)) {
    return 'is shaped like an email address.';
  }

  const digitsOnly = trimmed.replace(/[\s()+-]/g, '');
  if (THAI_PHONE_SHAPE.test(digitsOnly)) {
    return 'is shaped like a Thai phone number.';
  }
  if (NATIONAL_ID_SHAPE.test(digitsOnly)) {
    return 'is shaped like a Thai national ID.';
  }
  if (LONG_DIGIT_RUN.test(trimmed)) {
    return 'contains a run of 9 or more digits, which no metric of ours does.';
  }

  return null;
}

function isAnalyticsPrimitive(value: unknown): value is AnalyticsParamValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function describeType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'number') {
    return 'non-finite number';
  }
  return typeof value;
}

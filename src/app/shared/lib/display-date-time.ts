/**
 * The single source of truth for displaying an ISO / offset date (and optional
 * time) to users (OBRS-178). The standard shape is day-first, space separated,
 * localized month, e.g.
 *   formatDisplayDateTime → `8 ก.ค. 2026 08:32` (th) · `8 Jul 2026 08:32` (en)
 *   formatDisplayDate     → `8 ก.ค. 2026`       (th) · `8 Jul 2026`       (en)
 *   formatDisplayTime     → `08:32` (language-independent — no month name)
 *
 * Times are pinned to `Asia/Bangkok` — every OBRS timestamp is Bangkok-offset
 * and the product is Thailand-only, so the wall-clock reading is stable
 * regardless of the viewer's own timezone (and deterministic under test).
 *
 * Contract (both functions): returns `'-'` for empty input and echoes the raw
 * value untouched when it can't be parsed, so a malformed value is surfaced
 * rather than lost.
 *
 * `lang` — UI language code; only the `th` / non-`th` distinction matters.
 */

import { toApiOffsetDateTime } from './api-date-time';

/** Full date + 24h time, e.g. `8 ก.ค. 2026 08:32`. */
export function formatDisplayDateTime(
  value: string | null | undefined,
  lang?: string | null
): string {
  const parts = bangkokParts(value);
  if (typeof parts === 'string') {
    return parts;
  }
  const { day, month, year, hour, minute } = parts;
  return `${day} ${monthName(month, lang)} ${year} ${hour}:${minute}`;
}

/** Date only, e.g. `8 ก.ค. 2026`. */
export function formatDisplayDate(
  value: string | null | undefined,
  lang?: string | null
): string {
  const parts = bangkokParts(value);
  if (typeof parts === 'string') {
    return parts;
  }
  const { day, month, year } = parts;
  return `${day} ${monthName(month, lang)} ${year}`;
}

/**
 * 24h Bangkok time only, e.g. `14:32`. Same '-' / echo contract as its
 * siblings. SPEC-OBRS-426 BR-12a: for a value that can only ever be "today"
 * within the current Bangkok wall-clock day (e.g. a position `recordedAt`,
 * which can only be reported inside a window that opens shortly before
 * departure and closes shortly after arrival), the date is redundant and
 * brevity is load-bearing on a 375px screen — use this instead of
 * `formatDisplayDateTime`. For any value that can be genuinely multi-day-out
 * (e.g. `windowOpensAt`, which can be days away), keep `formatDisplayDateTime`
 * — stripping the date there would silently answer "when" with a time that
 * reads as today. No `lang` parameter: the time render is already
 * language-independent (only the month name was not).
 */
export function formatDisplayTime(value: string | null | undefined): string {
  const parts = bangkokParts(value);
  if (typeof parts === 'string') {
    return parts;
  }
  return `${parts.hour}:${parts.minute}`;
}

/**
 * OBRS-1585: the Bangkok wall-clock calendar day of an API timestamp, as
 * `YYYY-MM-DD` — `''` for empty or unparseable input, which matches no day.
 *
 * For deciding which day a row belongs to, and nothing else. It exists so a
 * day filter reads the row off the SAME clock that prints the row's date
 * column: splitting the raw string at `T` is a different clock, and the two
 * disagree the moment a value arrives in any offset but `+07:00`
 * (`2026-12-20T23:30:00Z` is 06:30 on the 21st in Bangkok, so the split says
 * the 20th while the column says the 21st and the row vanishes from its own
 * day). Compare against the day a `p-datePicker` holds via
 * `controlValueToDateString()`.
 */
export function bangkokDayKey(value: string | null | undefined): string {
  const parts = bangkokParts(value);
  if (typeof parts === 'string') {
    return '';
  }
  const { day, month, year } = parts;
  return `${year}-${String(month + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

interface DateParts {
  day: string;
  month: number; // 0-based index
  year: string;
  hour: string;
  minute: string;
}

/**
 * Bangkok wall-clock components for an ISO string, or a short-circuit string
 * (`'-'` for empty, the raw value for unparseable) the callers pass straight
 * through — keeping the empty/echo contract in one place.
 */
function bangkokParts(value: string | null | undefined): DateParts | string {
  if (!value) {
    return '-';
  }
  // OBRS-1585: `Date` reads an offset-less date-TIME as the VIEWER's own wall
  // clock, so the "stable regardless of the viewer's timezone" promise above
  // only held for values that already carried an offset. Pin those to Bangkok
  // first — the same normalisation `bangkokInstantMs()` does, and what the
  // value always meant. A date-only string is deliberately left alone:
  // `new Date('2026-07-08+07:00')` is Invalid Date, and callers do pass plain
  // `YYYY-MM-DD` (expenseDate, nextDueDate, ...) to `formatDisplayDate()`.
  const raw = String(value);
  const date = new Date(/\d:\d/.test(raw) ? toApiOffsetDateTime(raw) : raw);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  const parts = bangkokFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    day: String(Number(get('day'))), // Number() strips any leading zero.
    month: Number(get('month')) - 1,
    year: get('year'),
    // Some ICU builds render midnight as '24' under hour12:false — normalize.
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
  };
}

function monthName(index: number, lang?: string | null): string {
  const l = String(lang ?? 'th').toLowerCase();
  const key = l.startsWith('th') ? 'th' : l.startsWith('zh') ? 'zh' : 'en';
  return MONTHS_SHORT[key][index] ?? '';
}

// The app ships th/en/zh (app.component addLangs); anything else falls back to en.
const MONTHS_SHORT: Record<'th' | 'en' | 'zh', readonly string[]> = {
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
};

// One reusable formatter yielding Bangkok wall-clock components as plain
// (Latin-digit) numbers; the localized month name is applied separately so both
// languages share identical day/year/time rendering. Constructing an
// Intl.DateTimeFormat isn't free and this runs per table row, so cache it.
const bangkokFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

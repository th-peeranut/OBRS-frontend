/**
 * The single source of truth for displaying an ISO / offset date (and optional
 * time) to users (OBRS-178). The standard shape is day-first, space separated,
 * localized month, e.g.
 *   formatDisplayDateTime → `8 ก.ค. 2026 08:32` (th) · `8 Jul 2026 08:32` (en)
 *   formatDisplayDate     → `8 ก.ค. 2026`       (th) · `8 Jul 2026`       (en)
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
  const date = new Date(value);
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

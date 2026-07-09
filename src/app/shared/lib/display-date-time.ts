/**
 * Locale-aware presentation formatter for an ISO / offset date-time string.
 *
 * Thai (default) → `8 ก.ค. 2026 08:32`; English → `Jul 08, 2026, 08:32`
 * (the existing admin house style, e.g. `bookings.store.ts`). Times are pinned
 * to `Asia/Bangkok` — every OBRS timestamp is Bangkok-offset and the product is
 * Thailand-only, so this keeps the wall-clock time stable regardless of the
 * viewer's own timezone (and makes the output deterministic under test).
 *
 * Contract mirrors the per-page `formatDateTime` copies it stands in for:
 * returns `'-'` for empty input and echoes the raw value untouched when it
 * can't be parsed, so a malformed value is surfaced rather than silently lost.
 *
 * @param value ISO 8601 / offset date-time (e.g. `2026-07-08T08:32:44.105575+07:00`).
 * @param lang  UI language code; only the `th` / non-`th` distinction matters.
 */
export function formatDisplayDateTime(
  value: string | null | undefined,
  lang?: string | null
): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  const isThai = String(lang ?? 'th').toLowerCase().startsWith('th');
  return formatterFor(isThai).format(date);
}

// Constructing an `Intl.DateTimeFormat` is not free, and these formatters are
// called from templates — once per row, per change-detection tick. Cache the
// two formatters (Thai / English) so repeated renders reuse one instance each.
const formatterCache = new Map<boolean, Intl.DateTimeFormat>();

function formatterFor(isThai: boolean): Intl.DateTimeFormat {
  const cached = formatterCache.get(isThai);
  if (cached) {
    return cached;
  }
  // Plain `th-TH` defaults to the Buddhist calendar (พ.ศ. 2569) and Thai
  // digits; pin Gregorian + Latin numerals so the year reads `2026`.
  const locale = isThai ? 'th-TH-u-ca-gregory-nu-latn' : 'en-US';
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Bangkok',
    day: isThai ? 'numeric' : '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  formatterCache.set(isThai, formatter);
  return formatter;
}

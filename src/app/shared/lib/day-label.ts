import dayjs from 'dayjs';

/**
 * OBRS-1217 / OBRS-862 — weekday + date labels in the ACTIVE language, from the
 * platform's own calendar data. No locale bundle to register and no hand-kept
 * key set: 21 short weekday strings across three languages would be 21 chances
 * to drift.
 *
 * Lifted out of `ScheduleBookingListComponent` (where OBRS-1217 first wrote it)
 * when the day strip became a second consumer of the same two functions.
 */

export function toBcp47(lang: string | null | undefined): string {
  const normalized = (lang || '').toLowerCase();
  if (normalized.startsWith('th')) return 'th-TH';
  if (normalized.startsWith('zh')) return 'zh-CN';
  return 'en-GB';
}

/** Weekday (long) + day + short month, e.g. "วันอังคาร 11 ส.ค.". The year is
 *  left out on purpose: `th-TH` renders it as a Buddhist-era year, which is
 *  right but noisy inside a button. */
export function formatDayLabel(date: Date, lang: string): string {
  try {
    return new Intl.DateTimeFormat(toBcp47(lang), {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    // A locale the runtime rejects must not blank the button out.
    return dayjs(date).format('D MMM');
  }
}

/** OBRS-862 — the two rows of a day-strip chip. Same try/catch fallback as
 *  `formatDayLabel`, for the same reason: a rejected locale must not blank the
 *  chip out. */
export function formatDayChip(
  date: Date,
  lang: string
): { weekday: string; date: string } {
  const bcp47 = toBcp47(lang);
  try {
    return {
      weekday: new Intl.DateTimeFormat(bcp47, { weekday: 'short' }).format(date),
      date: new Intl.DateTimeFormat(bcp47, {
        day: 'numeric',
        month: 'short',
      }).format(date),
    };
  } catch {
    return { weekday: dayjs(date).format('ddd'), date: dayjs(date).format('D MMM') };
  }
}

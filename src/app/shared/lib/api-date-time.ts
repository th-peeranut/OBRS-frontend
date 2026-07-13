const OFFSET_DATE_TIME_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const BANGKOK_OFFSET = '+07:00';

export function toApiOffsetDateTime(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().replace(' ', 'T');
  if (!normalized) {
    return '';
  }

  return OFFSET_DATE_TIME_PATTERN.test(normalized)
    ? normalized
    : `${normalized}${BANGKOK_OFFSET}`;
}

export function combineBangkokDateTime(date: string, time: string): string {
  return toApiOffsetDateTime(`${date}T${time}:00`);
}

/**
 * OBRS-272: splits an offset ISO date-time back into separate `date`
 * (`YYYY-MM-DD`) / `time` (`HH:mm`) strings for a date+time control pair (two
 * `p-calendar`s). A plain string split is safe here — every OBRS timestamp
 * already carries the fixed `+07:00` Bangkok offset (the product is
 * Thailand-only), so there's no timezone math to do, unlike
 * `formatDisplayDateTime()` which converts to Bangkok wall-clock for *display*.
 * Mirrors the shape of `schedules.mappers.ts`'s module-local `splitDateTime()` —
 * kept here (not imported from there) so `shared/` code never depends on a
 * lazy feature module.
 */
export function splitApiOffsetDateTime(value: string | null | undefined): { date: string; time: string } {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return { date: '', time: '' };
  }

  const [date, rawTime = ''] = normalized.includes('T')
    ? normalized.split('T')
    : normalized.split(/\s+/);

  return {
    date,
    time: rawTime.slice(0, 5),
  };
}

/** `YYYY-MM-DD` → a local `Date` (midnight) for a `p-calendar` date control, or
 * `null` for empty/unparseable input. Mirrors `schedules.mappers.ts`'s
 * `toDateControlValue()` — see the `splitApiOffsetDateTime()` doc comment for
 * why this isn't imported from there. */
export function dateStringToControlValue(dateValue: string | null | undefined): Date | null {
  const normalized = String(dateValue ?? '').trim();
  const [year, month, day] = normalized.split('-').map((part) => Number(part));

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

/** `HH:mm` → a local `Date` (today's date, that wall-clock time) for a
 * `p-calendar` `[timeOnly]` control, or `null` for empty/unparseable input.
 * Mirrors `schedules.mappers.ts`'s `toTimeControlValue()`. */
export function timeStringToControlValue(timeValue: string | null | undefined): Date | null {
  const normalized = String(timeValue ?? '').trim().slice(0, 5);
  const [hours, minutes] = normalized.split(':').map((part) => Number(part));

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** Inverse of `dateStringToControlValue()` — a `p-calendar` date control's
 * `Date` value back to `YYYY-MM-DD`, or `''` for an empty/invalid `Date`.
 * Mirrors `schedules.mappers.ts`'s `toDateInputValue()`. */
export function controlValueToDateString(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Inverse of `timeStringToControlValue()` — a `p-calendar` `[timeOnly]`
 * control's `Date` value back to `HH:mm`, or `''` for an empty/invalid `Date`.
 * Mirrors `schedules.mappers.ts`'s `toTimeInputValue()`. */
export function controlValueToTimeString(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }

  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

/**
 * The `YYYY-MM-DD` / `HH:mm` <-> `Date` conversions behind every `p-datePicker` date-range filter,
 * settlement filter and schedule/vehicle/expense form.
 *
 * <p>Before this file the same bodies existed as 13 private component copies of `toDateInputValue`,
 * 12 of its inverse (with three slightly different guards on the parse side), five exported
 * per-page mapper copies, and once more in `api-date-time.ts` under the `controlValueTo*` /
 * `*ToControlValue` names - which now re-export from here. Same rationale as
 * `date-range-guard.ts` (OBRS-1754): the next bug in this family must be one edit, not twenty.
 * (A handful of one-off inline `getFullYear()/padStart` formatters in the report stores remain
 * and are candidates for the same treatment.)
 *
 * <p>Behaviour is that of the exported mapper copies, which were the strictest: `toDateInputValue`
 * returns `''` for a missing or invalid `Date`, and `toDateControlValue` returns `null` for
 * anything that is not three non-zero numeric parts. Every private copy only ever received
 * values it had produced itself, so this is observably the same for them.
 *
 * <p>Plain functions only: `shared/lib` carries no Angular dependency by convention.
 */

/** `Date` -> `YYYY-MM-DD` in local time; `''` when the value is missing or invalid. */
export function toDateInputValue(value: Date | null | undefined): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` -> local-midnight `Date`; `null` when any part is missing, zero or not a number. */
export function toDateControlValue(dateValue: string | null | undefined): Date | null {
  const normalizedDate = String(dateValue ?? '').trim();
  const [year, month, day] = normalizedDate.split('-').map((part) => Number(part));

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

/** `Date` -> `HH:mm`; `''` when the value is missing or invalid. */
export function toTimeInputValue(value: Date | null | undefined): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }

  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

/** `HH:mm` (longer strings are cut to five chars) -> today's `Date` at that time; `null` when out of range. */
export function toTimeControlValue(timeValue: string | null | undefined): Date | null {
  const normalizedTime = String(timeValue ?? '').trim().slice(0, 5);
  const [hours, minutes] = normalizedTime.split(':').map((part) => Number(part));

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

/** Splits `2026-01-05T08:30:00` or `2026-01-05 08:30` into its date and `HH:mm` halves. */
export function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return { date: '', time: '' };
  }

  const [date, rawTime = ''] = normalizedValue.includes('T')
    ? normalizedValue.split('T')
    : normalizedValue.split(/\s+/);

  return {
    date,
    time: rawTime.slice(0, 5),
  };
}

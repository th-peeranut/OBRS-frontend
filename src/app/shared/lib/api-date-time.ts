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
 * OBRS-574: an API date-time as an absolute instant (epoch ms), or `null` when
 * it is empty or unparseable.
 *
 * Exists because `new Date(raw)` is NOT safe on these values. The API emits at
 * least three shapes for the same field — `2026-07-10T08:00:00+07:00`,
 * `2026-06-20T08:00:00` and `2026-12-20 08:00:00` — and an offset-less string
 * is read by `Date` as the VIEWER's local wall clock. Prod and SIT run their
 * JVM and Postgres in UTC, so a Bangkok departure comes back seven hours early
 * there and any "has it left yet?" comparison flips around the wrong moment
 * without ever looking broken. Normalising through `toApiOffsetDateTime()`
 * first pins the offset-less case to Bangkok, which is what the value always
 * meant (the product is Thailand-only).
 *
 * Compare the RESULT against `Date.now()`, never wall-clock components: both
 * sides are then absolute instants and the viewer's own timezone drops out.
 */
export function bangkokInstantMs(value: string | null | undefined): number | null {
  const normalized = toApiOffsetDateTime(value);
  if (!normalized) {
    return null;
  }

  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The `p-datePicker` control <-> API string conversions, under the names this file has always
 * exported. The bodies live in `./date-input-value` (one owner, one spec) - these are aliases, not
 * copies, so `boarding-list`, `boarding-entry` and `staff-schedules` keep their imports unchanged.
 *
 * - `splitApiOffsetDateTime`: an API date-time (`2026-01-05T08:30:00+07:00` or `2026-01-05 08:30`)
 *   into its `date` and `HH:mm` halves. No timezone math: the product is Thailand-only and the
 *   backend already carries the fixed `+07:00` offset.
 * - `dateStringToControlValue` / `controlValueToDateString`: `YYYY-MM-DD` <-> local-midnight `Date`.
 * - `timeStringToControlValue` / `controlValueToTimeString`: `HH:mm` <-> today's `Date` at that time.
 */
export {
  splitDateTime as splitApiOffsetDateTime,
  toDateControlValue as dateStringToControlValue,
  toTimeControlValue as timeStringToControlValue,
  toDateInputValue as controlValueToDateString,
  toTimeInputValue as controlValueToTimeString,
} from './date-input-value';

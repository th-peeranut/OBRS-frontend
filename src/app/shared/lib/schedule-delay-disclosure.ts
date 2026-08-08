import dayjs from 'dayjs';

/**
 * OBRS-1141 — the one rule that decides whether a schedule row must disclose an
 * announced delay, and what it discloses.
 *
 * Background (OBRS-1099): the search/reschedule/parcel queries now return the
 * EFFECTIVE departure (`departureDateTime` = planned + announced delay) plus
 * `scheduledDepartureDateTime`, which the backend populates ONLY when the round
 * carries an announced delay and leaves `null` otherwise. So the field's mere
 * presence is the delay flag — there is no second boolean to read and no extra
 * request to make.
 *
 * Why a pure function rather than logic inside a template: four surfaces render
 * rows built from the same query (search outbound, search return, reschedule
 * options, parcel schedule picker). OBRS-1099's own post-mortem was that the
 * failure came from five independent readers each deciding for themselves; the
 * shift lives in one place on the backend for that reason, and the disclosure
 * rule lives here for the same one.
 */
export interface DelayDisclosure {
  /** `HH:mm` of the departure as originally planned. */
  plannedTime: string;
  /** `HH:mm` of the departure as it now stands (planned + announced delay). */
  effectiveTime: string;
  /** Whole minutes of announced delay. Always `> 0` — see `delayDisclosureOf`. */
  delayMinutes: number;
  /**
   * `DD/MM/YYYY` of the effective departure, but ONLY when it falls on a
   * different calendar day than the planned one; `null` otherwise.
   *
   * This exists for one concrete case the backend deliberately keeps
   * (OBRS-1099 AC1/AC9, locked by `ScheduleDelayReachesEveryReadPathIT`): a
   * 23:30 round delayed to 00:30 still appears under the date the customer
   * searched, because the sale window and the day bucket are both computed
   * from the PLANNED time. Showing `00:30` alone under a "8 Aug" heading reads
   * as a bug; showing the date next to it reads as what it is.
   */
  effectiveDate: string | null;
}

/**
 * Returns what a row must disclose, or `null` when it must render exactly as it
 * did before this card — which is the common case and is asserted per-surface
 * (OBRS-1141 AC2).
 *
 * `null` is returned when:
 * - `scheduledDepartureDateTime` is absent — no announced delay;
 * - either timestamp is unparseable — never guess at a customer-facing time;
 * - the difference is `<= 0`. The backend floors its shift at zero (OBRS-1099
 *   AC8), so a zero-length "delay" is representable, and rendering
 *   "planned 07:00 → 07:00 (delayed)" would be worse than rendering nothing.
 */
export function delayDisclosureOf(
  effectiveDepartureDateTime: string | null | undefined,
  scheduledDepartureDateTime: string | null | undefined
): DelayDisclosure | null {
  if (!scheduledDepartureDateTime || !effectiveDepartureDateTime) return null;

  const planned = dayjs(scheduledDepartureDateTime);
  const effective = dayjs(effectiveDepartureDateTime);
  if (!planned.isValid() || !effective.isValid()) return null;

  const delayMinutes = effective.diff(planned, 'minute');
  if (delayMinutes <= 0) return null;

  const crossesDay = effective.format('YYYY-MM-DD') !== planned.format('YYYY-MM-DD');

  return {
    plannedTime: planned.format('HH:mm'),
    effectiveTime: effective.format('HH:mm'),
    delayMinutes,
    effectiveDate: crossesDay ? effective.format('DD/MM/YYYY') : null,
  };
}

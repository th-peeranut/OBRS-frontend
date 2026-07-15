/**
 * Maximum passengers a single booking can request. Mirrors the backend
 * ScheduleSearchReqDto.MAX_PASSENGERS_PER_BOOKING (largest vehicle = minibus,
 * 21 seats), so a higher count can never match a schedule.
 *
 * Promoted out of `DropdownObrsPassengerComponent` (OBRS-323) so the OPEN-seating
 * passenger-count stepper on the passenger-info page (`PassengerInfoFormComponent`)
 * shares the same ceiling instead of re-declaring it.
 */
export const MAX_PASSENGERS_PER_BOOKING = 21;

/**
 * At or below this many remaining seats, a schedule is "near full" and the UI
 * surfaces the "เหลือ X ที่นั่ง" remaining-seat count as a scarcity signal.
 * Above it, the remaining count is hidden (plenty of availability — no need to
 * reveal inventory). Single source shared by the search results list
 * (`ScheduleBookingListComponent`) and the OPEN-seating passenger-count card
 * (`PassengerInfoFormComponent`, OBRS-323) so both apply the same threshold.
 */
export const LOW_SEAT_THRESHOLD = 5;

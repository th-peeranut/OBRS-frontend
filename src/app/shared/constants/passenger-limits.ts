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

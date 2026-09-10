export interface PassengerInfo {
  isAdult: boolean;
  title: number | null;
  firstName: string;
  middleName: string;
  lastName: string;
  phoneNumber: string;
  gender: string;
  /**
   * OBRS-1666: explicit consent to hold a monk/nun status (PDPA section 26). Only meaningful
   * beside those two `gender` values; reset to false whenever the type changes, so it can never
   * arrive already ticked. Becomes `passengerTypeConsentVersion` at the payload boundary.
   */
  passengerTypeConsent?: boolean;
  isSelectSeat: boolean;
  passengerSeat: string;
  /** Seat for the return (inbound) leg on round-trip bookings; unset for one-way. */
  passengerSeatReturn?: string;
  useBookerInfo?: boolean;
  /**
   * OBRS-238: only populated on the booker (not per-passenger). Required for
   * ONLINE bookings — backend rejects a null/blank contact.email for that
   * channel (BookingReqDtoValidator).
   */
  email?: string;
  /**
   * OBRS-361: optional per-passenger seat preference. Never pre-seeded
   * (design-system §3.1) — starts `null`, best-effort, never blocks a
   * booking. Sent to the API lowercased (`'WINDOW'` -> `'window'`) at the
   * payload boundary in `PassengerInfoComponent.buildPassengersPayload`.
   */
  seatPreference?: 'WINDOW' | 'AISLE' | null;
  /** OBRS-361: optional per-passenger seat requirement — same contract as
   *  `seatPreference` above. */
  seatRequirement?: 'WHEELCHAIR' | 'EXTRA_LEGROOM' | null;
}

export type PassengerInfoState = PassengerInfo[];

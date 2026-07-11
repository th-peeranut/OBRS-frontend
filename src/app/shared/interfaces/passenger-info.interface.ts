export interface PassengerInfo {
  isAdult: boolean;
  title: number | null;
  firstName: string;
  middleName: string;
  lastName: string;
  phoneNumber: string;
  gender: string;
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
}

export type PassengerInfoState = PassengerInfo[];

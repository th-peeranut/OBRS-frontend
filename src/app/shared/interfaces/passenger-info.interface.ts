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
}

export type PassengerInfoState = PassengerInfo[];

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
  useBookerInfo?: boolean;
}

export type PassengerInfoState = PassengerInfo[];

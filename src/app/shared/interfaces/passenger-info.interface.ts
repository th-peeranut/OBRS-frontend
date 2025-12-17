export interface PassengerInfo {
  isUseAddressInfo: boolean;
  isAdult: boolean;
  title: number | null;
  firstName: string;
  middleName: string;
  lastName: string;
  phoneNumber: string;
  gender: string;
  isSelectSeat: boolean;
  passengerSeat: string;
}

export type PassengerInfoState = PassengerInfo[];

import { Dropdown } from "./dropdown.interface";

export interface ScheduleFilter {
  roundTrip: Dropdown;
  passengerInfo: { type: string, count: number }[];
  startStation: string | number;
  endStation: string | number;
  departureDate: string;
  adultCount?: number;
  kidsCount?: number;
}

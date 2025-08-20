import { Station } from './station.interface';

export interface Province {
  id: number;
  nameThai: string;
  nameEnglish: string;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
}

export interface ProvinceStation extends Province {
  stations: Station[];
}

export interface ProvinceStationReview extends Province  {
  station: Station;
}

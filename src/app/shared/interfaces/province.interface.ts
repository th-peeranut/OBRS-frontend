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

export interface StopTranslation {
  locale: string;
  label: string;
  description: string | null;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
}

export interface Stop {
  id: number;
  code: string;
  status: string;
  stopType: string;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
  translations: StopTranslation[];
}

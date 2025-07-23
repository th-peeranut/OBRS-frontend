import { Route } from './route.interface';
import { Station } from './station.interface';

export interface RouteMap {
  id: number;
  stationOrder: number;
  travelTime: string;
  fare: number;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
  route: Route;
  startStationId: Station;
  stopStation: Station;
}

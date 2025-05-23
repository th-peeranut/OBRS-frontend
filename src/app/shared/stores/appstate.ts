import { Station } from "../interfaces/station.interface";

export interface Appstate {
    stationList?: Station[];
    apiStatus: string;
    apiResponseMessage: string;
}
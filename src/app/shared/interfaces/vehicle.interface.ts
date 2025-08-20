import { VehicleType } from "./vehicle-type.interface";

export interface Vehicle {
  id: number;
  numberPlate: string;
  status: number;
  vehicleNumber: string;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
  vehicleType: VehicleType
}

import { ReportsRangeDto } from './reports-summary.interface';

/** `GET /api/private/admin/reports/ops-efficiency?from&to` (OBRS-155). */
export interface OpsDeparturesDto {
  scheduled: number;
  completed: number;
  cancelled: number;
  completionRatePct: number;
}

export interface OpsSeatUtilizationDto {
  seatsSold: number;
  seatCapacity: number;
  fillRatePct: number;
}

export interface OpsVehicleTypeRowDto {
  vehicleType: string;
  departures: number;
  seatsSold: number;
  seatCapacity: number;
  fillRatePct: number;
  departuresSharePct: number;
}

export interface OpsEfficiencyDto {
  range: ReportsRangeDto;
  departures: OpsDeparturesDto;
  seatUtilization: OpsSeatUtilizationDto;
  byVehicleType: OpsVehicleTypeRowDto[];
}

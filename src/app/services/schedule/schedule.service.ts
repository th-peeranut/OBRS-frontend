import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';
import {
  ScheduleFilterPayload,
  ScheduleList,
  SeatMapRespDto,
} from '../../shared/interfaces/schedule.interface';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  constructor(private http: HttpClient) {}

  getByFilter(scheduleFilter: ScheduleFilterPayload): Observable<ResponseAPI<ScheduleList>> {
    return this.http.post<ResponseAPI<ScheduleList>>(
      `${environment.apiUrl}/api/schedules/search`,
      scheduleFilter
    );
  }

  /**
   * GET /api/schedules/{id}/seats — physical seat map (OBRS-362), used to
   * feed the wheelchair/extra-legroom badges on the passenger-info seat map.
   * Public endpoint, no auth.
   */
  getSeatMap(scheduleId: number | string): Observable<ResponseAPI<SeatMapRespDto[]>> {
    return this.http.get<ResponseAPI<SeatMapRespDto[]>>(
      `${environment.apiUrl}/api/schedules/${scheduleId}/seats`
    );
  }
}

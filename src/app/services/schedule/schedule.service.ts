import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';
import { ScheduleFilterPayload, ScheduleList } from '../../shared/interfaces/schedule.interface';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  constructor(private http: HttpClient) {}

  getByFilter(scheduleFilter: ScheduleFilterPayload): Observable<ResponseAPI<ScheduleList>> {
    return this.http.post<ResponseAPI<ScheduleList>>(
      `${environment.apiUrl}/api/schedules`,
      scheduleFilter
    );
  }
}

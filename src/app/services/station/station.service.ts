import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { StationApi } from '../../shared/interfaces/station.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class StationService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<StationApi[] | ResponseAPI<StationApi[]>> {
    return this.http.get<StationApi[] | ResponseAPI<StationApi[]>>(
      `${environment.apiUrl}/api/stops`
    );
  }
}

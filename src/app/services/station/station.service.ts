import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Station } from '../../shared/interfaces/station.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class StationService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<ResponseAPI<Station[]>> {
    return this.http.get<ResponseAPI<Station[]>>(
      `${environment.apiUrl}/api/stations`
    );
  }

  getById(id: number): Observable<ResponseAPI<Station>> {
    return this.http.get<ResponseAPI<Station>>(
      `${environment.apiUrl}/api/private/stations/${id}`
    );
  }

  create(role: Station): Observable<ResponseAPI<Station>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<ResponseAPI<Station>>(
      `${environment.apiUrl}/api/private/stations`,
      role,
      { headers }
    );
  }

  update(id: number, role: Station): Observable<ResponseAPI<Station>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.put<ResponseAPI<Station>>(
      `${environment.apiUrl}/api/private/stations/${id}`,
      role,
      { headers }
    );
  }

  delete(id: number): Observable<ResponseAPI<any>> {
    return this.http.delete<ResponseAPI<any>>(
      `${environment.apiUrl}/api/private/stations/${id}`
    );
  }
}

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Province, ProvinceStation } from '../../shared/interfaces/province.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class ProvinceService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<ResponseAPI<Province[]>> {
    return this.http.get<ResponseAPI<Province[]>>(
      `${environment.apiUrl}/api/private/stations`
    );
  }

  getById(id: number): Observable<ResponseAPI<Province>> {
    return this.http.get<ResponseAPI<Province>>(
      `${environment.apiUrl}/api/private/stations/${id}`
    );
  }

  create(role: Province): Observable<ResponseAPI<Province>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<ResponseAPI<Province>>(
      `${environment.apiUrl}/api/private/stations`,
      role,
      { headers }
    );
  }

  update(id: number, role: Province): Observable<ResponseAPI<Province>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.put<ResponseAPI<Province>>(
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

  getWithStation(): Observable<ResponseAPI<ProvinceStation[]>> {
    return this.http.get<ResponseAPI<ProvinceStation[]>>(
      `${environment.apiUrl}/api/provinces/stations`
    );
  }
}

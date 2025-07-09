import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { RouteMap } from '../../shared/interfaces/route-map.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RouteMapService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<ResponseAPI<RouteMap[]>> {
    return this.http.get<ResponseAPI<RouteMap[]>>(
      `${environment.apiUrl}/api/route-legs`
    );
  }

  getById(id: number): Observable<ResponseAPI<RouteMap>> {
    return this.http.get<ResponseAPI<RouteMap>>(
      `${environment.apiUrl}/api/private/route-legs/${id}`
    );
  }

  create(role: RouteMap): Observable<ResponseAPI<RouteMap>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<ResponseAPI<RouteMap>>(
      `${environment.apiUrl}/api/private/route-legs`,
      role,
      { headers }
    );
  }

  update(id: number, role: RouteMap): Observable<ResponseAPI<RouteMap>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.put<ResponseAPI<RouteMap>>(
      `${environment.apiUrl}/api/private/route-legs/${id}`,
      role,
      { headers }
    );
  }

  delete(id: number): Observable<ResponseAPI<any> | undefined> {
    return this.http.delete<ResponseAPI<any>>(
      `${environment.apiUrl}/api/private/route-legs/${id}`
    );
  }
}

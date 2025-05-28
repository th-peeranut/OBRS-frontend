import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Route } from '../../shared/interfaces/route.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RouteService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<ResponseAPI<Route[]>> {
    return this.http.get<ResponseAPI<Route[]>>(
      `${environment.apiUrl}/api/routes`
    );
  }

  getById(id: number): Observable<ResponseAPI<Route>> {
    return this.http.get<ResponseAPI<Route>>(
      `${environment.apiUrl}/api/private/routes/${id}`
    );
  }

  create(role: Route): Observable<ResponseAPI<Route>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<ResponseAPI<Route>>(
      `${environment.apiUrl}/api/private/routes`,
      role,
      { headers }
    );
  }

  update(id: number, role: Route): Observable<ResponseAPI<Route>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.put<ResponseAPI<Route>>(
      `${environment.apiUrl}/api/private/routes/${id}`,
      role,
      { headers }
    );
  }

  delete(id: number): Observable<ResponseAPI<any> | undefined> {
    return this.http.delete<ResponseAPI<any>>(
      `${environment.apiUrl}/api/private/routes/${id}`
    );
  }
}

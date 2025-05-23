import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Route } from '../../shared/interfaces/route.interface';

@Injectable({
  providedIn: 'root',
})
export class RouteService {
  constructor(private http: HttpClient) {}

  getAll(): Promise<ResponseAPI<Route[]>> {
    return this.http
      .get<ResponseAPI<Route[]>>(`${environment.apiUrl}/api/routes`)
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to fetch routes');
        return response;
      });
  }

  getById(id: number): Promise<ResponseAPI<Route>> {
    return this.http
      .get<ResponseAPI<Route>>(`${environment.apiUrl}/api/private/routes/${id}`)
      .toPromise()
      .then((response) => {
        if (!response) throw new Error(`Route with ID ${id} not found`);
        return response;
      });
  }

  create(role: Route): Promise<ResponseAPI<Route>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .post<ResponseAPI<Route>>(
        `${environment.apiUrl}/api/private/routes`,
        role,
        { headers }
      )
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to create route');
        return response;
      });
  }

  update(id: number, role: Route): Promise<ResponseAPI<Route>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .put<ResponseAPI<Route>>(
        `${environment.apiUrl}/api/private/routes/${id}`,
        role,
        { headers }
      )
      .toPromise()
      .then((response) => {
        if (!response) throw new Error(`Failed to update route with ID ${id}`);
        return response;
      });
  }

  delete(id: number): Promise<ResponseAPI<any> | undefined> {
    return this.http
      .delete<ResponseAPI<any>>(
        `${environment.apiUrl}/api/private/routes/${id}`
      )
      .toPromise()
      .then((response) => {
        if (response === undefined) return;
        return response;
      });
  }
}

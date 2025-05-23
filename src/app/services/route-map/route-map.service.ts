import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { RouteMap } from '../../shared/interfaces/route-map.interface';

@Injectable({
  providedIn: 'root'
})
export class RouteMapService {

  constructor(private http: HttpClient) {}
  
    getAll(): Promise<ResponseAPI<RouteMap[]>> {
      return this.http
        .get<ResponseAPI<RouteMap[]>>(`${environment.apiUrl}/api/route-maps`)
        .toPromise()
        .then((response) => {
          if (!response) throw new Error('Failed to fetch route-maps');
          return response;
        });
    }
  
    getById(id: number): Promise<ResponseAPI<RouteMap>> {
      return this.http
        .get<ResponseAPI<RouteMap>>(`${environment.apiUrl}/api/private/route-maps/${id}`)
        .toPromise()
        .then((response) => {
          if (!response) throw new Error(`RouteMap with ID ${id} not found`);
          return response;
        });
    }
  
    create(role: RouteMap): Promise<ResponseAPI<RouteMap>> {
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      return this.http
        .post<ResponseAPI<RouteMap>>(
          `${environment.apiUrl}/api/private/route-maps`,
          role,
          { headers }
        )
        .toPromise()
        .then((response) => {
          if (!response) throw new Error('Failed to create route');
          return response;
        });
    }
  
    update(id: number, role: RouteMap): Promise<ResponseAPI<RouteMap>> {
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      return this.http
        .put<ResponseAPI<RouteMap>>(
          `${environment.apiUrl}/api/private/route-maps/${id}`,
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
          `${environment.apiUrl}/api/private/route-maps/${id}`
        )
        .toPromise()
        .then((response) => {
          if (response === undefined) return;
          return response;
        });
    }
}

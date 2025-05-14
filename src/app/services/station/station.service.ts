import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Station } from '../../interfaces/station.interface';
import { ResponseAPI } from '../../interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class StationService {
  constructor(private http: HttpClient) {}

  getAll(): Promise<ResponseAPI<Station[]>> {
    return this.http
      .get<ResponseAPI<Station[]>>(`${environment.apiUrl}/api/stations`)
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to fetch stations');
        return response;
      });
  }

  getById(id: number): Promise<ResponseAPI<Station>> {
    return this.http
      .get<ResponseAPI<Station>>(`${environment.apiUrl}/api/private/stations/${id}`)
      .toPromise()
      .then((response) => {
        if (!response) throw new Error(`Station with ID ${id} not found`);
        return response;
      });
  }

  create(role: Station): Promise<ResponseAPI<Station>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .post<ResponseAPI<Station>>(`${environment.apiUrl}/api/private/stations`, role, { headers })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to create station');
        return response;
      });
  }

  update(id: number, role: Station): Promise<ResponseAPI<Station>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .put<ResponseAPI<Station>>(`${environment.apiUrl}/api/private/stations/${id}`, role, { headers })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error(`Failed to update station with ID ${id}`);
        return response;
      });
  }

  delete(id: number): Promise<ResponseAPI<any> | undefined> {
    return this.http
      .delete<ResponseAPI<any>>(`${environment.apiUrl}/api/private/stations/${id}`)
      .toPromise()
      .then((response) => {
        if (response === undefined) return;
        return response;
      });
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../interfaces/response.interface';
import { Role } from '../../interfaces/role.interface';

@Injectable({
  providedIn: 'root',
})
export class RoleService {
  constructor(private http: HttpClient) {}
  
    getAll(): Promise<ResponseAPI<Role[]>> {
      return this.http
        .get<ResponseAPI<Role[]>>(`${environment.apiUrl}/api/private/roles`)
        .toPromise()
        .then((response) => {
          if (!response) throw new Error('Failed to fetch roles');
          return response;
        });
    }
  
    getById(id: number): Promise<ResponseAPI<Role>> {
      return this.http
        .get<ResponseAPI<Role>>(`${environment.apiUrl}/api/private/roles/${id}`)
        .toPromise()
        .then((response) => {
          if (!response) throw new Error(`Role with ID ${id} not found`);
          return response;
        });
    }
  
    create(role: Role): Promise<ResponseAPI<Role>> {
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      return this.http
        .post<ResponseAPI<Role>>(`${environment.apiUrl}/api/private/roles`, role, { headers })
        .toPromise()
        .then((response) => {
          if (!response) throw new Error('Failed to create role');
          return response;
        });
    }
  
    update(id: number, role: Role): Promise<ResponseAPI<Role>> {
      const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
      return this.http
        .put<ResponseAPI<Role>>(`${environment.apiUrl}/api/private/roles/${id}`, role, { headers })
        .toPromise()
        .then((response) => {
          if (!response) throw new Error(`Failed to update role with ID ${id}`);
          return response;
        });
    }
  
    delete(id: number): Promise<ResponseAPI<any> | undefined> {
      return this.http
        .delete<ResponseAPI<any>>(`${environment.apiUrl}/api/private/roles/${id}`)
        .toPromise()
        .then((response) => {
          if (response === undefined) return;
          return response;
        });
    }
}

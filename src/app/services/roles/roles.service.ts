import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Role {
  id: number;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class RolesService {
  private readonly rolesUrl = `${environment.apiUrl}/api/roles`;

  constructor(private http: HttpClient) {}

  createRole(role: Role): Promise<Role> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .post<Role>(this.rolesUrl, role, { headers })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to create role');
        return response;
      });
  }

  getRoles(): Promise<Role[]> {
    return this.http
      .get<Role[]>(this.rolesUrl)
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to fetch roles');
        return response;
      });
  }

  getRoleById(id: number): Promise<Role> {
    return this.http
      .get<Role>(`${this.rolesUrl}/${id}`)
      .toPromise()
      .then((response) => {
        if (!response) throw new Error(`Role with ID ${id} not found`);
        return response;
      });
  }

  updateRole(id: number, role: Role): Promise<Role> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .put<Role>(`${this.rolesUrl}/${id}`, role, { headers })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error(`Failed to update role with ID ${id}`);
        return response;
      });
  }

  deleteRole(id: number): Promise<void> {
    return this.http
      .delete<void>(`${this.rolesUrl}/${id}`)
      .toPromise()
      .then((response) => {
        if (response === undefined) return;
        return response;
      });
  }
}

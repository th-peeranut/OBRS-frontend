import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRoleDto,
  AdminUserDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

export interface UsersData {
  users: AdminUserDto[];
  roles: AdminRoleDto[];
  lookups: AdminLookupDto[];
}

/** Stale-while-revalidate cache for the user-management page. */
@Injectable({ providedIn: 'root' })
export class UsersStore extends AdminCollectionStore<UsersData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<UsersData> {
    const [users, roles, lookups] = await Promise.all([
      firstValueFrom(this.adminApiService.getUsers()),
      firstValueFrom(this.adminApiService.getRoles()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);

    return {
      users: users?.data ?? [],
      roles: roles?.data ?? [],
      lookups: lookups?.data ?? [],
    };
  }
}

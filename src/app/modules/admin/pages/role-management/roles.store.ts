import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRoleDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

export interface RolesData {
  roles: AdminRoleDto[];
  lookups: AdminLookupDto[];
}

/** Stale-while-revalidate cache for the role-management page. */
@Injectable({ providedIn: 'root' })
export class RolesStore extends AdminCollectionStore<RolesData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<RolesData> {
    // Roles are required; lookups are best-effort (status labels degrade
    // gracefully when absent) — mirrors the page's original load semantics.
    const [rolesResult, lookupsResult] = await Promise.allSettled([
      firstValueFrom(this.adminApiService.getRoles()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);

    if (rolesResult.status === 'rejected') {
      throw rolesResult.reason;
    }

    return {
      roles: rolesResult.value?.data ?? [],
      lookups: lookupsResult.status === 'fulfilled' ? (lookupsResult.value?.data ?? []) : [],
    };
  }
}

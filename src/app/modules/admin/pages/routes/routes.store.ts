import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

export interface RoutesData {
  routes: AdminRouteDto[];
  lookups: AdminLookupDto[];
}

/**
 * Stale-while-revalidate cache for the routes page *list* (routes + status
 * lookups). The selected route's structure (stops/segments) is loaded
 * per-slug on demand and stays in the component — it isn't cached here.
 */
@Injectable({ providedIn: 'root' })
export class RoutesStore extends AdminCollectionStore<RoutesData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<RoutesData> {
    const [routes, lookups] = await Promise.all([
      firstValueFrom(this.adminApiService.getRoutes()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);

    return {
      routes: routes?.data ?? [],
      lookups: lookups?.data ?? [],
    };
  }
}

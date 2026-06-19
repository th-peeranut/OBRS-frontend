import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, AdminLookupDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/** Stale-while-revalidate cache for the lookup-settings page. */
@Injectable({ providedIn: 'root' })
export class LookupsStore extends AdminCollectionStore<AdminLookupDto[]> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<AdminLookupDto[]> {
    const response = await firstValueFrom(this.adminApiService.getLookups());
    return response?.data ?? [];
  }
}

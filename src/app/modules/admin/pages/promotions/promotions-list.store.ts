import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, PromotionRespDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/**
 * Stale-while-revalidate cache for the general promotions list (OBRS-109 /
 * #37) — every promotion row, including the round-trip singleton (which the
 * page renders as a "Managed above" row instead of Edit/Delete). Sibling to
 * VehiclesStore/RoundTripPromotionStore; fetch()-only, no fetch-in-ngOnInit.
 */
@Injectable({ providedIn: 'root' })
export class PromotionsListStore extends AdminCollectionStore<PromotionRespDto[]> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<PromotionRespDto[]> {
    const response = await firstValueFrom(this.adminApiService.getPromotions());
    return response?.data ?? [];
  }
}

import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, PromotionRespDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

@Injectable({ providedIn: 'root' })
export class RoundTripPromotionStore extends AdminCollectionStore<PromotionRespDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<PromotionRespDto> {
    const response = await firstValueFrom(this.adminApiService.getRoundTripPromotion());
    if (!response.data) {
      throw new Error('Round-trip promotion not found');
    }
    return response.data;
  }
}

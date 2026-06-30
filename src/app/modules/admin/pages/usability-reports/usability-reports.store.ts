import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { UsabilityReportPage } from '../../../../shared/interfaces/usability-report.interface';

@Injectable({ providedIn: 'root' })
export class UsabilityReportsStore extends AdminCollectionStore<UsabilityReportPage> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<UsabilityReportPage> {
    const response = await firstValueFrom(this.adminApiService.getUsabilityReports());
    return response.data ?? { content: [], totalElements: 0 };
  }
}

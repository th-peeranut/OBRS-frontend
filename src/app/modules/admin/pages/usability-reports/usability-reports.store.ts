import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import {
  UsabilityReportPage,
  UsabilityReportStatus,
} from '../../../../shared/interfaces/usability-report.interface';
import { sortForStatus } from './usability-reports-page.mappers';

@Injectable({ providedIn: 'root' })
export class UsabilityReportsStore extends AdminCollectionStore<UsabilityReportPage> {
  // OBRS-378: '' means "no status filter" (not used by default anymore — the
  // page always seeds a concrete role-default status — but kept so setStatus
  // can still be called with '' if a future caller needs the unfiltered view).
  private status: UsabilityReportStatus | '' = '';

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  // Switching tabs changes which server-side filter/sort applies, so the
  // single-slot cache MUST be cleared (not just refreshed) — otherwise the
  // previous tab's rows briefly replay as the new tab's before the fresh
  // fetch lands (a visible wrong-data flash).
  setStatus(status: UsabilityReportStatus | ''): Promise<void> {
    if (this.status !== status) {
      this.status = status;
      this.clear();
    }
    return this.refresh();
  }

  protected async fetch(): Promise<UsabilityReportPage> {
    const response = await firstValueFrom(
      this.adminApiService.getUsabilityReports(this.status || undefined, sortForStatus(this.status))
    );
    return response.data ?? { content: [], totalElements: 0 };
  }
}

import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  ParcelShareClawbackRowDto,
  ParcelShareClawbackStatus,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/** The section's filter, NOT the wire value: `ALL` means "send no `status`
 * param at all", which is how the backend returns collected rows alongside
 * outstanding ones. Keeping the widened type here rather than passing
 * `undefined` around means the template can bind one non-null string. */
export type ParcelShareClawbackFilter = ParcelShareClawbackStatus | 'ALL';

/**
 * OBRS-1053 — same shape as `ParcelShareMonthlyStore` (a private mutable
 * filter field + getter + `set*(value) { this.field = value; void
 * this.refresh(); }`), so the two sections of `/admin/reports` behave
 * identically.
 *
 * Defaults to `OUTSTANDING`: the only rows the owner can act on. A collected
 * row is history, and putting history in front of the action by default
 * would bury the one button this screen exists for.
 */
@Injectable({ providedIn: 'root' })
export class ParcelShareClawbacksStore extends AdminCollectionStore<ParcelShareClawbackRowDto[]> {
  private statusFilter: ParcelShareClawbackFilter = 'OUTSTANDING';

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  get filter(): ParcelShareClawbackFilter {
    return this.statusFilter;
  }

  setFilter(value: ParcelShareClawbackFilter): void {
    this.statusFilter = value;
    void this.refresh();
  }

  protected async fetch(): Promise<ParcelShareClawbackRowDto[]> {
    const response = await firstValueFrom(
      this.adminApiService.getParcelShareClawbacks(
        this.statusFilter === 'ALL' ? undefined : this.statusFilter
      )
    );
    return response?.data ?? [];
  }
}

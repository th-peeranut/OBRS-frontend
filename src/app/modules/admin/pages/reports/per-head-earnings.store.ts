import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import {
  PerHeadEarningsGranularity,
  PerHeadEarningsRespDto,
} from '../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-1147 AC-2 — every person's ค่าหัว under this owner. Same shape as
 * {@link ParcelShareMonthlyStore} beside it: a private mutable filter + getter +
 * `set*(value) { …; void this.refresh(); }`.
 *
 * `holderId` is deliberately NOT a field here. The section shows the full
 * per-person breakdown in one call, so narrowing to one person would be a second
 * round trip to display a subset of what is already on screen; the parameter
 * exists on the API for callers that genuinely need one person and is left
 * unused rather than wired to a picker nobody asked for.
 */
@Injectable({ providedIn: 'root' })
export class PerHeadEarningsStore extends AdminCollectionStore<PerHeadEarningsRespDto | null> {
  private from: string;
  private to: string;
  private granularity: PerHeadEarningsGranularity = 'MONTH';

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    // This calendar year to date — the same default window the staff page uses,
    // so the owner and the person being paid are looking at the same range
    // unless one of them changes it.
    const now = new Date();
    this.from = `${now.getFullYear()}-01-01`;
    this.to = PerHeadEarningsStore.toIsoDate(now);
  }

  get query(): { from: string; to: string; granularity: PerHeadEarningsGranularity } {
    return { from: this.from, to: this.to, granularity: this.granularity };
  }

  setQuery(from: string, to: string, granularity: PerHeadEarningsGranularity): void {
    this.from = from;
    this.to = to;
    this.granularity = granularity;
    void this.refresh();
  }

  protected async fetch(): Promise<PerHeadEarningsRespDto | null> {
    const response = await firstValueFrom(
      this.adminApiService.getDriverCashEarnings(this.from, this.to, this.granularity)
    );
    return response?.data ?? null;
  }

  private static toIsoDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

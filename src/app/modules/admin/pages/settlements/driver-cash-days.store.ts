import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { DriverCashDayPageDto } from '../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-960 — mirrors `SettlementsPendingStore` exactly (`settlements.store.ts`):
 * a root-scoped cache keyed by an owner-chosen `[from, to]` date range.
 * Deliberately a SEPARATE store/range from `SettlementsPendingStore` — a
 * driver-cash "day" is not a settlement "round" (different semantics, per
 * the card), so the two filters must not be coupled.
 */
@Injectable({ providedIn: 'root' })
export class DriverCashDaysStore extends AdminCollectionStore<DriverCashDayPageDto> {
  private fromDate: string;
  private toDate: string;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    const today = new Date();
    this.toDate = DriverCashDaysStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = DriverCashDaysStore.toDateInputValue(from);
  }

  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<DriverCashDayPageDto> {
    const response = await firstValueFrom(
      this.adminApiService.getDriverCashDays(this.fromDate, this.toDate)
    );
    return response.data ?? { range: { from: this.fromDate, to: this.toDate, timezone: '' }, items: [] };
  }

  private static toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

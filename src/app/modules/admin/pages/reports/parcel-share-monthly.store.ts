import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  ParcelShareMonthlyRowDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/**
 * OBRS-960 — mirrors `ExpensesStore.setVehicleFilter()` exactly
 * (`expenses.store.ts`): a private mutable filter field + getter +
 * `set*(value) { this.field = value; void this.refresh(); }`. Role is fixed
 * to SALESPERSON (card: "no role selector"), so it's a constant at the
 * `fetch()` call site, not a settable field.
 */
@Injectable({ providedIn: 'root' })
export class ParcelShareMonthlyStore extends AdminCollectionStore<ParcelShareMonthlyRowDto[]> {
  private year: number;
  private month: number;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth() + 1;
  }

  get period(): { year: number; month: number } {
    return { year: this.year, month: this.month };
  }

  setPeriod(year: number, month: number): void {
    this.year = year;
    this.month = month;
    void this.refresh();
  }

  protected async fetch(): Promise<ParcelShareMonthlyRowDto[]> {
    const response = await firstValueFrom(
      this.adminApiService.getParcelShareMonthly(this.year, this.month, 'SALESPERSON')
    );
    return response?.data ?? [];
  }
}

import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { SettlementPendingPageDto } from '../../../../shared/interfaces/settlement.interface';

/**
 * Stale-while-revalidate cache for `/api/private/settlements/pending`
 * (OBRS-196) — note the base path is `/private`, NOT `/admin` (the endpoint
 * is `hasRole('OWNER')`; ADMIN inherits it via the backend role hierarchy).
 *
 * Mirrors `ReportsStore` (OBRS-40) exactly: a single root-scoped cache keyed
 * by an admin-chosen `[from, to]` date range — `setRange()` updates the range
 * and re-fetches in place, and re-entering `/admin/settlements` renders the
 * LAST-FETCHED range's data immediately, then `refresh()` revalidates it in
 * the background.
 */
@Injectable({ providedIn: 'root' })
export class SettlementsPendingStore extends AdminCollectionStore<SettlementPendingPageDto> {
  private fromDate: string;
  private toDate: string;
  /**
   * `errorCode` from the most recent failed fetch, so the component can show
   * a server-driven message instead of a generic one. `error$` only carries a
   * boolean, so this is exposed alongside it rather than changing the shared
   * base class's contract (same pattern as `ReportsStore.lastErrorCode`).
   */
  private lastErrorCodeValue: string | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    // Default range: last 7 days inclusive of today.
    const today = new Date();
    this.toDate = SettlementsPendingStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = SettlementsPendingStore.toDateInputValue(from);
  }

  /** The range currently cached/being fetched, as `yyyy-MM-dd` strings. */
  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  get lastErrorCode(): string | null {
    return this.lastErrorCodeValue;
  }

  /**
   * Switch to a new date range and revalidate. The caller (the page
   * component) is responsible for client-side range validation before
   * calling this — this method assumes `from`/`to` are already valid
   * `yyyy-MM-dd` strings with `from <= to`.
   */
  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<SettlementPendingPageDto> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getSettlementsPending(this.fromDate, this.toDate)
      );
      this.lastErrorCodeValue = null;
      return response.data ?? this.emptyPage();
    } catch (error) {
      this.lastErrorCodeValue = SettlementsPendingStore.extractErrorCode(error);
      throw error;
    }
  }

  private emptyPage(): SettlementPendingPageDto {
    return { range: { from: this.fromDate, to: this.toDate, timezone: '' }, items: [] };
  }

  private static extractErrorCode(error: unknown): string | null {
    const httpError = error as { error?: { errorCode?: string } };
    return httpError?.error?.errorCode ?? null;
  }

  private static toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

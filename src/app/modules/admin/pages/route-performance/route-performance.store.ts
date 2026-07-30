import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { RoutePerformanceDto } from '../../../../shared/interfaces/route-performance.interface';

/**
 * SWR cache for `/admin/route-performance` (OBRS-153). A sibling of the other report stores:
 * one root-scoped cache parameterized by an admin-chosen `[from, to]` range.
 */
@Injectable({ providedIn: 'root' })
export class RoutePerformanceStore extends AdminCollectionStore<RoutePerformanceDto> {
  private fromDate: string;
  private toDate: string;
  private lastErrorCodeValue: string | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    const today = new Date();
    this.toDate = RoutePerformanceStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = RoutePerformanceStore.toDateInputValue(from);
  }

  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  get lastErrorCode(): string | null {
    return this.lastErrorCodeValue;
  }

  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<RoutePerformanceDto> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getRoutePerformance(this.fromDate, this.toDate)
      );
      this.lastErrorCodeValue = null;
      return response.data ?? this.emptyPerformance();
    } catch (error) {
      this.lastErrorCodeValue = RoutePerformanceStore.extractErrorCode(error);
      throw error;
    }
  }

  private emptyPerformance(): RoutePerformanceDto {
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      routes: [],
      totals: { departures: 0, ticketsSold: 0, netRevenue: '0.00', currency: '' },
    };
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

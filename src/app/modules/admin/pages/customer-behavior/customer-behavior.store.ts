import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { CustomerBehaviorDto } from '../../../../shared/interfaces/customer-behavior.interface';

/** SWR cache for `/admin/customer-behavior` (OBRS-154). Sibling of the other report stores. */
@Injectable({ providedIn: 'root' })
export class CustomerBehaviorStore extends AdminCollectionStore<CustomerBehaviorDto> {
  private fromDate: string;
  private toDate: string;
  private lastErrorCodeValue: string | null = null;

  constructor(private readonly adminApiService: AdminApiService, authService: AuthService) {
    super(authService);
    const today = new Date();
    this.toDate = CustomerBehaviorStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = CustomerBehaviorStore.toDateInputValue(from);
  }

  get range(): { from: string; to: string } { return { from: this.fromDate, to: this.toDate }; }
  get lastErrorCode(): string | null { return this.lastErrorCodeValue; }

  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<CustomerBehaviorDto> {
    try {
      const response = await firstValueFrom(this.adminApiService.getCustomerBehavior(this.fromDate, this.toDate));
      this.lastErrorCodeValue = null;
      return response.data ?? this.empty();
    } catch (error) {
      this.lastErrorCodeValue = CustomerBehaviorStore.extractErrorCode(error);
      throw error;
    }
  }

  private empty(): CustomerBehaviorDto {
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      totalBookings: 0, distinctCustomers: 0, returningCustomers: 0,
      returningRatePct: 0, avgBookingsPerCustomer: 0, bookingsByChannel: [], repeatDistribution: [],
    };
  }

  private static extractErrorCode(error: unknown): string | null {
    const e = error as { error?: { errorCode?: string } };
    return e?.error?.errorCode ?? null;
  }

  private static toDateInputValue(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

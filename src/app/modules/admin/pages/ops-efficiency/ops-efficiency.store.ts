import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { OpsEfficiencyDto } from '../../../../shared/interfaces/ops-efficiency.interface';

/** SWR cache for `/admin/ops-efficiency` (OBRS-155). Sibling of the other report stores. */
@Injectable({ providedIn: 'root' })
export class OpsEfficiencyStore extends AdminCollectionStore<OpsEfficiencyDto> {
  private fromDate: string;
  private toDate: string;
  private lastErrorCodeValue: string | null = null;

  constructor(private readonly adminApiService: AdminApiService, authService: AuthService) {
    super(authService);
    const today = new Date();
    this.toDate = OpsEfficiencyStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = OpsEfficiencyStore.toDateInputValue(from);
  }

  get range(): { from: string; to: string } { return { from: this.fromDate, to: this.toDate }; }
  get lastErrorCode(): string | null { return this.lastErrorCodeValue; }

  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<OpsEfficiencyDto> {
    try {
      const response = await firstValueFrom(this.adminApiService.getOpsEfficiency(this.fromDate, this.toDate));
      this.lastErrorCodeValue = null;
      return response.data ?? this.empty();
    } catch (error) {
      this.lastErrorCodeValue = OpsEfficiencyStore.extractErrorCode(error);
      throw error;
    }
  }

  private empty(): OpsEfficiencyDto {
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      departures: { scheduled: 0, completed: 0, cancelled: 0, completionRatePct: 0 },
      seatUtilization: { seatsSold: 0, seatCapacity: 0, fillRatePct: 0 },
      byVehicleType: [],
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

import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { PartUnitPriceReportDto } from '../../../../shared/interfaces/part-unit-price-report.interface';

/**
 * Stale-while-revalidate cache for `/admin/reports/part-unit-price` (OBRS-1613).
 *
 * Mirrors `PayeeSpendReportStore`, with one deliberate difference: there is no year and no month,
 * because there is no date range on this report at all. The owner ruled that on 2026-08-25 — both
 * parts on record with anything to compare straddle 2025/2026, so any default window would open
 * the screen on an empty chart for the exact data the screen exists to show.
 *
 * The one filter is WHICH registry entry, and it starts at none: the picker is the screen, and the
 * first response is what tells it which parts are even worth offering.
 */
@Injectable({ providedIn: 'root' })
export class PartUnitPriceReportStore extends AdminCollectionStore<PartUnitPriceReportDto> {
  private selectedPartId: number | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  get filter(): { partId: number | null } {
    return { partId: this.selectedPartId };
  }

  setPart(partId: number | null): void {
    this.selectedPartId = partId;
    void this.refresh();
  }

  protected async fetch(): Promise<PartUnitPriceReportDto> {
    const response = await firstValueFrom(
      this.adminApiService.getPartUnitPriceReport(this.selectedPartId)
    );
    return response.data ?? this.emptyReport();
  }

  /**
   * The shape a 200 with no body has to fall back to. Zeroes rather than nulls throughout: the
   * coverage line renders unconditionally, and a null total there would print as blank beside the
   * word "ทั้งหมด", which reads as a report claiming there was no spending at all.
   */
  private emptyReport(): PartUnitPriceReportDto {
    return {
      partId: this.selectedPartId,
      partOptions: [],
      lines: [],
      coverage: {
        totalAmount: '0.00',
        totalLineCount: 0,
        comparableAmount: '0.00',
        comparableLineCount: 0,
        unnamedAmount: '0.00',
        unnamedLineCount: 0,
        excludedPriceAmount: '0.00',
        excludedPriceLineCount: 0,
      },
    };
  }
}

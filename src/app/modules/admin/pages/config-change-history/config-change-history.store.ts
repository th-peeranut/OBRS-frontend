import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { PageResponse } from '../../../../shared/interfaces/payment.interface';
import { ConfigHistoryRow } from '../../../../shared/interfaces/config-history.interface';
import { extractConfigHistoryErrorCode } from './config-change-history-page.mappers';

/**
 * Stale-while-revalidate cache for `/admin/config-change-history`
 * (OBRS-576), following `UsabilityReportsStore` byte-for-byte (UX §2): a
 * single-slot cache, `clear()` BEFORE `refresh()` on every filter/page
 * setter (F20 — otherwise the previous filter/page's rows briefly flash as
 * the new one's before the fresh fetch lands), and a fully-populated zero
 * `PageResponse` fallback on fetch failure (never `null`).
 *
 * `PageResponse<T>` is reused verbatim from shared/interfaces/payment.interface.ts
 * — SA explicitly forbids a new paged interface (SA §5.2/§7.2).
 */
@Injectable({ providedIn: 'root' })
export class ConfigChangeHistoryStore extends AdminCollectionStore<PageResponse<ConfigHistoryRow>> {
  private configKey: string | undefined;
  private from: string | undefined;
  private to: string | undefined;
  private page = 0;
  private static readonly PAGE_SIZE = 20;

  /** errorCode from the most recent failed fetch (e.g. CONFIG_HISTORY_RANGE_INVALID),
   * mirroring ReportsStore.lastErrorCode — error$ only carries a boolean. */
  private lastErrorCodeValue: string | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  get lastErrorCode(): string | null {
    return this.lastErrorCodeValue;
  }

  setConfigKey(configKey: string | undefined): Promise<void> {
    if (this.configKey !== configKey) {
      this.configKey = configKey;
      this.page = 0;
      this.clear();
    }
    return this.refresh();
  }

  setRange(from: string | undefined, to: string | undefined): Promise<void> {
    if (this.from !== from || this.to !== to) {
      this.from = from;
      this.to = to;
      this.page = 0;
      this.clear();
    }
    return this.refresh();
  }

  setPage(page: number): Promise<void> {
    if (this.page !== page) {
      this.page = page;
      this.clear();
    }
    return this.refresh();
  }

  protected async fetch(): Promise<PageResponse<ConfigHistoryRow>> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getConfigChangeHistory(
          this.configKey,
          this.from,
          this.to,
          this.page,
          ConfigChangeHistoryStore.PAGE_SIZE
        )
      );
      this.lastErrorCodeValue = null;
      return (
        response.data ?? {
          content: [],
          totalElements: 0,
          totalPages: 0,
          size: ConfigChangeHistoryStore.PAGE_SIZE,
          number: this.page,
          numberOfElements: 0,
        }
      );
    } catch (error) {
      this.lastErrorCodeValue = extractConfigHistoryErrorCode(error);
      throw error;
    }
  }
}

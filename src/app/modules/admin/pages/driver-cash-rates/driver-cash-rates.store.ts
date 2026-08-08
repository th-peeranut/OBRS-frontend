import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import {
  DriverCashRateRowDto,
  SalesPointOptionDto,
} from '../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-1073 — the picker source is now `GET /owner/driver-cash/sales-points`,
 * not the PUBLIC all-stops endpoint this store used to borrow.
 *
 * That borrowing was a reasonable answer to the wrong question: when a rate
 * was keyed by stop, `StationService.getAll()` was the only flat stop list in
 * the codebase (the two earlier attempts — a `category === 'stop'` lookup
 * filter, and per-route `getRouteStops`) could not produce one. Now that a
 * rate belongs to a COUNTER, that list is both wrong and far too long: 91 of
 * the 101 seeded stops belong to no sales point at all, so most of what the
 * owner could pick had no counter to pay. The owner-only endpoint returns
 * exactly the three real ones.
 */
export interface DriverCashRatesData {
  rates: DriverCashRateRowDto[];
  salesPoints: SalesPointOptionDto[];
}

/** OBRS-960 — SWR store backing `DriverCashRatesPageComponent`'s view-only
 * history table (card 2) + card 1's add-rate stop dropdown. The rate API
 * is GET/POST only (every POST versions a new effective-dated row), so
 * there is no `mutate`-in-place edit path — `refresh()` after a successful
 * create is the only way the list updates. */
@Injectable({ providedIn: 'root' })
export class DriverCashRatesStore extends AdminCollectionStore<DriverCashRatesData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<DriverCashRatesData> {
    const [rates, salesPoints] = await Promise.all([
      firstValueFrom(this.adminApiService.getDriverCashRates()),
      firstValueFrom(this.adminApiService.getDriverCashSalesPoints()),
    ]);
    return {
      rates: rates?.data ?? [],
      salesPoints: salesPoints?.data ?? [],
    };
  }
}

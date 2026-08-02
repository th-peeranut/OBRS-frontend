import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, AdminLookupDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { DriverCashRateRowDto } from '../../../../shared/interfaces/driver-cash.interface';

/** ⚠️ The card does not name a stop-lookup source for the add-rate
 * dropdown. Reuses the generic `GET /private/lookups` (category `'stop'`)
 * `AdminApiService.getLookups()` already exposes to `RoutesStore` — the
 * same "fetch the list + its lookups together" shape — rather than
 * inventing a new stops endpoint. Flagged as a Contract Request in
 * `docs/handoff.md`; verify the category slug against the real backend. */
export interface DriverCashRatesData {
  rates: DriverCashRateRowDto[];
  stopLookups: AdminLookupDto[];
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
    const [rates, lookups] = await Promise.all([
      firstValueFrom(this.adminApiService.getDriverCashRates()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);
    return {
      rates: rates?.data ?? [],
      stopLookups: (lookups?.data ?? []).filter((l) => l.category === 'stop'),
    };
  }
}

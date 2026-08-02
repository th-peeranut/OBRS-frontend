import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { StationService } from '../../../../services/station/station.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { DriverCashRateRowDto } from '../../../../shared/interfaces/driver-cash.interface';
import { StationApi } from '../../../../shared/interfaces/station.interface';

/**
 * ⚠️ CORRECTED (2026-08-02, backend reconciliation) — the first version of
 * this store fetched `AdminApiService.getLookups()` filtered to
 * `category === 'stop'`. That category does not exist on the real backend
 * (`LookupCategoryConstant.java` only has `stop_status`/`stop_type` — stops
 * are their own entity, never inserted into the generic Lookup table), so
 * the filter would always have resolved to an empty array and the add-rate
 * dropdown would have silently shown no options.
 *
 * Nothing in `src/app/modules/admin/` or `src/app/modules/staff/` already
 * has a WORKING flat all-stops fetch (confirmed by search — the only other
 * stop source in this codebase, `AdminApiService.getRouteStops(routeSlug)`,
 * is per-route). The one genuinely working flat-stops endpoint is the
 * PUBLIC `GET /api/stops` (`../OBRS-backend/docs/api/catalog.md`), already
 * wrapped by `StationService.getAll()` and used by every customer-facing
 * stop picker (`station.effect.ts`, `parcel-booking-page.component.ts`,
 * the my-bookings reschedule/change-stop effects). Reused here rather than
 * inventing a second wrapper — being public/no-auth, calling it from an
 * owner-only admin page raises no permission mismatch.
 */
export interface DriverCashRatesData {
  rates: DriverCashRateRowDto[];
  stops: StationApi[];
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
    private readonly stationService: StationService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<DriverCashRatesData> {
    const [rates, stops] = await Promise.all([
      firstValueFrom(this.adminApiService.getDriverCashRates()),
      firstValueFrom(this.stationService.getAll()),
    ]);
    return {
      rates: rates?.data ?? [],
      stops: stops?.data ?? [],
    };
  }
}

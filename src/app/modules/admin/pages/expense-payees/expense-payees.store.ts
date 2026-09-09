import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminExpensePayeeDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/**
 * Stale-while-revalidate cache for the payee registry (OBRS-1577), shared by the two screens that
 * need it: the registry page itself and the picker inside the expense form.
 *
 * <p><b>It always fetches `includeInactive=true`, and that is deliberate.</b> The two consumers want
 * different subsets — the picker must never offer a retired garage, the registry must show one so it
 * can be un-retired — and the obvious design gives the store a mutable flag the way `ExpensesStore`
 * has `setVehicleFilter`. That would be wrong here: this store is root-scoped and both consumers can
 * be alive at once (the registry page is one navigation away from the expense form), so whichever
 * screen set the flag last would decide what the OTHER one sees. A picker silently listing retired
 * garages is exactly the mistake this card exists to prevent.
 *
 * <p>One fetch of the superset, filtered per consumer, avoids that entirely and costs nothing at
 * this size: the registry is the operator's own list of garages and petrol stations — tens of rows,
 * not thousands. Revisit if that stops being true.
 */
@Injectable({ providedIn: 'root' })
export class ExpensePayeesStore extends AdminCollectionStore<AdminExpensePayeeDto[]> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<AdminExpensePayeeDto[]> {
    const response = await firstValueFrom(this.adminApiService.getExpensePayees(null, true));
    return response?.data ?? [];
  }
}

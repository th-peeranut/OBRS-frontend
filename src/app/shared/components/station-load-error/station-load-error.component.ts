import { Component } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { combineLatest, map, Observable } from 'rxjs';
import { invokeGetAllProvinceWithStationApi } from '../../stores/station/station.action';
import { selectProvinceWithStation } from '../../stores/station/station.selector';
import { selectStationLoadFailed } from '../../stores/station/station-load-status.selector';

/**
 * OBRS-1222 — the inline replacement for the global error modal that used to
 * appear when `GET /api/stops` failed.
 *
 * ⚠️ THE CONDITION IS THE WHOLE POINT: it renders only when the load failed
 * **and** the roster is empty. `station.reducer.ts` hydrates from localStorage
 * synchronously, so a returning visitor whose fetch dies still has a fully
 * working booking form — telling them anything is an interruption for someone
 * with nothing wrong. A first-time visitor has an empty roster, so the
 * dropdowns are empty and the form only LOOKS usable; for them silence is the
 * same lie OBRS-642 was opened to remove. Neither "always show" nor "always
 * silent" is right for both, which is why this reads two inputs, not one.
 *
 * Smart, not presentational, on purpose: it is dropped into two templates
 * (`home-booking`, `schedule-booking-filter`) and both would otherwise have to
 * duplicate the same two selectors and the same dispatch — the exact
 * duplication that let the twin booking forms drift in OBRS-1021/1023/1028/1036.
 *
 * Not a modal, and never a modal: the retry belongs beside the empty fields it
 * refills, not on a layer over them.
 */
@Component({
  selector: 'app-station-load-error',
  templateUrl: './station-load-error.component.html',
  styleUrl: './station-load-error.component.scss',
  standalone: false,
})
export class StationLoadErrorComponent {
  readonly showError$: Observable<boolean>;

  constructor(private store: Store) {
    this.showError$ = combineLatest([
      this.store.pipe(select(selectProvinceWithStation)),
      this.store.pipe(select(selectStationLoadFailed)),
    ]).pipe(
      // `stations?.length` — the feature slice is registered by the lazy module,
      // and a TestBed that mocks only the slices its own component names would
      // otherwise throw here inside change detection.
      map(([stations, hasFailed]) => hasFailed && !stations?.length)
    );
  }

  /**
   * Re-dispatches the SAME action the page dispatches on init — not a direct
   * service call. `StationLoadStatusReducer` clears the failure on this action,
   * so the message disappears the instant the retry is in flight, and
   * `ProvinceEffect`'s session guard is still false after a failure (it is set
   * on success only), so the fetch really does happen again.
   */
  onRetry(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
  }
}

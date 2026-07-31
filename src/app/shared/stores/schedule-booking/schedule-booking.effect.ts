import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { EMPTY, Observable, of } from 'rxjs';
import { catchError, map, mergeMap, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { Appstate } from '../appstate';
import {
  invokeGetScheduleBookingApi,
  invokeGetScheduleBookingApiSuccess,
  invokeSetScheduleBookingApi,
  invokeSetScheduleBookingApiSuccess,
  revalidateRestoredScheduleBooking,
} from './schedule-booking.action';
import { selectScheduleBooking } from './schedule-booking.selector';
import {
  consumeBookingSelectionRestoredFlag,
  readBookingContext,
  rememberBookingSelection,
} from '../../lib/booking-context-storage';
import { Schedule } from '../../interfaces/schedule.interface';
import { ScheduleService } from '../../../services/schedule/schedule.service';
import { AlertService } from '../../services/alert.service';

/** Outcome of re-checking a restored selection against a live search. */
type RevalidateOutcome =
  /** Nothing to check, or the check itself could not be made. */
  | { status: 'skipped' }
  /** Still bookable — carries the FRESH rows, not the restored ones. */
  | { status: 'valid'; selection: Schedule[] }
  /** A chosen trip is gone or no longer has room for this many passengers. */
  | { status: 'unavailable' };

@Injectable()
export class ScheduleBookingEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);
  private scheduleService = inject(ScheduleService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);
  private router = inject(Router);

  getScheduleBookings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetScheduleBookingApi),
      withLatestFrom(this.store.pipe(select(selectScheduleBooking))),
      mergeMap(([, scheduleBooking]) => {
        if (scheduleBooking) {
          return of(
            invokeGetScheduleBookingApiSuccess({
              schedule_booking: scheduleBooking,
            })
          );
        } else {
          return of(
            invokeGetScheduleBookingApiSuccess({
              schedule_booking: null,
            })
          );
        }
      })
    )
  );

  setScheduleBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeSetScheduleBookingApi),
      // OBRS-903: every write to this slice — a pick, a deselect, and the
      // refresh `revalidateRestoredScheduleBooking$` performs — goes through
      // here, so this one tap keeps the cross-tab copy in step with the store
      // without any page having to know storage exists.
      tap((action) =>
        rememberBookingSelection(action.schedule_booking?.schedule ?? null)
      ),
      switchMap((action) => {
        if (action.schedule_booking) {
          return of(
            invokeSetScheduleBookingApiSuccess({
              schedule_booking: action.schedule_booking,
            })
          );
        } else {
          return of(
            invokeSetScheduleBookingApiSuccess({
              schedule_booking: null,
            })
          );
        }
      })
    )
  );

  /**
   * OBRS-903 AC3: a selection that came back from storage is re-checked against
   * a live search before the customer can build on it. The restored rows carry a
   * seat snapshot from whenever the original search ran — and
   * `passenger-info-form.component.ts` draws the seat map straight from
   * `Schedule.availableSeatNumbers` — so trusting them would offer seats that
   * were sold in the meantime and fail at payment instead. On success the
   * restored rows are REPLACED by the fresh ones for exactly that reason.
   */
  revalidateRestoredScheduleBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(revalidateRestoredScheduleBooking),
      mergeMap(() => this.revalidateRestoredSelection()),
      mergeMap((outcome) => {
        if (outcome.status === 'valid') {
          return of(
            invokeSetScheduleBookingApi({
              schedule_booking: { schedule: outcome.selection },
            })
          );
        }

        if (outcome.status === 'unavailable') {
          // The navigation waits for the customer to dismiss the message, and
          // that ordering is load-bearing rather than polite: arriving at
          // /schedule-booking re-runs their search, and `error.interceptor.ts`
          // opens its loading dialog on every /api/ request — SweetAlert2 has one
          // global instance, so the spinner REPLACES whatever is on screen.
          // Navigating first made this warning flash for ~200 ms and vanish
          // (measured in the browser: no `.swal2-container` left in the DOM).
          void this.alertService
            .warning(this.translate.instant('SCHEDULE_BOOKING.RESTORED_UNAVAILABLE'))
            .then(() => this.router.navigate(['/schedule-booking']));
          // Dropped now, not after the dialog: nothing may be built on a
          // selection already known to be unsellable.
          return of(
            invokeSetScheduleBookingApi({ schedule_booking: { schedule: null } })
          );
        }

        return EMPTY;
      })
    )
  );

  private revalidateRestoredSelection(): Observable<RevalidateOutcome> {
    // Consumes the flag rather than reading it: five lazy modules register this
    // effect and NgRx builds one instance per module injector, so a plain read
    // would send the same search once per loaded instance.
    if (!consumeBookingSelectionRestoredFlag()) {
      return of<RevalidateOutcome>({ status: 'skipped' });
    }

    const context = readBookingContext();
    const selection = context?.selection ?? null;
    const searchPayload = context?.searchPayload ?? null;

    // No stored search body means nothing to replay it with (an older entry, or
    // a selection made before this shipped). Leaving the selection alone is the
    // pre-OBRS-903 behavior, which the seat-locking backend still backstops.
    if (!selection?.length || !searchPayload) {
      return of<RevalidateOutcome>({ status: 'skipped' });
    }

    return this.scheduleService.getByFilter(searchPayload).pipe(
      map((response): RevalidateOutcome => {
        if (response?.code !== 200 || !response.data) {
          return { status: 'skipped' };
        }

        const live = [
          ...(response.data.departureSchedules ?? []),
          ...(response.data.arrivalSchedules ?? []),
        ];
        const seatsNeeded = searchPayload.numberOfPassengers ?? 1;
        const refreshed: Schedule[] = [];

        for (const chosen of selection) {
          const match = live.find((candidate) => candidate.id === chosen.id);
          // Gone from the results = departed, cancelled, or filtered out by the
          // backend's own availability rule. Either way it cannot be sold now.
          if (!match || (match.availableSeats ?? 0) < seatsNeeded) {
            return { status: 'unavailable' };
          }
          refreshed.push(match);
        }

        return { status: 'valid', selection: refreshed };
      }),
      // Fail OPEN on a transport error: a network blip must not throw away a
      // selection the customer spent effort on. The seat map may then be stale,
      // which is exactly the pre-existing same-tab behavior, and the backend
      // still refuses a taken seat under `SELECT … FOR UPDATE` (ADR-0006).
      catchError(() => of<RevalidateOutcome>({ status: 'skipped' }))
    );
  }
}

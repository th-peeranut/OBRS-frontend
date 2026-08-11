import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { catchError, filter, map, mergeMap, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { BookingService } from '../../../services/booking/booking.service';
import { StationService } from '../../../services/station/station.service';
import { RouteMapService } from '../../../services/route-map/route-map.service';
import { AlertService } from '../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../shared/lib/api-error';
import { classifyHttpFallback } from '../../../shared/lib/http-error-fallback';
import {
  extractChangeStopErrorCode,
  isTerminalChangeStopError,
  mapChangeStopErrorCode,
  mapChangeStopStopsLoadError,
} from '../../../shared/lib/change-stop-error';
import { normalizeStatusCode } from '../../../shared/interfaces/my-booking.interface';
import { ChangeStopSeatAssignment } from '../../../shared/interfaces/change-stop.interface';
import { StationApi } from '../../../shared/interfaces/station.interface';
import { BookingTicketJourney } from '../../../shared/interfaces/booking-ticket.interface';
import {
  changeStopAbandoned,
  changeStopRequiresPayment,
  changeStopSettled,
  closeChangeStopDialog,
  confirmChangeStop,
  confirmChangeStopFailure,
  confirmChangeStopSuccess,
  invokeLoadMyBookingsApi,
  loadChangeStopEstimate,
  loadChangeStopEstimateFailure,
  loadChangeStopEstimateSuccess,
  loadChangeStopRouteStops,
  loadChangeStopRouteStopsFailure,
  loadChangeStopRouteStopsSuccess,
  loadChangeStopTicketsFailure,
  loadChangeStopTicketsSuccess,
  loadStopsLookupFailure,
  loadStopsLookupSuccess,
  openChangeStopDialog,
} from './my-bookings.action';
import { selectMyBookings, selectMyBookingsList, selectStopsLookup } from './my-bookings.selector';

/**
 * Effects for the My Bookings change-stop dialog (OBRS-110 wave 2). Kept in
 * a dedicated class (registered alongside `MyBookingsEffect`/
 * `RescheduleEffect`/`ChangeSeatEffect`) so the existing effect files don't
 * balloon — all four write into the same `myBookings` feature state.
 */
@Injectable()
export class ChangeStopEffect {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private service = inject(BookingService);
  private stationService = inject(StationService);
  private routeMapService = inject(RouteMapService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  // Opening the dialog kicks off every background load in parallel and
  // non-blocking — the pickup step is interactive as soon as the route's
  // stops resolve (design-system §6: modals open optimistically, never
  // gated on an awaited fetch). The stops-lookup cache (stop slug → numeric
  // id) is shared with reschedule/change-seat; each dialog's effect class
  // guards it with the same empty-cache check rather than coupling to
  // RescheduleEffect's own trigger. Same reason it opts out of the global
  // loading popup (OBRS-1056): raised over an open dialog that popup swallows
  // the dialog's Escape key, which is the opposite of "opens optimistically".
  loadStopsLookupOnOpen$ = createEffect(() =>
    this.actions$.pipe(
      ofType(openChangeStopDialog),
      withLatestFrom(this.store.pipe(select(selectStopsLookup))),
      filter(([, stopsLookup]) => Object.keys(stopsLookup).length === 0),
      switchMap(() =>
        this.stationService.getAll({ skipLoadingAlert: true }).pipe(
          map((response) => loadStopsLookupSuccess({ stopsLookup: this.toStopsLookup(response.data) })),
          // No domain errorCode exists for this endpoint — with no backend
          // message either, branch the generic copy on HTTP status (OBRS-170)
          // instead of always showing the same vague STOPS_LOAD_ERROR text.
          catchError((error: unknown) =>
            of(
              loadStopsLookupFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant(mapChangeStopStopsLoadError(error)),
              })
            )
          )
        )
      )
    )
  );

  loadChangeStopTickets$ = createEffect(() =>
    this.actions$.pipe(
      ofType(openChangeStopDialog),
      switchMap(({ bookingId }) =>
        this.service.getBookingTickets(bookingId, true).pipe(
          map((response) =>
            loadChangeStopTicketsSuccess({ tickets: this.toSeatAssignments(response.data?.journeys) })
          ),
          catchError((error: unknown) =>
            of(
              loadChangeStopTicketsFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant(mapChangeStopStopsLoadError(error)),
              })
            )
          )
        )
      )
    )
  );

  // Resolves the open booking's routeSlug from the (already-loaded) bookings
  // list off the SAME action's own payload — not a selector keyed off
  // changeStopDialogBookingId — so this never races the reducer's own
  // handling of the same openChangeStopDialog dispatch. A missing routeSlug
  // fails immediately with no network call (design-system: don't fall back
  // to a broken picker).
  loadRouteStopsOnOpen$ = createEffect(() =>
    this.actions$.pipe(
      ofType(openChangeStopDialog),
      withLatestFrom(this.store.pipe(select(selectMyBookingsList))),
      map(([{ bookingId }, bookings]) => {
        const routeSlug = bookings.find((b) => b.id === bookingId)?.bookingSchedules?.[0]?.routeSlug;
        return routeSlug
          ? loadChangeStopRouteStops({ bookingId, routeSlug })
          : loadChangeStopRouteStopsFailure({
              error: this.translate.instant('MY_BOOKINGS.CHANGE_STOP.STOPS_LOAD_ERROR'),
            });
      })
    )
  );

  loadChangeStopRouteStops$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadChangeStopRouteStops),
      switchMap(({ routeSlug }) =>
        this.routeMapService.getPickupDropoff(routeSlug).pipe(
          map((response) =>
            loadChangeStopRouteStopsSuccess({
              pickup: response.data?.pickup ?? [],
              dropoff: response.data?.dropoff ?? [],
              route: response.data?.route ?? null,
            })
          ),
          catchError((error: unknown) =>
            of(
              loadChangeStopRouteStopsFailure({
                error: this.translate.instant(mapChangeStopStopsLoadError(error)),
              })
            )
          )
        )
      )
    )
  );

  loadChangeStopEstimate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadChangeStopEstimate),
      switchMap(({ bookingId, newFromStopId, newToStopId, seats }) =>
        this.service.getChangeStopEstimate(bookingId, { newFromStopId, newToStopId, seats }).pipe(
          map((response) => {
            const estimate = response.data;
            if (!estimate) {
              return loadChangeStopEstimateFailure({
                error: this.translate.instant('MY_BOOKINGS.CHANGE_STOP.ERROR.GENERIC'),
              });
            }
            return loadChangeStopEstimateSuccess({ estimate });
          }),
          catchError((error: unknown) =>
            of(
              loadChangeStopEstimateFailure({
                error: this.translate.instant(
                  mapChangeStopErrorCode(extractChangeStopErrorCode(error), classifyHttpFallback(error))
                ),
              })
            )
          )
        )
      )
    )
  );

  confirmChangeStop$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeStop),
      switchMap(({ bookingId, newFromStopId, newToStopId, seatAssignments, clientNetAmount }) =>
        this.service
          .confirmChangeStop(bookingId, { newFromStopId, newToStopId, seatAssignments, clientNetAmount })
          .pipe(
            map((response) => {
              const result = response.data;
              if (!result) {
                return confirmChangeStopFailure({
                  errorCode: 'GENERIC',
                  error: this.translate.instant('MY_BOOKINGS.CHANGE_STOP.ERROR.GENERIC'),
                });
              }
              return confirmChangeStopSuccess({ result });
            }),
            // Branch on `error.error.errorCode`, never the message string
            // (design-system §9) — localized the same regardless of Accept-Language.
            catchError((error: unknown) => {
              const errorCode = extractChangeStopErrorCode(error);
              return of(
                confirmChangeStopFailure({
                  errorCode,
                  error: this.translate.instant(
                    mapChangeStopErrorCode(errorCode, classifyHttpFallback(error))
                  ),
                })
              );
            })
          )
      )
    )
  );

  // CONFIRMED → the stop change already settled (refund or no additional
  // payment) — go straight to "settled" (success toast + list refresh + close).
  confirmChangeStopConfirmed$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeStopSuccess),
      filter(({ result }) => normalizeStatusCode(result.status) === 'confirmed'),
      map(() => changeStopSettled())
    )
  );

  // PENDING_PAYMENT → a top-up is owed; hand off to the embedded payment
  // step. `setActiveBookingId` keeps the reused payment leaf components'
  // `getActiveBookingId()` working unmodified — same handoff as reschedule.
  confirmChangeStopPending$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeStopSuccess),
      filter(({ result }) => normalizeStatusCode(result.status) === 'pending_payment'),
      tap(({ result }) => this.service.setActiveBookingId(result.bookingId)),
      map(({ result }) =>
        changeStopRequiresPayment({ bookingId: result.bookingId, paymentIntentId: result.paymentIntentId ?? null })
      )
    )
  );

  // Success is never gated behind the list refresh — the toast fires in
  // `tap`, then close + reload dispatch together.
  changeStopSettled$ = createEffect(() =>
    this.actions$.pipe(
      ofType(changeStopSettled),
      tap(() => this.alertService.success(this.translate.instant('MY_BOOKINGS.CHANGE_STOP.SUCCESS'))),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      mergeMap(([, state]) => [
        closeChangeStopDialog(),
        // OBRS-577 Decision A: preserveWindow — don't snap a multi-page list
        // back to page 1 after a settled change-stop.
        invokeLoadMyBookingsApi({ status: state.statusFilter, preserveWindow: true }),
      ])
    )
  );

  // Abandoned/failed payment — booking is left as `PENDING_PAYMENT`
  // server-side, so the list still needs a refresh, but with a "not
  // complete" notice instead of a success toast.
  changeStopAbandoned$ = createEffect(() =>
    this.actions$.pipe(
      ofType(changeStopAbandoned),
      tap(() => this.alertService.info(this.translate.instant('MY_BOOKINGS.CHANGE_STOP.PAYMENT_ABANDONED'))),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      mergeMap(([, state]) => [
        closeChangeStopDialog(),
        // OBRS-577 Decision A: preserveWindow — same as changeStopSettled$ above.
        invokeLoadMyBookingsApi({ status: state.statusFilter, preserveWindow: true }),
      ])
    )
  );

  // Terminal errors (booking can no longer change its stops at all) close
  // the dialog and toast; every other errorCode stays inline on the
  // estimate step via `changeStopConfirmError`/`changeStopConfirmErrorCode`.
  confirmChangeStopTerminalFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeStopFailure),
      filter(({ errorCode }) => isTerminalChangeStopError(errorCode)),
      tap(({ error }) => this.alertService.error(error)),
      map(() => closeChangeStopDialog())
    )
  );

  private toStopsLookup(stations: StationApi[] | null | undefined): Record<string, number> {
    const lookup: Record<string, number> = {};
    for (const station of stations ?? []) {
      if (station.slug) {
        lookup[station.slug] = station.id;
      }
    }
    return lookup;
  }

  private toSeatAssignments(journeys: BookingTicketJourney[] | undefined): ChangeStopSeatAssignment[] {
    // Change stop only supports single-leg bookings — the first (only) journey.
    const tickets = journeys?.[0]?.tickets ?? [];
    // OBRS-483: same fix as `RescheduleEffect.toSeatAssignments` — filter on
    // CONFIRMED status (the real invariant, and a guard against a cancelled
    // leftover ticket from a prior change-seat/reschedule still carrying a
    // seatNumber under ASSIGNED) instead of `!!ticket.seatNumber`, which
    // silently excluded EVERY ticket under OPEN. `seatNumber` is carried
    // through as-is (null under OPEN) — the backend fully supports
    // `POST .../change-stop/confirm` on an OPEN schedule.
    return tickets
      .filter((ticket) => normalizeStatusCode(ticket.status?.code) === 'confirmed')
      .map((ticket) => ({ ticketId: ticket.id, seatNumber: ticket.seatNumber ?? null }));
  }
}

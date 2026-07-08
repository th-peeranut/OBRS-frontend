import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { catchError, filter, map, mergeMap, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { BookingService } from '../../../services/booking/booking.service';
import { StationService } from '../../../services/station/station.service';
import { AlertService } from '../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../shared/lib/api-error';
import {
  extractRescheduleErrorCode,
  isTerminalRescheduleError,
  mapRescheduleErrorCode,
} from '../../../shared/lib/reschedule-error';
import { normalizeStatusCode, toAmountNumber } from '../../../shared/interfaces/my-booking.interface';
import { RescheduleSeatAssignment } from '../../../shared/interfaces/reschedule.interface';
import { StationApi } from '../../../shared/interfaces/station.interface';
import { BookingTicketJourney } from '../../../shared/interfaces/booking-ticket.interface';
import {
  closeRescheduleDialog,
  confirmReschedule,
  confirmRescheduleFailure,
  confirmRescheduleSuccess,
  invokeLoadMyBookingsApi,
  loadRescheduleEstimate,
  loadRescheduleEstimateFailure,
  loadRescheduleEstimateSuccess,
  loadRescheduleOptions,
  loadRescheduleOptionsFailure,
  loadRescheduleOptionsSuccess,
  loadRescheduleTickets,
  loadRescheduleTicketsFailure,
  loadRescheduleTicketsSuccess,
  loadStopsLookupFailure,
  loadStopsLookupSuccess,
  openRescheduleDialog,
  rescheduleAbandoned,
  rescheduleRequiresPayment,
  rescheduleSettled,
} from './my-bookings.action';
import { selectMyBookings, selectStopsLookup } from './my-bookings.selector';

/**
 * Effects for the My Bookings reschedule dialog (OBRS-83). Kept in a
 * dedicated class (registered alongside `MyBookingsEffect`) so the existing
 * load/cancel effect file doesn't balloon — both write into the same
 * `myBookings` feature state.
 */
@Injectable()
export class RescheduleEffect {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private service = inject(BookingService);
  private stationService = inject(StationService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  // Opening the dialog kicks off both background lookups in parallel and
  // non-blocking — the date step is interactive immediately (design-system §6:
  // modals open optimistically, never gated on an awaited fetch).
  loadStopsLookup$ = createEffect(() =>
    this.actions$.pipe(
      ofType(openRescheduleDialog),
      withLatestFrom(this.store.pipe(select(selectStopsLookup))),
      filter(([, stopsLookup]) => Object.keys(stopsLookup).length === 0),
      switchMap(() =>
        this.stationService.getAll().pipe(
          map((response) => loadStopsLookupSuccess({ stopsLookup: this.toStopsLookup(response.data) })),
          catchError((error: unknown) =>
            of(
              loadStopsLookupFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant('MY_BOOKINGS.RESCHEDULE.OPTIONS_ERROR'),
              })
            )
          )
        )
      )
    )
  );

  loadRescheduleTickets$ = createEffect(() =>
    this.actions$.pipe(
      ofType(openRescheduleDialog),
      switchMap(({ bookingId }) =>
        this.service.getBookingTickets(bookingId, true).pipe(
          map((response) =>
            loadRescheduleTicketsSuccess({ tickets: this.toSeatAssignments(response.data?.journeys) })
          ),
          catchError((error: unknown) =>
            of(
              loadRescheduleTicketsFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant('MY_BOOKINGS.RESCHEDULE.OPTIONS_ERROR'),
              })
            )
          )
        )
      )
    )
  );

  loadRescheduleOptions$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadRescheduleOptions),
      switchMap(({ bookingId, date }) =>
        this.service.getRescheduleOptions(bookingId, date).pipe(
          map((response) => loadRescheduleOptionsSuccess({ options: response.data ?? [] })),
          // Branch on `error.error.errorCode`, never the message string (design-system §9) —
          // works identically regardless of the request's Accept-Language.
          catchError((error: unknown) =>
            of(
              loadRescheduleOptionsFailure({
                error: this.translate.instant(mapRescheduleErrorCode(extractRescheduleErrorCode(error))),
              })
            )
          )
        )
      )
    )
  );

  loadRescheduleEstimate$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadRescheduleEstimate),
      switchMap(({ bookingId, newScheduleId, newFromStopId, newToStopId, seats }) =>
        this.service.getRescheduleEstimate(bookingId, { newScheduleId, newFromStopId, newToStopId, seats }).pipe(
          map((response) => {
            const estimate = response.data;
            if (!estimate) {
              return loadRescheduleEstimateFailure({
                error: this.translate.instant('MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC'),
              });
            }
            return loadRescheduleEstimateSuccess({ estimate });
          }),
          catchError((error: unknown) =>
            of(
              loadRescheduleEstimateFailure({
                error: this.translate.instant(mapRescheduleErrorCode(extractRescheduleErrorCode(error))),
              })
            )
          )
        )
      )
    )
  );

  // Confirm re-fetches the estimate right before submitting to guarantee a
  // fresh `netAmount` (acceptance criterion #9) — never trusts the value the
  // component last rendered. A mismatch refuses the submit with a
  // client-only PRICE_CHANGED code (the backend's own
  // RESCHEDULE_ERROR_NET_AMOUNT_CHANGED check is a second line of defense).
  confirmReschedule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmReschedule),
      switchMap(({ bookingId, newScheduleId, newFromStopId, newToStopId, seatAssignments, clientNetAmount }) =>
        this.service
          .getRescheduleEstimate(bookingId, {
            newScheduleId,
            newFromStopId,
            newToStopId,
            seats: Object.values(seatAssignments),
          })
          .pipe(
            switchMap((estimateResponse) => {
              const freshEstimate = estimateResponse.data;
              if (!freshEstimate) {
                return of(
                  confirmRescheduleFailure({
                    errorCode: 'GENERIC',
                    error: this.translate.instant('MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC'),
                  })
                );
              }

              const freshNetAmount = toAmountNumber(freshEstimate.netAmount);
              if (Math.abs(freshNetAmount - clientNetAmount) > 0.005) {
                return of(
                  confirmRescheduleFailure({
                    errorCode: 'RESCHEDULE_PRICE_CHANGED',
                    error: this.translate.instant('MY_BOOKINGS.RESCHEDULE.PRICE_CHANGED'),
                  })
                );
              }

              return this.service
                .confirmReschedule(bookingId, {
                  newScheduleId,
                  newFromStopId,
                  newToStopId,
                  seatAssignments,
                  clientNetAmount: freshNetAmount,
                })
                .pipe(
                  map((response) => {
                    const result = response.data;
                    if (!result) {
                      return confirmRescheduleFailure({
                        errorCode: 'GENERIC',
                        error: this.translate.instant('MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC'),
                      });
                    }
                    return confirmRescheduleSuccess({ result });
                  }),
                  // Branch on `error.error.errorCode`, never the message string
                  // (design-system §9) — localized the same regardless of Accept-Language.
                  catchError((error: unknown) => {
                    const errorCode = extractRescheduleErrorCode(error);
                    return of(
                      confirmRescheduleFailure({
                        errorCode,
                        error: this.translate.instant(mapRescheduleErrorCode(errorCode)),
                      })
                    );
                  })
                );
            }),
            catchError((error: unknown) => {
              const errorCode = extractRescheduleErrorCode(error);
              return of(
                confirmRescheduleFailure({
                  errorCode,
                  error: this.translate.instant(mapRescheduleErrorCode(errorCode)),
                })
              );
            })
          )
      )
    )
  );

  // CONFIRMED → the swap already settled; go straight to "settled" (success
  // toast + list refresh + close), matching acceptance criterion #10.
  confirmRescheduleConfirmed$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmRescheduleSuccess),
      filter(({ result }) => normalizeStatusCode(result.status) === 'confirmed'),
      map(() => rescheduleSettled())
    )
  );

  // PENDING_PAYMENT → a top-up is owed; hand off to the embedded payment
  // step (acceptance criterion #11). `setActiveBookingId` keeps the reused
  // payment leaf components' `getActiveBookingId()` working unmodified.
  confirmReschedulePending$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmRescheduleSuccess),
      filter(({ result }) => normalizeStatusCode(result.status) === 'pending_payment'),
      tap(({ result }) => this.service.setActiveBookingId(result.bookingId)),
      map(({ result }) =>
        rescheduleRequiresPayment({ bookingId: result.bookingId, paymentIntentId: result.paymentIntentId ?? null })
      )
    )
  );

  // Success is never gated behind the list refresh (acceptance criterion
  // #12) — the toast fires in `tap`, then close + reload dispatch together.
  rescheduleSettled$ = createEffect(() =>
    this.actions$.pipe(
      ofType(rescheduleSettled),
      tap(() => this.alertService.success(this.translate.instant('MY_BOOKINGS.RESCHEDULE.SUCCESS'))),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      mergeMap(([, state]) => [closeRescheduleDialog(), invokeLoadMyBookingsApi({ status: state.statusFilter })])
    )
  );

  // Abandoned/failed payment — booking is left as `PENDING_PAYMENT`
  // server-side (acceptance criterion #11), so the list still needs a
  // refresh, but with a "not complete" notice instead of a success toast.
  rescheduleAbandoned$ = createEffect(() =>
    this.actions$.pipe(
      ofType(rescheduleAbandoned),
      tap(() => this.alertService.info(this.translate.instant('MY_BOOKINGS.RESCHEDULE.PAYMENT_ABANDONED'))),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      mergeMap(([, state]) => [closeRescheduleDialog(), invokeLoadMyBookingsApi({ status: state.statusFilter })])
    )
  );

  // Terminal errors (booking can no longer be rescheduled at all) close the
  // dialog and toast; every other errorCode stays inline on the estimate
  // step via `rescheduleConfirmError`/`rescheduleConfirmErrorCode` in state
  // (mapped to the localized message by the component/effect that raised it).
  confirmRescheduleTerminalFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmRescheduleFailure),
      filter(({ errorCode }) => isTerminalRescheduleError(errorCode)),
      tap(({ error }) => this.alertService.error(error)),
      map(() => closeRescheduleDialog())
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

  private toSeatAssignments(journeys: BookingTicketJourney[] | undefined): RescheduleSeatAssignment[] {
    // Reschedule only supports single-leg bookings — the first (only) journey.
    const tickets = journeys?.[0]?.tickets ?? [];
    return tickets
      .filter((ticket) => !!ticket.seatNumber)
      .map((ticket) => ({ ticketId: ticket.id, seatNumber: ticket.seatNumber as string }));
  }
}

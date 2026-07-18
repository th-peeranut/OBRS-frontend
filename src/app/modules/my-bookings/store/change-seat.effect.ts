import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { catchError, filter, map, mergeMap, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { BookingService } from '../../../services/booking/booking.service';
import { AlertService } from '../../../shared/services/alert.service';
import { normalizeStatusCode } from '../../../shared/interfaces/my-booking.interface';
import { ChangeSeatTicket } from '../../../shared/interfaces/change-seat.interface';
import { BookingTicketJourney } from '../../../shared/interfaces/booking-ticket.interface';
import { extractApiErrorMessage } from '../../../shared/lib/api-error';
import { classifyHttpFallback } from '../../../shared/lib/http-error-fallback';
import {
  extractChangeSeatErrorCode,
  isTerminalChangeSeatError,
  mapChangeSeatErrorCode,
} from '../../../shared/lib/change-seat-error';
import {
  changeSeatSettled,
  closeChangeSeatDialog,
  confirmChangeSeat,
  confirmChangeSeatFailure,
  confirmChangeSeatSuccess,
  invokeLoadMyBookingsApi,
  loadChangeSeatAvailability,
  loadChangeSeatAvailabilityFailure,
  loadChangeSeatAvailabilitySuccess,
  loadChangeSeatTickets,
  loadChangeSeatTicketsFailure,
  loadChangeSeatTicketsSuccess,
  openChangeSeatDialog,
} from './my-bookings.action';
import { selectMyBookings } from './my-bookings.selector';

/** `errorCode`s that mean "the seat map moved under you" — the chosen
 * seat(s) are no longer valid, but the booking itself can still have its
 * seat changed, so the map is refreshed instead of closing the dialog. */
const RETURN_TO_MAP_ERROR_CODES: readonly string[] = [
  'CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE',
  'CHANGE_SEAT_ERROR_NO_SEATS',
  'CHANGE_SEAT_ERROR_SEAT_NOT_IN_MAP',
  'CHANGE_SEAT_ERROR_TICKET_MISMATCH',
];

/**
 * Effects for the My Bookings change-seat dialog (OBRS-110). Kept in a
 * dedicated class (registered alongside `MyBookingsEffect`/`RescheduleEffect`)
 * so the existing load/cancel effect file doesn't balloon — all three write
 * into the same `myBookings` feature state.
 */
@Injectable()
export class ChangeSeatEffect {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private service = inject(BookingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  // Opening the dialog kicks off both background loads in parallel and
  // non-blocking — the seat map step is interactive immediately (design-system
  // §6: modals open optimistically, never gated on an awaited fetch). The
  // same `loadChangeSeatAvailability` action is also re-dispatched later, by
  // the dialog's Retry button and by `confirmChangeSeatReturnToMap$` below.
  loadChangeSeatAvailabilityOnOpen$ = createEffect(() =>
    this.actions$.pipe(
      ofType(openChangeSeatDialog),
      map(({ bookingId }) => loadChangeSeatAvailability({ bookingId }))
    )
  );

  loadChangeSeatAvailability$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadChangeSeatAvailability),
      switchMap(({ bookingId }) =>
        this.service.getChangeSeatAvailability(bookingId).pipe(
          map((response) => {
            const availability = response.data;
            if (!availability) {
              return loadChangeSeatAvailabilityFailure({
                error: this.translate.instant('MY_BOOKINGS.CHANGE_SEAT.ERROR.GENERIC'),
              });
            }
            return loadChangeSeatAvailabilitySuccess({ availability });
          }),
          // Branch on `error.error.errorCode`, never the message string
          // (design-system §9) — works identically regardless of the
          // request's Accept-Language. With no recognized code, `fallbackTier`
          // further splits "backend unreachable" from "rejected, no code"
          // (OBRS-170) instead of one vague GENERIC message.
          catchError((error: unknown) =>
            of(
              loadChangeSeatAvailabilityFailure({
                error: this.translate.instant(
                  mapChangeSeatErrorCode(extractChangeSeatErrorCode(error), classifyHttpFallback(error))
                ),
              })
            )
          )
        )
      )
    )
  );

  loadChangeSeatTickets$ = createEffect(() =>
    this.actions$.pipe(
      ofType(openChangeSeatDialog),
      switchMap(({ bookingId }) =>
        this.service.getBookingTickets(bookingId, true).pipe(
          map((response) =>
            loadChangeSeatTicketsSuccess({ tickets: this.toChangeSeatTickets(response.data?.journeys) })
          ),
          catchError((error: unknown) =>
            of(
              loadChangeSeatTicketsFailure({
                error:
                  extractApiErrorMessage(error) ||
                  // Same code-less tiering as availability/confirm above (and
                  // change-stop's own tickets load) — a backend-down 5xx says
                  // "try again later", a code-less rejection says "can't do
                  // this right now", instead of one vague GENERIC (OBRS-170).
                  this.translate.instant(
                    mapChangeSeatErrorCode(extractChangeSeatErrorCode(error), classifyHttpFallback(error))
                  ),
              })
            )
          )
        )
      )
    )
  );

  confirmChangeSeat$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeSeat),
      switchMap(({ bookingId, seatAssignments }) =>
        this.service.confirmChangeSeat(bookingId, seatAssignments).pipe(
          map((response) => {
            const result = response.data;
            if (!result) {
              return confirmChangeSeatFailure({
                errorCode: 'GENERIC',
                error: this.translate.instant('MY_BOOKINGS.CHANGE_SEAT.ERROR.GENERIC'),
              });
            }
            return confirmChangeSeatSuccess({ result });
          }),
          catchError((error: unknown) => {
            const errorCode = extractChangeSeatErrorCode(error);
            return of(
              confirmChangeSeatFailure({
                errorCode,
                error: this.translate.instant(
                  mapChangeSeatErrorCode(errorCode, classifyHttpFallback(error))
                ),
              })
            );
          })
        )
      )
    )
  );

  // CONFIRMED → the swap already settled; go straight to "settled" (success
  // toast + list refresh + close). Change seat never returns anything else.
  confirmChangeSeatConfirmed$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeSeatSuccess),
      filter(({ result }) => normalizeStatusCode(result.status) === 'confirmed'),
      map(() => changeSeatSettled())
    )
  );

  // Success is never gated behind the list refresh — the toast fires in
  // `tap`, then close + reload dispatch together.
  changeSeatSettled$ = createEffect(() =>
    this.actions$.pipe(
      ofType(changeSeatSettled),
      tap(() => this.alertService.success(this.translate.instant('MY_BOOKINGS.CHANGE_SEAT.SUCCESS'))),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      mergeMap(([, state]) => [closeChangeSeatDialog(), invokeLoadMyBookingsApi({ status: state.statusFilter })])
    )
  );

  // Terminal errors (booking can no longer have its seat changed at all)
  // close the dialog and toast; every other errorCode stays inline on the
  // map step via `changeSeatConfirmError`/`changeSeatConfirmErrorCode` and
  // re-fetches availability so the map reflects reality (design-system §6;
  // OBRS-83 NO_SEATS lesson — the re-fetch must not clobber the confirm
  // error, see the reducer's `loadChangeSeatAvailability` case).
  confirmChangeSeatTerminalFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeSeatFailure),
      filter(({ errorCode }) => isTerminalChangeSeatError(errorCode)),
      tap(({ error }) => this.alertService.error(error)),
      map(() => closeChangeSeatDialog())
    )
  );

  confirmChangeSeatReturnToMap$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmChangeSeatFailure),
      filter(({ errorCode }) => RETURN_TO_MAP_ERROR_CODES.includes(errorCode)),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      filter(([, state]) => state.changeSeatDialogBookingId !== null),
      map(([, state]) =>
        loadChangeSeatAvailability({ bookingId: state.changeSeatDialogBookingId as number })
      )
    )
  );

  private toChangeSeatTickets(journeys: BookingTicketJourney[] | undefined): ChangeSeatTicket[] {
    // Change seat only supports single-leg bookings — the first (only) journey.
    const tickets = journeys?.[0]?.tickets ?? [];
    return tickets
      // `GET .../tickets` includes CANCELLED leftovers from a prior
      // change-stop/reschedule (which cancel+recreate tickets) — those still
      // carry a seatNumber, so filtering on seatNumber alone seeded
      // `seatAssignments` with a cancelled ticket id too. The backend's
      // change-seat confirm requires the payload's ticket-id set to match
      // the CONFIRMED tickets exactly, else it 400s with
      // CHANGE_SEAT_ERROR_TICKET_MISMATCH (OBRS-171 follow-up). Reuse the
      // same confirmed-status normalization `confirmChangeSeatConfirmed$`
      // already applies to `result.status`.
      //
      // OBRS-483: dropped the additional `!!ticket.seatNumber` predicate —
      // on an OPEN-seating schedule every ticket's seatNumber is null, so
      // that extra check would (harmlessly, since change-seat is gated
      // `changeSeatEligible=false` under OPEN, my-bookings.component.ts —
      // OPEN has no seat to change, a domain rule, not a limitation) still
      // exclude every ticket here too, the same silent-empty-list bug the
      // reschedule/change-stop effects had. `seatNumber as string` stays —
      // in practice this path only ever runs for ASSIGNED bookings, where
      // it's always non-null.
      .filter((ticket) => normalizeStatusCode(ticket.status?.code) === 'confirmed')
      .map((ticket) => ({ ticketId: ticket.id, seatNumber: ticket.seatNumber as string }));
  }
}

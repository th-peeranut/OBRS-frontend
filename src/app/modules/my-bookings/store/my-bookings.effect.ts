import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { from, of } from 'rxjs';
import { catchError, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { BookingService } from '../../../services/booking/booking.service';
import { AlertService } from '../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../shared/lib/api-error';
import { extractApiErrorCode } from '../../../shared/lib/api-error-code';
import {
  CancelBookingResult,
  CancellationPolicy,
  MANUAL_REFUND_METHOD,
  MyBookingView,
  toAmountNumber,
} from '../../../shared/interfaces/my-booking.interface';
import {
  cancelBookingDismissed,
  cancelBookingFailure,
  cancelBookingSuccess,
  confirmCancelWithDestination,
  invokeLoadMyBookingsApi,
  invokeLoadMyBookingsApiFailure,
  invokeLoadMyBookingsApiSuccess,
  openCancelRefundDestinationModal,
  refundDestinationInvalid,
  requestCancelBooking,
} from './my-bookings.action';
import { selectMyBookings } from './my-bookings.selector';

/** OBRS-286: the two destination error codes the customer-cancel endpoint can
 * 400 with — SA-SPEC-OBRS-286.md contract #1. */
const REFUND_DESTINATION_ERROR_CODES = new Set([
  'cancel.error.refund-destination-required',
  'cancel.error.refund-destination-invalid',
]);

@Injectable()
export class MyBookingsEffect {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private service = inject(BookingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  loadMyBookings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeLoadMyBookingsApi),
      switchMap(({ status, showLoading }) =>
        this.service.getMyBookings(status, showLoading).pipe(
          map((response) =>
            invokeLoadMyBookingsApiSuccess({
              bookings: response.data?.content ?? [],
            })
          ),
          catchError((error: unknown) =>
            of(
              invokeLoadMyBookingsApiFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant('MY_BOOKINGS.LOAD_FAILED'),
              })
            )
          )
        )
      )
    )
  );

  // Preview the refund, confirm with the traveler, then cancel — all in one
  // exclusive stream so a second click can't race the first.
  //
  // OBRS-286 Flow A1: when the policy resolves to MANUAL_REFUND_REQUIRED, the
  // plain Swal confirm is replaced by `openCancelRefundDestinationModal` — the
  // traveler must supply a refund destination first. Every other path
  // (non-manual) is byte-identical to before.
  requestCancel$ = createEffect(() =>
    this.actions$.pipe(
      ofType(requestCancelBooking),
      switchMap(({ booking }) =>
        this.service.getCancellationPolicy(booking.id).pipe(
          switchMap((response) => {
            const policy = response.data;
            if (!policy) {
              return of(
                cancelBookingFailure({
                  error:
                    response.message ||
                    this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
                })
              );
            }

            if (policy.refundMethod === MANUAL_REFUND_METHOD) {
              return of(openCancelRefundDestinationModal({ booking, policy }));
            }

            return from(this.confirmCancellation(booking, policy)).pipe(
              switchMap((confirmed) => {
                if (!confirmed) {
                  return of(cancelBookingDismissed());
                }
                return this.cancelConfirmed$(booking);
              })
            );
          }),
          catchError((error: unknown) =>
            of(
              cancelBookingFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
              })
            )
          )
        )
      )
    )
  );

  // OBRS-286 Flow A1 step 4-5: submits the cancel-with-destination modal.
  // On success, byte-identical to the non-manual path (cancelBookingSuccess).
  // On a destination error code, `refundDestinationInvalid` keeps the modal
  // open with what was typed intact (the fix for the Scrutinize-caught
  // contradiction — see the reducer). Every other failure (network/409/500/
  // window-closed) still routes through the existing `cancelBookingFailure`
  // (global toast, modal closes) — those are genuinely not "keep editing"
  // cases.
  confirmCancelWithDestination$ = createEffect(() =>
    this.actions$.pipe(
      ofType(confirmCancelWithDestination),
      switchMap(({ booking, refundDestination }) =>
        this.service.cancelBooking(booking.id, { refundDestination }).pipe(
          map((response) => {
            const result = response.data;
            if (!result) {
              return cancelBookingFailure({
                error:
                  response.message ||
                  this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
              });
            }
            return cancelBookingSuccess({ result });
          }),
          catchError((error: unknown) => {
            const code = extractApiErrorCode(error, null);
            if (code && REFUND_DESTINATION_ERROR_CODES.has(code)) {
              return of(
                refundDestinationInvalid({
                  message:
                    extractApiErrorMessage(error) ||
                    this.translate.instant('REFUND_DESTINATION.ERROR.SERVER_INVALID'),
                })
              );
            }
            return of(
              cancelBookingFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
              })
            );
          })
        )
      )
    )
  );

  // On success: toast the refund and reload the list (preserving the filter).
  cancelSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(cancelBookingSuccess),
      tap(({ result }) => this.showCancelSuccess(result)),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      map(([, state]) =>
        invokeLoadMyBookingsApi({ status: state.statusFilter })
      )
    )
  );

  cancelFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(cancelBookingFailure),
        tap(({ error }) => this.alertService.error(error))
      ),
    { dispatch: false }
  );

  private cancelConfirmed$(booking: MyBookingView) {
    return this.service.cancelBooking(booking.id).pipe(
      map((response) => {
        const result = response.data;
        if (!result) {
          return cancelBookingFailure({
            error:
              response.message ||
              this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
          });
        }
        return cancelBookingSuccess({ result });
      }),
      catchError((error: unknown) =>
        of(
          cancelBookingFailure({
            error:
              extractApiErrorMessage(error) ||
              this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
          })
        )
      )
    );
  }

  private confirmCancellation(
    booking: MyBookingView,
    policy: CancellationPolicy
  ): Promise<boolean> {
    const lines = [
      this.translate.instant('MY_BOOKINGS.CANCEL.CONFIRM_TEXT', {
        bookingNumber: booking.bookingNumber,
        route: booking.route,
      }),
      this.translate.instant('MY_BOOKINGS.CANCEL.REFUND_LINE', {
        refund: this.formatCurrency(policy.refundAmount),
        rate: policy.refundRatePercent,
      }),
      this.translate.instant('MY_BOOKINGS.CANCEL.PENALTY_LINE', {
        penalty: this.formatCurrency(policy.penaltyAmount),
      }),
    ];

    if (policy.refundMethod === MANUAL_REFUND_METHOD) {
      lines.push(this.translate.instant('MY_BOOKINGS.CANCEL.MANUAL_REFUND_NOTE'));
    }

    return this.alertService.confirm({
      icon: 'warning',
      title: this.translate.instant('MY_BOOKINGS.CANCEL.CONFIRM_TITLE'),
      text: lines.join('\n'),
      confirmButtonText: this.translate.instant('MY_BOOKINGS.CANCEL.CONFIRM_BUTTON'),
      cancelButtonText: this.translate.instant('MY_BOOKINGS.CANCEL.CANCEL_BUTTON'),
    });
  }

  private showCancelSuccess(result: CancelBookingResult): void {
    const message =
      result.refundMethod === MANUAL_REFUND_METHOD
        ? this.translate.instant('MY_BOOKINGS.CANCEL.SUCCESS_MANUAL', {
            refund: this.formatCurrency(result.refundAmount),
          })
        : this.translate.instant('MY_BOOKINGS.CANCEL.SUCCESS', {
            refund: this.formatCurrency(result.refundAmount),
          });

    void this.alertService.success(message);
  }

  private formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(toAmountNumber(value));
  }
}

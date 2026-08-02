import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { catchError, filter, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { BookingService } from '../../../services/booking/booking.service';
import { AlertService } from '../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../shared/lib/api-error';
import { errorCodeFromMessageKey, extractApiErrorCode } from '../../../shared/lib/api-error-code';
import {
  CancelBookingResult,
  MANUAL_REFUND_METHOD,
  formatRefundAmount,
} from '../../../shared/interfaces/my-booking.interface';
import { MY_BOOKINGS_PAGE_SIZE } from './my-bookings.model';
import {
  cancelBookingFailure,
  cancelBookingSuccess,
  confirmCancelWithDestination,
  invokeLoadMoreMyBookingsApi,
  invokeLoadMoreMyBookingsApiFailure,
  invokeLoadMoreMyBookingsApiSuccess,
  invokeLoadMyBookingsApi,
  invokeLoadMyBookingsApiFailure,
  invokeLoadMyBookingsApiSuccess,
  openCancelRefundDestinationModal,
  refundDestinationInvalid,
  requestCancelBooking,
} from './my-bookings.action';
import { selectMyBookings } from './my-bookings.selector';

/** OBRS-286: the two destination error codes the customer-cancel endpoint can
 * 400 with — SA-SPEC-OBRS-286.md contract #1.
 *
 * OBRS-839: written as the dotted `messageKey` form, compared against the wire
 * `errorCode`, which is the DERIVED `CANCEL_ERROR_REFUND_DESTINATION_*`. The
 * comparison could never be true, so `refundDestinationInvalid` never fired and
 * a rejected bank account / PromptPay number closed the traveler's modal with a
 * generic toast instead of keeping what they typed and saying which field was
 * wrong. Derived here rather than hand-typed — see `errorCodeFromMessageKey`. */
const REFUND_DESTINATION_ERROR_CODES = new Set<string>([
  errorCodeFromMessageKey('cancel.error.refund-destination-required'),
  errorCodeFromMessageKey('cancel.error.refund-destination-invalid'),
]);

@Injectable()
export class MyBookingsEffect {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private service = inject(BookingService);
  private alertService = inject(AlertService);
  private translate = inject(TranslateService);

  // OBRS-577 Decision A: `preserveWindow` (set by the 6 post-mutation reload
  // sites) refetches however many MY_BOOKINGS_PAGE_SIZE pages are already on
  // screen in ONE request (`withLatestFrom` reads `pagesLoaded` off the
  // current state), so a cancel/reschedule/change-seat/change-stop success
  // never visibly truncates a loaded-5-pages list back to page 1. The first
  // load and every status-filter switch leave it `false` (or unset) and get
  // the plain AC2 default of MY_BOOKINGS_PAGE_SIZE.
  loadMyBookings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeLoadMyBookingsApi),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      switchMap(([{ status, showLoading, preserveWindow }, state]) => {
        const size = preserveWindow
          ? Math.max(MY_BOOKINGS_PAGE_SIZE, state.pagesLoaded * MY_BOOKINGS_PAGE_SIZE)
          : MY_BOOKINGS_PAGE_SIZE;

        return this.service
          .getMyBookings({ status, page: 0, size, showLoadingDialog: showLoading })
          .pipe(
            map((response) =>
              invokeLoadMyBookingsApiSuccess({
                bookings: response.data?.content ?? [],
                totalElements: response.data?.totalElements ?? 0,
                totalPages: response.data?.totalPages ?? 0,
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
          );
      })
    )
  );

  // OBRS-577 AC2/AC6: fetches the next MY_BOOKINGS_PAGE_SIZE-row page and the
  // reducer APPENDS it (never replaces) — the customer-shell incremental
  // "Load more" idiom (design-system §12, OBRS-433 precedent), not a
  // page-number paginator. `filter` is a defensive second gate mirroring
  // `MyReportsStore.loadMore()`'s own guard — the button is already hidden
  // once `pagesLoaded >= totalPages`, and `showLoadingDialog: false` is
  // explicit (not just the service default) so this never surfaces the
  // global loading dialog even if that default ever changes.
  loadMoreMyBookings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeLoadMoreMyBookingsApi),
      withLatestFrom(this.store.pipe(select(selectMyBookings))),
      filter(([, state]) => !state.loadingMore && state.pagesLoaded < state.totalPages),
      switchMap(([, state]) =>
        this.service
          .getMyBookings({
            status: state.statusFilter,
            page: state.pagesLoaded,
            size: MY_BOOKINGS_PAGE_SIZE,
            showLoadingDialog: false,
          })
          .pipe(
            map((response) =>
              invokeLoadMoreMyBookingsApiSuccess({
                bookings: response.data?.content ?? [],
                totalElements: response.data?.totalElements ?? 0,
                totalPages: response.data?.totalPages ?? 0,
              })
            ),
            catchError((error: unknown) =>
              of(
                invokeLoadMoreMyBookingsApiFailure({
                  error:
                    extractApiErrorMessage(error) ||
                    this.translate.instant('MY_BOOKINGS.LOAD_MORE_FAILED'),
                })
              )
            )
          )
      )
    )
  );

  // Load more failures are a toast only (AlertService) — the already-visible
  // list/count line stay exactly as they were before the click (spec
  // "States" section), never a full-page error takeover.
  loadMoreMyBookingsFailureToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(invokeLoadMoreMyBookingsApiFailure),
        tap(({ error }) => this.alertService.error(error))
      ),
    { dispatch: false }
  );

  // Preview the refund, then open the cancel modal — one exclusive stream so
  // a second click can't race the first.
  //
  // OBRS-286 Flow A1 introduced this modal only for MANUAL_REFUND_REQUIRED,
  // falling through to a plain Swal confirm for every other refund method.
  // OBRS-942 deleted that fork: the two screens quoted identical numbers and
  // only the Swal lane never mentioned the OBRS-813 reschedule offer, so a
  // card payer could lose 20% where a free reschedule would have kept 100%.
  // Every resolved policy now opens the same modal; `CancelBookingModalComponent`
  // hides the destination form/note itself when the method isn't manual.
  requestCancel$ = createEffect(() =>
    this.actions$.pipe(
      ofType(requestCancelBooking),
      switchMap(({ booking }) =>
        this.service.getCancellationPolicy(booking.id).pipe(
          switchMap((response) => {
            const policy = response.data;
            if (!policy) {
              // OBRS-843: this is a FAILURE path reached on an HTTP 200 whose
              // `data` came back null, and `response.message` on a 2xx is
              // `ApiSuccessRespDto`'s reason phrase — the literal "OK". The
              // traveler was shown an error toast reading "OK". The envelope
              // message is never user-facing copy; the translated string is.
              return of(
                cancelBookingFailure({
                  error: this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
                })
              );
            }

            return of(openCancelRefundDestinationModal({ booking, policy }));
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
              // OBRS-843 — same "OK"-as-an-error-message defect as above.
              return cancelBookingFailure({
                error: this.translate.instant('MY_BOOKINGS.CANCEL.FAILED'),
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
        // OBRS-577 Decision A: preserveWindow so a traveler who has loaded
        // several pages doesn't see the list snap back to page 1 after a
        // successful cancel.
        invokeLoadMyBookingsApi({ status: state.statusFilter, preserveWindow: true })
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

  // OBRS-843: delegates to the shared formatter the counter and override cancel
  // dialogs now use, so one refund reads the same on all three surfaces.
  private formatCurrency(value: number | string): string {
    return formatRefundAmount(value);
  }
}

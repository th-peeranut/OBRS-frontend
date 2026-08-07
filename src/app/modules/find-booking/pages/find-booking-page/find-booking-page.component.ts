import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { BookingLookupService } from '../../../../services/booking-lookup/booking-lookup.service';
import {
  BookingLookupResult,
  BookingLookupStop,
} from '../../../../shared/interfaces/booking-lookup.interface';
import {
  bookingLookupStatusKey,
  bookingLookupStatusTone,
  bookingLookupStopLabel,
} from '../../../../shared/lib/booking-lookup-status';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

/**
 * `idle` before the first submit; `throttled` is its own state because it is the ONE failure a
 * caller can fix by waiting rather than by retyping — collapsing it into `not-found` would tell
 * someone who is already being rate-limited to try again immediately.
 */
type LookupContentState = 'idle' | 'loading' | 'found' | 'not-found' | 'throttled';

/**
 * OBRS-857 — `/find-booking`. The public way back to a ticket for a customer with no account
 * (`customerArea: true`, NO `requireAuth`, same route shape as `/track-parcel`).
 *
 * <p><b>Why this page exists at all.</b> It is the precondition for ever making email optional at
 * checkout: SMS is off and there is no LINE channel, so once the tab is closed a guest's only
 * remaining copy of the ticket is the booking number they wrote down. ADR-0123 Decision 5 settles
 * that the answer to "how does a guest get their ticket" is RETRIEVAL, not delivery — which is
 * also why the e-ticket screen links here.
 *
 * <p><b>What this component must not do.</b> The backend answers "no such booking", "wrong phone"
 * and "that is a parcel booking" with one byte-identical 404, so that the endpoint cannot be used
 * to confirm which booking numbers exist. Anything here that split that 404 into two messages —
 * even a friendlier one — would hand back the oracle the backend spent a whole service class
 * closing. There is exactly one refusal state, and it says nothing about which half was wrong.
 */
@Component({
  selector: 'app-find-booking-page',
  templateUrl: './find-booking-page.component.html',
  styleUrl: './find-booking-page.component.scss',
  standalone: false,
})
export class FindBookingPageComponent implements OnDestroy {
  protected readonly form: FormGroup;
  protected contentState: LookupContentState = 'idle';
  protected result: BookingLookupResult | null = null;

  protected readonly stopLabel = bookingLookupStopLabel;
  protected readonly statusKey = bookingLookupStatusKey;
  protected readonly statusTone = bookingLookupStatusTone;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly lookupService: BookingLookupService,
    private readonly translate: TranslateService
  ) {
    this.form = this.fb.group({
      bookingNumber: ['', [Validators.required]],
      // Digits only, 10-15 — the same range the backend's `ContactPhone.ANY_DIGITS_PATTERN`
      // accepts. Validating tighter here than the column does would lock the owners of landline
      // and legacy-format bookings out of their own tickets, which is the failure this page
      // exists to prevent, not one it may introduce.
      phoneNumber: ['', [Validators.required, Validators.pattern(/^\d{10,15}$/)]],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onSubmit(): void {
    // Trim BEFORE validating, and write the trimmed values back into the controls. Both halves
    // matter. Validating first would reject a pasted `" 0812345678 "` against the digits-only
    // pattern — a booking reference and a phone number are exactly the two things a customer
    // copies out of a message, and surrounding whitespace comes with them; the customer would
    // see "enter 10-15 digits" over a field that visibly holds ten. Writing back is what stops
    // the field from disagreeing with what was actually sent.
    this.form.patchValue({
      bookingNumber: String(this.form.value.bookingNumber ?? '').trim(),
      phoneNumber: String(this.form.value.phoneNumber ?? '').trim(),
    });

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const bookingNumber = String(this.form.value.bookingNumber ?? '');
    const phoneNumber = String(this.form.value.phoneNumber ?? '');
    if (!bookingNumber || !phoneNumber) {
      return;
    }

    this.contentState = 'loading';
    this.result = null;

    this.lookupService
      .lookup({ bookingNumber, phoneNumber })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.result = resp?.data ?? null;
          this.contentState = this.result ? 'found' : 'not-found';
        },
        error: (error: unknown) => {
          this.result = null;
          // 429 is the only status that gets its own message, and it is not an oracle: it is a
          // fact about THIS caller's request rate, not about whether the booking exists. Every
          // other failure — 404, 400, a network drop — renders the single neutral refusal.
          this.contentState = this.isThrottled(error) ? 'throttled' : 'not-found';
        },
      });
  }

  private isThrottled(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 429;
  }

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected stopFor(stop: BookingLookupStop | null | undefined): string {
    return this.stopLabel(stop);
  }

  /** Empty rather than a dash: an OPEN-seating schedule normalizes every seat to null (OBRS-321/483). */
  protected get hasTickets(): boolean {
    return (this.result?.tickets?.length ?? 0) > 0;
  }
}

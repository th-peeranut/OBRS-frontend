import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { BookingsStore } from './bookings.store';
import {
  AdminApiService,
  AdminBookingDto,
  AdminPaymentByBookingIdDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { TranslateService } from '@ngx-translate/core';

/**
 * OBRS-614: the row badge must never carry a payment status that no server
 * ever said. Every case below pins one of the two REAL sources toBookingRow
 * may draw from, plus the two "there is no payment status" outcomes that
 * replaced the fabricated third one.
 */
describe('BookingsStore paymentStatus (OBRS-614)', () => {
  let store: BookingsStore;
  let adminApiServiceSpy: jasmine.SpyObj<AdminApiService>;

  function booking(overrides: Partial<AdminBookingDto> = {}): AdminBookingDto {
    return {
      id: 1,
      bookingNumber: 'B-1',
      totalAmount: 500,
      status: 'confirmed',
      createdAt: '2026-09-01T10:00:00+07:00',
      ...overrides,
    };
  }

  /** A payments response that ERRORS. Tagged explicitly rather than sniffed
   * with `instanceof Error`: HttpErrorResponse does NOT extend Error, so that
   * check silently turned this arm into a 200 carrying the error object as its
   * body — the fabricated value then appeared for the no-data reason instead
   * of the error reason, and the spec still went red for the wrong cause. */
  function errors(): { throws: HttpErrorResponse } {
    return {
      throws: new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable' }),
    };
  }

  function setup(
    bookings: AdminBookingDto[],
    payments: (bookingId: number) => AdminPaymentByBookingIdDto | { throws: HttpErrorResponse }
  ): void {
    adminApiServiceSpy.getBookings.and.returnValue(
      of({ code: 200, message: 'OK', data: { content: bookings } } as any)
    );
    adminApiServiceSpy.getBookingPayments.and.callFake((bookingId: number) => {
      const result = payments(bookingId);
      return 'throws' in result
        ? throwError(() => result.throws)
        : of({ code: 200, message: 'OK', data: result } as any);
    });
  }

  async function firstRowStatus(): Promise<string> {
    await store.refresh();
    const data = await new Promise<any>((resolve) =>
      store.data$.subscribe((value) => value && resolve(value))
    );
    return data.rows[0].paymentStatus;
  }

  beforeEach(() => {
    adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', [
      'getBookings',
      'getBookingPayments',
    ]);

    TestBed.configureTestingModule({
      providers: [
        BookingsStore,
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        {
          provide: AuthService,
          useValue: { authStatus$: new BehaviorSubject<boolean>(true).asObservable() },
        },
        { provide: TranslateService, useValue: { currentLang: 'en' } },
      ],
    });

    store = TestBed.inject(BookingsStore);
  });

  // The defect this card exists for: the payments call failing is exactly when
  // staff need the truth, and it was the moment the badge started inventing one.
  it('reports PAYMENT_LOAD_FAILED — not a status derived from the booking — when getBookingPayments errors', async () => {
    setup([booking({ status: 'cancelled' })], () => errors());

    expect(await firstRowStatus()).toBe('PAYMENT_LOAD_FAILED');
  });

  // A CANCELLED booking may have been paid in full and refunded; 'FAILED' was
  // not an ambiguous label, it was a false one.
  it('never reports FAILED for a CANCELLED booking that has no payment data', async () => {
    setup([booking({ status: 'cancelled' })], (bookingId) => ({ bookingId }));

    expect(await firstRowStatus()).toBe('UNKNOWN');
  });

  // Nor is CONFIRMED proof that anything was collected (deposit case, OBRS-298).
  it('reports UNKNOWN for a CONFIRMED booking whose payments response carries no summary', async () => {
    setup([booking({ status: 'confirmed' })], (bookingId) => ({ bookingId }));

    expect(await firstRowStatus()).toBe('UNKNOWN');
  });

  // Controls — the two REAL sources must still win, in the same order as before.
  it('uses the booking-level overall payment status when the endpoint returns one', async () => {
    setup([booking({ status: 'cancelled' })], (bookingId) => ({
      bookingId,
      paymentSummary: { overallPaymentStatus: 'refund_processed' },
    }));

    expect(await firstRowStatus()).toBe('REFUND PROCESSED');
  });

  it('falls back to the booking payload own payment status before giving up', async () => {
    setup(
      [booking({ status: 'cancelled', payment: { status: 'refunded' } })],
      (bookingId) => ({ bookingId })
    );

    expect(await firstRowStatus()).toBe('REFUNDED');
  });

  it('prefers the booking payload own payment status over PAYMENT_LOAD_FAILED when the endpoint errors', async () => {
    setup([booking({ status: 'cancelled', payment: { status: 'refunded' } })], () => errors());

    expect(await firstRowStatus()).toBe('REFUNDED');
  });
});

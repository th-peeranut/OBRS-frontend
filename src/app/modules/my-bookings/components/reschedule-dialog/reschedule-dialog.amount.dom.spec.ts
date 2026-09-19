import { Component, EventEmitter, Input, NO_ERRORS_SCHEMA, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { RescheduleDialogComponent } from './reschedule-dialog.component';
import { ChangeStopDialogComponent } from '../change-stop-dialog/change-stop-dialog.component';
import { AuthService } from '../../../../auth/auth.service';
import { MyBookingDto } from '../../../../shared/interfaces/my-booking.interface';
import { MyBookingsState, initialMyBookingsState } from '../../store/my-bookings.model';

interface FakeRootState {
  myBookings: MyBookingsState;
}

/** Mirrors `reschedule-dialog.component.spec.ts`'s `FakeStore` — a `BehaviorSubject` so the
 * component's real NgRx selectors run against whatever state is `.next()`-ed. */
class FakeStore extends BehaviorSubject<FakeRootState> {
  readonly dispatch = jasmine.createSpy('dispatch');
}

function buildState(overrides: Partial<MyBookingsState> = {}): MyBookingsState {
  return { ...initialMyBookingsState, ...overrides };
}

function buildBooking(overrides: Partial<MyBookingDto> = {}): MyBookingDto {
  return {
    id: 5,
    bookingNumber: 'B-5',
    status: 'confirmed',
    bookingType: 'one_way',
    rescheduleCount: 0,
    stopChangeCount: 0,
    rescheduleWindowHours: 2,
    rescheduleMaxDaysAhead: 60,
    bookingSchedules: [
      {
        id: 1,
        departureDateTime: '2026-12-21T09:00:00',
        fromStop: { code: 'a' },
        toStop: { code: 'b' },
        tickets: [{ id: 11, seatNumber: '1' }],
        routeSlug: 'bkk-cnx',
      },
    ],
    ...overrides,
  };
}

/**
 * OBRS-1997 stand-ins for `app-payment-creditcard` / `app-payment-qrcode`: real components
 * with the same selector and the exact `@Input`/`@Output` surface the dialogs bind, so the
 * dialogs' `[amountOverride]` binding actually resolves against a declared input (a
 * `NO_ERRORS_SCHEMA`-only setup would silently accept ANY binding, including a typo'd one).
 */
@Component({
  selector: 'app-payment-creditcard',
  template: '',
  standalone: false,
})
class StubCreditcardComponent {
  @Input() activeTab: string | null = null;
  @Input() successRedirect: string | null = null;
  @Input() amountOverride: number | null = null;
  @Output() tabChange = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();
  @Output() paymentCompleted = new EventEmitter<void>();
}

@Component({
  selector: 'app-payment-qrcode',
  template: '',
  standalone: false,
})
class StubQrcodeComponent {
  @Input() activeTab: string | null = null;
  @Input() successRedirect: string | null = null;
  @Input() amountOverride: number | null = null;
  @Output() tabChange = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();
  @Output() paymentCompleted = new EventEmitter<void>();
}

describe('RescheduleDialogComponent - payment step amountOverride (OBRS-1997)', () => {
  let fixture: ComponentFixture<RescheduleDialogComponent>;
  let store: FakeStore;

  function render(state: MyBookingsState): void {
    store = new FakeStore({ myBookings: state });

    TestBed.configureTestingModule({
      declarations: [RescheduleDialogComponent, StubCreditcardComponent, StubQrcodeComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: store },
        { provide: AuthService, useValue: { hasAnyRole: () => false } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(RescheduleDialogComponent);
    fixture.componentInstance.bookingId = 5;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  /**
   * A distinctive netAmount (137, not one of the other fixtures' round numbers) proves the
   * value the payment step's children receive is THIS estimate, not a coincidental default.
   * Reschedule net amount is negative on the wire when it's a refund-toward direction; the
   * component's own `Math.abs` (mirrored here) is what the assertion pins.
   */
  const ESTIMATE = {
    oldFare: '100.00',
    newFare: '237.00',
    fareDiff: '137.00',
    rescheduleFee: '0.00',
    netAmount: '137.00',
    paymentDirection: 'TOP_UP' as const,
    cashRefundEligible: false,
  };

  it('binds the credit-card step to the estimate amount, not null', () => {
    render(
      buildState({
        bookings: [buildBooking()],
        rescheduleDialogBookingId: 5,
        rescheduleEstimate: ESTIMATE,
        reschedulePendingPayment: { bookingId: 5, paymentIntentId: 777 },
      })
    );

    expect(fixture.componentInstance.step).toBe('payment');
    expect(fixture.componentInstance.paymentTab).toBe('creditcard');

    const stub = fixture.debugElement.query(
      (de) => de.componentInstance instanceof StubCreditcardComponent
    ).componentInstance as StubCreditcardComponent;

    expect(stub.amountOverride).toBe(137);
  });

  it('binds the QR step to the same estimate amount', () => {
    render(
      buildState({
        bookings: [buildBooking()],
        rescheduleDialogBookingId: 5,
        rescheduleEstimate: ESTIMATE,
        reschedulePendingPayment: { bookingId: 5, paymentIntentId: 777 },
      })
    );
    fixture.componentInstance.paymentTab = 'qrcode';
    fixture.detectChanges();

    const stub = fixture.debugElement.query(
      (de) => de.componentInstance instanceof StubQrcodeComponent
    ).componentInstance as StubQrcodeComponent;

    expect(stub.amountOverride).toBe(137);
  });
});

describe('ChangeStopDialogComponent - payment step amountOverride (OBRS-1997)', () => {
  let fixture: ComponentFixture<ChangeStopDialogComponent>;
  let store: FakeStore;

  function render(state: MyBookingsState): void {
    store = new FakeStore({ myBookings: state });

    TestBed.configureTestingModule({
      declarations: [ChangeStopDialogComponent, StubCreditcardComponent, StubQrcodeComponent],
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: Store, useValue: store }],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(ChangeStopDialogComponent);
    fixture.componentInstance.bookingId = 5;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  const ESTIMATE = {
    oldFare: '100.00',
    newFare: '237.00',
    fareDiff: '137.00',
    netAmount: '137.00',
    paymentDirection: 'TOP_UP' as const,
  };

  it('binds the credit-card step to the estimate amount, not null', () => {
    render(
      buildState({
        bookings: [buildBooking()],
        changeStopDialogBookingId: 5,
        changeStopEstimate: ESTIMATE,
        changeStopPendingPayment: { bookingId: 5, paymentIntentId: 777 },
      })
    );

    expect(fixture.componentInstance.step).toBe('payment');
    expect(fixture.componentInstance.paymentTab).toBe('creditcard');

    const stub = fixture.debugElement.query(
      (de) => de.componentInstance instanceof StubCreditcardComponent
    ).componentInstance as StubCreditcardComponent;

    expect(stub.amountOverride).toBe(137);
  });

  it('binds the QR step to the same estimate amount', () => {
    render(
      buildState({
        bookings: [buildBooking()],
        changeStopDialogBookingId: 5,
        changeStopEstimate: ESTIMATE,
        changeStopPendingPayment: { bookingId: 5, paymentIntentId: 777 },
      })
    );
    fixture.componentInstance.paymentTab = 'qrcode';
    fixture.detectChanges();

    const stub = fixture.debugElement.query(
      (de) => de.componentInstance instanceof StubQrcodeComponent
    ).componentInstance as StubQrcodeComponent;

    expect(stub.amountOverride).toBe(137);
  });
});

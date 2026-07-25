import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { OverrideCancelModalComponent } from './override-cancel-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { AdminApiService, AdminBookingDetailDto } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';

// Far future → inside the cancellation window; far past → out-of-window. Using
// fixed sentinel dates keeps the window check deterministic without faking the
// clock.
function bookingWithDeparture(departure: string): AdminBookingDetailDto {
  return {
    id: 42,
    bookingNumber: '#BK-42',
    status: { code: 'confirmed', label: 'Confirmed' },
    journeys: [
      {
        fromStop: { code: 'a', label: 'A' },
        toStop: { code: 'b', label: 'B' },
        departureDateTime: departure,
      },
    ],
  };
}

const IN_WINDOW = bookingWithDeparture('2099-01-01T00:00:00Z');
const OUT_OF_WINDOW = bookingWithDeparture('2000-01-01T00:00:00Z');

describe('OverrideCancelModalComponent (OBRS-690)', () => {
  let fixture: ComponentFixture<OverrideCancelModalComponent>;
  let component: OverrideCancelModalComponent;
  let api: jasmine.SpyObj<AdminApiService>;
  let alert: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdminApiService>('AdminApiService', ['adminOverrideCancelBooking']);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error']);
    alert.success.and.resolveTo(undefined as any);
    alert.error.and.resolveTo(undefined as any);

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [OverrideCancelModalComponent, AdminModalBackdropDirective],
      providers: [
        { provide: AdminApiService, useValue: api },
        { provide: AlertService, useValue: alert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OverrideCancelModalComponent);
    component = fixture.componentInstance;
  });

  // Open the dialog the way the parent's template binding would: set inputs,
  // then let Angular's ngOnChanges reset the form + validators.
  function open(booking: AdminBookingDetailDto): void {
    component.booking = booking;
    component.isOpen = true;
    component.ngOnChanges({ isOpen: new SimpleChange(false, true, true) });
    fixture.detectChanges();
  }

  const reasonField = () =>
    fixture.debugElement.query(By.css('textarea[formControlName="reason"]'));

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('AC2: hides the reason field for an in-window POLICY cancel', () => {
    open(IN_WINDOW);
    expect((component as any).reasonRequired).toBeFalse();
    expect(reasonField()).toBeNull();
    expect((component as any).canSubmit).toBeTrue();
  });

  it('AC1: renders two rate buttons, never a numeric input', () => {
    open(IN_WINDOW);
    const rateButtons = fixture.debugElement.queryAll(By.css('.override-rate-btn'));
    expect(rateButtons.length).toBe(2);
    expect(fixture.debugElement.query(By.css('input[type="number"]'))).toBeNull();
  });

  it('AC2: choosing FULL reveals the reason field and blocks submit until it is filled', () => {
    open(IN_WINDOW);
    (component as any).selectRate('FULL');
    fixture.detectChanges();

    expect((component as any).reasonRequired).toBeTrue();
    expect(reasonField()).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();

    (component as any).form.get('reason').setValue('full refund authorised by owner');
    fixture.detectChanges();
    expect((component as any).canSubmit).toBeTrue();
  });

  it('AC2: an out-of-window POLICY cancel still requires a reason (window is a rule-break)', () => {
    open(OUT_OF_WINDOW);
    expect((component as any).rateChoice).toBe('POLICY');
    expect((component as any).outsideWindow).toBeTrue();
    expect((component as any).reasonRequired).toBeTrue();
    expect(reasonField()).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();
  });

  it('submits POLICY with no reason for an in-window cancel and emits cancelled + closed', async () => {
    api.adminOverrideCancelBooking.and.returnValue(of({ code: 200, message: 'Booking cancelled' }));
    const cancelled = jasmine.createSpy('cancelled');
    const closed = jasmine.createSpy('closed');
    component.cancelled.subscribe(cancelled);
    component.closed.subscribe(closed);

    open(IN_WINDOW);
    await (component as any).submit();

    expect(api.adminOverrideCancelBooking).toHaveBeenCalledWith(42, {
      rateChoice: 'POLICY',
      reason: undefined,
    });
    expect(cancelled).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalled();
  });

  it('submits FULL with the trimmed reason', async () => {
    api.adminOverrideCancelBooking.and.returnValue(of({ code: 200, message: 'ok' }));
    open(IN_WINDOW);
    (component as any).selectRate('FULL');
    (component as any).form.get('reason').setValue('  goodwill full refund  ');
    fixture.detectChanges();

    await (component as any).submit();

    expect(api.adminOverrideCancelBooking).toHaveBeenCalledWith(42, {
      rateChoice: 'FULL',
      reason: 'goodwill full refund',
    });
  });

  it('keeps the dialog open and shows an inline error when the API fails', async () => {
    api.adminOverrideCancelBooking.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'Booking is not confirmed' },
          })
      )
    );
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);

    open(IN_WINDOW);
    await (component as any).submit();

    expect((component as any).errorMessage).toBe('Booking is not confirmed');
    expect(closed).not.toHaveBeenCalled();
  });
});

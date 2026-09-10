import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { CounterCancelPageComponent } from './counter-cancel-page.component';
import { CounterCancelSearchFormComponent } from './counter-cancel-search-form/counter-cancel-search-form.component';
import { CounterCancelResultListComponent } from './counter-cancel-result-list/counter-cancel-result-list.component';
import { CounterCancelModalComponent } from './counter-cancel-modal/counter-cancel-modal.component';
import { AdminPaginatorComponent } from '../../../admin/components/admin-paginator/admin-paginator.component';
import { AdminModalBackdropDirective } from '../../../../shared/directives/admin-modal-backdrop.directive';
import { PendingButtonDirective } from '../../../../shared/directives/pending-button.directive';
import { AppRefundDestinationFieldsComponent } from '../../../../shared/components/refund-destination-fields/refund-destination-fields.component';
import { StaffApiService, CounterBookingSearchResultDto } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AuthService } from '../../../../auth/auth.service';
import { errorCodeFromMessageKey } from '../../../../shared/lib/api-error-code';
import { TitleLabelPipe } from '../../../../shared/pipes/title-label.pipe';

// OBRS-766 (QA-caught): the wire `errorCode` is derived from its dotted
// messageKey — see `api-error-code.ts`'s `errorCodeFromMessageKey` doc
// comment. The mocked HttpErrorResponse below must carry the DERIVED wire
// form, not the messageKey.
const CRITERIA_REQUIRED_CODE = errorCodeFromMessageKey('booking.search.error.criteria-required');

function resultRow(overrides: Partial<CounterBookingSearchResultDto> = {}): CounterBookingSearchResultDto {
  return {
    bookingId: 7,
    bookingNumber: 'B-000007',
    contactTitle: null,
    contactName: 'Somchai Jaidee',
    contactPhoneMasked: '••••1234',
    status: 'confirmed',
    netAmount: 300,
    journeys: [],
    ...overrides,
  };
}

describe('CounterCancelPageComponent (OBRS-766)', () => {
  let fixture: ComponentFixture<CounterCancelPageComponent>;
  let component: CounterCancelPageComponent;
  let api: jasmine.SpyObj<StaffApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<StaffApiService>('StaffApiService', [
      'searchBookings',
      'getCancelPolicy',
      'cancelCounterBooking',
    ]);
    // Selecting a row opens CounterCancelModalComponent optimistically, which
    // immediately fetches the policy in its own ngOnChanges — give every test
    // in this file a safe default so only the tests that care about the
    // policy response need to override it.
    api.getCancelPolicy.and.returnValue(
      of({
        code: 200,
        message: 'ok',
        data: {
          originalAmount: 0,
          refundAmount: 0,
          penaltyAmount: 0,
          refundRatePercent: '0%',
          refundMethod: 'card',
          policyWindow: '0h',
        },
      })
    );
    const alert = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error']);
    alert.success.and.resolveTo(undefined as any);
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getUsername']);
    auth.getUsername.and.returnValue('salesperson@obrs.test');

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot(), TitleLabelPipe],
      declarations: [
        CounterCancelPageComponent,
        CounterCancelSearchFormComponent,
        CounterCancelResultListComponent,
        CounterCancelModalComponent,
        AdminPaginatorComponent,
        AdminModalBackdropDirective,
        AppRefundDestinationFieldsComponent,
        PendingButtonDirective,
      ],
      providers: [
        { provide: StaffApiService, useValue: api },
        { provide: AlertService, useValue: alert },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CounterCancelPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders no in-body title (design-system §7 — the shell topbar owns it)', () => {
    expect(fixture.debugElement.query(By.css('h1, h2, h3'))).toBeNull();
  });

  it('does not show the result list before a search has run', () => {
    expect(fixture.debugElement.query(By.css('app-counter-cancel-result-list'))).toBeNull();
  });

  it('searches on the phone mode and renders results', () => {
    api.searchBookings.and.returnValue(
      of({
        code: 200,
        message: 'ok',
        data: { content: [resultRow()], totalElements: 1, totalPages: 1, size: 20, number: 0, numberOfElements: 1 },
      })
    );

    (component as any).onSearch({ mode: 'phone', value: '0812345678' });
    fixture.detectChanges();

    expect(api.searchBookings).toHaveBeenCalledWith({ page: 0, size: 20, phone: '0812345678' });
    expect(fixture.debugElement.query(By.css('app-counter-cancel-result-list'))).not.toBeNull();
    expect((component as any).results.length).toBe(1);
  });

  it('searches on the bookingNumber mode with the right param', () => {
    api.searchBookings.and.returnValue(
      of({
        code: 200,
        message: 'ok',
        data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0, numberOfElements: 0 },
      })
    );

    (component as any).onSearch({ mode: 'bookingNumber', value: 'B-000007' });

    expect(api.searchBookings).toHaveBeenCalledWith({ page: 0, size: 20, bookingNumber: 'B-000007' });
  });

  it('an empty page renders the honest empty state (search ran, no results)', () => {
    api.searchBookings.and.returnValue(
      of({
        code: 200,
        message: 'ok',
        data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0, numberOfElements: 0 },
      })
    );

    (component as any).onSearch({ mode: 'phone', value: '0000000000' });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ccrl-empty'))).not.toBeNull();
  });

  it('BOOKING_SEARCH_ERROR_CRITERIA_REQUIRED shows the search banner', () => {
    api.searchBookings.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errorCode: CRITERIA_REQUIRED_CODE },
          })
      )
    );

    (component as any).onSearch({ mode: 'phone', value: '0812345678' });
    fixture.detectChanges();

    expect((component as any).searchErrorMessage).toBe('STAFF.CANCEL_BOOKING.SEARCH.CRITERIA_REQUIRED');
    expect(fixture.debugElement.query(By.css('.ccp-search-error'))).not.toBeNull();
  });

  it('any other search failure shows the generic load-failed message', () => {
    api.searchBookings.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    (component as any).onSearch({ mode: 'phone', value: '0812345678' });

    expect((component as any).searchErrorMessage).toBe('STAFF.CANCEL_BOOKING.SEARCH.LOAD_FAILED');
  });

  it('page change re-fetches at the requested (0-based) page', () => {
    api.searchBookings.and.returnValue(
      of({
        code: 200,
        message: 'ok',
        data: { content: [resultRow()], totalElements: 25, totalPages: 2, size: 20, number: 0, numberOfElements: 20 },
      })
    );
    (component as any).onSearch({ mode: 'phone', value: '0812345678' });
    api.searchBookings.calls.reset();

    (component as any).onPageChange(2);

    expect(api.searchBookings).toHaveBeenCalledWith({ page: 1, size: 20, phone: '0812345678' });
  });

  it('selecting a booking opens the modal optimistically with the row already in hand', () => {
    const row = resultRow();
    (component as any).onSelectBooking(row);
    fixture.detectChanges();

    expect((component as any).isModalOpen).toBeTrue();
    expect((component as any).selectedBooking).toBe(row);
  });

  it('a successful cancel closes the modal and re-runs the search', () => {
    api.searchBookings.and.returnValue(
      of({
        code: 200,
        message: 'ok',
        data: { content: [resultRow()], totalElements: 1, totalPages: 1, size: 20, number: 0, numberOfElements: 1 },
      })
    );
    (component as any).onSearch({ mode: 'phone', value: '0812345678' });
    api.searchBookings.calls.reset();

    (component as any).onSelectBooking(resultRow());
    (component as any).onModalCancelled();

    expect((component as any).isModalOpen).toBeFalse();
    expect(api.searchBookings).toHaveBeenCalled();
  });
});

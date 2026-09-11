import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { BookingsPageComponent } from './bookings/bookings-page.component';
import { BookingsStore } from './bookings/bookings.store';
import { LookupSettingsPageComponent } from './lookup-settings/lookup-settings-page.component';
import { LookupsStore } from './lookup-settings/lookups.store';
import { AdminApiService } from '../../../services/admin/admin-api.service';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../../shared/services/alert.service';
import { PhoneFormatPipe } from '../../../shared/pipes/phone-format.pipe';
import { TitleLabelPipe } from '../../../shared/pipes/title-label.pipe';

// OBRS-1825. `@for (x of src; track x)` over a source that ALLOCATES on every
// read tracks by object identity, so every change-detection cycle hands the
// repeater objects it has never seen: it destroys the whole list and builds it
// again. Nothing about that is visible in a screenshot, in the rendered text,
// or in a spec that asserts on textContent — the second list says exactly what
// the first one said. The only observable difference is the IDENTITY of the DOM
// nodes, which is what these two specs read.
//
// The negative control is the assertion itself: run these against `track event`
// / `track group` and they go red on the first list item.

function makeStoreStub(data: unknown) {
  const data$ = new BehaviorSubject<unknown>(data);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    errorStatus$: new BehaviorSubject<number | null>(null),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
    get errorStatus() {
      return null;
    },
  };
}

/** The nativeElements of a list, in order, for identity comparison. */
function nodesOf(fixture: ComponentFixture<unknown>, selector: string): HTMLElement[] {
  return fixture.debugElement.queryAll(By.css(selector)).map((de) => de.nativeElement as HTMLElement);
}

describe('@for track keys survive a change-detection cycle (OBRS-1825)', () => {
  describe('booking detail timeline', () => {
    let fixture: ComponentFixture<BookingsPageComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [CommonModule, TranslateModule.forRoot(), PhoneFormatPipe, TitleLabelPipe],
        declarations: [BookingsPageComponent],
        providers: [
          { provide: BookingsStore, useValue: makeStoreStub({ rows: [], statusOptions: [] }) },
          {
            provide: AdminApiService,
            useValue: jasmine.createSpyObj('AdminApiService', [
              'getBookingById',
              'getBookingPayments',
              'adminOverrideCancelBooking',
            ]),
          },
          { provide: AuthService, useValue: { hasAnyRole: () => true, getRoles: () => ['admin'] } },
        ],
        schemas: [NO_ERRORS_SCHEMA],
      }).compileComponents();

      fixture = TestBed.createComponent(BookingsPageComponent);
      fixture.detectChanges();

      // Open the detail modal on a booking whose timeline has every kind of
      // entry: created, two payments (same labelKey, so a labelKey-based track
      // would be a duplicate key), expires, and the pinned current status.
      const component = fixture.componentInstance as unknown as Record<string, unknown>;
      component['selectedBookingId'] = 1;
      component['detailBooking'] = {
        id: 1,
        bookingNumber: 'BK-000001',
        status: 'CONFIRMED',
        createdAt: '2026-09-01T08:00:00+07:00',
        expiredAt: '2026-09-01T09:00:00+07:00',
        journeys: [],
      };
      component['paymentTransactions'] = [
        { transactionId: 'tx-1', paymentMethod: 'cash', paidAt: '2026-09-01T08:10:00+07:00' },
        { transactionId: 'tx-2', paymentMethod: 'cash', paidAt: '2026-09-01T08:20:00+07:00' },
      ];
      fixture.detectChanges();
    });

    it('keeps the same <li> nodes when nothing changed', () => {
      const before = nodesOf(fixture, '.bk-timeline > li');
      expect(before.length).toBe(5); // created + 2 payments + expires + current status

      fixture.detectChanges(); // a second cycle, with no input touched

      const after = nodesOf(fixture, '.bk-timeline > li');
      expect(after.length).toBe(before.length);
      after.forEach((node, i) => expect(node).toBe(before[i], `timeline <li> #${i} was rebuilt`));
    });
  });

  describe('lookup settings category groups', () => {
    let fixture: ComponentFixture<LookupSettingsPageComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
        declarations: [LookupSettingsPageComponent],
        providers: [
          { provide: LookupsStore, useValue: makeStoreStub([]) },
          { provide: AdminApiService, useValue: jasmine.createSpyObj('AdminApiService', ['getLookups']) },
          { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['success', 'error', 'warning']) },
          { provide: AuthService, useValue: { hasAnyRole: () => true, getRoles: () => ['admin'] } },
        ],
        schemas: [NO_ERRORS_SCHEMA],
      }).compileComponents();

      fixture = TestBed.createComponent(LookupSettingsPageComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance as unknown as Record<string, unknown>;
      component['entries'] = [
        { id: 1, category: 'booking_status', slug: 'paid', enLabel: 'Paid', enDescription: '-', thLabel: 'จ่ายแล้ว', thDescription: '-' },
        { id: 2, category: 'role_status', slug: 'active', enLabel: 'Active', enDescription: '-', thLabel: 'ใช้งาน', thDescription: '-' },
      ];
      fixture.detectChanges();
    });

    it('keeps the same group rows when nothing changed', () => {
      const before = nodesOf(fixture, 'tr.admin-group-row');
      expect(before.length).toBe(2);

      fixture.detectChanges(); // a second cycle, with no input touched

      const after = nodesOf(fixture, 'tr.admin-group-row');
      expect(after.length).toBe(before.length);
      after.forEach((node, i) => expect(node).toBe(before[i], `group row #${i} was rebuilt`));
    });
  });
});

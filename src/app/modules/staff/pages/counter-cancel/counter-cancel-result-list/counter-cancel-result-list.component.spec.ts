import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { CounterCancelResultListComponent } from './counter-cancel-result-list.component';
import { CounterBookingSearchResultDto } from '../../../../../services/staff/staff-api.service';
import { AdminPaginatorComponent } from '../../../../admin/components/admin-paginator/admin-paginator.component';

function row(overrides: Partial<CounterBookingSearchResultDto> = {}): CounterBookingSearchResultDto {
  return {
    bookingId: 1,
    bookingNumber: 'B-000123',
    contactName: 'Somchai Jaidee',
    contactPhoneMasked: '••••5678',
    status: 'confirmed',
    netAmount: 450,
    journeys: [
      {
        fromStop: { code: 'a', display: { en: { label: 'A' } } },
        toStop: { code: 'b', display: { en: { label: 'B' } } },
        departureDateTime: '2099-01-01T08:00:00Z',
      },
    ],
    ...overrides,
  };
}

describe('CounterCancelResultListComponent (OBRS-766)', () => {
  let fixture: ComponentFixture<CounterCancelResultListComponent>;
  let component: CounterCancelResultListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [CounterCancelResultListComponent, AdminPaginatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CounterCancelResultListComponent);
    component = fixture.componentInstance;
    const translate = TestBed.inject(TranslateService);
    translate.currentLang = 'en';
  });

  // FE-4: assert the RENDERED DOM cell, not merely a bound field — a
  // *ngIf-false element still counts as "covered" otherwise (FRONTEND-GOTCHAS).
  it('FE-4: renders contactPhoneMasked verbatim in the DOM, never re-masked', () => {
    component.results = [row({ contactPhoneMasked: '••••5678' })];
    component.hasSearched = true;
    fixture.detectChanges();

    const cell = fixture.debugElement.query(By.css('.ccrl-phone'));
    expect(cell).not.toBeNull();
    expect(cell.nativeElement.textContent.trim()).toBe('••••5678');
  });

  it('shows the Cancel action only for a confirmed booking', () => {
    component.results = [row({ status: 'confirmed' })];
    component.hasSearched = true;
    fixture.detectChanges();

    const actionButtons = fixture.debugElement.queryAll(By.css('.admin-btn.admin-btn-small'));
    expect(actionButtons.length).toBe(1);
    expect(fixture.debugElement.query(By.css('.admin-status.is-neutral'))).toBeNull();
  });

  it('shows the NOT_CANCELLABLE badge instead of the action for a non-confirmed booking', () => {
    component.results = [row({ status: 'cancelled' })];
    component.hasSearched = true;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-btn.admin-btn-small'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.admin-status.is-neutral'))).not.toBeNull();
  });

  it('emits selectBooking with the row when Cancel is clicked', () => {
    const selectBooking = jasmine.createSpy('selectBooking');
    component.selectBooking.subscribe(selectBooking);
    const theRow = row();
    component.results = [theRow];
    component.hasSearched = true;
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.admin-btn.admin-btn-small')).nativeElement.click();

    expect(selectBooking).toHaveBeenCalledWith(theRow);
  });

  it('shows the honest empty state only after a search has actually run', () => {
    component.results = [];
    component.hasSearched = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.ccrl-empty'))).toBeNull();

    component.hasSearched = true;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.ccrl-empty'))).not.toBeNull();
  });

  it('emits pageChange from the paginator', () => {
    const pageChange = jasmine.createSpy('pageChange');
    component.pageChange.subscribe(pageChange);
    component.page = 1;
    component.totalPages = 3;
    fixture.detectChanges();

    fixture.debugElement.query(By.css('app-admin-paginator')).triggerEventHandler('pageChange', 2);

    expect(pageChange).toHaveBeenCalledWith(2);
  });
});

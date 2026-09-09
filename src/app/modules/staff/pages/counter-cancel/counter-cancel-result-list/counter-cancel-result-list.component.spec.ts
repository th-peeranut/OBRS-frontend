import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { CounterCancelResultListComponent } from './counter-cancel-result-list.component';
import { CounterBookingSearchResultDto } from '../../../../../services/staff/staff-api.service';
import { AdminPaginatorComponent } from '../../../../admin/components/admin-paginator/admin-paginator.component';
import { TitleLabelPipe } from '../../../../../shared/pipes/title-label.pipe';

function row(overrides: Partial<CounterBookingSearchResultDto> = {}): CounterBookingSearchResultDto {
  return {
    bookingId: 1,
    bookingNumber: 'B-000123',
    contactTitle: 'MR',
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
      imports: [CommonModule, TranslateModule.forRoot(), TitleLabelPipe],
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

  /**
   * OBRS-1601. Two things at once, on purpose:
   *
   * <p>The honorific reaches the DOM at all — the wiring (`row.contactTitle` + the pipe in this
   * module) is the part that breaks silently, since a missing field renders as an empty prefix and
   * every other assertion in this file stays green.
   *
   * <p>And it MOVES when the reader switches language with no refetch. That is the whole reason the
   * code crosses the wire instead of a word, and the reason `titleLabel` is impure — a pure pipe, or
   * a string composed in the store/getter, would leave `Mr.` on screen after the switch.
   */
  it('OBRS-1601: renders the contact honorific in the active language and re-renders on a switch', () => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { COMMON: { TITLES: { MR: 'Mr.' } } }, true);
    translate.setTranslation('th', { COMMON: { TITLES: { MR: 'นาย' } } }, true);
    translate.currentLang = 'en';

    component.results = [row({ contactTitle: 'MR', contactName: 'Somchai Jaidee' })];
    component.hasSearched = true;
    fixture.detectChanges();

    const nameCell = () =>
      fixture.debugElement.queryAll(By.css('.ccrl-row td'))[1].nativeElement.textContent.trim();
    expect(nameCell()).toBe('Mr. Somchai Jaidee');

    translate.use('th');
    fixture.detectChanges();
    expect(nameCell()).toBe('นาย Somchai Jaidee');
  });

  it('OBRS-1601: a contact with no title renders the bare name - no prefix, no leading space', () => {
    component.results = [row({ contactTitle: null, contactName: 'Somchai Jaidee' })];
    component.hasSearched = true;
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css('.ccrl-row td'))[1].nativeElement.textContent.trim(),
    ).toBe('Somchai Jaidee');
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

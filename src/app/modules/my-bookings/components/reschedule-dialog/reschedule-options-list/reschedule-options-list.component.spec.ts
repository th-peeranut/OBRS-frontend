import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { RescheduleOptionsListComponent } from './reschedule-options-list.component';
import { RescheduleOption } from '../../../../../shared/interfaces/reschedule.interface';
// OBRS-1141: the option card now hosts the shared delay disclosure.
import { ScheduleDelayNoticeComponent } from '../../../../../shared/components/schedule-delay-notice/schedule-delay-notice.component';

describe('RescheduleOptionsListComponent', () => {
  let fixture: ComponentFixture<RescheduleOptionsListComponent>;
  let component: RescheduleOptionsListComponent;

  const sampleOption: RescheduleOption = {
    scheduleId: 101,
    vehicleTypeName: 'Van',
    departureDateTime: '2026-12-21T09:00:00',
    arrivalDateTime: '2026-12-21T11:00:00',
    pricePerSeat: '220.00',
    availableSeats: 5,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RescheduleOptionsListComponent, ScheduleDelayNoticeComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(RescheduleOptionsListComponent);
    component = fixture.componentInstance;
  });

  function textOf(selector: string): string {
    const el = fixture.debugElement.query(By.css(selector));
    return el ? (el.nativeElement.textContent || '').trim() : '';
  }

  it('shows the loading state distinct from the empty/error states', () => {
    component.loading = true;
    component.options = [];
    fixture.detectChanges();

    expect(textOf('.reschedule-options-list__state')).toBe('MY_BOOKINGS.RESCHEDULE.OPTIONS_LOADING');
    expect(fixture.debugElement.query(By.css('.reschedule-option-card'))).toBeNull();
  });

  it('shows a dedicated empty state for a 200 response with zero options — not an error', () => {
    component.loading = false;
    component.error = null;
    component.options = [];
    fixture.detectChanges();

    expect(textOf('.reschedule-options-list__state')).toBe('MY_BOOKINGS.RESCHEDULE.OPTIONS_EMPTY');
  });

  it('shows the error state (not the empty state) when the load failed', () => {
    component.loading = false;
    component.error = 'MY_BOOKINGS.RESCHEDULE.OPTIONS_ERROR';
    component.options = [];
    fixture.detectChanges();

    expect(textOf('.reschedule-options-list__state')).toBe('MY_BOOKINGS.RESCHEDULE.OPTIONS_ERROR');
  });

  it('renders a selectable card per option and emits `select` on click', () => {
    component.loading = false;
    component.error = null;
    component.options = [sampleOption];
    fixture.detectChanges();

    const selectSpy = jasmine.createSpy('select');
    component.select.subscribe(selectSpy);

    fixture.debugElement.query(By.css('.reschedule-option-card')).nativeElement.click();

    expect(selectSpy).toHaveBeenCalledWith(sampleOption);
  });

  it('shows a confirm-time error banner ALONGSIDE the (still-valid) options list — never in place of it', () => {
    component.loading = false;
    component.error = null;
    component.options = [sampleOption];
    component.confirmError = 'MY_BOOKINGS.RESCHEDULE.ERROR.NO_SEATS';
    fixture.detectChanges();

    expect(textOf('.reschedule-options-list__confirm-error')).toBe(
      'MY_BOOKINGS.RESCHEDULE.ERROR.NO_SEATS'
    );
    // The list itself must still render — a confirm-time failure bounces the
    // traveler back to pick a different candidate, it doesn't invalidate the
    // whole list the way a load `error` does.
    expect(fixture.debugElement.query(By.css('.reschedule-option-card'))).not.toBeNull();
  });

  it('renders no confirm-error banner when confirmError is null', () => {
    component.loading = false;
    component.error = null;
    component.options = [sampleOption];
    component.confirmError = null;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.reschedule-options-list__confirm-error'))).toBeNull();
  });
});

// OBRS-1141 AC3. `getRescheduleOptions` runs the SAME
// `searchSchedulesWithAvailability` query as customer search, so its candidate
// rows can carry an announced delay — and this is the surface where silence
// costs most: OBRS-666 lets a 45-minute delay unlock a free reschedule, and a
// passenger taking it must not be moved onto another delayed round unknowingly.
describe('RescheduleOptionsListComponent (announced-delay disclosure, OBRS-1141)', () => {
  let fixture: ComponentFixture<RescheduleOptionsListComponent>;
  let component: RescheduleOptionsListComponent;

  const onTime: RescheduleOption = {
    scheduleId: 201,
    vehicleTypeName: 'Van',
    departureDateTime: '2026-12-21T09:00:00+07:00',
    arrivalDateTime: '2026-12-21T11:00:00+07:00',
    pricePerSeat: '220.00',
    availableSeats: 5,
  };

  const delayed: RescheduleOption = {
    ...onTime,
    scheduleId: 202,
    departureDateTime: '2026-12-21T11:00:00+07:00',
    arrivalDateTime: '2026-12-21T13:00:00+07:00',
    scheduledDepartureDateTime: '2026-12-21T09:00:00+07:00',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RescheduleOptionsListComponent, ScheduleDelayNoticeComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(RescheduleOptionsListComponent);
    component = fixture.componentInstance;
  });

  function render(options: RescheduleOption[]): void {
    component.loading = false;
    component.error = null;
    component.options = options;
    fixture.detectChanges();
  }

  it('AC2 — an on-time candidate renders no delay markup, so the card keeps its 2x2 grid', () => {
    render([onTime]);

    const card = fixture.debugElement.query(By.css('.reschedule-option-card'));
    expect(card.queryAll(By.css('[data-testid="schedule-delay-notice"]')).length).toBe(0);
    // The host element itself must be `:empty` — that is what
    // `:host(:empty) { display: none }` keys off to stop it costing a grid gap.
    const host = card.query(By.css('app-schedule-delay-notice'));
    expect(host.nativeElement.children.length).toBe(0);
  });

  it('AC1 — a delayed candidate discloses the badge and the time it was planned for', () => {
    render([delayed]);

    const card = fixture.debugElement.query(By.css('.reschedule-option-card'));
    const text = (card.nativeElement.textContent || '').replace(/\s+/g, ' ').trim();
    expect(text).toContain('11:00');
    expect(text).toContain('SCHEDULE_DELAY_NOTICE.BADGE');
    expect(text).toContain('SCHEDULE_DELAY_NOTICE.PLANNED');
  });

  it('discloses per row — one delayed candidate does not mark its on-time neighbours', () => {
    render([onTime, delayed, onTime]);

    const cards = fixture.debugElement.queryAll(By.css('.reschedule-option-card'));
    const flagged = cards.map(
      (c) => c.queryAll(By.css('[data-testid="schedule-delay-notice"]')).length
    );
    expect(flagged).toEqual([0, 1, 0]);
  });
});

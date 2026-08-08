import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { ScheduleDelayNoticeComponent } from './schedule-delay-notice.component';

describe('ScheduleDelayNoticeComponent (OBRS-1141)', () => {
  let fixture: ComponentFixture<ScheduleDelayNoticeComponent>;
  let component: ScheduleDelayNoticeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleDelayNoticeComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleDelayNoticeComponent);
    component = fixture.componentInstance;
  });

  function render(departure: string, scheduled: string | null): void {
    component.departureDateTime = departure;
    component.scheduledDepartureDateTime = scheduled;
    component.ngOnChanges();
    fixture.detectChanges();
  }

  it('renders NOTHING for a round with no announced delay — the host stays empty (AC2)', () => {
    render('2026-08-08T07:00:00', null);

    expect(fixture.debugElement.query(By.css('[data-testid="schedule-delay-notice"]'))).toBeNull();
    // `:host(:empty) { display: none }` is what keeps this from costing a flex/grid
    // `gap` in the parent row, and `:empty` ignores the comment an inactive
    // `@if` leaves behind — so assert there is no ELEMENT child, not that the
    // innerHTML is the empty string.
    expect(fixture.nativeElement.children.length).toBe(0);
  });

  it('shows a delayed badge and the planned time when the round is delayed (AC1)', () => {
    render('2026-08-08T09:00:00', '2026-08-08T07:00:00');

    const notice = fixture.debugElement.query(By.css('[data-testid="schedule-delay-notice"]'));
    expect(notice).not.toBeNull();
    expect(notice.nativeElement.textContent).toContain('SCHEDULE_DELAY_NOTICE.BADGE');

    const planned = fixture.debugElement.query(By.css('[data-testid="schedule-delay-planned"]'));
    expect(planned.nativeElement.textContent).toContain('SCHEDULE_DELAY_NOTICE.PLANNED');
  });

  it('routes every string through i18n — nothing user-visible is hardcoded (AC1)', () => {
    render('2026-08-09T00:30:00', '2026-08-08T23:30:00');

    const notice = fixture.debugElement.query(By.css('[data-testid="schedule-delay-notice"]'));
    // With TranslateModule.forRoot() and no loaded dictionary, every resolved
    // string is its own KEY. Any literal copy would therefore show up here as
    // text that is not a SCHEDULE_DELAY_NOTICE.* key.
    const text: string = notice.nativeElement.textContent.replace(/\s+/g, ' ').trim();
    const leftovers = text
      .split(' ')
      .filter((token) => token && !token.startsWith('SCHEDULE_DELAY_NOTICE.'));
    expect(leftovers).toEqual([]);
  });

  it('adds the departure DATE only when the delay crosses midnight (AC5)', () => {
    render('2026-08-09T00:30:00', '2026-08-08T23:30:00');
    expect(
      fixture.debugElement.query(By.css('[data-testid="schedule-delay-date"]'))
    ).not.toBeNull();

    render('2026-08-08T09:00:00', '2026-08-08T07:00:00');
    expect(fixture.debugElement.query(By.css('[data-testid="schedule-delay-date"]'))).toBeNull();
  });

  it('carries an aria-label naming both times, so the badge is not the only cue', () => {
    render('2026-08-08T09:00:00', '2026-08-08T07:00:00');

    const notice = fixture.debugElement.query(By.css('[data-testid="schedule-delay-notice"]'));
    expect(notice.nativeElement.getAttribute('aria-label')).toContain(
      'SCHEDULE_DELAY_NOTICE.A11Y'
    );
  });

  it('renders nothing when the planned time is not before the effective one', () => {
    render('2026-08-08T07:00:00', '2026-08-08T07:00:00');
    expect(fixture.nativeElement.children.length).toBe(0);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { ArrivalDateNoticeComponent } from './arrival-date-notice.component';

describe('ArrivalDateNoticeComponent (OBRS-861)', () => {
  let fixture: ComponentFixture<ArrivalDateNoticeComponent>;
  let component: ArrivalDateNoticeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ArrivalDateNoticeComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(ArrivalDateNoticeComponent);
    component = fixture.componentInstance;
  });

  function render(departure: string | null, arrival: string | null): void {
    component.departureDateTime = departure;
    component.arrivalDateTime = arrival;
    component.ngOnChanges();
    fixture.detectChanges();
  }

  it('renders NOTHING for a trip that arrives the same day — the host stays empty (AC4)', () => {
    render('2026-08-23T08:00:00+07:00', '2026-08-23T18:30:00+07:00');

    expect(fixture.debugElement.query(By.css('[data-testid="arrival-date-notice"]'))).toBeNull();
    // `:host(:empty) { display: none }` is what keeps this from costing a flex
    // `gap` in the parent row, and `:empty` ignores the comment an inactive `@if`
    // leaves behind — so assert there is no ELEMENT child, not empty innerHTML.
    expect(fixture.nativeElement.children.length).toBe(0);
  });

  it('shows the arrival date for an overnight trip (AC1)', () => {
    render('2026-08-23T18:00:00+07:00', '2026-08-24T05:30:00+07:00');

    const notice = fixture.debugElement.query(By.css('[data-testid="arrival-date-notice"]'));
    expect(notice).not.toBeNull();
    expect(notice.nativeElement.textContent).toContain('ARRIVAL_DATE_NOTICE.ARRIVES_ON');
  });

  it('drops the notice again when inputs change back to a same-day trip', () => {
    render('2026-08-23T18:00:00+07:00', '2026-08-24T05:30:00+07:00');
    expect(component.arrivalDate).toBe('24/08/2026');

    render('2026-08-23T08:00:00+07:00', '2026-08-23T18:30:00+07:00');
    expect(component.arrivalDate).toBeNull();
    expect(fixture.debugElement.query(By.css('[data-testid="arrival-date-notice"]'))).toBeNull();
  });
});

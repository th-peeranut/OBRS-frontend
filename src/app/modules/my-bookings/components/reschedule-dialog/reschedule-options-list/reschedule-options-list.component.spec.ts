import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { RescheduleOptionsListComponent } from './reschedule-options-list.component';
import { RescheduleOption } from '../../../../../shared/interfaces/reschedule.interface';

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
      declarations: [RescheduleOptionsListComponent],
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

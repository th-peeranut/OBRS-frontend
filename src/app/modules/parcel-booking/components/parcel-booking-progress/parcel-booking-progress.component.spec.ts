import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ParcelBookingProgressComponent } from './parcel-booking-progress.component';

describe('ParcelBookingProgressComponent', () => {
  let component: ParcelBookingProgressComponent;
  let fixture: ComponentFixture<ParcelBookingProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [ParcelBookingProgressComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ParcelBookingProgressComponent);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('marks the step at currentIndex as active and earlier steps as done', () => {
    component.steps = [
      { labelKey: 'PARCEL_BOOKING.STEP.TRIP' },
      { labelKey: 'PARCEL_BOOKING.STEP.DETAILS' },
      { labelKey: 'PARCEL_BOOKING.STEP.PAYMENT' },
    ];
    component.currentIndex = 1;
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.parcel-booking-progress__step');
    expect(items.length).toBe(3);
    expect(items[0].classList.contains('is-done')).toBeTrue();
    expect(items[1].classList.contains('is-active')).toBeTrue();
    expect(items[2].classList.contains('is-active')).toBeFalse();
    expect(items[2].classList.contains('is-done')).toBeFalse();
  });
});

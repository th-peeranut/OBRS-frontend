import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TripDetailsViewComponent } from './trip-details-view.component';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { WalkInTripDto } from '../../../../../services/staff/staff-api.service';

describe('TripDetailsViewComponent', () => {
  let component: TripDetailsViewComponent;
  let fixture: ComponentFixture<TripDetailsViewComponent>;

  const mockTrip: WalkInTripDto = {
    scheduleId: 1,
    vehicleType: 'van',
    licensePlate: 'ABC-123',
    driverName: 'John Doe',
    departureDateTime: '2026-06-25T08:00:00+07:00',
    arrivalDateTime: '2026-06-25T12:00:00+07:00',
    pricePerSeat: '250',
    capacity: 13,
    availableCount: 10,
    reservedUnpaidCount: 1,
    soldPaidCount: 2,
    availableSeatNumbers: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TripDetailsViewComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      providers: [CurrencyPipe],
    }).compileComponents();

    fixture = TestBed.createComponent(TripDetailsViewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render nothing when trip is null', () => {
    component.trip = null;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('dl')).toBeNull();
  });

  it('should display trip data when trip is provided', () => {
    component.trip = mockTrip;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('dl')).toBeTruthy();
    expect(el.textContent).toContain('ABC-123');
    expect(el.textContent).toContain('John Doe');
  });
});

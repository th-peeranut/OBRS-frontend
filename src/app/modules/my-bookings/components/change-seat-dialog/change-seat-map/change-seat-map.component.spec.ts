import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import { ChangeSeatMapComponent } from './change-seat-map.component';

describe('ChangeSeatMapComponent', () => {
  let component: ChangeSeatMapComponent;
  let fixture: ComponentFixture<ChangeSeatMapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ChangeSeatMapComponent],
      imports: [TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ChangeSeatMapComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the bus seat map for a non-van vehicleType', () => {
    component.vehicleType = 'bus';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-passenger-seat-bus'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('app-passenger-seat-van'))).toBeNull();
  });

  it('renders the van seat map for vehicleType "van"', () => {
    component.vehicleType = 'van';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-passenger-seat-van'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('app-passenger-seat-bus'))).toBeNull();
  });

  it('also treats "minibus" as a van layout', () => {
    component.vehicleType = 'minibus';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-passenger-seat-van'))).not.toBeNull();
  });

  it('builds a seatGenders map with the picked seat marked SELECTED', () => {
    component.pickedSeat = 'B4';
    expect(component.seatGenders).toEqual({ B4: 'SELECTED' });
  });

  it('returns an empty (non-null) seatGenders map when nothing is picked yet — multi-select mode stays active', () => {
    component.pickedSeat = '';
    expect(component.seatGenders).toEqual({});
  });

  it('re-emits a clicked seat as seatPicked', () => {
    const spy = jasmine.createSpy('seatPicked');
    component.seatPicked.subscribe(spy);

    component.onSeatClicked('B7');

    expect(spy).toHaveBeenCalledWith('B7');
  });

  it('renders the legend with available/occupied/selected/current entries', () => {
    fixture.detectChanges();

    const legendItems = fixture.debugElement.queryAll(By.css('.change-seat-map__legend li'));
    expect(legendItems.length).toBe(4);
  });

  describe('originalSeats (OBRS-170: distinct marker for the traveler\'s original seat)', () => {
    it('defaults to null and does not mark any seat ORIGINAL when unset — booking/walk-in flows are unaffected', () => {
      component.pickedSeat = 'B4';
      expect(component.originalSeats).toBeNull();
      expect(component.seatGenders).toEqual({ B4: 'SELECTED' });
    });

    it('marks a seat ORIGINAL when it differs from the currently picked seat', () => {
      component.originalSeats = ['B1'];
      component.pickedSeat = 'B4';

      expect(component.seatGenders).toEqual({ B1: 'ORIGINAL', B4: 'SELECTED' });
    });

    it('keeps the SELECTED marker (not ORIGINAL) when the original seat is still the picked one', () => {
      component.originalSeats = ['B1'];
      component.pickedSeat = 'B1';

      expect(component.seatGenders).toEqual({ B1: 'SELECTED' });
    });

    it('still marks ORIGINAL even when nothing is picked yet', () => {
      component.originalSeats = ['B1'];
      component.pickedSeat = '';

      expect(component.seatGenders).toEqual({ B1: 'ORIGINAL' });
    });

    it('ignores empty-string entries in originalSeats', () => {
      component.originalSeats = [''];
      component.pickedSeat = 'B4';

      expect(component.seatGenders).toEqual({ B4: 'SELECTED' });
    });

    it('does NOT mark the original seat when another ticket has taken it (multi-passenger) — it renders occupied, not a misleading ORIGINAL', () => {
      // Active ticket moved off B1 (picked B5); another ticket now holds B1,
      // so B1 arrives in takenSeats. B1 must not carry the ORIGINAL marker.
      component.originalSeats = ['B1'];
      component.pickedSeat = 'B5';
      component.takenSeats = ['B1'];

      expect(component.seatGenders).toEqual({ B5: 'SELECTED' });
    });
  });
});

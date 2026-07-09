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

  it('renders the legend with available/occupied/selected entries', () => {
    fixture.detectChanges();

    const legendItems = fixture.debugElement.queryAll(By.css('.change-seat-map__legend li'));
    expect(legendItems.length).toBe(3);
  });
});

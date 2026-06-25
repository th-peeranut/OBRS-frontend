import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { TripDetailsEditFormComponent } from './trip-details-edit-form.component';
import { AdminDropdownComponent } from '../../../../../modules/admin/components/admin-dropdown/admin-dropdown.component';
import { AdminVehicleDto, AdminVehicleTypeDto } from '../../../../../services/admin/admin-api.service';
import { CalendarModule } from 'primeng/calendar';
import { InputNumberModule } from 'primeng/inputnumber';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { PassengerSeatVanComponent } from '../../../../passenger-info/components/passenger-seat-van/passenger-seat-van.component';
import { PassengerSeatBusComponent } from '../../../../passenger-info/components/passenger-seat-bus/passenger-seat-bus.component';
import { PassengerSeatBoxComponent } from '../../../../passenger-info/components/passenger-seat-box/passenger-seat-box.component';

describe('TripDetailsEditFormComponent', () => {
  let component: TripDetailsEditFormComponent;
  let fixture: ComponentFixture<TripDetailsEditFormComponent>;

  const mockVehicleTypes: AdminVehicleTypeDto[] = [
    { id: 1, slug: 'van', totalSeats: 13 },
    { id: 2, slug: 'bus', totalSeats: 40 },
  ];

  const mockVehicles: AdminVehicleDto[] = [
    { id: 10, numberPlate: 'AA-001', vehicleType: { id: 1, slug: 'van' } },
    { id: 11, numberPlate: 'BB-002', vehicleType: { id: 2, slug: 'bus' } },
  ];

  // Helper to access protected/private form
  function getForm(comp: TripDetailsEditFormComponent): FormGroup {
    return (comp as unknown as { form: FormGroup }).form;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        TripDetailsEditFormComponent,
        AdminDropdownComponent,
        PassengerSeatVanComponent,
        PassengerSeatBusComponent,
        PassengerSeatBoxComponent,
      ],
      imports: [
        CommonModule,
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        CalendarModule,
        InputNumberModule,
        NoopAnimationsModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TripDetailsEditFormComponent);
    component = fixture.componentInstance;
    component.vehicleTypes = mockVehicleTypes;
    component.vehicles = mockVehicles;
    component.drivers = [];
    component.seatMapOptions = [];
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filteredVehicleOptions', () => {
    it('should filter vehicles by selected vehicle type slug', () => {
      getForm(component).get('vehicleType')!.setValue('van', { emitEvent: false });
      const filtered = (component as unknown as { filteredVehicleOptions: { code: string; label: string }[] }).filteredVehicleOptions;
      expect(filtered.length).toBe(1);
      expect(filtered[0].code).toBe('10');
    });

    it('should return all vehicles when no type is selected', () => {
      getForm(component).get('vehicleType')!.setValue('', { emitEvent: false });
      const filtered = (component as unknown as { filteredVehicleOptions: { code: string; label: string }[] }).filteredVehicleOptions;
      expect(filtered.length).toBe(2);
    });
  });

  describe('applyUntouchedPatch', () => {
    it('should patch untouched fields', () => {
      component.applyUntouchedPatch({ vehicleType: 'bus', driverId: '5' });
      expect(getForm(component).get('vehicleType')!.value).toBe('bus');
      expect(getForm(component).get('driverId')!.value).toBe('5');
    });

    it('should NOT patch touched fields', () => {
      getForm(component).get('vehicleType')!.markAsTouched();
      getForm(component).get('vehicleType')!.setValue('van', { emitEvent: false });
      component.applyUntouchedPatch({ vehicleType: 'bus' });
      // Should remain 'van' because the field was touched.
      expect(getForm(component).get('vehicleType')!.value).toBe('van');
    });
  });

  describe('effectiveTotalSeats', () => {
    it('should return totalSeats of the selected vehicle type', () => {
      getForm(component).get('vehicleType')!.setValue('van', { emitEvent: false });
      const seats = (component as unknown as { effectiveTotalSeats: number | null }).effectiveTotalSeats;
      expect(seats).toBe(13);
    });

    it('should return null when no type is selected', () => {
      getForm(component).get('vehicleType')!.setValue('', { emitEvent: false });
      const seats = (component as unknown as { effectiveTotalSeats: number | null }).effectiveTotalSeats;
      expect(seats).toBeNull();
    });
  });

  describe('driverOptions mapping', () => {
    it('should map driver list to options', () => {
      component.drivers = [{ id: 7, name: 'Alice' }];
      fixture.detectChanges();
      const opts = (component as unknown as { driverOptions: { code: string; label: string }[] }).driverOptions;
      expect(opts.length).toBe(1);
      expect(opts[0]).toEqual({ code: '7', label: 'Alice' });
    });
  });

  describe('form validation', () => {
    it('should be invalid when departureTime is empty', () => {
      getForm(component).get('departureTime')!.setValue(null);
      expect(getForm(component).invalid).toBeTrue();
    });

    it('should be invalid when vehicleType is empty', () => {
      getForm(component).get('vehicleType')!.setValue('');
      expect(getForm(component).invalid).toBeTrue();
    });
  });
});

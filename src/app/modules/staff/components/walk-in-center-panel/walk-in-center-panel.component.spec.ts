import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WalkInCenterPanelComponent } from './walk-in-center-panel.component';
import { WalkInTripDto } from '../../../../services/staff/staff-api.service';
import { StopOption } from '../../pages/sell/sell-page.component';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

function makeTrip(overrides: Partial<WalkInTripDto> = {}): WalkInTripDto {
  return {
    scheduleId: 1,
    vehicleType: 'bus',
    licensePlate: 'AB-1234',
    driverName: 'John',
    departureDateTime: '2026-07-01T08:00:00',
    arrivalDateTime: '2026-07-01T12:00:00',
    pricePerSeat: '300',
    capacity: 21,
    availableCount: 15,
    reservedUnpaidCount: 3,
    soldPaidCount: 3,
    availableSeatNumbers: ['1', '2', '3', '4', '5'],
    ...overrides,
  };
}

function makeStopOption(slug: string, name: string, time = ''): StopOption {
  return { slug, name, time };
}

describe('WalkInCenterPanelComponent', () => {
  let component: WalkInCenterPanelComponent;
  let fixture: ComponentFixture<WalkInCenterPanelComponent>;

  const adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', [
    'getScheduleById',
    'getVehicleTypes',
    'getVehicles',
    'getVehicleTypeById',
    'updateSchedule',
  ]);
  adminApiServiceSpy.getScheduleById.and.returnValue(of({ data: null }));
  adminApiServiceSpy.getVehicleTypes.and.returnValue(of({ data: [] }));
  adminApiServiceSpy.getVehicles.and.returnValue(of({ data: [] }));
  adminApiServiceSpy.getVehicleTypeById.and.returnValue(of({ data: { seatMaps: [] } }));
  adminApiServiceSpy.updateSchedule.and.returnValue(of({ status: 200, message: 'OK' }));

  const staffApiServiceSpy = jasmine.createSpyObj('StaffApiService', ['getDrivers']);
  staffApiServiceSpy.getDrivers.and.returnValue(of({ data: [] }));

  const alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error', 'warning']);
  alertServiceSpy.success.and.returnValue(Promise.resolve(undefined));
  alertServiceSpy.error.and.returnValue(Promise.resolve(undefined));
  alertServiceSpy.warning.and.returnValue(Promise.resolve(undefined));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WalkInCenterPanelComponent],
      imports: [
        CommonModule,
        HttpClientTestingModule,
        RouterTestingModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        { provide: StaffApiService, useValue: staffApiServiceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
        TranslateService,
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(WalkInCenterPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('passengerTypeOptions', () => {
    it('defines 4 passenger type options (male, female, monk, nun)', () => {
      const values = (component as unknown as { passengerTypeOptions: { value: string }[] })
        .passengerTypeOptions.map((o) => o.value);
      expect(values).toEqual(['male', 'female', 'monk', 'nun']);
    });

    it('provides an SVG icon path for male, female and monk', () => {
      const opts = (component as unknown as { passengerTypeOptions: { value: string; icon: string }[] }).passengerTypeOptions;
      expect(opts.find((o) => o.value === 'male')?.icon).toContain('passenger-male.svg');
      expect(opts.find((o) => o.value === 'female')?.icon).toContain('passenger-female.svg');
      expect(opts.find((o) => o.value === 'monk')?.icon).toContain('passenger-monk.svg');
    });

    it('uses empty icon string for nun (Bootstrap Icon fallback)', () => {
      const opts = (component as unknown as { passengerTypeOptions: { value: string; icon: string }[] }).passengerTypeOptions;
      expect(opts.find((o) => o.value === 'nun')?.icon).toBe('');
    });
  });

  describe('onSelectPassengerType', () => {
    it('emits passengerTypeChange with the clicked value', () => {
      let emitted: string | undefined;
      component.passengerTypeChange.subscribe((v) => { emitted = v; });
      (component as unknown as { onSelectPassengerType: (v: string) => void }).onSelectPassengerType('female');
      expect(emitted).toBe('female');
    });

    it('emits for each valid passenger type', () => {
      const emitted: string[] = [];
      component.passengerTypeChange.subscribe((v) => emitted.push(v));
      const fn = (component as unknown as { onSelectPassengerType: (v: string) => void }).onSelectPassengerType.bind(component);
      for (const v of ['male', 'female', 'monk', 'nun']) {
        fn(v);
      }
      expect(emitted).toEqual(['male', 'female', 'monk', 'nun']);
    });
  });

  describe('seatGender getter', () => {
    it('uppercases passengerGender for seat-map components', () => {
      component.passengerGender = 'male';
      expect((component as unknown as { seatGender: string }).seatGender).toBe('MALE');
    });

    it('defaults to MALE when passengerGender is empty', () => {
      component.passengerGender = '';
      expect((component as unknown as { seatGender: string }).seatGender).toBe('MALE');
    });
  });

  describe('seatGendersUpper getter', () => {
    it('returns null when seatPassengerTypes is empty', () => {
      component.seatPassengerTypes = {};
      expect((component as unknown as { seatGendersUpper: Record<string, string> | null }).seatGendersUpper).toBeNull();
    });

    it('returns upper-cased map when seatPassengerTypes has entries', () => {
      component.seatPassengerTypes = { B1: 'male', B3: 'female' };
      const upper = (component as unknown as { seatGendersUpper: Record<string, string> | null }).seatGendersUpper;
      expect(upper).not.toBeNull();
      expect(upper!['B1']).toBe('MALE');
      expect(upper!['B3']).toBe('FEMALE');
    });
  });

  describe('takenSeats getter', () => {
    it('returns empty array when no trip selected', () => {
      component.selectedTrip = null;
      expect((component as unknown as { takenSeats: string[] }).takenSeats).toEqual([]);
    });

    it('returns taken bus seats that are not in availableSeatNumbers', () => {
      component.selectedTrip = makeTrip({ availableSeatNumbers: ['1', '2', '3'] });
      const taken = (component as unknown as { takenSeats: string[] }).takenSeats;
      expect(taken).not.toContain('B1');
      expect(taken).not.toContain('B2');
      expect(taken).not.toContain('B3');
      expect(taken).toContain('B4');
    });
  });

  describe('stop selection outputs', () => {
    it('emits pickupChange', () => {
      const emitted: string[] = [];
      component.pickupChange.subscribe((v) => emitted.push(v));
      component.pickupChange.emit('stop_a');
      expect(emitted).toEqual(['stop_a']);
    });

    it('emits dropoffChange', () => {
      const emitted: string[] = [];
      component.dropoffChange.subscribe((v) => emitted.push(v));
      component.dropoffChange.emit('stop_c');
      expect(emitted).toEqual(['stop_c']);
    });
  });

  // ---------------------------------------------------------------------------
  // Stop filter logic
  // ---------------------------------------------------------------------------

  describe('filteredPickupOptions getter', () => {
    const stops = [
      makeStopOption('a', 'Bangkok Central'),
      makeStopOption('b', 'Chiang Mai Old City'),
      makeStopOption('c', 'Phuket Town'),
    ];

    beforeEach(() => {
      component.pickupOptions = stops;
      (component as unknown as { pickupFilter: string }).pickupFilter = '';
    });

    it('returns full list when filter is empty', () => {
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(result).toEqual(stops);
    });

    it('returns full list when filter is only whitespace', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = '   ';
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(result).toEqual(stops);
    });

    it('filters by substring (case-insensitive)', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'chiang';
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('b');
    });

    it('is case-insensitive for Latin text', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'BANGKOK';
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('a');
    });

    it('returns empty array when no stops match', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'zzznomatch';
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(result.length).toBe(0);
    });

    it('does NOT mutate the @Input pickupOptions array', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'phuket';
      (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(component.pickupOptions).toEqual(stops);
      expect(component.pickupOptions.length).toBe(3);
    });

    it('partial match returns multiple results', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'a';
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      // 'Bangkok Central' and 'Chiang Mai Old City' both contain 'a'
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('filteredDropoffOptions getter', () => {
    const stops = [
      makeStopOption('x', 'Hat Yai'),
      makeStopOption('y', 'Khon Kaen'),
      makeStopOption('z', 'Lampang Central'),
    ];

    beforeEach(() => {
      component.dropoffOptions = stops;
      (component as unknown as { dropoffFilter: string }).dropoffFilter = '';
    });

    it('returns full list when filter is empty', () => {
      const result = (component as unknown as { filteredDropoffOptions: StopOption[] }).filteredDropoffOptions;
      expect(result).toEqual(stops);
    });

    it('filters by substring (case-insensitive)', () => {
      (component as unknown as { dropoffFilter: string }).dropoffFilter = 'khon';
      const result = (component as unknown as { filteredDropoffOptions: StopOption[] }).filteredDropoffOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('y');
    });

    it('returns empty array when no stops match', () => {
      (component as unknown as { dropoffFilter: string }).dropoffFilter = 'nomatch999';
      const result = (component as unknown as { filteredDropoffOptions: StopOption[] }).filteredDropoffOptions;
      expect(result.length).toBe(0);
    });

    it('does NOT mutate the @Input dropoffOptions array', () => {
      (component as unknown as { dropoffFilter: string }).dropoffFilter = 'hat';
      (component as unknown as { filteredDropoffOptions: StopOption[] }).filteredDropoffOptions;
      expect(component.dropoffOptions).toEqual(stops);
      expect(component.dropoffOptions.length).toBe(3);
    });

    it('is independent from the pickup filter', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'zzz';
      (component as unknown as { dropoffFilter: string }).dropoffFilter = '';
      const result = (component as unknown as { filteredDropoffOptions: StopOption[] }).filteredDropoffOptions;
      expect(result).toEqual(stops);
    });
  });

  describe('filter no-match condition', () => {
    it('filteredPickupOptions.length === 0 when filter matches nothing', () => {
      component.pickupOptions = [makeStopOption('a', 'Bangkok')];
      (component as unknown as { pickupFilter: string }).pickupFilter = 'zzznomatch';
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(result.length).toBe(0);
    });

    it('filteredPickupOptions.length > 0 after clearing the filter', () => {
      component.pickupOptions = [makeStopOption('a', 'Bangkok')];
      (component as unknown as { pickupFilter: string }).pickupFilter = 'zzznomatch';
      (component as unknown as { pickupFilter: string }).pickupFilter = '';
      const result = (component as unknown as { filteredPickupOptions: StopOption[] }).filteredPickupOptions;
      expect(result.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Popular stop getters
  // ---------------------------------------------------------------------------

  describe('filteredPopularPickupOptions getter', () => {
    const validPickup = [
      makeStopOption('a', 'Bangkok'),
      makeStopOption('b', 'Chiang Mai'),
      makeStopOption('c', 'Phuket'),
    ];

    beforeEach(() => {
      component.pickupOptions = validPickup;
      component.popularPickupStops = [
        makeStopOption('a', 'Bangkok'),
        makeStopOption('b', 'Chiang Mai'),
      ];
      (component as unknown as { pickupFilter: string }).pickupFilter = '';
    });

    it('returns all valid popular stops when filter is empty', () => {
      const result = (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      expect(result.length).toBe(2);
    });

    it('filters by query (case-insensitive)', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'chiang';
      const result = (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('b');
    });

    it('returns empty array when query matches nothing', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'zzznomatch';
      const result = (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      expect(result.length).toBe(0);
    });

    it('excludes popular stops whose slug is not in pickupOptions (robustness guard)', () => {
      component.popularPickupStops = [
        makeStopOption('a', 'Bangkok'),
        makeStopOption('unknown_slug', 'Ghost Stop'),
      ];
      const result = (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('a');
    });

    it('returns empty array when popularPickupStops is empty', () => {
      component.popularPickupStops = [];
      const result = (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      expect(result.length).toBe(0);
    });

    it('does NOT mutate the @Input popularPickupStops array', () => {
      (component as unknown as { pickupFilter: string }).pickupFilter = 'chiang';
      const before = [...component.popularPickupStops];
      (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      expect(component.popularPickupStops).toEqual(before);
      expect(component.popularPickupStops.length).toBe(before.length);
    });

    it('recomputes correctly when pickupOptions changes', () => {
      component.pickupOptions = [makeStopOption('a', 'Bangkok')];
      const result = (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      // 'b' (Chiang Mai) is no longer in pickupOptions → excluded
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('a');
    });

    it('selecting a popular stop slug emits the same slug as selecting from full list', () => {
      const emitted: string[] = [];
      component.pickupChange.subscribe((v) => emitted.push(v));
      const popular = (component as unknown as { filteredPopularPickupOptions: StopOption[] }).filteredPopularPickupOptions;
      if (popular.length > 0) {
        component.pickupChange.emit(popular[0].slug);
      }
      expect(emitted[0]).toBe('a');
    });
  });

  describe('filteredPopularDropoffOptions getter', () => {
    const validDropoff = [
      makeStopOption('x', 'Hat Yai'),
      makeStopOption('y', 'Khon Kaen'),
    ];

    beforeEach(() => {
      component.dropoffOptions = validDropoff;
      component.popularDropoffStops = [
        makeStopOption('x', 'Hat Yai'),
        makeStopOption('y', 'Khon Kaen'),
      ];
      (component as unknown as { dropoffFilter: string }).dropoffFilter = '';
    });

    it('returns all valid popular dropoff stops when filter is empty', () => {
      const result = (component as unknown as { filteredPopularDropoffOptions: StopOption[] }).filteredPopularDropoffOptions;
      expect(result.length).toBe(2);
    });

    it('filters popular dropoff stops by query', () => {
      (component as unknown as { dropoffFilter: string }).dropoffFilter = 'hat';
      const result = (component as unknown as { filteredPopularDropoffOptions: StopOption[] }).filteredPopularDropoffOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('x');
    });

    it('excludes popular dropoff stop not in dropoffOptions', () => {
      component.popularDropoffStops = [
        makeStopOption('x', 'Hat Yai'),
        makeStopOption('not_valid', 'Invalid Stop'),
      ];
      const result = (component as unknown as { filteredPopularDropoffOptions: StopOption[] }).filteredPopularDropoffOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('x');
    });

    it('returns empty array when popularDropoffStops is empty', () => {
      component.popularDropoffStops = [];
      const result = (component as unknown as { filteredPopularDropoffOptions: StopOption[] }).filteredPopularDropoffOptions;
      expect(result.length).toBe(0);
    });

    it('does NOT mutate the @Input popularDropoffStops array', () => {
      (component as unknown as { dropoffFilter: string }).dropoffFilter = 'hat';
      const before = [...component.popularDropoffStops];
      (component as unknown as { filteredPopularDropoffOptions: StopOption[] }).filteredPopularDropoffOptions;
      expect(component.popularDropoffStops).toEqual(before);
    });

    it('recomputes correctly when dropoffOptions changes', () => {
      component.dropoffOptions = [makeStopOption('x', 'Hat Yai')];
      const result = (component as unknown as { filteredPopularDropoffOptions: StopOption[] }).filteredPopularDropoffOptions;
      expect(result.length).toBe(1);
      expect(result[0].slug).toBe('x');
    });

    it('selecting a popular dropoff stop emits the same slug', () => {
      const emitted: string[] = [];
      component.dropoffChange.subscribe((v) => emitted.push(v));
      component.dropoffChange.emit('x');
      expect(emitted[0]).toBe('x');
    });
  });

  describe('edit mode', () => {
    it('isEditMode starts false', () => {
      expect((component as unknown as { isEditMode: boolean }).isEditMode).toBeFalse();
    });

    it('closeEditMode resets isEditMode to false', () => {
      (component as unknown as { isEditMode: boolean }).isEditMode = true;
      (component as unknown as { closeEditMode: () => void }).closeEditMode();
      expect((component as unknown as { isEditMode: boolean }).isEditMode).toBeFalse();
    });

    it('ngOnChanges closes edit mode when selectedTrip changes', () => {
      (component as unknown as { isEditMode: boolean }).isEditMode = true;
      component.ngOnChanges({
        selectedTrip: {
          currentValue: makeTrip({ scheduleId: 2 }),
          previousValue: makeTrip({ scheduleId: 1 }),
          firstChange: false,
          isFirstChange: () => false,
        },
      });
      expect((component as unknown as { isEditMode: boolean }).isEditMode).toBeFalse();
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FleetVehicleStatusListComponent } from './fleet-vehicle-status-list.component';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';

function makeRow(overrides: Partial<FleetPositionRespDto> = {}): FleetPositionRespDto {
  return {
    vehicleId: 1,
    numberPlate: '40-1234',
    vehicleNumber: '1',
    lat: 13.36,
    lon: 100.98,
    speed: 40,
    course: 90,
    engineStatus: 1,
    recordedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    positionKnown: true,
    stale: false,
    deviceOnline: true,
    gpsImeiConfigured: true,
    ...overrides,
  };
}

describe('FleetVehicleStatusListComponent', () => {
  let fixture: ComponentFixture<FleetVehicleStatusListComponent>;
  let component: FleetVehicleStatusListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [FleetVehicleStatusListComponent],
    }).compileComponents();

    // Same reason as the map panel's spec: with no translations loaded
    // ngx-translate echoes the key, so a "the cell shows the speed" assertion
    // would pass on the constant key and prove nothing.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(
      'en',
      { STAFF: { FLEET_MAP: { SPEED_VALUE: '{{value}} km/h', COL: { SPEED: 'Speed' } } } },
      true
    );
    translate.use('en');

    fixture = TestBed.createComponent(FleetVehicleStatusListComponent);
    component = fixture.componentInstance;
  });

  it('renders a row per vehicle, including NOT_TRACKED/AWAITING_SIGNAL rows that never get a marker', () => {
    component.vehicles = [
      makeRow({ vehicleId: 1 }), // LIVE
      makeRow({ vehicleId: 2, gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true, lat: null, lon: null }), // NOT_TRACKED
      makeRow({ vehicleId: 3, positionKnown: false, deviceOnline: null, stale: true, lat: null, lon: null }), // AWAITING_SIGNAL
    ];
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr:not(.admin-empty-row)');
    expect(rows.length).toBe(3);
  });

  it('day-one: 6 vehicles all gpsImeiConfigured:false render as is-neutral NOT_TRACKED chips', () => {
    component.vehicles = Array.from({ length: 6 }, (_, i) =>
      makeRow({ vehicleId: i + 1, gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true, lat: null, lon: null })
    );
    fixture.detectChanges();

    const chips: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.admin-status');
    expect(chips.length).toBe(6);
    chips.forEach((chip) => expect(chip.classList.contains('is-neutral')).toBeTrue());
  });

  it('renders the empty row when there are no vehicles', () => {
    component.vehicles = [];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('tr.admin-empty-row')).not.toBeNull();
  });

  it('chipFor resolves through the shared resolver — OFFLINE gets is-danger', () => {
    const vehicle = makeRow({ deviceOnline: false, stale: true });
    const chip = (component as any).chipFor(vehicle);
    expect(chip.token).toBe('is-danger');
  });

  describe('OBRS-1070 — speed column', () => {
    it('the header row carries 4 columns, with SPEED between STATUS and LAST_UPDATE', () => {
      component.vehicles = [makeRow()];
      fixture.detectChanges();

      const headers: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('thead th');
      expect(headers.length).toBe(4);
      expect(headers[2].textContent?.trim()).toBe('Speed');
    });

    it('every body row keeps 4 cells, so no row can shift under the wrong header', () => {
      component.vehicles = [
        makeRow({ vehicleId: 1 }),
        makeRow({ vehicleId: 2, gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true, lat: null, lon: null, speed: null, recordedAt: null }),
      ];
      fixture.detectChanges();

      const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('tbody tr:not(.admin-empty-row)');
      rows.forEach((row) => expect(row.querySelectorAll('td').length).toBe(4));
    });

    it('renders the speed with its unit, from the bare-value key (not the popup key with its "Speed:" prefix)', () => {
      component.vehicles = [makeRow({ speed: 62 })];
      fixture.detectChanges();

      const cell: HTMLElement = fixture.nativeElement.querySelector('.fleet-speed-cell');
      expect(cell.textContent?.trim()).toBe('62 km/h');
    });

    it('a vehicle with no speed reading gets the em dash, never a stranded unit', () => {
      component.vehicles = [makeRow({ speed: null })];
      fixture.detectChanges();

      const cell: HTMLElement = fixture.nativeElement.querySelector('.fleet-speed-cell');
      expect(cell.textContent?.trim()).toBe('—');
    });

    it('the empty-state row spans all 4 columns', () => {
      component.vehicles = [];
      fixture.detectChanges();

      const cell: HTMLElement = fixture.nativeElement.querySelector('tr.admin-empty-row td');
      expect(cell.getAttribute('colspan')).toBe('4');
    });
  });
});

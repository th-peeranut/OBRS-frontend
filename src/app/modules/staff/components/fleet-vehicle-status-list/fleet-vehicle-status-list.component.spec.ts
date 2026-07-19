import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
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
});

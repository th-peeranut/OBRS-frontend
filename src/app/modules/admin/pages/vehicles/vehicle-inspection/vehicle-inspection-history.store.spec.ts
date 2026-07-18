import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { VehicleInspectionHistoryStore } from './vehicle-inspection-history.store';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../../auth/auth.service';

describe('VehicleInspectionHistoryStore', () => {
  it('should be created and start with no value', () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [VehicleInspectionHistoryStore, AdminApiService, AuthService],
    });
    const store = TestBed.inject(VehicleInspectionHistoryStore);

    expect(store).toBeTruthy();
    expect(store.hasValue).toBeFalse();
  });

  it('setVehicleId() clears the cache when the vehicle changes', () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [VehicleInspectionHistoryStore, AdminApiService, AuthService],
    });
    const store = TestBed.inject(VehicleInspectionHistoryStore);

    store.setVehicleId(1);
    store.setVehicleId(2);

    expect(store.hasValue).toBeFalse();
  });

  it('fetch() returns [] before any vehicle is focused', async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [VehicleInspectionHistoryStore, AdminApiService, AuthService],
    });
    const store = TestBed.inject(VehicleInspectionHistoryStore);

    await store.refresh();

    expect(store.value).toEqual([]);
  });

  it('refresh() fetches via AdminApiService.getVehicleInspections(vehicleId) once focused', async () => {
    const rows = [
      {
        id: 1,
        inspectedAt: '2026-07-14T09:00:00+07:00',
        inspectedByName: 'Somchai',
        odometerKm: 1000,
        defectCount: 0,
        pendingMaintenance: false,
      },
    ];
    const adminApiStub = {
      getVehicleInspections: jasmine
        .createSpy('getVehicleInspections')
        .and.returnValue(of({ code: 200, message: 'OK', data: rows })),
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        VehicleInspectionHistoryStore,
        { provide: AdminApiService, useValue: adminApiStub },
        AuthService,
      ],
    });
    const store = TestBed.inject(VehicleInspectionHistoryStore);
    store.setVehicleId(7);

    await store.refresh();

    expect(adminApiStub.getVehicleInspections).toHaveBeenCalledWith(7);
    expect(store.value).toEqual(rows);
  });

  it('is a fresh instance per TestBed.inject (not providedIn: root)', () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [VehicleInspectionHistoryStore, AdminApiService, AuthService],
    });
    const store = TestBed.inject(VehicleInspectionHistoryStore);
    store.setVehicleId(99);

    const other = new VehicleInspectionHistoryStore(
      TestBed.inject(AdminApiService),
      TestBed.inject(AuthService)
    );

    expect(other.hasValue).toBeFalse();
    expect(other).not.toBe(store);
  });
});

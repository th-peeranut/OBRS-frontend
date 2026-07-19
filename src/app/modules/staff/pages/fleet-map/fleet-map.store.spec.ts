import { BehaviorSubject, Observable, of } from 'rxjs';
import { FleetMapStore } from './fleet-map.store';
import { FleetPositionRespDto, StaffApiService } from '../../../../services/staff/staff-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> {
  return { code: 200, message: 'OK', data };
}

function makeRow(overrides: Partial<FleetPositionRespDto> = {}): FleetPositionRespDto {
  return {
    vehicleId: 1,
    numberPlate: '40-1234',
    vehicleNumber: '1',
    lat: 14.96204,
    lon: 102.490885,
    speed: 62,
    course: 287,
    engineStatus: 1,
    recordedAt: '2026-07-18T14:31:40+07:00',
    lastSeenAt: '2026-07-18T14:31:40+07:00',
    positionKnown: true,
    stale: false,
    deviceOnline: true,
    gpsImeiConfigured: true,
    ...overrides,
  };
}

interface FakeApi {
  getFleetPositions: jasmine.Spy<() => Observable<ResponseAPI<FleetPositionRespDto[]>>>;
}

function makeStore(api: Partial<FakeApi>, authStatus$ = new BehaviorSubject<boolean>(true)): FleetMapStore {
  const full: FakeApi = {
    getFleetPositions: jasmine.createSpy('getFleetPositions').and.returnValue(of(ok([makeRow()]))),
    ...api,
  };
  return new FleetMapStore(full as unknown as StaffApiService, { authStatus$ } as any);
}

describe('FleetMapStore', () => {
  it('calls StaffApiService.getFleetPositions() and unwraps response.data', async () => {
    const rows = [makeRow({ vehicleId: 1 }), makeRow({ vehicleId: 2, gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true, lat: null, lon: null })];
    const getFleetPositions = jasmine.createSpy('getFleetPositions').and.returnValue(of(ok(rows)));
    const store = makeStore({ getFleetPositions });

    await store.refresh();

    expect(getFleetPositions).toHaveBeenCalled();
    expect(store.value).toEqual(rows);
  });

  it('unwraps response.data ?? [] when data is missing', async () => {
    const store = makeStore({
      getFleetPositions: jasmine
        .createSpy('getFleetPositions')
        .and.returnValue(of({ code: 200, message: 'OK', data: undefined } as unknown as ResponseAPI<FleetPositionRespDto[]>)),
    });

    await store.refresh();

    expect(store.value).toEqual([]);
  });

  it('replays the cached value synchronously to a new subscriber (re-entry)', async () => {
    const store = makeStore({});
    await store.refresh();

    let received: FleetPositionRespDto[] | null | undefined;
    store.data$.subscribe((v) => (received = v));

    expect(received).not.toBeNull();
    expect((received as FleetPositionRespDto[]).length).toBe(1);
  });
});

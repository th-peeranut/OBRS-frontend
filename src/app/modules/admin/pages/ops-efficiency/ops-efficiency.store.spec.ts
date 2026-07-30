import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { OpsEfficiencyStore } from './ops-efficiency.store';
import { OpsEfficiencyDto } from '../../../../shared/interfaces/ops-efficiency.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> { return { code: 200, message: 'OK', data }; }
function d(): OpsEfficiencyDto {
  return { range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    departures: { scheduled: 4, completed: 3, cancelled: 1, completionRatePct: 75 },
    seatUtilization: { seatsSold: 48, seatCapacity: 70, fillRatePct: 68.6 }, byVehicleType: [] };
}
interface FakeApi { getOpsEfficiency: jasmine.Spy<(from: string, to: string) => Observable<ResponseAPI<OpsEfficiencyDto>>>; }
function makeStore(api: Partial<FakeApi>, authStatus$ = new BehaviorSubject<boolean>(true)): OpsEfficiencyStore {
  const full: FakeApi = { getOpsEfficiency: jasmine.createSpy('getOpsEfficiency').and.returnValue(of(ok(d()))), ...api };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new OpsEfficiencyStore(full as any, { authStatus$ } as any);
}
describe('OpsEfficiencyStore', () => {
  it('fetches with the current range on refresh()', async () => {
    const getOpsEfficiency = jasmine.createSpy('getOpsEfficiency').and.returnValue(of(ok(d())));
    const store = makeStore({ getOpsEfficiency });
    await store.refresh();
    const { from, to } = store.range;
    expect(getOpsEfficiency).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.departures.scheduled).toBe(4);
  });
  it('setRange() switches and refetches', async () => {
    const getOpsEfficiency = jasmine.createSpy('getOpsEfficiency').and.returnValue(of(ok(d())));
    const store = makeStore({ getOpsEfficiency });
    store.setRange('2026-06-01', '2026-06-10'); await Promise.resolve();
    expect(getOpsEfficiency).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
  });
  it('exposes lastErrorCode on failure', async () => {
    const store = makeStore({ getOpsEfficiency: jasmine.createSpy().and.returnValue(throwError(() => ({ error: { errorCode: 'REPORT_RANGE_TOO_LARGE' } }))) });
    await store.refresh();
    expect(store.lastErrorCode).toBe('REPORT_RANGE_TOO_LARGE');
  });
});

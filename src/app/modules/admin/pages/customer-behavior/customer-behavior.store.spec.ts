import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { CustomerBehaviorStore } from './customer-behavior.store';
import { CustomerBehaviorDto } from '../../../../shared/interfaces/customer-behavior.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

function ok<T>(data: T): ResponseAPI<T> { return { code: 200, message: 'OK', data }; }
function d(): CustomerBehaviorDto {
  return { range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    totalBookings: 6, distinctCustomers: 3, returningCustomers: 2, returningRatePct: 66.7, avgBookingsPerCustomer: 2,
    bookingsByChannel: [], repeatDistribution: [] };
}
interface FakeApi { getCustomerBehavior: jasmine.Spy<(from: string, to: string) => Observable<ResponseAPI<CustomerBehaviorDto>>>; }
function makeStore(api: Partial<FakeApi>, authStatus$ = new BehaviorSubject<boolean>(true)): CustomerBehaviorStore {
  const full: FakeApi = { getCustomerBehavior: jasmine.createSpy('getCustomerBehavior').and.returnValue(of(ok(d()))), ...api };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CustomerBehaviorStore(full as any, { authStatus$ } as any);
}
describe('CustomerBehaviorStore', () => {
  it('fetches with the current range on refresh()', async () => {
    const getCustomerBehavior = jasmine.createSpy('getCustomerBehavior').and.returnValue(of(ok(d())));
    const store = makeStore({ getCustomerBehavior });
    await store.refresh();
    const { from, to } = store.range;
    expect(getCustomerBehavior).toHaveBeenCalledOnceWith(from, to);
    expect(store.value?.distinctCustomers).toBe(3);
  });
  it('setRange() switches and refetches', async () => {
    const getCustomerBehavior = jasmine.createSpy('getCustomerBehavior').and.returnValue(of(ok(d())));
    const store = makeStore({ getCustomerBehavior });
    store.setRange('2026-06-01', '2026-06-10'); await Promise.resolve();
    expect(getCustomerBehavior).toHaveBeenCalledWith('2026-06-01', '2026-06-10');
  });
  it('exposes lastErrorCode on failure', async () => {
    const store = makeStore({ getCustomerBehavior: jasmine.createSpy().and.returnValue(throwError(() => ({ error: { errorCode: 'REPORT_RANGE_TOO_LARGE' } }))) });
    await store.refresh();
    expect(store.lastErrorCode).toBe('REPORT_RANGE_TOO_LARGE');
  });
});

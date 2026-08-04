import { of, throwError } from 'rxjs';
import { ParcelShareConfigStore } from './parcel-share-config.store';

function createStaffApiStub(response: unknown): any {
  return {
    getParcelShareConfig: jasmine.createSpy('getParcelShareConfig').and.returnValue(of(response)),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

describe('ParcelShareConfigStore', () => {
  it('exposes configured:true from a successful fetch', async () => {
    const staffApi = createStaffApiStub({
      code: 200,
      message: 'OK',
      data: { driverPct: 10, salespersonPct: 5, configured: true },
    });
    const store = new ParcelShareConfigStore(staffApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual({ driverPct: 10, salespersonPct: 5, configured: true });
    expect(store.errorStatus).toBeNull();
  });

  // OBRS-960 fail-safe: fetch() throws on a missing/malformed response body
  // (mirrors JumpSeatConfigStore) so error$ fires — the CONSUMER page is what
  // reads this as "show the warning", but the store's own job is simply to
  // surface the failure rather than silently substituting a default value.
  it('surfaces error$ when the response has no data', async () => {
    const staffApi = createStaffApiStub({ code: 200, message: 'OK', data: null });
    const store = new ParcelShareConfigStore(staffApi, createAuthServiceStub());

    let failed = false;
    store.error$.subscribe((v) => (failed = v));

    await store.refresh();

    expect(failed).toBeTrue();
    expect(store.value).toBeNull();
  });

  it('surfaces error$ on a transport failure', async () => {
    const staffApi: any = {
      getParcelShareConfig: jasmine
        .createSpy('getParcelShareConfig')
        .and.returnValue(throwError(() => new Error('network error'))),
    };
    const store = new ParcelShareConfigStore(staffApi, createAuthServiceStub());

    let failed = false;
    store.error$.subscribe((v) => (failed = v));

    await store.refresh();

    expect(failed).toBeTrue();
  });
});

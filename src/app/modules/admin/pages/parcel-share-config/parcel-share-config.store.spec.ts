import { of } from 'rxjs';
import { ParcelShareConfigAdminStore } from './parcel-share-config.store';

function createAdminApiStub(response: unknown): any {
  return {
    getParcelShareOwnerConfig: jasmine.createSpy('getParcelShareOwnerConfig').and.returnValue(of(response)),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

describe('ParcelShareConfigAdminStore', () => {
  it('fetches and exposes the owner config', async () => {
    const config = { driverPct: 10, driverPctConfigured: true, salespersonPct: 5, salespersonPctConfigured: true };
    const store = new ParcelShareConfigAdminStore(
      createAdminApiStub({ code: 200, message: 'OK', data: config }),
      createAuthServiceStub()
    );

    await store.refresh();

    expect(store.value).toEqual(config);
  });

  it('surfaces error$ when the response has no data', async () => {
    const store = new ParcelShareConfigAdminStore(
      createAdminApiStub({ code: 200, message: 'OK', data: null }),
      createAuthServiceStub()
    );

    let failed = false;
    store.error$.subscribe((v) => (failed = v));
    await store.refresh();

    expect(failed).toBeTrue();
  });
});

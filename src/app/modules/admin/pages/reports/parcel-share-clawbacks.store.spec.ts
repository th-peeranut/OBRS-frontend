import { of } from 'rxjs';
import { ParcelShareClawbacksStore } from './parcel-share-clawbacks.store';

function createAdminApiStub(response: unknown): any {
  return {
    getParcelShareClawbacks: jasmine
      .createSpy('getParcelShareClawbacks')
      .and.returnValue(of(response)),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

describe('ParcelShareClawbacksStore', () => {
  it('defaults the filter to OUTSTANDING — the only rows the owner can act on', () => {
    const store = new ParcelShareClawbacksStore(createAdminApiStub({}), createAuthServiceStub());
    expect(store.filter).toBe('OUTSTANDING');
  });

  it('sends the wire status when the filter is a real status', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: [] });
    const store = new ParcelShareClawbacksStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(adminApi.getParcelShareClawbacks).toHaveBeenCalledWith('OUTSTANDING');
  });

  /**
   * The whole point of the `ALL` option: the backend returns COLLECTED rows
   * alongside OUTSTANDING ones only when `status` is ABSENT. Sending the
   * literal string `'ALL'` would be a 400/empty list, so this asserts the
   * translation to `undefined`, not merely that a call happened.
   */
  it('sends NO status param for ALL — `ALL` is a UI value, not a wire value', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: [] });
    const store = new ParcelShareClawbacksStore(adminApi, createAuthServiceStub());

    store.setFilter('ALL');
    await new Promise((r) => setTimeout(r, 0));

    expect(adminApi.getParcelShareClawbacks).toHaveBeenCalledWith(undefined);
    expect(store.filter).toBe('ALL');
  });

  it('setFilter re-fetches with the new status', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: [] });
    const store = new ParcelShareClawbacksStore(adminApi, createAuthServiceStub());

    store.setFilter('COLLECTED');
    await new Promise((r) => setTimeout(r, 0));

    expect(adminApi.getParcelShareClawbacks).toHaveBeenCalledWith('COLLECTED');
  });

  it('treats a null data payload as an empty list, never a crash', async () => {
    const adminApi = createAdminApiStub({ code: 200, message: 'OK', data: null });
    const store = new ParcelShareClawbacksStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual([]);
  });
});

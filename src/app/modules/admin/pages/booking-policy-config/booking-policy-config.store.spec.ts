import { of } from 'rxjs';
import { BookingPolicyConfigStore } from './booking-policy-config.store';

const OWNER_CONFIG = {
  maxAdvanceDays: 45,
  maxAdvanceDaysOverridden: true,
  cutoffMinutes: 20,
  cutoffMinutesOverridden: false,
};

const PLATFORM_CONFIG = { maxAdvanceDays: 60, cutoffMinutes: 30 };

function createAdminApiStub(): any {
  return {
    getBookingPolicyOwnerConfig: jasmine
      .createSpy('getBookingPolicyOwnerConfig')
      .and.returnValue(of({ code: 200, message: 'OK', data: OWNER_CONFIG })),
    getBookingPolicyConfig: jasmine
      .createSpy('getBookingPolicyConfig')
      .and.returnValue(of({ code: 200, message: 'OK', data: PLATFORM_CONFIG })),
  };
}

function createAuthServiceStub(roles: string[]): any {
  return {
    authStatus$: of(true),
    getRoles: () => roles,
    // OBRS-1454: present ONLY so a store that reached for it would be caught. It is symmetric on
    // this frontend (owner grants admin and admin grants owner), so a store using it could not
    // tell the two surfaces apart — which is the defect this card fixes.
    hasAnyRole: () => {
      throw new Error('hasAnyRole cannot distinguish owner from admin - use getRoles()');
    },
  };
}

describe('BookingPolicyConfigStore', () => {
  it('OBRS-1454: an OWNER reads their own override surface', async () => {
    const api = createAdminApiStub();
    const store = new BookingPolicyConfigStore(api, createAuthServiceStub(['owner', 'customer']));

    await store.refresh();

    expect(api.getBookingPolicyOwnerConfig).toHaveBeenCalledTimes(1);
    expect(api.getBookingPolicyConfig).not.toHaveBeenCalled();
    expect(store.value).toEqual(OWNER_CONFIG);
  });

  it('OBRS-1454: an ADMIN still reads the platform default - the owner endpoint refuses them', async () => {
    const api = createAdminApiStub();
    const store = new BookingPolicyConfigStore(api, createAuthServiceStub(['admin']));

    await store.refresh();

    expect(api.getBookingPolicyConfig).toHaveBeenCalledTimes(1);
    expect(api.getBookingPolicyOwnerConfig).not.toHaveBeenCalled();
    expect(store.value).toEqual(PLATFORM_CONFIG);
  });

  it('surfaces error$ when the response has no data', async () => {
    const api = createAdminApiStub();
    api.getBookingPolicyOwnerConfig.and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const store = new BookingPolicyConfigStore(api, createAuthServiceStub(['owner']));

    let failed = false;
    store.error$.subscribe((v) => (failed = v));
    await store.refresh();

    expect(failed).toBeTrue();
  });
});

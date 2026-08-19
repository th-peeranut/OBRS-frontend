import { of } from 'rxjs';
import { CancelReschedulePolicyConfigStore } from './cancel-reschedule-policy-config.store';

function createAdminApiStub(response: unknown): any {
  return {
    getCancelReschedulePolicyOwnerConfig: jasmine
      .createSpy('getCancelReschedulePolicyOwnerConfig')
      .and.returnValue(of(response)),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

const CONFIG = {
  cancelWindowHours: 2,
  cancelWindowHoursOverridden: false,
  rescheduleWindowHours: 2,
  rescheduleWindowHoursOverridden: false,
  rescheduleMaxDaysAhead: 60,
  rescheduleMaxDaysAheadOverridden: false,
  earlyWindowHours: 24,
  earlyWindowHoursOverridden: false,
  cancelRefundRateEarly: 0.8,
  cancelRefundRateEarlyOverridden: false,
  cancelRefundRateLate: 0.5,
  cancelRefundRateLateOverridden: false,
  rescheduleFeeLateThb: 50,
  rescheduleFeeLateThbOverridden: false,
};

describe('CancelReschedulePolicyConfigStore', () => {
  it('fetches and exposes the owner config', async () => {
    const store = new CancelReschedulePolicyConfigStore(
      createAdminApiStub({ code: 200, message: 'OK', data: CONFIG }),
      createAuthServiceStub()
    );

    await store.refresh();

    expect(store.value).toEqual(CONFIG);
  });

  it('surfaces error$ when the response has no data', async () => {
    const store = new CancelReschedulePolicyConfigStore(
      createAdminApiStub({ code: 200, message: 'OK', data: null }),
      createAuthServiceStub()
    );

    let failed = false;
    store.error$.subscribe((v) => (failed = v));
    await store.refresh();

    expect(failed).toBeTrue();
  });
});

import { of } from 'rxjs';
import { OperationsConfigStore } from './operations-config.store';

function createAdminApiStub(response: unknown): any {
  return {
    getOperationsOwnerConfig: jasmine
      .createSpy('getOperationsOwnerConfig')
      .and.returnValue(of(response)),
  };
}

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

const CONFIG = {
  seatReservationMinutes: 10,
  seatReservationMinutesOverridden: false,
  reschedulePaymentTimeoutMinutes: 15,
  reschedulePaymentTimeoutMinutesOverridden: false,
  noShowCutoffMinutes: 10,
  noShowCutoffMinutesOverridden: false,
  nearFullAlertThresholdPercent: 90,
  nearFullAlertThresholdPercentOverridden: false,
};

describe('OperationsConfigStore', () => {
  it('fetches and exposes the owner config', async () => {
    const store = new OperationsConfigStore(
      createAdminApiStub({ code: 200, message: 'OK', data: CONFIG }),
      createAuthServiceStub()
    );

    await store.refresh();

    expect(store.value).toEqual(CONFIG);
  });

  it('surfaces error$ when the response has no data', async () => {
    const store = new OperationsConfigStore(
      createAdminApiStub({ code: 200, message: 'OK', data: null }),
      createAuthServiceStub()
    );

    let failed = false;
    store.error$.subscribe((v) => (failed = v));
    await store.refresh();

    expect(failed).toBeTrue();
  });
});

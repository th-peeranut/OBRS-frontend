import { HomeComponent } from './home.component';
import { createStoreStub, createTranslateStub } from '../../testing/test-stubs';

function createAlertStub(): any {
  return { warning: () => {}, error: () => {} };
}

describe('HomeComponent', () => {
  let component: HomeComponent;

  beforeEach(() => {
    component = new HomeComponent(
      createStoreStub(),
      createAlertStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('onPickupDropoffConfirmed shows error when station not found', () => {
    const alertSpy = jasmine.createSpy('error');
    (component as any).alertService = { error: alertSpy, warning: () => {} };
    (component as any).allStations = [];
    component.onPickupDropoffConfirmed({ pickupSlug: 'x', dropoffSlug: 'y' });
    expect(alertSpy).toHaveBeenCalled();
  });
});

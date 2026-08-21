import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { AddSegmentModalComponent } from './add-segment-modal.component';
import { SegmentRow, StopPoint } from '../routes.mappers';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const STOP_A: StopPoint = {
  slug: 'stop-a',
  name: 'Stop A',
  distance: '0 km',
  duration: '0 mins',
  stopOrder: 1,
  offsetMinutesFromOrigin: 0,
};
const STOP_B: StopPoint = {
  slug: 'stop-b',
  name: 'Stop B',
  distance: '10 km',
  duration: '20 mins',
  stopOrder: 2,
  offsetMinutesFromOrigin: 20,
};
const STOP_C: StopPoint = {
  slug: 'stop-c',
  name: 'Stop C',
  distance: '20 km',
  duration: '40 mins',
  stopOrder: 3,
  offsetMinutesFromOrigin: 40,
};

/** stop-a -> stop-c priced for both vehicle types; stop-a -> stop-b for neither.
 *  That is the shape the card is about: the pair the owner wants has NO row. */
const VAN_PAIR: SegmentRow = {
  id: 5,
  origin: 'Stop A',
  destination: 'Stop C',
  fare: 180,
  duration: '40 mins',
  estimatedDurationMinutes: 40,
  fromStopSlug: 'stop-a',
  toStopSlug: 'stop-c',
  vehicleTypeSlug: 'van',
  vehicleTypeName: 'Van',
};
const MINIBUS_PAIR: SegmentRow = {
  ...VAN_PAIR,
  id: 6,
  vehicleTypeSlug: 'minibus',
  vehicleTypeName: 'Minibus',
};

function makeComponent() {
  const adminApi = {
    updateSegments: jasmine
      .createSpy('updateSegments')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  const component = new AddSegmentModalComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  component.stops = [STOP_A, STOP_B, STOP_C];
  component.allSegments = [VAN_PAIR, MINIBUS_PAIR];
  component.routeSlug = 'route-1';
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApi, alert };
}

function form(component: AddSegmentModalComponent): any {
  return (component as any).addSegmentForm;
}

function fill(
  component: AddSegmentModalComponent,
  fromStopSlug: string,
  toStopSlug: string,
  fares: Record<string, string>
): void {
  component.open();
  form(component).patchValue({ fromStopSlug, toStopSlug, fares });
}

describe('AddSegmentModalComponent', () => {
  describe('open', () => {
    it('offers one fare control per vehicle type already priced on the route', () => {
      const { component } = makeComponent();

      component.open();

      expect((component as any).isOpen).toBeTrue();
      expect(Object.keys(form(component).get('fares').controls)).toEqual(['van', 'minibus']);
    });
  });

  // AC-1 + AC-4: the pair is CREATED, and nothing that already existed is lost.
  // The backend replaces the whole (route, vehicleType) set from the payload
  // (ADR-0122), so "did not delete anything" is a claim about what was SENT.
  describe('saving a new pair', () => {
    it('sends one request carrying every existing pair plus the new one', async () => {
      const { component, adminApi } = makeComponent();
      fill(component, 'stop-a', 'stop-b', { van: '90', minibus: '95' });

      await (component as any).submit();

      expect(adminApi.updateSegments).toHaveBeenCalledTimes(1);
      expect(adminApi.updateSegments.calls.mostRecent().args[0]).toEqual({
        route: 'route-1',
        vehicleTypes: [
          {
            vehicleType: 'van',
            stopPairs: [
              { fromStop: 'stop-a', toStop: 'stop-c', fare: 180 },
              { fromStop: 'stop-a', toStop: 'stop-b', fare: 90 },
            ],
          },
          {
            vehicleType: 'minibus',
            stopPairs: [
              { fromStop: 'stop-a', toStop: 'stop-c', fare: 180 },
              { fromStop: 'stop-a', toStop: 'stop-b', fare: 95 },
            ],
          },
        ],
      });
    });

    it('omits estimatedDurationMinutes on every pair, the new one included', async () => {
      const { component, adminApi } = makeComponent();
      fill(component, 'stop-a', 'stop-b', { van: '90', minibus: '' });

      await (component as any).submit();

      const payload = adminApi.updateSegments.calls.mostRecent().args[0];
      for (const pair of payload.vehicleTypes[0].stopPairs) {
        expect('estimatedDurationMinutes' in pair).toBeFalse();
      }
    });

    // A blank fare must not be read as 0.00 ("free") and must not delete that
    // vehicle type's rows - which is what sending an EMPTY block would do.
    it('sends no block at all for a vehicle type left blank', async () => {
      const { component, adminApi } = makeComponent();
      fill(component, 'stop-a', 'stop-b', { van: '90', minibus: '' });

      await (component as any).submit();

      const payload = adminApi.updateSegments.calls.mostRecent().args[0];
      expect(payload.vehicleTypes.length).toBe(1);
      expect(payload.vehicleTypes[0].vehicleType).toBe('van');
    });

    it('reloads the route structure and closes on success', async () => {
      const { component } = makeComponent();
      fill(component, 'stop-a', 'stop-b', { van: '90', minibus: '' });

      await (component as any).submit();

      expect(component.reloadStructure).toHaveBeenCalledTimes(1);
      expect((component as any).isOpen).toBeFalse();
    });

    it('keeps the modal open and shows the error when the backend refuses', async () => {
      const { component, adminApi, alert } = makeComponent();
      adminApi.updateSegments.and.returnValue(throwError(() => new Error('nope')));
      fill(component, 'stop-a', 'stop-b', { van: '90', minibus: '' });

      await (component as any).submit();

      expect(alert.error).toHaveBeenCalledTimes(1);
      expect((component as any).isOpen).toBeTrue();
    });
  });

  // AC-2. Nothing may be sent for a pair that runs against the stop order -
  // asserting the request count is what proves the guard runs BEFORE the write.
  describe('refusals', () => {
    it('refuses a destination that comes before the origin', async () => {
      const { component, adminApi } = makeComponent();
      fill(component, 'stop-c', 'stop-a', { van: '90', minibus: '' });

      await (component as any).submit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form(component).get('toStopSlug').hasError('stopOrder')).toBeTrue();
    });

    it('refuses the same stop on both ends', async () => {
      const { component, adminApi } = makeComponent();
      fill(component, 'stop-b', 'stop-b', { van: '90', minibus: '' });

      await (component as any).submit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form(component).get('toStopSlug').hasError('sameStop')).toBeTrue();
    });

    it('refuses a form with no fare on any vehicle type', async () => {
      const { component, adminApi } = makeComponent();
      fill(component, 'stop-a', 'stop-b', { van: '', minibus: '' });

      await (component as any).submit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form(component).get('toStopSlug').hasError('noFare')).toBeTrue();
    });

    it('refuses a pair the vehicle type is already priced for', async () => {
      const { component, adminApi } = makeComponent();
      fill(component, 'stop-a', 'stop-c', { van: '90', minibus: '' });

      await (component as any).submit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form(component).get('fares.van').hasError('alreadyPriced')).toBeTrue();
    });

    // The pair may be missing for ONE vehicle type only. Refusing per vehicle
    // type rather than per pair is what keeps that case addable.
    it('allows a pair only the other vehicle type is priced for', async () => {
      const { component, adminApi } = makeComponent();
      const MINIBUS_ELSEWHERE: SegmentRow = {
        ...MINIBUS_PAIR,
        id: 7,
        fromStopSlug: 'stop-b',
        toStopSlug: 'stop-c',
      };
      component.allSegments = [VAN_PAIR, MINIBUS_ELSEWHERE];
      fill(component, 'stop-a', 'stop-c', { van: '', minibus: '95' });

      await (component as any).submit();

      expect(adminApi.updateSegments).toHaveBeenCalledTimes(1);
      expect(adminApi.updateSegments.calls.mostRecent().args[0]).toEqual({
        route: 'route-1',
        vehicleTypes: [
          {
            vehicleType: 'minibus',
            stopPairs: [
              { fromStop: 'stop-b', toStop: 'stop-c', fare: 180 },
              { fromStop: 'stop-a', toStop: 'stop-c', fare: 95 },
            ],
          },
        ],
      });
    });
  });
});

import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { SegmentEditModalComponent } from './segment-edit-modal.component';
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

const SEGMENT: SegmentRow = {
  id: 5,
  origin: 'Stop A',
  destination: 'Stop B',
  fare: 10,
  duration: '20 mins',
  estimatedDurationMinutes: 20,
  fromStopSlug: 'stop-a',
  toStopSlug: 'stop-b',
  vehicleTypeSlug: 'van',
  vehicleTypeName: 'Van',
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
  const component = new SegmentEditModalComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  component.stops = [STOP_A, STOP_B, STOP_C];
  component.allSegments = [SEGMENT];
  component.routeSlug = 'route-1';
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApi, alert };
}

describe('SegmentEditModalComponent', () => {
  describe('open', () => {
    it('resets the form with the segment values and opens the modal', () => {
      const { component } = makeComponent();

      component.open({ ...SEGMENT });

      expect((component as any).isOpen).toBeTrue();
      expect((component as any).selectedSegment).toEqual(SEGMENT);
      const form = (component as any).editSegmentForm;
      expect(form.get('fromStopSlug').value).toBe('stop-a');
      expect(form.get('toStopSlug').value).toBe('stop-b');
      expect(form.get('fare').value).toBe('10.00');
      expect(form.get('estimatedDurationMinutes').value).toBe(20);
    });
  });

  // OBRS-1031: the backend keeps ONE arrival minute per stop and derives every pair's duration
  // from it, so this edit moves rows the owner did not open. The count must be announced.
  describe('blast radius of a duration edit', () => {
    /** Same route as SEGMENT, all reading stop-b's arrival minute, across two vehicle types. */
    const SHARES_STOP_B_AS_ORIGIN: SegmentRow = {
      ...SEGMENT,
      id: 6,
      fromStopSlug: 'stop-b',
      toStopSlug: 'stop-c',
    };
    const SHARES_STOP_B_OTHER_VEHICLE_TYPE: SegmentRow = {
      ...SEGMENT,
      id: 7,
      fromStopSlug: 'stop-a',
      toStopSlug: 'stop-b',
      vehicleTypeSlug: 'minibus',
      vehicleTypeName: 'Minibus',
    };
    const UNRELATED_PAIR: SegmentRow = {
      ...SEGMENT,
      id: 8,
      fromStopSlug: 'stop-a',
      toStopSlug: 'stop-c',
    };

    it('counts every other pair reading the destination stop, across vehicle types', () => {
      const { component } = makeComponent();
      component.allSegments = [
        SEGMENT,
        SHARES_STOP_B_AS_ORIGIN,
        SHARES_STOP_B_OTHER_VEHICLE_TYPE,
        UNRELATED_PAIR,
      ];

      component.open({ ...SEGMENT });

      // route_stops is per ROUTE, so the minibus row moves too even though the PUT payload only
      // carries the van rows. The edited row itself and the a->c pair are not counted.
      expect((component as any).affectedPairCount).toBe(2);
      expect((component as any).affectedDestinationName).toBe('Stop B');
    });

    it('recounts when the owner picks a different destination stop', () => {
      const { component } = makeComponent();
      component.allSegments = [SEGMENT, SHARES_STOP_B_AS_ORIGIN, UNRELATED_PAIR];
      component.open({ ...SEGMENT });

      (component as any).editSegmentForm.get('toStopSlug').setValue('stop-c');

      // stop-c is read by b->c and a->c - two rows, neither of them the edited one.
      expect((component as any).affectedPairCount).toBe(2);
      expect((component as any).affectedDestinationName).toBe('Stop C');
    });

    it('reports 0 when nothing else on the route reads that stop, so the notice stays hidden', () => {
      const { component } = makeComponent();
      component.allSegments = [SEGMENT, UNRELATED_PAIR];

      component.open({ ...SEGMENT });

      expect((component as any).affectedPairCount).toBe(0);
    });
  });

  describe('field helpers', () => {
    it('isFieldInvalid is false until touched/dirty', () => {
      const { component } = makeComponent();
      component.open({ ...SEGMENT });
      const form = (component as any).editSegmentForm;

      form.get('fromStopSlug').setValue('');
      expect((component as any).isFieldInvalid('fromStopSlug')).toBeFalse();

      form.get('fromStopSlug').markAsTouched();
      expect((component as any).isFieldInvalid('fromStopSlug')).toBeTrue();
    });

    it('hasFieldError checks a specific error key on a touched/dirty field', () => {
      const { component } = makeComponent();
      component.open({ ...SEGMENT });
      const control = (component as any).editSegmentForm.get('toStopSlug');

      control.setErrors({ sameStop: true });
      expect((component as any).hasFieldError('toStopSlug', 'sameStop')).toBeFalse();

      control.markAsTouched();
      expect((component as any).hasFieldError('toStopSlug', 'sameStop')).toBeTrue();
      expect((component as any).hasFieldError('toStopSlug', 'stopOrder')).toBeFalse();
    });
  });

  describe('submitSegmentEdit guards', () => {
    it('does nothing when there is no selected segment', async () => {
      const { component, adminApi } = makeComponent();

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
    });

    it('does nothing when routeSlug is empty', async () => {
      const { component, adminApi } = makeComponent();
      component.open({ ...SEGMENT });
      component.routeSlug = '';

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
    });

    it('marks the form touched and does not submit when invalid', async () => {
      const { component, adminApi } = makeComponent();
      component.open({ ...SEGMENT });
      const form = (component as any).editSegmentForm;
      form.get('fare').setValue('');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form.get('fare').touched).toBeTrue();
    });
  });

  describe('validateSegmentStops (via submit)', () => {
    it('sets a required error when the destination stop is unknown', async () => {
      const { component, adminApi } = makeComponent();
      component.open({ ...SEGMENT });
      const form = (component as any).editSegmentForm;
      form.get('toStopSlug').setValue('missing-stop');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form.get('toStopSlug').hasError('required')).toBeTrue();
    });

    it('sets a sameStop error when origin and destination match', async () => {
      const { component, adminApi } = makeComponent();
      component.open({ ...SEGMENT });
      const form = (component as any).editSegmentForm;
      form.get('toStopSlug').setValue('stop-a');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form.get('toStopSlug').hasError('sameStop')).toBeTrue();
    });

    it('sets a stopOrder error when the destination is not after the origin', async () => {
      const { component, adminApi } = makeComponent();
      component.open({ ...SEGMENT });
      const form = (component as any).editSegmentForm;
      form.get('fromStopSlug').setValue('stop-c');
      form.get('toStopSlug').setValue('stop-b');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form.get('toStopSlug').hasError('stopOrder')).toBeTrue();
    });
  });

  describe('submitSegmentEdit success/error', () => {
    it('reloads the structure before alerting success, then closes and emits saved', async () => {
      const { component, adminApi, alert } = makeComponent();
      component.open({ ...SEGMENT });

      const callOrder: string[] = [];
      adminApi.updateSegments.and.callFake(() => {
        callOrder.push('updateSegments');
        return of({ code: 200, message: 'OK', data: null });
      });
      (component.reloadStructure as jasmine.Spy).and.callFake(() => {
        callOrder.push('reloadStructure');
        return Promise.resolve();
      });
      alert.success.and.callFake(() => {
        callOrder.push('alertSuccess');
        return Promise.resolve();
      });

      const savedSpy = jasmine.createSpy('saved');
      component.saved.subscribe(savedSpy);

      await (component as any).submitSegmentEdit();

      expect(callOrder).toEqual(['updateSegments', 'reloadStructure', 'alertSuccess']);
      expect((component as any).isOpen).toBeFalse();
      expect((component as any).isSavingSegmentEdit).toBeFalse();
      expect(savedSpy).toHaveBeenCalled();
    });

    it('alerts an error and keeps the modal open when the update fails', async () => {
      const { component, adminApi, alert } = makeComponent();
      component.open({ ...SEGMENT });
      adminApi.updateSegments.and.returnValue(throwError(() => new Error('save failed')));

      const savedSpy = jasmine.createSpy('saved');
      component.saved.subscribe(savedSpy);

      await (component as any).submitSegmentEdit();

      expect(alert.error).toHaveBeenCalledWith('save failed');
      expect((component as any).isOpen).toBeTrue();
      expect((component as any).isSavingSegmentEdit).toBeFalse();
      expect(component.reloadStructure).not.toHaveBeenCalled();
      expect(savedSpy).not.toHaveBeenCalled();
    });
  });

  describe('closeModal', () => {
    it('does not close while saving', () => {
      const { component } = makeComponent();
      component.open({ ...SEGMENT });
      (component as any).isSavingSegmentEdit = true;

      (component as any).closeModal();

      expect((component as any).isOpen).toBeTrue();
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { SegmentEditModalComponent } from './segment-edit-modal.component';
import {
  SegmentPivotRow,
  SegmentRow,
  StopPoint,
  toSegmentPivotRows,
  toVehicleTypeOptions,
} from '../routes.mappers';
import { AdminSharedModule } from '../../../admin-shared.module';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { PendingButtonDirective } from '../../../../../shared/directives/pending-button.directive';
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

/** The same a->b pair, priced for the other vehicle type. A different id on
 *  purpose: the backend regenerates ids on every save, so the two rows of one
 *  pair never share one. */
const MINIBUS_SEGMENT: SegmentRow = {
  ...SEGMENT,
  id: 6,
  fare: 25,
  vehicleTypeSlug: 'minibus',
  vehicleTypeName: 'Minibus',
};

/** Built through the production mappers, so the dialog is handed exactly the
 *  row the segments table hands it. */
function pivotOf(segments: SegmentRow[], pairIndex = 0): SegmentPivotRow {
  return toSegmentPivotRows(segments, toVehicleTypeOptions(segments))[pairIndex];
}

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
    it('resets the form with the pair values and opens the modal', () => {
      const { component } = makeComponent();

      component.open(pivotOf([SEGMENT]));

      expect((component as any).isOpen).toBeTrue();
      const form = (component as any).editSegmentForm;
      expect(form.get('fromStopSlug').value).toBe('stop-a');
      expect(form.get('toStopSlug').value).toBe('stop-b');
      expect(form.get('fares.van').value).toBe('10.00');
      expect(form.get('estimatedDurationMinutes').value).toBe(20);
    });

    // OBRS-1034 AC-1: both vehicle types of the pair, in one dialog.
    it('builds one fare control per vehicle type priced for the pair', () => {
      const { component } = makeComponent();
      component.allSegments = [SEGMENT, MINIBUS_SEGMENT];

      component.open(pivotOf([SEGMENT, MINIBUS_SEGMENT]));

      const fares = (component as any).editSegmentForm.get('fares');
      expect(Object.keys(fares.controls)).toEqual(['van', 'minibus']);
      expect(fares.get('van').value).toBe('10.00');
      expect(fares.get('minibus').value).toBe('25.00');
    });

    // AC-6: a type with no row for the pair gets no control, so nothing about
    // it can reach the payload - and it is never seeded with 0.00.
    it('gives no fare control to a vehicle type the pair has no row for', () => {
      const { component } = makeComponent();
      const minibusElsewhere: SegmentRow = {
        ...MINIBUS_SEGMENT,
        id: 7,
        fromStopSlug: 'stop-b',
        toStopSlug: 'stop-c',
      };
      component.allSegments = [SEGMENT, minibusElsewhere];

      component.open(pivotOf([SEGMENT, minibusElsewhere]));

      const fares = (component as any).editSegmentForm.get('fares');
      expect(Object.keys(fares.controls)).toEqual(['van']);
      expect(fares.get('minibus')).toBeNull();
    });
  });

  // OBRS-1031: the backend keeps ONE arrival minute per stop and derives every pair's duration
  // from it, so this edit moves rows the owner did not open. The count must be announced.
  describe('blast radius of a duration edit', () => {
    /** Same route as SEGMENT, all reading stop-b's arrival minute. */
    const SHARES_STOP_B_AS_ORIGIN: SegmentRow = {
      ...SEGMENT,
      id: 8,
      fromStopSlug: 'stop-b',
      toStopSlug: 'stop-c',
    };
    const UNRELATED_PAIR: SegmentRow = {
      ...SEGMENT,
      id: 9,
      fromStopSlug: 'stop-a',
      toStopSlug: 'stop-c',
    };

    it('counts every other pair reading the destination stop, across vehicle types', () => {
      const { component } = makeComponent();
      const segments = [
        SEGMENT,
        SHARES_STOP_B_AS_ORIGIN,
        MINIBUS_SEGMENT,
        UNRELATED_PAIR,
      ];
      component.allSegments = segments;

      component.open(pivotOf(segments));

      // route_stops is per ROUTE, so a pair of ANY vehicle type reading stop-b is collateral.
      // Only b->c is: the a->c pair does not touch stop-b, and the minibus a->b row is the very
      // pair this dialog saves (OBRS-1034), not collateral damage from it.
      expect((component as any).affectedPairCount).toBe(1);
      expect((component as any).affectedDestinationName).toBe('Stop B');
    });

    it('excludes BOTH vehicle types of the edited pair, not just one row', () => {
      const { component } = makeComponent();
      const segments = [SEGMENT, MINIBUS_SEGMENT];
      component.allSegments = segments;

      component.open(pivotOf(segments));

      expect((component as any).affectedPairCount).toBe(0);
    });

    it('recounts when the owner picks a different destination stop', () => {
      const { component } = makeComponent();
      const segments = [SEGMENT, SHARES_STOP_B_AS_ORIGIN, UNRELATED_PAIR];
      component.allSegments = segments;
      component.open(pivotOf(segments));

      (component as any).editSegmentForm.get('toStopSlug').setValue('stop-c');

      // stop-c is read by b->c and a->c - two rows, neither of them the edited pair.
      expect((component as any).affectedPairCount).toBe(2);
      expect((component as any).affectedDestinationName).toBe('Stop C');
    });

    it('reports 0 when nothing else on the route reads that stop, so the notice stays hidden', () => {
      const { component } = makeComponent();
      const segments = [SEGMENT, UNRELATED_PAIR];
      component.allSegments = segments;

      component.open(pivotOf(segments));

      expect((component as any).affectedPairCount).toBe(0);
    });
  });

  describe('field helpers', () => {
    it('isFieldInvalid is false until touched/dirty', () => {
      const { component } = makeComponent();
      component.open(pivotOf([SEGMENT]));
      const form = (component as any).editSegmentForm;

      form.get('fromStopSlug').setValue('');
      expect((component as any).isFieldInvalid('fromStopSlug')).toBeFalse();

      form.get('fromStopSlug').markAsTouched();
      expect((component as any).isFieldInvalid('fromStopSlug')).toBeTrue();
    });

    it('isFareInvalid addresses the control of the given vehicle type', () => {
      const { component } = makeComponent();
      component.allSegments = [SEGMENT, MINIBUS_SEGMENT];
      component.open(pivotOf([SEGMENT, MINIBUS_SEGMENT]));
      const fares = (component as any).editSegmentForm.get('fares');

      fares.get('minibus').setValue('');
      fares.get('minibus').markAsTouched();

      expect((component as any).isFareInvalid('minibus')).toBeTrue();
      expect((component as any).isFareInvalid('van')).toBeFalse();
    });

    it('hasFieldError checks a specific error key on a touched/dirty field', () => {
      const { component } = makeComponent();
      component.open(pivotOf([SEGMENT]));
      const control = (component as any).editSegmentForm.get('toStopSlug');

      control.setErrors({ sameStop: true });
      expect((component as any).hasFieldError('toStopSlug', 'sameStop')).toBeFalse();

      control.markAsTouched();
      expect((component as any).hasFieldError('toStopSlug', 'sameStop')).toBeTrue();
      expect((component as any).hasFieldError('toStopSlug', 'stopOrder')).toBeFalse();
    });
  });

  describe('submitSegmentEdit guards', () => {
    it('does nothing when no pair is selected', async () => {
      const { component, adminApi } = makeComponent();

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
    });

    it('does nothing when routeSlug is empty', async () => {
      const { component, adminApi } = makeComponent();
      component.open(pivotOf([SEGMENT]));
      component.routeSlug = '';

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
    });

    it('marks the form touched and does not submit when a fare is invalid', async () => {
      const { component, adminApi } = makeComponent();
      component.open(pivotOf([SEGMENT]));
      const fareControl = (component as any).editSegmentForm.get('fares.van');
      fareControl.setValue('');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(fareControl.touched).toBeTrue();
    });
  });

  describe('validateSegmentStops (via submit)', () => {
    it('sets a required error when the destination stop is unknown', async () => {
      const { component, adminApi } = makeComponent();
      component.open(pivotOf([SEGMENT]));
      const form = (component as any).editSegmentForm;
      form.get('toStopSlug').setValue('missing-stop');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form.get('toStopSlug').hasError('required')).toBeTrue();
    });

    it('sets a sameStop error when origin and destination match', async () => {
      const { component, adminApi } = makeComponent();
      component.open(pivotOf([SEGMENT]));
      const form = (component as any).editSegmentForm;
      form.get('toStopSlug').setValue('stop-a');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).not.toHaveBeenCalled();
      expect(form.get('toStopSlug').hasError('sameStop')).toBeTrue();
    });

    it('sets a stopOrder error when the destination is not after the origin', async () => {
      const { component, adminApi } = makeComponent();
      component.open(pivotOf([SEGMENT]));
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
      component.open(pivotOf([SEGMENT]));

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

    // AC-2: two fares changed, ONE request. Two requests would let the second be
    // rejected after the first committed, leaving the fare table half-saved.
    it('sends both vehicle types in a single updateSegments call', async () => {
      const { component, adminApi } = makeComponent();
      component.allSegments = [SEGMENT, MINIBUS_SEGMENT];
      component.open(pivotOf([SEGMENT, MINIBUS_SEGMENT]));

      const fares = (component as any).editSegmentForm.get('fares');
      fares.get('van').setValue('111');
      fares.get('minibus').setValue('222');

      await (component as any).submitSegmentEdit();

      expect(adminApi.updateSegments).toHaveBeenCalledTimes(1);
      const payload = adminApi.updateSegments.calls.mostRecent().args[0];
      expect(payload.route).toBe('route-1');
      expect(payload.vehicleTypes.map((block: any) => block.vehicleType)).toEqual([
        'van',
        'minibus',
      ]);
      expect(payload.vehicleTypes[0].stopPairs[0].fare).toBe(111);
      expect(payload.vehicleTypes[1].stopPairs[0].fare).toBe(222);
      // Card scope 3: one block states the duration, the other must not, or the
      // backend answers the duplicate route-level write with a 400.
      expect(payload.vehicleTypes[0].stopPairs[0].estimatedDurationMinutes).toBe(20);
      expect(payload.vehicleTypes[1].stopPairs[0].estimatedDurationMinutes).toBeUndefined();
    });

    // AC-3: the PUT is a full replace per (route, vehicleType), so the value the
    // untouched block carries IS the value that comes back on reload.
    it('re-sends the untouched vehicle type at its existing fare', async () => {
      const { component, adminApi } = makeComponent();
      component.allSegments = [SEGMENT, MINIBUS_SEGMENT];
      component.open(pivotOf([SEGMENT, MINIBUS_SEGMENT]));

      (component as any).editSegmentForm.get('fares.van').setValue('111');

      await (component as any).submitSegmentEdit();

      const payload = adminApi.updateSegments.calls.mostRecent().args[0];
      expect(payload.vehicleTypes[1].vehicleType).toBe('minibus');
      expect(payload.vehicleTypes[1].stopPairs[0].fare).toBe(25);
    });

    // AC-6: no control means no block, so the other type's rows are left alone
    // rather than deleted by a full replace of an empty set.
    it('sends no block for a vehicle type the pair has no row for', async () => {
      const { component, adminApi } = makeComponent();
      const minibusElsewhere: SegmentRow = {
        ...MINIBUS_SEGMENT,
        id: 7,
        fromStopSlug: 'stop-b',
        toStopSlug: 'stop-c',
      };
      component.allSegments = [SEGMENT, minibusElsewhere];
      component.open(pivotOf([SEGMENT, minibusElsewhere]));

      await (component as any).submitSegmentEdit();

      const payload = adminApi.updateSegments.calls.mostRecent().args[0];
      expect(payload.vehicleTypes.map((block: any) => block.vehicleType)).toEqual(['van']);
    });

    // AC-4: a rejected save must leave the dialog open and every fare where it was.
    it('alerts an error, keeps the modal open and touches no fare when the update fails', async () => {
      const { component, adminApi, alert } = makeComponent();
      component.allSegments = [SEGMENT, MINIBUS_SEGMENT];
      component.open(pivotOf([SEGMENT, MINIBUS_SEGMENT]));
      adminApi.updateSegments.and.returnValue(throwError(() => new Error('save failed')));

      const savedSpy = jasmine.createSpy('saved');
      component.saved.subscribe(savedSpy);

      await (component as any).submitSegmentEdit();

      expect(alert.error).toHaveBeenCalledWith('save failed');
      expect((component as any).isOpen).toBeTrue();
      expect((component as any).isSavingSegmentEdit).toBeFalse();
      // The table reads `allSegments`, which only changes on a reload - and the
      // reload is what did not happen.
      expect(component.reloadStructure).not.toHaveBeenCalled();
      expect(component.allSegments.map((segment) => segment.fare)).toEqual([10, 25]);
      expect(savedSpy).not.toHaveBeenCalled();
    });
  });

  describe('closeModal', () => {
    it('does not close while saving', () => {
      const { component } = makeComponent();
      component.open(pivotOf([SEGMENT]));
      (component as any).isSavingSegmentEdit = true;

      (component as any).closeModal();

      expect((component as any).isOpen).toBeTrue();
    });
  });
});

// ── Template-level tests: the rendered controls the card counts ────────────
describe('SegmentEditModalComponent (template)', () => {
  let fixture: ComponentFixture<SegmentEditModalComponent>;
  let component: SegmentEditModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        AdminSharedModule,
      ],
      declarations: [
        SegmentEditModalComponent,
        AdminModalBackdropDirective,
        PendingButtonDirective,
      ],
      providers: [
        {
          provide: AdminApiService,
          useValue: {
            updateSegments: jasmine
              .createSpy('updateSegments')
              .and.returnValue(of({ code: 200, message: 'OK', data: null })),
          },
        },
        {
          provide: AlertService,
          useValue: {
            success: jasmine.createSpy('success').and.resolveTo(undefined),
            error: jasmine.createSpy('error').and.resolveTo(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SegmentEditModalComponent);
    component = fixture.componentInstance;
    component.stops = [STOP_A, STOP_B, STOP_C];
    component.routeSlug = 'route-1';
    component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  });

  function render(segments: SegmentRow[]): void {
    component.allSegments = segments;
    component.open(pivotOf(segments));
    fixture.detectChanges();
  }

  it('renders one fare input per priced vehicle type', () => {
    render([SEGMENT, MINIBUS_SEGMENT]);

    const inputs = fixture.debugElement.queryAll(
      By.css('input[data-testid^="segment-edit-fare-"]')
    );
    expect(inputs.map((input) => input.nativeElement.getAttribute('data-testid'))).toEqual([
      'segment-edit-fare-van',
      'segment-edit-fare-minibus',
    ]);
    expect(inputs.map((input) => input.nativeElement.value)).toEqual(['10.00', '25.00']);
  });

  // AC-5: the duration belongs to the route, not to a vehicle type, so there is
  // exactly one of it however many fare inputs are on screen.
  it('renders exactly one duration control', () => {
    render([SEGMENT, MINIBUS_SEGMENT]);

    const durationInputs = fixture.debugElement.queryAll(
      By.css('input[data-testid="segment-edit-duration"]')
    );
    expect(durationInputs.length).toBe(1);
    expect(durationInputs[0].nativeElement.value).toBe('20');
  });

  // AC-6: never 0.00 - a price of zero reads as "free", not "no row here".
  it('renders the not-set label instead of an input for an unpriced vehicle type', () => {
    const minibusElsewhere: SegmentRow = {
      ...MINIBUS_SEGMENT,
      id: 7,
      fromStopSlug: 'stop-b',
      toStopSlug: 'stop-c',
    };
    render([SEGMENT, minibusElsewhere]);

    expect(
      fixture.debugElement.query(By.css('input[data-testid="segment-edit-fare-minibus"]'))
    ).toBeNull();
    const unset = fixture.debugElement.query(
      By.css('[data-testid="segment-edit-fare-unset-minibus"]')
    );
    expect(unset).toBeTruthy();
    expect(unset.nativeElement.textContent.trim()).toBe('ADMIN.ROUTES.FARE_UNSET');
    expect(unset.nativeElement.textContent).not.toContain('0.00');
  });
});

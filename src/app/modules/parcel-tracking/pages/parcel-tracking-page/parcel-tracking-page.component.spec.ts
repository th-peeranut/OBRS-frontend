import { FormBuilder } from '@angular/forms';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ParcelTrackingPageComponent } from './parcel-tracking-page.component';
import { ParcelTrackingService } from '../../../../services/parcel-tracking/parcel-tracking.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeRouteStub(trackingNumber: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: convertToParamMap(trackingNumber ? { trackingNumber } : {}) },
  } as unknown as ActivatedRoute;
}

function makeComponent(
  trackingService: Partial<ParcelTrackingService>,
  routeTrackingNumber: string | null = null
): ParcelTrackingPageComponent {
  return new ParcelTrackingPageComponent(
    new FormBuilder(),
    makeRouteStub(routeTrackingNumber),
    trackingService as ParcelTrackingService,
    createTranslateStub()
  );
}

describe('ParcelTrackingPageComponent', () => {
  it('should be created', () => {
    const component = makeComponent({ track: () => of({ code: 200, message: 'OK', data: {} as never }) });
    expect(component).toBeTruthy();
  });

  it('starts idle when there is no deep-link tracking number', () => {
    const component = makeComponent({ track: jasmine.createSpy() as never });
    component.ngOnInit();
    expect(component['contentState']).toBe('idle');
  });

  it('auto-runs the lookup for a deep-linked tracking number', () => {
    const trackSpy = jasmine
      .createSpy('track')
      .and.returnValue(of({ code: 200, message: 'OK', data: { trackingNumber: 'PCL-1', deliveryStatus: 'accepted', recipientNameMasked: 'S***i' } }));
    const component = makeComponent({ track: trackSpy as never }, 'PCL-1');

    component.ngOnInit();

    expect(trackSpy).toHaveBeenCalledWith('PCL-1');
    expect(component['contentState']).toBe('found');
    expect(component['result']?.trackingNumber).toBe('PCL-1');
  });

  it('does not submit an empty tracking number', () => {
    const trackSpy = jasmine.createSpy('track');
    const component = makeComponent({ track: trackSpy as never });
    component['onSubmit']();
    expect(trackSpy).not.toHaveBeenCalled();
    expect(component['contentState']).toBe('idle');
  });

  it('shows a neutral not-found state on 404 (no distinction from any other failure)', () => {
    const trackSpy = jasmine.createSpy('track').and.returnValue(throwError(() => ({ status: 404 })));
    const component = makeComponent({ track: trackSpy as never });
    component['form'].patchValue({ trackingNumber: 'unknown' });

    component['onSubmit']();

    expect(component['contentState']).toBe('not-found');
    expect(component['result']).toBeNull();
  });

  it('renders the status chip/label for a found result', () => {
    const component = makeComponent({ track: () => of({ code: 200, message: 'OK', data: {} as never }) });
    expect(component['chipFor']('collected').token).toBe('is-success');
  });

  // OBRS-415/UX §8: `created` renders the CUSTOMER copy (PARCEL_TRACKING.STATUS.CREATED),
  // never the driver copy `chipFor().i18nKey` would give — the exact OBRS-427 mistake.
  it('renders the customer-facing label for "created", not the driver copy', () => {
    const component = makeComponent({ track: () => of({ code: 200, message: 'OK', data: {} as never }) });
    expect(component['statusLabelKey']('created')).toBe('PARCEL_TRACKING.STATUS.CREATED');
    expect(component['statusLabelKey']('created')).not.toBe(component['chipFor']('created').i18nKey);
  });

  it('falls through to the shared chip i18n key for every other status', () => {
    const component = makeComponent({ track: () => of({ code: 200, message: 'OK', data: {} as never }) });
    expect(component['statusLabelKey']('collected')).toBe(component['chipFor']('collected').i18nKey);
  });

  it('cleans up on destroy without throwing', () => {
    const component = makeComponent({ track: () => of({ code: 200, message: 'OK', data: {} as never }) });
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

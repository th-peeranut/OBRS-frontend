import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
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

  it('OBRS-1561: a deep link padded with whitespace is trimmed before it reaches the field or the API', () => {
    const trackSpy = jasmine
      .createSpy('track')
      .and.returnValue(of({ code: 200, message: 'OK', data: { trackingNumber: 'P-ABCDEFGHIJ', deliveryStatus: 'accepted', recipientNameMasked: 'S***i' } }));
    const component = makeComponent({ track: trackSpy as never }, '  P-ABCDEFGHIJ  ');

    component.ngOnInit();

    expect(component['form'].value.trackingNumber).toBe('P-ABCDEFGHIJ');
    expect(trackSpy).toHaveBeenCalledWith('P-ABCDEFGHIJ');
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

  // OBRS-427: EVERY status gets its own PARCEL_TRACKING.STATUS.* key — the customer
  // surface must never fall through to chipFor()'s STAFF/driver copy for any status.
  it('renders the customer namespace for every other status too, never the STAFF copy', () => {
    const component = makeComponent({ track: () => of({ code: 200, message: 'OK', data: {} as never }) });
    expect(component['statusLabelKey']('collected')).toBe('PARCEL_TRACKING.STATUS.COLLECTED');
    expect(component['statusLabelKey']('collected')).not.toBe(component['chipFor']('collected').i18nKey);
  });

  it('cleans up on destroy without throwing', () => {
    const component = makeComponent({ track: () => of({ code: 200, message: 'OK', data: {} as never }) });
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

// OBRS-1353: the drop-off proof reaches the sender HERE or nowhere — this is the
// only surface a cash walk-in can open. Rendered through TestBed because both
// claims are about the DOM: the photo shows when there is one, and nothing shows
// (no empty frame, no broken alt) when there is not.
describe('ParcelTrackingPageComponent — drop-off proof (OBRS-1353)', () => {
  const PHOTO = 'https://supabase.example/storage/v1/object/public/parcels/1/proof.jpg';

  function renderWith(data: Record<string, unknown>): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [ParcelTrackingPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: makeRouteStub('PCL-1') },
        {
          provide: ParcelTrackingService,
          useValue: { track: () => of({ code: 200, message: 'OK', data }) },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    const fixture = TestBed.createComponent(ParcelTrackingPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const found = {
    trackingNumber: 'PCL-1',
    deliveryStatus: 'left_at_stop',
    recipientNameMasked: 'S***i',
  };

  it('renders the photo and the left-at-stop time once the parcel has been left', () => {
    const el = renderWith({ ...found, leftAtStopPhotoUrl: PHOTO, leftAtStopAt: '2026-08-14T10:15:30+07:00' });

    const img = el.querySelector('.parcel-tracking-proof img') as HTMLImageElement | null;
    expect(img).withContext('the proof photo should be rendered').toBeTruthy();
    expect(img?.getAttribute('src')).toBe(PHOTO);
  });

  it('renders no proof figure at all when the parcel has not been left at a stop', () => {
    const el = renderWith(found);

    expect(el.querySelector('.parcel-tracking-proof')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ParcelTrackingService } from './parcel-tracking.service';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_LOGOUT } from '../../shared/interceptors/http-context-tokens';

describe('ParcelTrackingService', () => {
  let service: ParcelTrackingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ParcelTrackingService],
    });
    service = TestBed.inject(ParcelTrackingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('track() gets the public tracking endpoint (no /api/private segment)', () => {
    service.track('PCL-ABC123').subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/parcels/track/PCL-ABC123`);
    expect(req.request.method).toBe('GET');
    req.flush({
      code: 200,
      message: 'OK',
      data: {
        trackingNumber: 'PCL-ABC123',
        deliveryStatus: 'accepted',
        pickupStop: 'Bangkok',
        dropoffStop: 'Chiang Mai',
        recipientNameMasked: 'S***i',
      },
    });
  });

  // OBRS-305 scrutinize note: SKIP_AUTH_LOGOUT must be set so an expired
  // token carried by a logged-in staff member browsing this public page
  // never force-logs them out.
  it('track() sets SKIP_AUTH_LOGOUT so an expired token never force-logs the viewer out', () => {
    service.track('unknown').subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/parcels/track/unknown`);
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
    req.flush({ errorCode: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
  });

  it('track() URL-encodes the tracking number', () => {
    service.track('PCL/123 456').subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/api/parcels/track/${encodeURIComponent('PCL/123 456')}`
    );
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: {} });
  });
});

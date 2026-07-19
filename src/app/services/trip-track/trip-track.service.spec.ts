import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TripTrackService } from './trip-track.service';
import { environment } from '../../../environments/environment';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

describe('TripTrackService', () => {
  let service: TripTrackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TripTrackService],
    });
    service = TestBed.inject(TripTrackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getVehiclePosition() GETs the correct ticket-scoped endpoint', () => {
    service.getVehiclePosition(4321).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/4321/vehicle-position`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { state: 'LIVE', lat: 1, lon: 1, recordedAt: null, stale: false, windowOpensAt: null } });
  });

  // U19 (SPEC-OBRS-426 BR-19): a 60s poll must never raise a modal or flash
  // the global loader, but a genuine 401 must still force-logout — verified
  // here at the layer that actually sets the HttpContext, since a
  // component-level test with a stubbed service can't see the real context.
  it('U19: sets SKIP_GLOBAL_ERROR_ALERT and SKIP_GLOBAL_LOADING_ALERT, and does NOT set SKIP_AUTH_LOGOUT', () => {
    service.getVehiclePosition(1).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/tickets/1/vehicle-position`);
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    // Default token value (false) = a 401 DOES force logout — the token must
    // never be flipped true here, or a real expired session on this poll
    // would sit logged-out-but-looking-fine (OBRS-187).
    expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: { state: 'CLOSED', lat: null, lon: null, recordedAt: null, stale: true, windowOpensAt: null } });
  });
});

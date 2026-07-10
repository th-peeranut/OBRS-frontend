import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TicketService } from './ticket.service';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_LOGOUT } from '../../shared/interceptors/http-context-tokens';

describe('TicketService', () => {
  let service: TicketService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TicketService],
    });
    service = TestBed.inject(TicketService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getBoardingToken', () => {
    it('issues a GET to /api/private/tickets/{id}/boarding-token', () => {
      service.getBoardingToken(42).subscribe();

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/tickets/42/boarding-token`
      );
      expect(req.request.method).toBe('GET');

      req.flush({
        code: 200,
        message: 'OK',
        data: {
          ticketId: 42,
          ticketNumber: 'T-ABC123',
          boardingToken: 'signed.jwt.token',
          expiresAt: '2026-07-20T00:00:00Z',
        },
      });
    });

    it('resolves the boardingToken payload used to render the QR', () => {
      let boardingToken: string | undefined;
      service.getBoardingToken(42).subscribe((response) => {
        boardingToken = response.data?.boardingToken;
      });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/tickets/42/boarding-token`
      );
      req.flush({
        code: 200,
        message: 'OK',
        data: {
          ticketId: 42,
          ticketNumber: 'T-ABC123',
          boardingToken: 'signed.jwt.token',
          expiresAt: '2026-07-20T00:00:00Z',
        },
      });

      expect(boardingToken).toBe('signed.jwt.token');
    });

    it('does not set SKIP_AUTH_LOGOUT — a 401 here should force-logout like any authenticated customer call', () => {
      service.getBoardingToken(42).subscribe({ next: () => undefined, error: () => undefined });

      const req = httpMock.expectOne(
        `${environment.apiUrl}/api/private/tickets/42/boarding-token`
      );
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeFalse();
      req.flush({ errorCode: 'GENERIC' }, { status: 401, statusText: 'Unauthorized' });
    });
  });
});

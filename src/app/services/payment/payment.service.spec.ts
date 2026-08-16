import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { PaymentService } from './payment.service';
import { AuthService } from '../../auth/auth.service';
import { BookingService } from '../booking/booking.service';
import { PaymentPayload } from '../../shared/interfaces/payment.interface';
import { environment } from '../../../environments/environment';

/**
 * OBRS-858 (ADR-0123 Decision 6) — pins WHICH payment endpoint a caller reaches, and what it
 * carries.
 *
 * Both directions are asserted, because only one of them is load-bearing on its own. A test that
 * checked only the guest branch would still pass if someone "simplified" this to always use the
 * public endpoint — and that change would silently move every signed-in customer onto a public
 * door that exists for callers the server cannot identify.
 */
describe('PaymentService — guest vs signed-in payment endpoint (OBRS-858)', () => {
  const PAYLOAD = {
    bookingId: 42,
    paymentMethod: 'card',
    amount: 200,
  } as unknown as PaymentPayload;

  let service: PaymentService;
  let httpMock: HttpTestingController;
  let authStub: { isAuthenticated: () => boolean };
  let bookingStub: { getGuestPaymentToken: () => string | null };

  beforeEach(() => {
    authStub = { isAuthenticated: () => true };
    bookingStub = { getGuestPaymentToken: () => null };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PaymentService,
        { provide: AuthService, useValue: authStub },
        { provide: BookingService, useValue: bookingStub },
      ],
    });

    service = TestBed.inject(PaymentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('a GUEST holding a booking token pays through the PUBLIC endpoint, token in the header', () => {
    authStub.isAuthenticated = () => false;
    bookingStub.getGuestPaymentToken = () => 'signed.booking.token';

    service.createPayment(PAYLOAD).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/payments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Guest-Payment-Token')).toBe(
      'signed.booking.token'
    );
    // The idempotency key is not optional on this path either — the server requires it, and a
    // missing one would surface as a 400 no user could act on.
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    req.flush({ code: 200, message: 'OK', data: {} });
  });

  it('a SIGNED-IN customer keeps the private endpoint, and sends no guest token', () => {
    authStub.isAuthenticated = () => true;
    // Even with a stale token lying in storage: being signed in is what decides, so a leftover
    // from an earlier guest booking can never redirect an account holder onto the public door.
    bookingStub.getGuestPaymentToken = () => 'stale.token.from.before.login';

    service.createPayment(PAYLOAD).subscribe();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/api/private/payments`
    );
    expect(req.request.headers.has('X-Guest-Payment-Token')).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: {} });
  });

  it('a guest with NO token still goes to the private endpoint rather than sending an empty header', () => {
    authStub.isAuthenticated = () => false;
    bookingStub.getGuestPaymentToken = () => null;

    service.createPayment(PAYLOAD).subscribe();

    // A 401 from the private endpoint is the honest outcome here: there is genuinely no
    // credential of either kind. Sending an empty X-Guest-Payment-Token instead would turn that
    // into a confusing "we could not verify this payment request" for a state that is really
    // "you have nothing to pay with".
    const req = httpMock.expectOne(
      `${environment.apiUrl}/api/private/payments`
    );
    expect(req.request.headers.has('X-Guest-Payment-Token')).toBeFalse();
    req.flush({ code: 200, message: 'OK', data: {} });
  });

  /**
   * OBRS-1379. The QR image is a second call on the same two lanes, and it gets the lane from
   * the path the server put in `qrImageUrl` rather than deciding again — deciding twice is how
   * the two answers drift apart. What still has to be decided here is the credential: the guest
   * lane's endpoint reads a header, and an image request that forgets it is a QR that never
   * loads for exactly the customers this flow exists for.
   */
  it('the guest QR path carries the booking token; the private one carries none', () => {
    authStub.isAuthenticated = () => false;
    bookingStub.getGuestPaymentToken = () => 'signed.booking.token';

    service.getQrImage('/api/payments/7/qr').subscribe();

    const guestReq = httpMock.expectOne(`${environment.apiUrl}/api/payments/7/qr`);
    expect(guestReq.request.method).toBe('GET');
    expect(guestReq.request.responseType).toBe('blob');
    expect(guestReq.request.headers.get('X-Guest-Payment-Token')).toBe('signed.booking.token');
    guestReq.flush(new Blob(['<svg/>'], { type: 'image/svg+xml' }));

    service.getQrImage('/api/private/payments/7/qr').subscribe();

    const privateReq = httpMock.expectOne(`${environment.apiUrl}/api/private/payments/7/qr`);
    expect(privateReq.request.headers.has('X-Guest-Payment-Token')).toBeFalse();
    privateReq.flush(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ParcelBookingService } from './parcel-booking.service';
import { ParcelOnlineReqDto } from '../../shared/interfaces/parcel.interface';

describe('ParcelBookingService', () => {
  let service: ParcelBookingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(ParcelBookingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getMyProfile hits GET /api/private/users/me', () => {
    service.getMyProfile().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/users/me`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: {} });
  });

  it('getParcelQuote adds parcelType=consigned and forwards the other params', () => {
    service
      .getParcelQuote({ scheduleId: 1, pickupStopId: 2, dropoffStopId: 3, weightKg: 4.5 })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === `${environment.apiUrl}/api/private/parcels/quote`
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('parcelType')).toBe('consigned');
    expect(req.request.params.get('scheduleId')).toBe('1');
    expect(req.request.params.get('pickupStopId')).toBe('2');
    expect(req.request.params.get('dropoffStopId')).toBe('3');
    expect(req.request.params.get('weightKg')).toBe('4.5');
    req.flush({
      code: 200,
      message: 'OK',
      data: { amount: 100, farePerUnit: 100, unitCount: 1, weightTierMultiplier: 1 },
    });
  });

  it('createOnlineParcelBooking POSTs to /api/private/parcels/online with the exact payload', () => {
    const payload: ParcelOnlineReqDto = {
      scheduleId: 1,
      pickupStopId: 2,
      dropoffStopId: 3,
      weightKg: 4.5,
      description: 'a box',
      prohibitedAcknowledged: true,
      senderPhone: '0812345678',
      recipient: { name: 'Somchai', phone: '0898765432' },
    };

    service.createOnlineParcelBooking(payload).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/private/parcels/online`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({
      code: 201,
      message: 'Created',
      data: {
        parcelId: 1,
        trackingNumber: 'PCL1',
        bookingId: 1,
        bookingNumber: 'BK1',
        amount: 100,
        deliveryStatus: 'created',
        collectionCode: null,
        recipientName: 'Somchai',
        waybillUrl: null,
      },
    });
  });

  // ParcelController#getMyParcels(Pageable) takes ONLY page/size/sort — a
  // `status` param would be silently dropped by Spring's binder, never
  // filtered on, so this call sends page/size only (Scrutinize finding).
  it('getMyParcels sends only page/size — never a status param', () => {
    service.getMyParcels(0, 20).subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === `${environment.apiUrl}/api/private/parcels/me`
    );
    expect(req.request.params.get('status')).toBeNull();
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({
      code: 200,
      message: 'OK',
      data: { content: [], totalElements: 0, totalPages: 0, size: 20, number: 0, numberOfElements: 0 },
    });
  });
});

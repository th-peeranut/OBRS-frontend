import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import QRCode from 'qrcode';
import { ParcelWaybillPageComponent } from './parcel-waybill-page.component';
import { StaffApiService } from '../../../../services/staff/staff-api.service';

const SAMPLE_WAYBILL = {
  trackingNumber: 'PCL-1',
  sender: { name: 'Somchai', phone: '0812345678' },
  recipient: { name: 'Somsri', phone: '0898765432' },
  pickupStop: { name: 'Bangkok' },
  dropoffStop: { name: 'Chiang Mai' },
  weightKg: 5,
  amount: 100,
  departureAt: '14 Jul 2026 08:00',
  collectionToken: 'signed-collection-token',
};

function makeRouteStub(id: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: convertToParamMap(id ? { id } : {}) },
  } as unknown as ActivatedRoute;
}

describe('ParcelWaybillPageComponent (constructed directly — load/QR logic)', () => {
  it('should be created', () => {
    const staffApi = { getWaybill: () => of({ code: 200, message: 'OK', data: null }) } as unknown as StaffApiService;
    const component = new ParcelWaybillPageComponent(makeRouteStub('1'), staffApi, {} as never);
    expect(component).toBeTruthy();
  });

  it('shows an error state when the route has no id param', () => {
    const staffApi = { getWaybill: () => of({ code: 200, message: 'OK', data: null }) } as unknown as StaffApiService;
    const component = new ParcelWaybillPageComponent(makeRouteStub(null), staffApi, {} as never);
    component.ngOnInit();
    expect(component['hasError']).toBeTrue();
    expect(component['isLoading']).toBeFalse();
  });

  it('loads the waybill and renders a QR for the collectionToken', async () => {
    const qrSpy = spyOn(QRCode, 'toDataURL').and.callThrough() as unknown as jasmine.Spy;
    const staffApi = {
      getWaybill: jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: SAMPLE_WAYBILL })),
    } as unknown as StaffApiService;
    const component = new ParcelWaybillPageComponent(makeRouteStub('1'), staffApi, {} as never);

    component.ngOnInit();
    expect((staffApi.getWaybill as jasmine.Spy)).toHaveBeenCalledWith(1);
    expect(component['waybill']).toEqual(SAMPLE_WAYBILL as never);
    expect(component['isLoading']).toBeFalse();
    expect(component['hasError']).toBeFalse();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(qrSpy).toHaveBeenCalledWith(
      'signed-collection-token',
      jasmine.objectContaining({ width: 140, margin: 1, errorCorrectionLevel: 'M' })
    );
    expect(component['qrDataUrl']).toContain('data:image');
  });

  it('sets hasError on a failed fetch', () => {
    const staffApi = { getWaybill: () => throwError(() => new Error('boom')) } as unknown as StaffApiService;
    const component = new ParcelWaybillPageComponent(makeRouteStub('1'), staffApi, {} as never);
    component.ngOnInit();
    expect(component['hasError']).toBeTrue();
    expect(component['isLoading']).toBeFalse();
  });

  it('cleans up on destroy without throwing (no portal open)', () => {
    const staffApi = { getWaybill: () => of({ code: 200, message: 'OK', data: SAMPLE_WAYBILL }) } as unknown as StaffApiService;
    const component = new ParcelWaybillPageComponent(makeRouteStub('1'), staffApi, {} as never);
    component.ngOnInit();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

// OBRS-305 / ADR 0015: mirrors BoardingListComponent's own printManifest()
// portal-lifecycle suite — the CDK Portal round-trip needs a REAL
// ViewContainerRef + a REAL #printTemplate resolved by Angular's view-init,
// so (unlike the block above) this renders the component via TestBed.
describe('ParcelWaybillPageComponent — printWaybill() portal lifecycle (CDK Portal, ADR 0015)', () => {
  let fixture: ComponentFixture<ParcelWaybillPageComponent>;
  let component: ParcelWaybillPageComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [ParcelWaybillPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: makeRouteStub('1') },
        {
          provide: StaffApiService,
          useValue: { getWaybill: () => of({ code: 200, message: 'OK', data: SAMPLE_WAYBILL }) },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ParcelWaybillPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // resolves the static #printTemplate ViewChild and calls ngOnInit
  });

  afterEach(() => {
    document.querySelectorAll('.parcel-waybill-print-portal').forEach((el) => el.remove());
    document.body.classList.remove('parcel-waybill-printing');
  });

  it('teleports a document.body child carrying the marker class and defers window.print()', () => {
    const printSpy = spyOn(window, 'print');

    component['printWaybill']();

    const host = document.querySelector('.parcel-waybill-print-portal');
    expect(host).withContext('portal host should be appended to document.body').toBeTruthy();
    expect(host?.parentElement).toBe(document.body);
    expect(document.body.classList.contains('parcel-waybill-printing')).toBe(true);
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('afterprint tears the portal down (idempotent — no leaked listener/body node)', (done) => {
    spyOn(window, 'print');
    component['printWaybill']();
    expect(document.querySelector('.parcel-waybill-print-portal')).toBeTruthy();

    window.dispatchEvent(new Event('afterprint'));

    setTimeout(() => {
      expect(document.querySelector('.parcel-waybill-print-portal')).toBeFalsy();
      expect(document.body.classList.contains('parcel-waybill-printing')).toBeFalse();
      done();
    });
  });

  it('ngOnDestroy disposes a still-open portal (navigating away mid print-dialog must not leak a body node)', () => {
    spyOn(window, 'print');
    component['printWaybill']();
    expect(document.querySelector('.parcel-waybill-print-portal')).toBeTruthy();

    fixture.destroy();

    expect(document.querySelector('.parcel-waybill-print-portal')).toBeFalsy();
  });

  it('printWaybill() is safe to call again while already open — never leaks a second host', () => {
    spyOn(window, 'print');
    component['printWaybill']();
    component['printWaybill']();

    expect(document.querySelectorAll('.parcel-waybill-print-portal').length).toBe(1);
  });
});

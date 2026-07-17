import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ParcelBookingSuccessPageComponent } from './parcel-booking-success-page.component';
import { stashParcelBookingAmount } from '../../parcel-booking-amount-session';

describe('ParcelBookingSuccessPageComponent', () => {
  let component: ParcelBookingSuccessPageComponent;
  let fixture: ComponentFixture<ParcelBookingSuccessPageComponent>;

  function setup(trackingNumber: string): void {
    TestBed.configureTestingModule({
      declarations: [ParcelBookingSuccessPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ trackingNumber }) } },
        },
      ],
    })
      .overrideComponent(ParcelBookingSuccessPageComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(ParcelBookingSuccessPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => sessionStorage.clear());

  it('reads the tracking number from the route', () => {
    setup('PCL123');
    expect((component as any).trackingNumber).toBe('PCL123');
  });

  it('reads a stashed amount when present', () => {
    stashParcelBookingAmount('PCL123', 150);
    setup('PCL123');
    expect((component as any).amountPaid).toBe(150);
  });

  it('leaves amountPaid null when nothing was stashed (cross-device deep link)', () => {
    setup('PCL999');
    expect((component as any).amountPaid).toBeNull();
  });

  it('resolves the created status chip (never promises a collection code)', () => {
    setup('PCL123');
    expect((component as any).createdStatus.token).toBe('is-neutral');
  });
});

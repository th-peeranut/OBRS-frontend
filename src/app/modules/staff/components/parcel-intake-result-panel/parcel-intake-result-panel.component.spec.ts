import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ParcelIntakeResultPanelComponent } from './parcel-intake-result-panel.component';
import { ParcelCarryOnRespDto, ParcelConsignedRespDto } from '../../../../shared/interfaces/parcel.interface';

describe('ParcelIntakeResultPanelComponent', () => {
  it('should be created', () => {
    const component = new ParcelIntakeResultPanelComponent();
    expect(component).toBeTruthy();
  });

  it('defaults result to null', () => {
    const component = new ParcelIntakeResultPanelComponent();
    expect(component.result).toBeNull();
  });

  it('accepts an assigned result', () => {
    const component = new ParcelIntakeResultPanelComponent();
    component.result = {
      parcelId: 1,
      trackingNumber: 'PCL-1',
      bookingId: 10,
      bookingNumber: 'BK-1',
      amount: 100,
      deliveryStatus: 'accepted',
      collectionCode: 'ABC123',
      waybillUrl: '/staff/parcels/1/waybill',
    };
    expect(component.result.trackingNumber).toBe('PCL-1');
  });

  // OBRS-341 — the SAME component now also renders the carry-on-on-seat
  // response shape (design-system §10: extend, don't fork).
  describe('isCarryOnResult() — the consigned/carry-on discriminant', () => {
    it('returns false for a consigned result (no parcelType field at all)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      const consigned = {
        parcelId: 1,
        trackingNumber: 'PCL-1',
        bookingId: 10,
        bookingNumber: 'BK-1',
        amount: 100,
        deliveryStatus: 'accepted',
        collectionCode: 'ABC123',
        waybillUrl: '/staff/parcels/1/waybill',
      };
      expect(component['isCarryOnResult'](consigned)).toBeFalse();
    });

    it('returns true for a carry-on-on-seat result (parcelType === carry_on_seat)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      const carryOn = {
        parcelId: 5,
        trackingNumber: 'P-AB12CD34EF',
        bookingId: 91,
        bookingNumber: 'B-000091',
        parcelType: 'carry_on_seat' as const,
        freeAisle: false,
        seatCount: 1,
        seatNumbers: ['A1'],
        amount: 150,
        bookingNetAmount: 150,
      };
      expect(component['isCarryOnResult'](carryOn)).toBeTrue();
    });

    it('returns true for a free-aisle carry-on result (freeAisle: true, seats null)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      const freeAisle = {
        parcelId: 6,
        trackingNumber: 'P-FREE1',
        bookingId: 92,
        bookingNumber: 'B-000092',
        parcelType: 'carry_on_seat' as const,
        freeAisle: true,
        seatCount: null,
        seatNumbers: null,
        amount: 0,
        bookingNetAmount: 0,
      };
      expect(component['isCarryOnResult'](freeAisle)).toBeTrue();
    });
  });

  // ---------------------------------------------------------------------------
  // OBRS-341 (card AC follow-up) — pay cash / next item
  // ---------------------------------------------------------------------------

  const consignedResult: ParcelConsignedRespDto = {
    parcelId: 1,
    trackingNumber: 'PCL-1',
    bookingId: 10,
    bookingNumber: 'BK-1',
    amount: 100,
    deliveryStatus: 'accepted',
    collectionCode: 'ABC123',
    waybillUrl: '/staff/parcels/1/waybill',
  };

  const freeAisleResult: ParcelCarryOnRespDto = {
    parcelId: 6,
    trackingNumber: 'P-FREE1',
    bookingId: 92,
    bookingNumber: 'B-000092',
    parcelType: 'carry_on_seat',
    freeAisle: true,
    seatCount: null,
    seatNumbers: null,
    amount: 0,
    bookingNetAmount: 0,
  };

  const onSeatResult: ParcelCarryOnRespDto = {
    parcelId: 5,
    trackingNumber: 'P-AB12CD34EF',
    bookingId: 91,
    bookingNumber: 'B-000091',
    parcelType: 'carry_on_seat',
    freeAisle: false,
    seatCount: 1,
    seatNumbers: ['A1'],
    amount: 150,
    bookingNetAmount: 150,
  };

  describe('isNextItemPrimary — exactly one primary action per result state', () => {
    it('is false for a consigned result ("View waybill" is primary)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      component.result = consignedResult;
      expect(component['isNextItemPrimary']).toBeFalse();
    });

    it('is true for a free-aisle carry-on result (no other action exists)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      component.result = freeAisleResult;
      expect(component['isNextItemPrimary']).toBeTrue();
    });

    it('is false for an on-seat UNPAID result ("เก็บเงินสด" is primary)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      component.result = onSeatResult;
      component.carryOnPaid = false;
      expect(component['isNextItemPrimary']).toBeFalse();
    });

    it('is true for an on-seat PAID result (pay button is gone)', () => {
      const component = new ParcelIntakeResultPanelComponent();
      component.result = onSeatResult;
      component.carryOnPaid = true;
      expect(component['isNextItemPrimary']).toBeTrue();
    });
  });

  describe('DOM rendering — pay action visibility and next-item wiring', () => {
    let fixture: ComponentFixture<ParcelIntakeResultPanelComponent>;
    let component: ParcelIntakeResultPanelComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), RouterTestingModule],
        declarations: [ParcelIntakeResultPanelComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(ParcelIntakeResultPanelComponent);
      component = fixture.componentInstance;
    });

    function payButton(): HTMLButtonElement | null {
      return fixture.nativeElement.querySelector('[data-testid="parcel-carryon-pay-cash"]');
    }

    function nextItemButton(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('[data-testid="parcel-intake-next-item"]');
    }

    function paidNote(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="parcel-carryon-paid-note"]');
    }

    it('free-aisle: renders NO pay button and NO paid note at all (nothing to collect)', () => {
      component.result = freeAisleResult;
      fixture.detectChanges();

      expect(payButton()).toBeNull();
      expect(paidNote()).toBeNull();
    });

    it('on-seat, unpaid: renders the pay button, enabled', () => {
      component.result = onSeatResult;
      component.carryOnPaid = false;
      component.isPayingCarryOn = false;
      fixture.detectChanges();

      const btn = payButton();
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBeFalse();
    });

    it('on-seat, payment in flight: the pay button is DISABLED', () => {
      component.result = onSeatResult;
      component.carryOnPaid = false;
      component.isPayingCarryOn = true;
      fixture.detectChanges();

      expect(payButton()?.disabled).toBeTrue();
    });

    it('on-seat, paid: the pay button is GONE (not reachable again) and the paid note shows', () => {
      component.result = onSeatResult;
      component.carryOnPaid = true;
      fixture.detectChanges();

      expect(payButton()).toBeNull();
      expect(paidNote()).not.toBeNull();
    });

    it('clicking the pay button emits payCash', () => {
      component.result = onSeatResult;
      component.carryOnPaid = false;
      fixture.detectChanges();
      const spy = spyOn(component.payCash, 'emit');

      payButton()?.click();

      expect(spy).toHaveBeenCalled();
    });

    it('the next-item button is always present and clicking it emits nextItem', () => {
      component.result = onSeatResult;
      fixture.detectChanges();
      const spy = spyOn(component.nextItem, 'emit');

      nextItemButton().click();

      expect(spy).toHaveBeenCalled();
    });

    it('renders a real DOM check for isNextItemPrimary via the admin-btn-primary class', () => {
      component.result = freeAisleResult; // next-item IS the only action here
      fixture.detectChanges();

      expect(nextItemButton().classList.contains('admin-btn-primary')).toBeTrue();
    });
  });

  describe('DOM rendering', () => {
    let fixture: ComponentFixture<ParcelIntakeResultPanelComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), RouterTestingModule],
        declarations: [ParcelIntakeResultPanelComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(ParcelIntakeResultPanelComponent);
    });

    it('renders no button/link at all when result is null', () => {
      fixture.componentInstance.result = null;
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.parcel-intake-result'))).toBeNull();
    });
  });
});

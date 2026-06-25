import { of } from 'rxjs';
import { FormBuilder } from '@angular/forms';
import { WalkInCheckoutComponent } from './walk-in-checkout.component';
import {
  RouteSegmentsDto,
  SegmentStopPairDto,
  WalkInTripDto,
} from '../../../../services/staff/staff-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeTrip(overrides: Partial<WalkInTripDto> = {}): WalkInTripDto {
  return {
    scheduleId: 1,
    vehicleType: 'bus',
    licensePlate: 'AB-1234',
    driverName: 'John',
    departureDateTime: '2026-07-01T08:00:00',
    arrivalDateTime: '2026-07-01T12:00:00',
    pricePerSeat: '300',
    capacity: 21,
    availableCount: 15,
    reservedUnpaidCount: 3,
    soldPaidCount: 3,
    availableSeatNumbers: ['1', '2', '3', '4', '5'],
    ...overrides,
  };
}

function pair(from: string, to: string, fare: string, vt = 'bus'): SegmentStopPairDto {
  return {
    segmentId: 0,
    fromStop: { slug: from, name: from.toUpperCase() },
    toStop: { slug: to, name: to.toUpperCase() },
    vehicleType: { slug: vt, name: vt },
    fare,
    estimatedDurationMinutes: 60,
  };
}

// A 3-stop route a → b → c (bus). Full route a→c = 300; a→b = 100; b→c = 200.
const SEGMENTS: RouteSegmentsDto = {
  route: { slug: 'route-x', name: 'Route X' },
  stopPairs: [
    pair('a', 'b', '100'),
    pair('a', 'c', '300'),
    pair('b', 'c', '200'),
    // a 'van' pair that must be filtered out for a bus trip:
    pair('a', 'c', '999', 'van'),
  ],
};

function createStaffApiStub(segments: RouteSegmentsDto = SEGMENTS): any {
  return {
    getRouteSegments: jasmine
      .createSpy('getRouteSegments')
      .and.returnValue(of({ data: segments })),
  };
}

function makeComponent(staffApi = createStaffApiStub()): WalkInCheckoutComponent {
  const fb = new FormBuilder();
  return new WalkInCheckoutComponent(fb, createTranslateStub(), staffApi);
}

/** Load the route segments into the component as the template binding would. */
function loadRoute(comp: WalkInCheckoutComponent, trip = makeTrip()): void {
  comp.selectedTrip = trip;
  comp.routeSlug = 'route-x';
  comp.ngOnChanges({
    routeSlug: { currentValue: 'route-x', previousValue: null, firstChange: true, isFirstChange: () => true },
  });
}

function fillValidContact(comp: WalkInCheckoutComponent): void {
  comp['contactForm'].setValue({
    title: 'Mr.',
    firstName: 'Somchai',
    lastName: 'Rakdee',
    phoneNumber: '0812345678',
    identityCardNumber: '',
    email: 'somchai@example.com',
  });
}

describe('WalkInCheckoutComponent', () => {
  it('should create', () => {
    expect(makeComponent()).toBeTruthy();
  });

  describe('segment loading & pickup/drop-off', () => {
    it('defaults to the full route (origin → destination) with the full-route fare', () => {
      const comp = makeComponent();
      loadRoute(comp);
      expect(comp['pickupSlug']).toBe('a');
      expect(comp['dropoffSlug']).toBe('c');
      expect((comp as any).segmentFare).toBe(300);
    });

    it('orders stops origin → destination and offers all but the last as pickups', () => {
      const comp = makeComponent();
      loadRoute(comp);
      expect((comp as any).orderedStops.map((s: any) => s.slug)).toEqual(['a', 'b', 'c']);
      expect((comp as any).pickupOptions.map((s: any) => s.slug)).toEqual(['a', 'b']);
    });

    it('filters stop pairs to the trip vehicle type (ignores the van fare)', () => {
      const comp = makeComponent();
      loadRoute(comp, makeTrip({ vehicleType: 'bus' }));
      // a→c bus fare is 300, not the 999 van fare
      expect((comp as any).segmentFare).toBe(300);
    });

    it('limits drop-off options to stops downstream of the chosen pickup', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp['pickupSlug'] = 'b';
      (comp as any).onPickupChange();
      expect((comp as any).dropoffOptions.map((s: any) => s.slug)).toEqual(['c']);
      expect(comp['dropoffSlug']).toBe('c');
      expect((comp as any).segmentFare).toBe(200);
    });
  });

  describe('canSell gating', () => {
    it('returns false when form is invalid', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when email is missing (required for walk-in)', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      comp['contactForm'].patchValue({
        title: 'Mr.', firstName: 'A', lastName: 'B', phoneNumber: '0812345678', email: '',
      });
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when no seats selected', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = [];
      comp['cashReceived'] = 300;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when cashReceived < totalAmount', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 200; // total is 300
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when no valid segment is selected (no route loaded)', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 0;
      fillValidContact(comp);
      expect((comp as any).segmentFare).toBeNull();
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns true when all conditions are met', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeTrue();
    });

    it('returns true when cashReceived > totalAmount (change due)', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 500;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeTrue();
    });
  });

  describe('total & change due', () => {
    it('multiplies the segment fare by the seat count', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1', 'B2']; // 2 * 300
      expect((comp as any).totalAmount).toBe(600);
    });

    it('change is positive when cash > total', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 500;
      expect((comp as any).changeDue).toBe(200);
    });

    it('change is zero when cash equals total', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      expect((comp as any).changeDue).toBe(0);
    });
  });

  describe('sell payload', () => {
    it('emits fromStop, toStop, segment fare and email; omits blank idCard', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      fillValidContact(comp);

      let emitted: Parameters<typeof comp['sell']['emit']>[0] | undefined;
      comp.sell.subscribe((p) => { emitted = p; });
      (comp as any).onSell();

      expect(emitted).toBeDefined();
      expect(emitted!.fromStop).toBe('a');
      expect(emitted!.toStop).toBe('c');
      expect(emitted!.pricePerSeat).toBe(300);
      expect(emitted!.contact.email).toBe('somchai@example.com');
      expect('identityCardNumber' in emitted!.contact).toBeFalse();
      expect('gender' in emitted!.contact).toBeFalse();
    });

    it('does not emit when the form is invalid (blank email)', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      comp['contactForm'].patchValue({
        title: 'Mr.', firstName: 'A', lastName: 'B', phoneNumber: '0812345678', email: '',
      });

      let emitted: unknown;
      comp.sell.subscribe((p) => { emitted = p; });
      (comp as any).onSell();
      expect(emitted).toBeUndefined();
    });

    it('includes identityCardNumber when provided', () => {
      const comp = makeComponent();
      loadRoute(comp);
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      comp['contactForm'].setValue({
        title: 'Mr.', firstName: 'Somchai', lastName: 'Rakdee',
        phoneNumber: '0812345678', identityCardNumber: '1234567890123',
        email: 'test@example.com',
      });

      let emitted: Parameters<typeof comp['sell']['emit']>[0] | undefined;
      comp.sell.subscribe((p) => { emitted = p; });
      (comp as any).onSell();

      expect(emitted!.contact.identityCardNumber).toBe('1234567890123');
      expect(emitted!.cashReceived).toBe(300);
    });
  });

  describe('passenger type', () => {
    it('defaults to male and emits the selected slug on change', () => {
      const comp = makeComponent();
      expect(comp['passengerType']).toBe('male');

      let emitted: string | undefined;
      comp.passengerTypeChange.subscribe((v) => { emitted = v; });
      comp['passengerType'] = 'nun';
      (comp as any).onPassengerTypeChange();

      expect(emitted).toBe('nun');
    });
  });

  describe('lifecycle', () => {
    it('cleans up on destroy', () => {
      const comp = makeComponent();
      comp.ngOnInit();
      expect(() => comp.ngOnDestroy()).not.toThrow();
    });

    it('resets cashReceived when seats change', () => {
      const comp = makeComponent();
      comp['cashReceived'] = 500;
      comp.ngOnChanges({
        selectedSeats: { currentValue: ['B2'], previousValue: ['B1'], firstChange: false, isFirstChange: () => false },
      });
      expect(comp['cashReceived']).toBe(0);
    });
  });
});

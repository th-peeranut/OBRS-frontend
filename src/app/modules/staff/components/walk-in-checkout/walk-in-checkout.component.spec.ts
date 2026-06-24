import { FormBuilder } from '@angular/forms';
import { WalkInCheckoutComponent } from './walk-in-checkout.component';
import { WalkInTripDto } from '../../../../services/staff/staff-api.service';
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

function makeComponent(): WalkInCheckoutComponent {
  const fb = new FormBuilder();
  return new WalkInCheckoutComponent(fb, createTranslateStub());
}

function fillValidContact(comp: WalkInCheckoutComponent): void {
  comp['contactForm'].setValue({
    title: 'Mr.',
    firstName: 'Somchai',
    lastName: 'Rakdee',
    phoneNumber: '0812345678',
    identityCardNumber: '',
    email: '',
  });
}

describe('WalkInCheckoutComponent', () => {
  it('should create', () => {
    const comp = makeComponent();
    expect(comp).toBeTruthy();
  });

  describe('canSell gating', () => {
    it('returns false when form is invalid', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip();
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      // form is pristine/invalid (title etc. empty)
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when no seats selected', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip();
      comp.selectedSeats = [];
      comp['cashReceived'] = 300;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when cashReceived < totalAmount', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 200; // less than 300
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when totalAmount is 0 (no trip)', () => {
      const comp = makeComponent();
      comp.selectedTrip = null;
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 0;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns true when all conditions are met', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeTrue();
    });

    it('returns true when cashReceived > totalAmount (change due)', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 500;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeTrue();
    });
  });

  describe('change due computation', () => {
    it('is positive when cash > total', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1', 'B2']; // 2 * 300 = 600
      comp['cashReceived'] = 1000;
      expect((comp as any).changeDue).toBe(400);
    });

    it('is zero when cash equals total', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '150' });
      comp.selectedSeats = ['B1', 'B2']; // 2 * 150 = 300
      comp['cashReceived'] = 300;
      expect((comp as any).changeDue).toBe(0);
    });

    it('is negative when cash < total', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 100;
      expect((comp as any).changeDue).toBe(-200);
    });

    it('handles multi-seat total correctly', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '250' });
      comp.selectedSeats = ['B1', 'B2', 'B3']; // 3 * 250 = 750
      comp['cashReceived'] = 1000;
      expect((comp as any).totalAmount).toBe(750);
      expect((comp as any).changeDue).toBe(250);
    });
  });

  describe('sell payload', () => {
    it('emits payload WITHOUT gender and WITHOUT idCard/email when blank', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      fillValidContact(comp);

      let emittedPayload: Parameters<typeof comp['sell']['emit']>[0] | undefined;
      comp.sell.subscribe((p) => { emittedPayload = p; });

      (comp as any).onSell();

      expect(emittedPayload).toBeDefined();
      expect(emittedPayload!.contact.title).toBe('Mr.');
      expect(emittedPayload!.contact.firstName).toBe('Somchai');
      expect(emittedPayload!.contact.lastName).toBe('Rakdee');
      expect(emittedPayload!.contact.phoneNumber).toBe('0812345678');
      expect('identityCardNumber' in emittedPayload!.contact).toBeFalse();
      expect('email' in emittedPayload!.contact).toBeFalse();
      // gender must NOT be in contact
      expect('gender' in emittedPayload!.contact).toBeFalse();
    });

    it('includes identityCardNumber and email when provided', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 300;
      comp['contactForm'].setValue({
        title: 'Mr.',
        firstName: 'Somchai',
        lastName: 'Rakdee',
        phoneNumber: '0812345678',
        identityCardNumber: '1234567890123',
        email: 'test@example.com',
      });

      let emittedPayload: Parameters<typeof comp['sell']['emit']>[0] | undefined;
      comp.sell.subscribe((p) => { emittedPayload = p; });

      (comp as any).onSell();

      expect(emittedPayload!.contact.identityCardNumber).toBe('1234567890123');
      expect(emittedPayload!.contact.email).toBe('test@example.com');
    });

    it('emits cashReceived in payload', () => {
      const comp = makeComponent();
      comp.selectedTrip = makeTrip({ pricePerSeat: '300' });
      comp.selectedSeats = ['B1'];
      comp['cashReceived'] = 500;
      fillValidContact(comp);

      let emittedPayload: Parameters<typeof comp['sell']['emit']>[0] | undefined;
      comp.sell.subscribe((p) => { emittedPayload = p; });

      (comp as any).onSell();

      expect(emittedPayload!.cashReceived).toBe(500);
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
      comp.ngOnChanges({ selectedSeats: { currentValue: ['B2'], previousValue: ['B1'], firstChange: false, isFirstChange: () => false } });
      expect(comp['cashReceived']).toBe(0);
    });
  });
});

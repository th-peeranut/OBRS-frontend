import { FormBuilder } from '@angular/forms';
import { WalkInCheckoutComponent } from './walk-in-checkout.component';
import {
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

function makeComponent(): WalkInCheckoutComponent {
  const fb = new FormBuilder();
  return new WalkInCheckoutComponent(fb, createTranslateStub());
}

function makeComponentWithLang(lang: string): WalkInCheckoutComponent {
  const fb = new FormBuilder();
  const translate = createTranslateStub();
  translate.currentLang = lang;
  return new WalkInCheckoutComponent(fb, translate);
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

  describe('titleLabel localization', () => {
    const mr = { id: 1, nameThai: 'นาย', nameEnglish: 'Mr.', nameChinese: '先生' };

    it('renders the Thai title for th', () => {
      expect((makeComponentWithLang('th') as any).titleLabel(mr)).toBe('นาย');
    });

    it('renders the Chinese title for zh (previously fell back to English)', () => {
      expect((makeComponentWithLang('zh') as any).titleLabel(mr)).toBe('先生');
    });

    it('renders the English title for en', () => {
      expect((makeComponentWithLang('en') as any).titleLabel(mr)).toBe('Mr.');
    });
  });

  describe('canSell gating', () => {
    it('returns false when form is invalid', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 300;
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when email is missing (required for walk-in)', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 300;
      comp['contactForm'].patchValue({
        title: 'Mr.', firstName: 'A', lastName: 'B', phoneNumber: '0812345678', email: '',
      });
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when no seats selected', () => {
      const comp = makeComponent();
      comp.selectedSeats = [];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 300;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when cashReceived < totalAmount', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 200;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns false when pricePerSeat is 0 (no segment selected)', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 0;
      comp['cashReceived'] = 0;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeFalse();
    });

    it('returns true when all conditions are met', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 300;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeTrue();
    });

    it('returns true when cashReceived > totalAmount (change due)', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 500;
      fillValidContact(comp);
      expect((comp as any).canSell).toBeTrue();
    });
  });

  describe('total & change due', () => {
    it('multiplies pricePerSeat by the seat count', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1', 'B2'];
      comp.pricePerSeat = 300;
      expect((comp as any).totalAmount).toBe(600);
    });

    it('change is positive when cash > total', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 500;
      expect((comp as any).changeDue).toBe(200);
    });

    it('change is zero when cash equals total', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 300;
      expect((comp as any).changeDue).toBe(0);
    });
  });

  describe('sell payload', () => {
    it('emits contact + cashReceived; omits blank idCard', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
      comp['cashReceived'] = 300;
      fillValidContact(comp);

      let emitted: Parameters<typeof comp['sell']['emit']>[0] | undefined;
      comp.sell.subscribe((p) => { emitted = p; });
      (comp as any).onSell();

      expect(emitted).toBeDefined();
      expect(emitted!.contact.email).toBe('somchai@example.com');
      expect('identityCardNumber' in emitted!.contact).toBeFalse();
      expect('gender' in emitted!.contact).toBeFalse();
      // fromStop / toStop / pricePerSeat are no longer in the payload (now in sell-page)
      expect(('fromStop' as string) in emitted!).toBeFalse();
      expect(('toStop' as string) in emitted!).toBeFalse();
      expect(('pricePerSeat' as string) in emitted!).toBeFalse();
    });

    it('does not emit when the form is invalid (blank email)', () => {
      const comp = makeComponent();
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
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
      comp.selectedSeats = ['B1'];
      comp.pricePerSeat = 300;
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

  // Note: passenger type selection was moved to walk-in-center-panel (Change 1 / issue #50).
  // Segment / pickup / drop-off logic was moved to sell-page (Change 2 / issue #53).

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

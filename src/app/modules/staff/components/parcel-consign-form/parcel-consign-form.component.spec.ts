import { FormBuilder } from '@angular/forms';
import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ParcelConsignFormComponent } from './parcel-consign-form.component';
import { ParcelPolicyDto, ParcelPolicyService } from '../../../../services/parcel-policy/parcel-policy.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

// OBRS-629: the one injected dependency this component now has. The comment
// below used to say it had none — the parcel limits it renders come from the
// server now, not from literals typed into the form and into i18n.
const DEFAULT_POLICY: ParcelPolicyDto = {
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
};

function policyServiceStub(policy: ParcelPolicyDto | 'error'): ParcelPolicyService {
  return {
    getParcelPolicy: () =>
      policy === 'error'
        ? throwError(() => new Error('parcel-policy unavailable'))
        : of({ code: 200, message: 'OK', data: policy } as ResponseAPI<ParcelPolicyDto>),
  } as ParcelPolicyService;
}

// Constructed directly (no TestBed/fixture) — same precedent as
// WalkInCheckoutComponent's spec: a dumb reactive-form component's TS logic
// doesn't need template compilation.
function makeComponent(policy: ParcelPolicyDto | 'error' = DEFAULT_POLICY): ParcelConsignFormComponent {
  const fb = new FormBuilder();
  const component = new ParcelConsignFormComponent(fb, policyServiceStub(policy));
  component.ngOnInit();
  return component;
}

describe('ParcelConsignFormComponent', () => {
  let component: ParcelConsignFormComponent;

  beforeEach(() => {
    component = makeComponent();
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('starts invalid (required fields empty) and cannot submit', () => {
    expect(component['form'].valid).toBeFalse();
    expect(component['canSubmit']).toBeFalse();
  });

  // design-system.md §3.1 lock: every app-admin-dropdown-bound control starts
  // EMPTY (showing its placeholder) — no pre-seeded default.
  it('cold-open: schedule/pickup/dropoff dropdowns start empty (no pre-seeded value)', () => {
    expect(component['form'].get('scheduleId')?.value).toBe('');
    expect(component['form'].get('pickupStopId')?.value).toBe('');
    expect(component['form'].get('dropoffStopId')?.value).toBe('');
  });

  it('rejects a phone number that does not match ^0\\d{9}$', () => {
    const ctrl = component['form'].get('senderPhone');
    ctrl?.setValue('12345');
    ctrl?.markAsTouched();
    expect(component['fieldError']('senderPhone')).toBe('STAFF.VALIDATION.PHONE_INVALID');
  });

  it('accepts a valid phone number', () => {
    const ctrl = component['form'].get('senderPhone');
    ctrl?.setValue('0812345678');
    expect(ctrl?.valid).toBeTrue();
  });

  // OBRS-455: same asymmetry as the online form, at the counter. Staff may consign for a business
  // that only has a landline, but the recipient's number is where the arrival SMS goes.
  it('takes a landline as senderPhone and refuses it as recipientPhone, with its own message', () => {
    const sender = component['form'].get('senderPhone');
    const recipient = component['form'].get('recipientPhone');

    sender?.setValue('0212345678');
    expect(sender?.valid).toBeTrue();

    recipient?.setValue('0212345678');
    recipient?.markAsTouched();
    expect(recipient?.valid).toBeFalse();
    expect(component['fieldError']('recipientPhone')).toBe('STAFF.VALIDATION.THAI_MOBILE_INVALID');

    recipient?.setValue('0912345678');
    expect(recipient?.valid).toBeTrue();
  });

  it('rejects weightKg <= 0', () => {
    const ctrl = component['form'].get('weightKg');
    ctrl?.setValue(0);
    ctrl?.markAsTouched();
    expect(component['fieldError']('weightKg')).toBe('STAFF.PARCEL_CONSIGN.VALIDATION.WEIGHT_POSITIVE');
  });

  it('rejects weightKg > 100', () => {
    const ctrl = component['form'].get('weightKg');
    ctrl?.setValue(101);
    ctrl?.markAsTouched();
    expect(component['fieldError']('weightKg')).toBe('STAFF.PARCEL_CONSIGN.VALIDATION.WEIGHT_MAX');
  });

  it('prohibitedAcknowledged must be true (requiredTrue)', () => {
    const ctrl = component['form'].get('prohibitedAcknowledged');
    expect(ctrl?.valid).toBeFalse();
    ctrl?.setValue(true);
    expect(ctrl?.valid).toBeTrue();
  });

  it('dimensions: no values filled is valid (all-or-none, none case)', () => {
    expect(component['dimensionsGroup'].valid).toBeTrue();
  });

  it('dimensions: partially filled is invalid (all-or-none)', () => {
    component['dimensionsGroup'].get('lengthCm')?.setValue(10);
    component['dimensionsGroup'].markAllAsTouched();
    expect(component['dimensionsGroup'].invalid).toBeTrue();
    expect(component['isDimensionsIncomplete']).toBeTrue();
  });

  it('dimensions: all three filled is valid', () => {
    component['dimensionsGroup'].get('lengthCm')?.setValue(10);
    component['dimensionsGroup'].get('widthCm')?.setValue(10);
    component['dimensionsGroup'].get('heightCm')?.setValue(10);
    expect(component['dimensionsGroup'].valid).toBeTrue();
  });

  it('does not emit submitForm while invalid', () => {
    const spy = spyOn(component.submitForm, 'emit');
    component['onSubmit']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits submitForm with the assembled payload when valid', () => {
    const spy = spyOn(component.submitForm, 'emit');
    component['form'].setValue({
      senderName: 'Somchai',
      senderPhone: '0812345678',
      recipientName: 'Somsri',
      recipientPhone: '0898765432',
      scheduleId: '42',
      pickupStopId: '1',
      dropoffStopId: '2',
      weightKg: 5,
      description: 'Documents',
      dimensions: { lengthCm: null, widthCm: null, heightCm: null },
      prohibitedAcknowledged: true,
      // OBRS-341: always-present carry-on-only controls (inert in consigned
      // mode) — FormGroup#setValue requires every control, unlike patchValue.
      seatCount: null,
      specifySeats: false,
    });

    component['onSubmit']();

    // OBRS-341: the emitted business value now carries a `mode` discriminant
    // ('consigned' here) so the page can tell the two shapes apart without
    // relying on its own separately-tracked mode field — the wire DTO the
    // page builds from this is unaffected (ParcelConsignedReqDto has no
    // `mode` field; see parcel-consign-page.component.ts#submitConsigned).
    expect(spy).toHaveBeenCalledWith({
      mode: 'consigned',
      sender: { name: 'Somchai', phone: '0812345678' },
      recipient: { name: 'Somsri', phone: '0898765432' },
      scheduleId: 42,
      pickupStopId: 1,
      dropoffStopId: 2,
      weightKg: 5,
      description: 'Documents',
      prohibitedAcknowledged: true,
    });
  });

  it('emits quoteParamsChange (debounced) once all 4 fields are valid', fakeAsync(() => {
    const spy = spyOn(component.quoteParamsChange, 'emit');
    component['form'].get('scheduleId')?.setValue('42');
    component['form'].get('pickupStopId')?.setValue('1');
    component['form'].get('dropoffStopId')?.setValue('2');
    component['form'].get('weightKg')?.setValue(5);

    tick(400);

    expect(spy).toHaveBeenCalledWith({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });
  }));

  it('emits null via quoteParamsChange when fields are incomplete', fakeAsync(() => {
    const spy = spyOn(component.quoteParamsChange, 'emit');
    component['form'].get('scheduleId')?.setValue('42');
    tick(400);

    expect(spy).toHaveBeenCalledWith(null);
  }));

  // ---------------------------------------------------------------------------
  // OBRS-341 — carry-on-on-seat mode
  // ---------------------------------------------------------------------------

  function switchToCarryOn(c: ParcelConsignFormComponent): void {
    c.ngOnChanges({
      mode: {
        previousValue: 'consigned',
        currentValue: 'carry_on_seat',
        firstChange: false,
        isFirstChange: () => false,
      },
    });
  }

  describe('carryOnClassification — live client-side classification hint', () => {
    beforeEach(() => switchToCarryOn(component));

    it('is null while dimensions are incomplete', () => {
      expect(component['carryOnClassification']).toBeNull();
    });

    it('classifies exactly 71.12cm as free_aisle (server boundary)', () => {
      component['dimensionsGroup'].setValue({ lengthCm: 71.12, widthCm: 10, heightCm: 10 });
      expect(component['carryOnClassification']).toBe('free_aisle');
      expect(component['isOnSeat']).toBeFalse();
    });

    it('classifies 71.13cm as on_seat (one hair past the boundary)', () => {
      component['dimensionsGroup'].setValue({ lengthCm: 71.13, widthCm: 10, heightCm: 10 });
      expect(component['carryOnClassification']).toBe('on_seat');
      expect(component['isOnSeat']).toBeTrue();
    });
  });

  describe('carryOnDisplayAmount — farePerUnit x seatCount, NOT quote.amount', () => {
    beforeEach(() => {
      switchToCarryOn(component);
      component['dimensionsGroup'].setValue({ lengthCm: 100, widthCm: 40, heightCm: 30 }); // on-seat
    });

    it('is null with no quote yet', () => {
      expect(component['carryOnDisplayAmount']).toBeNull();
    });

    it('is farePerUnit * seatCount, ignoring quote.amount entirely', () => {
      // quote.amount deliberately != farePerUnit * seatCount here, so a test
      // that accidentally read quote.amount instead would fail this exact case.
      component.quote = { amount: 999, farePerUnit: 120, unitCount: 1, weightTierMultiplier: 1.5 };
      component['form'].get('seatCount')?.setValue(3);

      expect(component['carryOnDisplayAmount']).toBe(360); // 120 * 3, not 999
    });

    it('is null while seatCount is unset', () => {
      component.quote = { amount: 100, farePerUnit: 100, unitCount: 1, weightTierMultiplier: 1 };
      expect(component['carryOnDisplayAmount']).toBeNull();
    });
  });

  describe('mode switching resets the form (no state leaks between branches)', () => {
    it('clears recipient/dimensions/seatCount/specifySeats/selectedSeatNumbers on switch', () => {
      component['form'].get('recipientName')?.setValue('Somsri');
      component['form'].get('recipientPhone')?.setValue('0898765432');
      component['selectedSeatNumbers'] = ['A1', 'A2'];

      switchToCarryOn(component);

      expect(component['form'].get('recipientName')?.value).toBe('');
      expect(component['form'].get('recipientPhone')?.value).toBe('');
      expect(component['selectedSeatNumbers']).toEqual([]);
      expect(component['form'].get('seatCount')?.value).toBeNull();
      expect(component['form'].get('specifySeats')?.value).toBeFalse();
    });

    it('recipient is NOT required in carry-on mode (contract: field does not exist on the wire)', () => {
      switchToCarryOn(component);
      expect(component['form'].get('recipientName')?.errors).toBeNull();
      expect(component['form'].get('recipientPhone')?.errors).toBeNull();
    });

    it('dimensions become REQUIRED (all three) in carry-on mode, unlike consigned\'s optional all-or-none', () => {
      switchToCarryOn(component);
      expect(component['dimensionsGroup'].get('lengthCm')?.hasError('required')).toBeTrue();
      expect(component['dimensionsGroup'].get('widthCm')?.hasError('required')).toBeTrue();
      expect(component['dimensionsGroup'].get('heightCm')?.hasError('required')).toBeTrue();
    });

    it('switching a second time BACK to consigned restores the all-or-none dimensions validator', () => {
      switchToCarryOn(component);
      component.ngOnChanges({
        mode: {
          previousValue: 'carry_on_seat',
          currentValue: 'consigned',
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component['dimensionsGroup'].get('lengthCm')?.hasError('required')).toBeFalse();
      expect(component['dimensionsGroup'].valid).toBeTrue(); // none filled -> all-or-none passes
      expect(component['form'].get('recipientName')?.hasError('required')).toBeTrue(); // required again
    });
  });

  // OBRS-341 (card AC follow-up) — "รับชิ้นต่อไป"
  describe('resetForNextItem() — blanks the form WITHOUT a mode change', () => {
    it('clears every field and keeps the CURRENT mode/validators (carry-on stays carry-on)', () => {
      switchToCarryOn(component);
      component['form'].patchValue({ senderName: 'Somchai', weightKg: 15 });
      component['dimensionsGroup'].setValue({ lengthCm: 80, widthCm: 40, heightCm: 30 });
      component['form'].get('seatCount')?.setValue(2);
      component['selectedSeatNumbers'] = ['A1', 'A2'];

      component.resetForNextItem();

      expect(component['mode']).toBe('carry_on_seat'); // unchanged
      expect(component['form'].get('senderName')?.value).toBe('');
      expect(component['form'].get('weightKg')?.value).toBeNull();
      expect(component['dimensionsGroup'].get('lengthCm')?.value).toBeNull();
      expect(component['form'].get('seatCount')?.value).toBeNull();
      expect(component['selectedSeatNumbers']).toEqual([]);
      // Carry-on validators still apply (dimensions still required, not all-or-none):
      expect(component['dimensionsGroup'].get('lengthCm')?.hasError('required')).toBeTrue();
    });

    it('emits quoteParamsChange(null) so a stale price cannot linger on the fresh form', () => {
      const spy = spyOn(component.quoteParamsChange, 'emit');

      component.resetForNextItem();

      expect(spy).toHaveBeenCalledWith(null);
    });
  });

  describe('carry-on submit payload — seatCount/seatNumbers/recipient shape', () => {
    function fillCommonFields(c: ParcelConsignFormComponent): void {
      c['form'].patchValue({
        senderName: 'Somchai',
        senderPhone: '0812345678',
        scheduleId: '42',
        pickupStopId: '1',
        dropoffStopId: '2',
        weightKg: 15,
        description: 'Oversized backpack',
        prohibitedAcknowledged: true,
      });
    }

    it('emits mode carry_on_seat with seatCount set and NO recipient key at all when on-seat', () => {
      switchToCarryOn(component);
      fillCommonFields(component);
      component['dimensionsGroup'].setValue({ lengthCm: 80, widthCm: 40, heightCm: 30 }); // on-seat
      component['form'].get('seatCount')?.setValue(1);

      const spy = spyOn(component.submitForm, 'emit');
      component['onSubmit']();

      expect(spy).toHaveBeenCalledWith(
        jasmine.objectContaining({ mode: 'carry_on_seat', seatCount: 1 })
      );
      const emitted = spy.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
      expect('recipient' in emitted).toBeFalse();
    });

    it('omits seatCount entirely (contract: MUST BE ABSENT) when the item classifies free-aisle', () => {
      switchToCarryOn(component);
      fillCommonFields(component);
      component['dimensionsGroup'].setValue({ lengthCm: 30, widthCm: 20, heightCm: 10 }); // free-aisle

      const spy = spyOn(component.submitForm, 'emit');
      component['onSubmit']();

      expect(spy).toHaveBeenCalled();
      const emitted = spy.calls.mostRecent().args[0] as unknown as Record<string, unknown>;
      expect('seatCount' in emitted).toBeFalse();
      expect('seatNumbers' in emitted).toBeFalse();
    });

    it('does not allow submit when specifySeats is checked but the chosen count mismatches seatCount', () => {
      switchToCarryOn(component);
      fillCommonFields(component);
      component['dimensionsGroup'].setValue({ lengthCm: 80, widthCm: 40, heightCm: 30 }); // on-seat
      component['form'].get('seatCount')?.setValue(2);
      component['form'].get('specifySeats')?.setValue(true);
      component['selectedSeatNumbers'] = ['A1']; // only 1, but seatCount is 2

      expect(component['seatNumbersMismatch']).toBeTrue();
      expect(component['canSubmit']).toBeFalse();
    });

    it('includes explicit seatNumbers only when specifySeats is checked and the count matches', () => {
      switchToCarryOn(component);
      fillCommonFields(component);
      component['dimensionsGroup'].setValue({ lengthCm: 80, widthCm: 40, heightCm: 30 }); // on-seat
      component['form'].get('seatCount')?.setValue(1);
      component['form'].get('specifySeats')?.setValue(true);
      component['selectedSeatNumbers'] = ['A1'];

      const spy = spyOn(component.submitForm, 'emit');
      component['onSubmit']();

      expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({ seatNumbers: ['A1'] }));
    });
  });

  // OBRS-629 AC-1/AC-3/AC-4. This form matters more than the customer wizard right now: OBRS-622
  // gated the online channel, so at go-live this IS the parcel counter, and until this card it
  // asked the sender to attest to a prohibited list it never showed them.
  describe('OBRS-629 — limits come from GET /api/parcel-policy, not from literals', () => {
    it('exposes one row per served category so the attestation has something to attest to', () => {
      const c = makeComponent({
        maxWeightKg: 100,
        carryOnFreeSizeMaxInch: 28,
        carryOnFreeAisleMaxPerTrip: 10,
        prohibitedCategories: ['flammable', 'livestock'],
      });

      expect(c['prohibitedCategories'].map((v) => v.slug)).toEqual(['flammable', 'livestock']);
      expect(c['prohibitedCategories'][0].i18nKey).toBe('PARCEL.PROHIBITED.ITEM.FLAMMABLE');
      // No copy shipped for 'livestock' - shown by its slug rather than dropped, because intake
      // will still reject on it.
      expect(c['prohibitedCategories'][1].i18nKey).toBe('PARCEL.PROHIBITED.UNLISTED');
      expect(c['prohibitedCategories'][1].params).toEqual({ slug: 'livestock' });
      c.ngOnDestroy();
    });

    it('rejects a weight above the SERVED cap, not above a hardcoded 100', () => {
      const c = makeComponent({ ...DEFAULT_POLICY, maxWeightKg: 50 });
      const ctrl = c['form'].get('weightKg');

      ctrl?.setValue(60);
      ctrl?.markAsTouched();
      // Validators.max(100) - what this line used to be - passes 60 silently, and the sender
      // finds out from a 409 after the salesperson has taken the parcel.
      expect(c['fieldError']('weightKg')).toBe('STAFF.PARCEL_CONSIGN.VALIDATION.WEIGHT_MAX');
      expect(c['weightMaxParams'].max).toBe(50);
      c.ngOnDestroy();
    });

    it('flags a failed read instead of falling back to a plausible-but-stale list', () => {
      const c = makeComponent('error');

      expect(c['policyLoaded']).toBeTrue();
      expect(c['prohibitedLoadFailed']).toBeTrue();
      expect(c['prohibitedCategories']).toEqual([]);
      c.ngOnDestroy();
    });
  });
});

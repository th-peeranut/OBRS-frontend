import { FormBuilder } from '@angular/forms';
import { fakeAsync, tick } from '@angular/core/testing';
import { ParcelConsignFormComponent } from './parcel-consign-form.component';

// Constructed directly (no TestBed/fixture) — same precedent as
// WalkInCheckoutComponent's spec: a dumb reactive-form component's TS logic
// doesn't need template compilation, and this component has no TranslateService
// or other injected dependency to stub.
function makeComponent(): ParcelConsignFormComponent {
  const fb = new FormBuilder();
  const component = new ParcelConsignFormComponent(fb);
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
    });

    component['onSubmit']();

    expect(spy).toHaveBeenCalledWith({
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
});

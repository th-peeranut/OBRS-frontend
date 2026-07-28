import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ParcelDetailsFormComponent } from './parcel-details-form.component';

describe('ParcelDetailsFormComponent', () => {
  let component: ParcelDetailsFormComponent;
  let fixture: ComponentFixture<ParcelDetailsFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [ParcelDetailsFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ParcelDetailsFormComponent);
    component = fixture.componentInstance;
    component.scheduleId = 1;
    component.pickupStopId = 2;
    component.dropoffStopId = 3;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders the sender name read-only (not a form control) and prefills the phone once', () => {
    component.senderNameDisplay = 'Somchai Jaidee';
    component.senderPhonePrefill = '0812345678';
    component.ngOnChanges({
      senderPhonePrefill: {
        currentValue: '0812345678',
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    } as any);
    fixture.detectChanges();

    expect(component['form'].get('senderPhone')).toBeTruthy();
    expect((component['form'] as any).contains('senderName')).toBeFalse();
    // OBRS-691: the prefill now displays grouped (3-3-4), same as every other phone field at rest.
    expect(component['form'].get('senderPhone')?.value).toBe('081-234-5678');

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Somchai Jaidee');
  });

  it('rejects a senderPhone that fails the \\d{10,15} rule', () => {
    const ctrl = component['form'].get('senderPhone');
    ctrl?.setValue('123');
    expect(ctrl?.valid).toBeFalse();
    ctrl?.setValue('0812345678');
    expect(ctrl?.valid).toBeTrue();
  });

  // OBRS-455: the two phones on one waybill do NOT share a rule, and this is the pinning test for
  // that asymmetry — the exact case a "unify the phone rules" refactor is most likely to flatten.
  it('accepts a landline as senderPhone but rejects the same number as recipientPhone', () => {
    const sender = component['form'].get('senderPhone');
    const recipient = component['form'].get('recipientPhone');
    const bangkokLandline = '0212345678';

    sender?.setValue(bangkokLandline);
    // nothing texts the sender — a business shipping cargo from a landline must still book
    expect(sender?.valid).toBeTrue();

    recipient?.setValue(bangkokLandline);
    // the arrival SMS goes here, and ThaiBulkSMS cannot deliver to 02...
    expect(recipient?.valid).toBeFalse();
    expect(component['fieldError']('recipientPhone')).toBeNull(); // untouched: no message yet
    recipient?.markAsTouched();
    expect(component['fieldError']('recipientPhone')).toBe(
      'PARCEL_BOOKING.VALIDATION.THAI_MOBILE_INVALID'
    );

    recipient?.setValue('0812345678');
    expect(recipient?.valid).toBeTrue();
  });

  it('requires the prohibited-acknowledgement checkbox to be checked', () => {
    const ctrl = component['form'].get('prohibitedAcknowledged');
    expect(ctrl?.valid).toBeFalse();
    ctrl?.setValue(true);
    expect(ctrl?.valid).toBeTrue();
  });

  it('does not submit while the form is invalid, and emits submitForm once valid', () => {
    const submitted: unknown[] = [];
    component.submitForm.subscribe((v) => submitted.push(v));

    (component as any).onSubmit();
    expect(submitted.length).toBe(0);

    component['form'].setValue({
      senderPhone: '0812345678',
      recipientName: 'Somchai',
      recipientPhone: '0898765432',
      weightKg: 5,
      description: 'a box of clothes',
      dimensions: { lengthCm: null, widthCm: null, heightCm: null },
      prohibitedAcknowledged: true,
    });

    (component as any).onSubmit();
    expect(submitted.length).toBe(1);
    expect((submitted[0] as any).senderPhone).toBe('0812345678');
    expect((submitted[0] as any).dimensions).toBeUndefined();
  });

  it('emits a debounced quoteParamsChange once scheduleId/stops/weight are all valid', fakeAsync(() => {
    const emitted: unknown[] = [];
    component.quoteParamsChange.subscribe((v) => emitted.push(v));

    component['form'].get('weightKg')?.setValue(5);
    tick(500);

    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted[emitted.length - 1]).toEqual({
      scheduleId: 1,
      pickupStopId: 2,
      dropoffStopId: 3,
      weightKg: 5,
    });
  }));

  it('emits null quoteParamsChange when weight is cleared', fakeAsync(() => {
    const emitted: unknown[] = [];
    component.quoteParamsChange.subscribe((v) => emitted.push(v));

    component['form'].get('weightKg')?.setValue(5);
    tick(500);
    component['form'].get('weightKg')?.setValue(null);
    tick(500);

    expect(emitted[emitted.length - 1]).toBeNull();
  }));

  it('requires all three dimensions together, or none', () => {
    const group = component['dimensionsGroup'];
    group.get('lengthCm')?.setValue(10);
    expect(group.valid).toBeFalse();
    group.get('widthCm')?.setValue(10);
    group.get('heightCm')?.setValue(10);
    expect(group.valid).toBeTrue();
  });
});

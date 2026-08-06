import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ParcelDetailsFormComponent } from './parcel-details-form.component';
import { ParcelPolicyDto, ParcelPolicyService } from '../../../../services/parcel-policy/parcel-policy.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

// OBRS-629: the weight cap and the prohibited list are served by
// GET /api/parcel-policy now, not typed into this component and into i18n.
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

describe('ParcelDetailsFormComponent', () => {
  let component: ParcelDetailsFormComponent;
  let fixture: ComponentFixture<ParcelDetailsFormComponent>;

  async function setUp(policy: ParcelPolicyDto | 'error' = DEFAULT_POLICY): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [ParcelDetailsFormComponent],
      providers: [{ provide: ParcelPolicyService, useValue: policyServiceStub(policy) }],
    }).compileComponents();

    fixture = TestBed.createComponent(ParcelDetailsFormComponent);
    component = fixture.componentInstance;
    component.scheduleId = 1;
    component.pickupStopId = 2;
    component.dropoffStopId = 3;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await setUp();
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

  // OBRS-629 AC-3/AC-4 — these assert the RENDERED list and the ACTUAL validity, not that a
  // service was called: the defect being closed was a screen that stayed on 100 kg and five
  // categories no matter what the config said, and only what reaches the DOM can prove otherwise.
  describe('OBRS-629 — limits come from GET /api/parcel-policy, not from literals', () => {
    function renderedProhibitedItems(): HTMLElement[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll('.parcel-details-form__prohibited-list li')
      );
    }

    it('renders one row per served category, not the five it used to hardcode', async () => {
      await setUp({ ...DEFAULT_POLICY, prohibitedCategories: ['livestock', 'battery'] });

      const items = renderedProhibitedItems();
      expect(items.length).toBe(2);
      // Neither slug ships copy, so both fall back to the parameterised UNLISTED key rather
      // than vanishing - a category the sender cannot see is one intake will still reject on.
      expect(component['prohibitedCategories'].map((c) => c.slug)).toEqual(['livestock', 'battery']);
      expect(component['prohibitedCategories'].every((c) => c.i18nKey === 'PARCEL.PROHIBITED.UNLISTED')).toBeTrue();
    });

    it('accepts a weight the served cap allows and rejects one above it', async () => {
      await setUp({ ...DEFAULT_POLICY, maxWeightKg: 50 });

      const ctrl = component['form'].get('weightKg');
      ctrl?.setValue(50);
      expect(ctrl?.hasError('max')).withContext('50 is at the served cap').toBeFalse();
      ctrl?.setValue(60);
      expect(ctrl?.hasError('max')).withContext('60 exceeds the served cap of 50').toBeTrue();
      // The old Validators.max(100) would have passed 60 - this is the whole defect.
      expect(component['weightMaxParams'].max).toBe(50);
    });

    it('shows an ask-staff message instead of a stale list when the read fails', async () => {
      await setUp('error');

      expect(renderedProhibitedItems().length).toBe(0);
      expect(component['prohibitedLoadFailed']).toBeTrue();
      expect(fixture.nativeElement.textContent).toContain('PARCEL.PROHIBITED.LOAD_ERROR');
    });

    it('leaves the weight uncapped client-side when the read fails - intake still rejects', async () => {
      await setUp('error');

      const ctrl = component['form'].get('weightKg');
      ctrl?.setValue(9999);
      // Inventing a fallback cap here would put a number in front of the sender that nothing
      // configured; validateWeight is what actually holds the line.
      expect(ctrl?.hasError('max')).toBeFalse();
    });

    it('renders the empty-list message when the admin has configured no categories', async () => {
      await setUp({ ...DEFAULT_POLICY, prohibitedCategories: [] });

      expect(renderedProhibitedItems().length).toBe(0);
      expect(component['prohibitedLoadFailed']).toBeFalse();
      // getStringListConfig has no fallback, so an unset config really does block nothing.
      expect(fixture.nativeElement.textContent).toContain('PARCEL.PROHIBITED.EMPTY');
    });
  });
});

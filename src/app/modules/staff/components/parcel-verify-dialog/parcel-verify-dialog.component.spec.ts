import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ParcelVerifyDialogComponent } from './parcel-verify-dialog.component';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';
import {
  AA_NORMAL_TEXT,
  contrast,
  effectiveBg,
  fgOf,
  mountInChain,
  resolveTokenColour,
  toHex,
} from '../../../../testing/contrast';

function makeParcel(overrides: Partial<ParcelDeliveryListItemDto> = {}): ParcelDeliveryListItemDto {
  return {
    parcelId: 1,
    trackingNumber: 'PCL-1',
    senderName: 'Somchai',
    senderPhone: '0812345678',
    recipientName: 'Somsri',
    recipientPhone: '0898765432',
    pickupStop: { name: 'Bangkok' },
    dropoffStop: { name: 'Chiang Mai' },
    weightKg: 5,
    deliveryStatus: 'created',
    bookingStatus: 'confirmed',
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    amount: 350,
    ...overrides,
  };
}

function makeComponent(): ParcelVerifyDialogComponent {
  return new ParcelVerifyDialogComponent(new FormBuilder());
}

function openWith(component: ParcelVerifyDialogComponent, parcel: ParcelDeliveryListItemDto): void {
  component.parcel = parcel;
  component.isOpen = true;
  component.ngOnChanges({
    isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true },
  });
}

describe('ParcelVerifyDialogComponent', () => {
  it('should be created', () => {
    expect(makeComponent()).toBeTruthy();
  });

  it('resets the form and clears outcome whenever isOpen flips to true (no pre-seeded outcome)', () => {
    const component = makeComponent();
    component['form'].get('actualWeightKg')?.setValue(99);
    component['outcome'] = 'reject';

    openWith(component, makeParcel());

    expect(component['form'].get('actualWeightKg')?.value).toBeNull();
    expect(component['outcome']).toBeNull();
  });

  it('cannot submit until an outcome is selected, even with valid measurements', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: 5,
      actualLengthCm: 30,
      actualWidthCm: 20,
      actualHeightCm: 15,
    });
    expect(component['canSubmit']).toBeFalse();
  });

  it('a tap on the already-selected segment is a no-op', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['selectOutcome']('accept');
    const control = component['form'].get('rejectReason')!;
    spyOn(control, 'updateValueAndValidity');
    component['selectOutcome']('accept');
    expect(control.updateValueAndValidity).not.toHaveBeenCalled();
  });

  it('selecting reject makes rejectReason required; canSubmit is false until it is filled', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: 5,
      actualLengthCm: 30,
      actualWidthCm: 20,
      actualHeightCm: 15,
    });
    component['selectOutcome']('reject');
    expect(component['canSubmit']).toBeFalse();

    component['form'].get('rejectReason')?.setValue('Box was empty');
    expect(component['canSubmit']).toBeTrue();
  });

  it('switching outcome away from reject clears the rejectReason VALUE, not just hides it', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['selectOutcome']('reject');
    component['form'].get('rejectReason')?.setValue('stale reason');

    component['selectOutcome']('accept');

    expect(component['form'].get('rejectReason')?.value).toBe('');
  });

  it('emits confirmAccept with the numeric form value on submit when outcome is accept', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: '5.2',
      actualLengthCm: '31',
      actualWidthCm: '21',
      actualHeightCm: '16',
    });
    component['selectOutcome']('accept');
    const spy = spyOn(component.confirmAccept, 'emit');

    component['onSubmit']();

    expect(spy).toHaveBeenCalledWith({
      actualWeightKg: 5.2,
      actualLengthCm: 31,
      actualWidthCm: 21,
      actualHeightCm: 16,
    });
  });

  it('emits confirmReject with the trimmed reject reason on submit when outcome is reject', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: 5,
      actualLengthCm: 30,
      actualWidthCm: 20,
      actualHeightCm: 15,
    });
    component['selectOutcome']('reject');
    component['form'].get('rejectReason')?.setValue('  Damaged in transit  ');
    const spy = spyOn(component.confirmReject, 'emit');

    component['onSubmit']();

    expect(spy).toHaveBeenCalledWith(
      jasmine.objectContaining({ rejectReason: 'Damaged in transit' })
    );
  });

  it('does not emit anything when submit is clicked while invalid', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    const acceptSpy = spyOn(component.confirmAccept, 'emit');
    const rejectSpy = spyOn(component.confirmReject, 'emit');

    component['onSubmit']();

    expect(acceptSpy).not.toHaveBeenCalled();
    expect(rejectSpy).not.toHaveBeenCalled();
  });

  describe('isMismatch()', () => {
    it('flags a measured weight that differs from declared beyond tolerance', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ weightKg: 5 }));
      component['form'].get('actualWeightKg')?.setValue(7);
      expect(component['isMismatch']('actualWeightKg')).toBeTrue();
    });

    it('does not flag a measured weight within tolerance of declared', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ weightKg: 5 }));
      component['form'].get('actualWeightKg')?.setValue(5.02);
      expect(component['isMismatch']('actualWeightKg')).toBeFalse();
    });

    it('flags a dimension mismatch beyond the 1cm tolerance', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ lengthCm: 30 }));
      component['form'].get('actualLengthCm')?.setValue(35);
      expect(component['isMismatch']('actualLengthCm')).toBeTrue();
    });

    it('never flags a mismatch before anything has been entered', () => {
      const component = makeComponent();
      openWith(component, makeParcel());
      expect(component['isMismatch']('actualWeightKg')).toBeFalse();
    });

    it('never flags a mismatch when the parcel never declared that dimension', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ lengthCm: null }));
      component['form'].get('actualLengthCm')?.setValue(999);
      expect(component['isMismatch']('actualLengthCm')).toBeFalse();
    });
  });

  it('does not dismiss while submitting', () => {
    const component = makeComponent();
    component.isSubmitting = true;
    const spy = spyOn(component.dismiss, 'emit');
    component['onDismiss']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits dismiss when not submitting', () => {
    const component = makeComponent();
    const spy = spyOn(component.dismiss, 'emit');
    component['onDismiss']();
    expect(spy).toHaveBeenCalled();
  });

  it('cannot select an outcome while submitting', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component.isSubmitting = true;
    component['selectOutcome']('accept');
    expect(component['outcome']).toBeNull();
  });

  // ── OBRS-726: measured contrast of the mismatch hint ───────────────────────
  //
  // `.pv-mismatch-hint` used --admin-danger-text, the dark half of a pastel CHIP
  // pair, as a standalone colour with no fill of its own. This site was NOT on
  // OBRS-726's list of three — it surfaced when the population was re-counted
  // from the enclosing rule instead of by grep.
  //
  // Unlike the parcel-intake panel (see that component's spec: a raw Bootstrap
  // `.card` that never themes, OBRS-747), this hint's surface IS themed — the
  // dialog renders its own `.admin-modal`, which paints --admin-surface-card.
  // That is why the swap to --admin-danger-fg is correct HERE and wrong there,
  // and it is why this block measures the ancestor rather than assuming it.
  describe('contrast of .pv-mismatch-hint, measured (OBRS-726)', () => {
    let fixture: ComponentFixture<ParcelVerifyDialogComponent>;
    let teardown: (() => void) | null = null;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), ReactiveFormsModule],
        declarations: [ParcelVerifyDialogComponent],
        schemas: [NO_ERRORS_SCHEMA], // adminModalBackdrop is a real directive, not declared here
      }).compileComponents();
      fixture = TestBed.createComponent(ParcelVerifyDialogComponent);
    });

    afterEach(() => {
      teardown?.();
      teardown = null;
    });

    /** Open the dialog with a weight far enough off declared to trip the hint. */
    function mountWithMismatch(dark: boolean): HTMLElement {
      const component = fixture.componentInstance;
      openWith(component, makeParcel({ weightKg: 5 }));
      component['form'].get('actualWeightKg')?.setValue(20);
      teardown = mountInChain(fixture.nativeElement, ['admin-shell theme-staff'], dark);
      fixture.detectChanges();
      const hint = fixture.nativeElement.querySelector('.pv-mismatch-hint') as HTMLElement | null;
      expect(hint)
        .withContext('the mismatch hint must actually render, or nothing is being measured')
        .not.toBeNull();
      return hint!;
    }

    // Measured in ChromeHeadless on this tree: light #93000a on #ffffff = 9.35:1,
    // dark #ffb4ab on #1d2226 = 9.45:1. Before OBRS-726 the dark pair was
    // #93000a on #1d2226 = 1.71:1.
    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';

      it(`${mode}: the surface under the hint is the themed modal card`, () => {
        // Precondition, asserted before measuring through it: a themed
        // foreground is only correct over a themed background.
        const hint = mountWithMismatch(dark);
        expect(hint.closest('.admin-modal'))
          .withContext('the hint must sit inside .admin-modal')
          .not.toBeNull();
        expect(toHex(effectiveBg(hint)))
          .withContext(`${mode}: painted background behind the hint`)
          .toBe(dark ? '#1d2226' : '#ffffff');
      });

      it(`${mode}: the hint meets AA on the modal card`, () => {
        const hint = mountWithMismatch(dark);
        const bg = effectiveBg(hint);
        const ratio = contrast(fgOf(hint), bg);
        expect(ratio)
          .withContext(
            `${mode}: hint ${toHex(fgOf(hint))} on ${toHex(bg)} = ${ratio.toFixed(2)}:1 ` +
              `(the chip half --admin-danger-text measured 1.71:1 here before OBRS-726)`
          )
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the hint uses --admin-danger-fg, not the chip half`, () => {
        // In LIGHT mode both tokens are #93000a, so the ratio test above cannot
        // see a silent revert. Pin the identity in both modes.
        const hint = mountWithMismatch(dark);
        const shell = document.querySelector('.admin-shell') as HTMLElement;
        expect(toHex(fgOf(hint))).toBe(toHex(resolveTokenColour(shell, '--admin-danger-fg')));
      });
    }
  });
});

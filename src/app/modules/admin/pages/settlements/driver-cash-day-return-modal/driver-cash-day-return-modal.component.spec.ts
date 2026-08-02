import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashDayReturnModalComponent } from './driver-cash-day-return-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { DriverCashDayDetailDto } from '../../../../../shared/interfaces/driver-cash.interface';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf, mountInChain, toHex } from '../../../../../testing/contrast';

const DETAIL: DriverCashDayDetailDto = {
  dayId: 1,
  scheduleId: 100,
  routeLabel: 'BKK-CNX',
  departureDateTime: '2026-08-01T08:00:00',
  currency: 'THB',
  expectedAmount: '500.00',
  entries: [
    { label: 'Per-head: origin stop', amount: '300.00', fromUnmappedSalesPoint: false },
    { label: 'Parcel share', amount: '200.00', fromUnmappedSalesPoint: true },
  ],
  hasUnmappedSalesPointRemit: true,
  status: 'PENDING',
};

describe('DriverCashDayReturnModalComponent', () => {
  let fixture: ComponentFixture<DriverCashDayReturnModalComponent>;
  let component: DriverCashDayReturnModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [DriverCashDayReturnModalComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(DriverCashDayReturnModalComponent);
    component = fixture.componentInstance;
    component.isOpen = true;
    component.summary = {
      dayId: 1,
      scheduleId: 100,
      routeLabel: 'BKK-CNX',
      departureDateTime: '2026-08-01T08:00:00',
      netCash: '500.00',
      currency: 'THB',
      status: 'PENDING',
      hasUnmappedSalesPointRemit: true,
    };
    component.detail = DETAIL;
    // TestBed.createComponent() with no wrapping host template never fires
    // ngOnChanges from a real binding — call it once here so `formDayId`
    // starts seeded at 1, matching what the real modal sees on open (the
    // page binds [summary]/[detail], which DOES trigger it).
    component.ngOnChanges({});
    fixture.detectChanges();
  });

  function confirmBtn(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-return-confirm"]');
  }

  function amountInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-returned-amount-input"]');
  }

  function reasonInput(): HTMLTextAreaElement | null {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-discrepancy-reason-input"]');
  }

  function setAmount(value: string): void {
    component['returnedAmountInput'] = value;
    fixture.detectChanges();
  }

  function setReason(value: string): void {
    component['discrepancyReasonInput'] = value;
    fixture.detectChanges();
  }

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  // ── OBRS-960 central assertion: discrepancy blocks confirm without a reason ──
  describe('discrepancy blocks confirm until a reason is entered', () => {
    it('a matching returned amount (no discrepancy) does NOT require a reason and confirm is enabled', () => {
      setAmount('500.00');
      expect(component['hasDiscrepancy']()).toBeFalse();
      expect(component['canConfirm']).toBeTrue();
      expect(confirmBtn().disabled).toBeFalse();
    });

    it('a non-zero discrepancy with NO reason blocks confirm', () => {
      setAmount('480.00');
      expect(component['hasDiscrepancy']()).toBeTrue();
      expect(component['canConfirm']).toBeFalse();
      expect(confirmBtn().disabled).toBeTrue();
    });

    it('a non-zero discrepancy WITH a reason unblocks confirm', () => {
      setAmount('480.00');
      setReason('Short by 20 THB, driver acknowledged');
      expect(component['canConfirm']).toBeTrue();
      expect(confirmBtn().disabled).toBeFalse();
    });

    it('the discrepancy reason field only renders when there is a discrepancy', () => {
      setAmount('500.00');
      expect(reasonInput()).toBeNull();

      setAmount('480.00');
      expect(reasonInput()).not.toBeNull();
    });

    it('a whitespace-only reason still blocks confirm (trimmed)', () => {
      setAmount('480.00');
      setReason('   ');
      expect(component['canConfirm']).toBeFalse();
    });

    it('clicking confirm while blocked does not emit confirmRequested', () => {
      setAmount('480.00');
      const spy = spyOn(component.confirmRequested, 'emit');
      component['onConfirmClick']();
      expect(spy).not.toHaveBeenCalled();
    });

    it('an invalid amount string blocks confirm', () => {
      setAmount('abc');
      expect(component['returnedCents']).toBeNull();
      expect(component['canConfirm']).toBeFalse();
    });
  });

  // ── OBRS-960: money parsing uses cents, never float arithmetic ───────────
  describe('discrepancy computation uses cents, not floats', () => {
    it('computes an exact discrepancy for a float-unsafe pair (0.1 + 0.2 trap family)', () => {
      component.detail = { ...DETAIL, expectedAmount: '20.00' };
      fixture.detectChanges();
      setAmount('19.90');
      // Naive float subtraction (20.00 - 19.90) can render as
      // -0.09999999999999964 in JS; the cents-based implementation must
      // yield an exact -0.10.
      expect(component['discrepancyAmount']()).toBe('-0.10');
    });

    it('emits the confirm payload as a decimal string derived from cents, not the raw input', () => {
      setAmount('500.00');
      const spy = spyOn(component.confirmRequested, 'emit');
      component['onConfirmClick']();
      expect(spy).toHaveBeenCalledWith({ returnedAmount: '500.00', discrepancyReason: undefined });
    });

    it('omits discrepancyReason on the emitted payload when balanced (never a stray keystroke)', () => {
      setAmount('500.00');
      setReason('typed then deleted logic — should not be sent');
      component['discrepancyReasonInput'] = ''; // no discrepancy path never surfaces this field anyway
      const spy = spyOn(component.confirmRequested, 'emit');
      component['onConfirmClick']();
      expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({ discrepancyReason: undefined }));
    });

    it('includes the trimmed discrepancyReason when unbalanced', () => {
      setAmount('480.00');
      setReason('  short by 20  ');
      const spy = spyOn(component.confirmRequested, 'emit');
      component['onConfirmClick']();
      expect(spy).toHaveBeenCalledWith({ returnedAmount: '480.00', discrepancyReason: 'short by 20' });
    });
  });

  it('resets the form when a DIFFERENT day is opened, keeps it when the SAME day re-emits', () => {
    setAmount('480.00');
    setReason('note');

    // Same day (a detail patch on the same round) must not wipe the form.
    component.detail = { ...DETAIL };
    component.ngOnChanges({});
    expect(component['returnedAmountInput']).toBe('480.00');

    // A different day starts clean.
    component.summary = { ...component.summary!, dayId: 2 };
    component.detail = { ...DETAIL, dayId: 2 };
    component.ngOnChanges({});
    expect(component['returnedAmountInput']).toBe('');
    expect(component['discrepancyReasonInput']).toBe('');
  });

  it('renders the unmapped-sales-point note on the entry line, not a separate section', () => {
    const notes = fixture.debugElement.queryAll(By.css('[data-testid="driver-cash-entry-unmapped-note"]'));
    expect(notes.length).toBe(1);
  });

  // ── Contrast: the new .driver-cash-return-entry-note colored element ─────
  describe('contrast — the unmapped-remit-line note (OBRS-960)', () => {
    const PAGE_CHAIN = ['admin-shell theme-admin'];
    let teardown: (() => void) | null = null;

    afterEach(() => {
      teardown?.();
      teardown = null;
    });

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';
      it(`${mode}: meets AA on the surface actually painted`, () => {
        teardown = mountInChain(fixture.nativeElement, PAGE_CHAIN, dark);
        fixture.detectChanges();

        const el = fixture.nativeElement.querySelector(
          '[data-testid="driver-cash-entry-unmapped-note"]'
        ) as HTMLElement;
        expect(el).not.toBeNull();
        const ratio = contrast(fgOf(el), effectiveBg(el));
        expect(ratio)
          .withContext(`${mode}: ${toHex(fgOf(el))} on ${toHex(effectiveBg(el))} = ${ratio.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });
});

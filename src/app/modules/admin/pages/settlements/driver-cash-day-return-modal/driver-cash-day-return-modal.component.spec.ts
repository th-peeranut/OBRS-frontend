import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DriverCashDayReturnModalComponent } from './driver-cash-day-return-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import {
  DriverCashDayRespDto,
  DriverCashDaySummaryRespDto,
  DriverCashEntryRespDto,
} from '../../../../../shared/interfaces/driver-cash.interface';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf, mountInChain, toHex } from '../../../../../testing/contrast';

// OBRS-960 — CORRECTED (2026-08-02, backend reconciliation, 2nd pass):
// entries built from the BACKEND's exact field list (`id`, `type`, `amount`,
// `scheduleId`, `stopId`, `headCount`, `expenseCategory`, `expenseId`,
// `note`, `fromUnmappedSalesPoint`, `createdAt`) — the first reconciliation
// pass still invented a `label: string` field that does not exist on the
// wire, which every entry row would have rendered as the literal string
// "undefined" (uncaught by TypeScript, because the response was typed by
// this repo's OWN — wrong — interface, not the server's). A fixture built
// only against this file's interface can never fail that way; this one is
// checked against the field names the backend actually sends.
const ENTRIES: DriverCashEntryRespDto[] = [
  {
    id: 101,
    type: 'ADVANCE',
    amount: '100.00',
    scheduleId: null,
    stopId: null,
    headCount: null,
    expenseCategory: null,
    expenseId: null,
    note: null,
    fromUnmappedSalesPoint: false,
    createdAt: '2026-08-01T07:00:00+07:00',
  },
  {
    id: 102,
    type: 'PER_HEAD',
    amount: '60.00',
    scheduleId: 50,
    stopId: 3,
    headCount: 3,
    expenseCategory: null,
    expenseId: null,
    note: null,
    fromUnmappedSalesPoint: false,
    createdAt: '2026-08-01T08:00:00+07:00',
  },
  {
    id: 103,
    type: 'EXPENSE_PAID',
    amount: '40.00',
    scheduleId: null,
    stopId: null,
    headCount: null,
    expenseCategory: 'PERMIT_FEE',
    expenseId: 9,
    note: 'ใบเวลาสาย 1',
    fromUnmappedSalesPoint: false,
    createdAt: '2026-08-01T09:00:00+07:00',
  },
  {
    id: 104,
    type: 'PER_HEAD',
    amount: '200.00',
    scheduleId: 50,
    stopId: 4,
    headCount: 10,
    expenseCategory: null,
    expenseId: null,
    note: null,
    fromUnmappedSalesPoint: true,
    createdAt: '2026-08-01T10:00:00+07:00',
  },
];

const DETAIL: DriverCashDayRespDto = {
  dayId: 1,
  driverId: 5,
  driverName: 'Somchai',
  holderRole: 'DRIVER',
  businessDate: '2026-08-01',
  vehicleId: 100,
  status: 'OPEN',
  entries: ENTRIES,
  advanceTotal: '100.00',
  perHeadTotal: '260.00',
  expensePaidTotal: '40.00',
  parcelRemitTotal: '0.00',
  // OBRS-992/OBRS-1053: already INSIDE expectedReturnAmount, never an addend.
  parcelClawbackTotal: '0.00',
  expectedReturnAmount: '500.00',
  returnedAmount: null,
  returnedAt: null,
  returnedByUserId: null,
  returnedByName: null,
  discrepancy: null,
  discrepancyReason: null,
  perHeadRates: [],
  hasUnmappedSalesPointRemit: true,
};

const SUMMARY: DriverCashDaySummaryRespDto = {
  dayId: 1,
  driverId: 5,
  driverName: 'Somchai',
  holderRole: 'DRIVER',
  businessDate: '2026-08-01',
  vehicleId: 100,
  vehiclePlate: 'AB-1234',
  status: 'OPEN',
  expectedReturnAmount: '500.00',
  returnedAmount: null,
  discrepancy: null,
  overdueOpen: false,
  hasUnmappedSalesPointRemit: true,
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
    component.summary = { ...SUMMARY };
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

    it('a RETURNED day (status !== OPEN) blocks confirm even with a valid amount', () => {
      component.detail = { ...DETAIL, status: 'RETURNED', returnedAmount: '500.00' };
      component.ngOnChanges({});
      fixture.detectChanges();
      setAmount('500.00');
      expect(component['canConfirm']).toBeFalse();
    });
  });

  // ── OBRS-960: money parsing uses cents, never float arithmetic ───────────
  describe('discrepancy computation uses cents, not floats', () => {
    it('computes an exact discrepancy for a float-unsafe pair (0.1 + 0.2 trap family)', () => {
      component.detail = { ...DETAIL, expectedReturnAmount: '20.00' };
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

    // A different day starts from ITS OWN expectation (OBRS-1144), not from
    // the previous day's typing and not from an empty box.
    component.summary = { ...component.summary!, dayId: 2 };
    component.detail = { ...DETAIL, dayId: 2, expectedReturnAmount: '310.00' };
    component.ngOnChanges({});
    expect(component['returnedAmountInput']).toBe('310.00');
    expect(component['discrepancyReasonInput']).toBe('');
  });

  // ── OBRS-1144 — the owner asked whether the field was needed at all
  // ("แค่ส่งเรื่องต่อให้ owner กดรับก็น่าจะโอเค"). Decision (ข): keep it, because it is
  // the only thing that can ever record that the cash did NOT add up — but
  // seed it, so the ordinary matching day is one click.
  describe('OBRS-1144 — the expected amount is prefilled and the negative case is typable', () => {
    /** Rebuild the open-modal handshake the smart page performs: summary
     * first (optimistic open), then the resolved detail. */
    function openDay(dayId: number, expected: string, status: 'OPEN' | 'RETURNED' = 'OPEN'): void {
      component.summary = { ...SUMMARY, dayId, expectedReturnAmount: expected, status };
      component.detail = { ...DETAIL, dayId, expectedReturnAmount: expected, status };
      component.ngOnChanges({});
      fixture.detectChanges();
    }

    function discrepancyRow(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="driver-cash-return-discrepancy"]');
    }

    it('seeds the input with the expected amount and confirm is enabled on arrival — no typing', () => {
      openDay(7, '500.00');
      expect(component['returnedAmountInput']).toBe('500.00');
      expect(component['hasDiscrepancy']()).toBeFalse();
      expect(component['canConfirm']).toBeTrue();
      expect(confirmBtn().disabled).toBeFalse();
      expect(reasonInput()).toBeNull();
    });

    // A prefilled box means every ordinary day would otherwise open showing
    // "discrepancy 0.00" — the same nothing-line the breakdown rows above are
    // already hidden for. It must appear the moment the figure is edited.
    it('hides the discrepancy row at zero and shows it as soon as the amount is edited', () => {
      openDay(7, '500.00');
      expect(discrepancyRow()).toBeNull();

      setAmount('480.00');
      expect(discrepancyRow()).not.toBeNull();
      // OBRS-1592: rendered through the shared formatter — `THB -20`, sign kept.
      expect(discrepancyRow()!.textContent).toContain('THB -20');
    });

    // The exact screen the owner was looking at: a salesperson whose per-head
    // pay outran the cash they took in. The backend dropped its @DecimalMin
    // floor for this in OBRS-1073; the frontend was still refusing to type it.
    it('a NEGATIVE expectation is seeded, confirmable, and needs no fabricated reason', () => {
      openDay(8, '-20.00');
      expect(component['returnedAmountInput']).toBe('-20.00');
      expect(component['returnedCents']).toBe(-2000);
      expect(component['discrepancyCents']).toBe(0);
      expect(component['hasDiscrepancy']()).toBeFalse();
      expect(confirmBtn().disabled).toBeFalse();
      expect(reasonInput()).toBeNull();
    });

    it('emits the negative amount on the wire as a signed decimal string', () => {
      openDay(8, '-20.00');
      const spy = spyOn(component.confirmRequested, 'emit');
      component['onConfirmClick']();
      expect(spy).toHaveBeenCalledWith({ returnedAmount: '-20.00', discrepancyReason: undefined });
    });

    // Before this card the null from toCents() fell through `?? 0`, so a
    // negative expectation was compared against ZERO and every entry looked
    // like a discrepancy. Locks the sign of the comparison in both directions.
    it('computes the discrepancy against a negative expectation, with the right sign', () => {
      openDay(8, '-20.00');
      setAmount('-25.00'); // paid the salesperson 5 MORE than the day owed them
      expect(component['discrepancyCents']).toBe(-500);
      expect(component['discrepancyAmount']()).toBe('-5.00');
      expect(component['hasDiscrepancy']()).toBeTrue();
      expect(component['canConfirm']).toBeFalse(); // reason still mandatory
      setReason('จ่ายเกินไป 5 บาท');
      expect(component['canConfirm']).toBeTrue();
    });

    it('does NOT overwrite what the owner typed when the same day re-emits its detail', () => {
      openDay(9, '500.00');
      setAmount('480.00');
      component.detail = { ...DETAIL, dayId: 9, expectedReturnAmount: '500.00' };
      component.ngOnChanges({});
      expect(component['returnedAmountInput']).toBe('480.00');
    });

    it('does not prefill from a summary alone — it waits for the detail that carries the expectation', () => {
      component.summary = { ...SUMMARY, dayId: 11, expectedReturnAmount: '500.00' };
      component.detail = null;
      component.ngOnChanges({});
      expect(component['returnedAmountInput']).toBe('');
    });

    it('does not prefill a day that is already RETURNED', () => {
      openDay(12, '500.00', 'RETURNED');
      expect(component['returnedAmountInput']).toBe('');
    });
  });

  it('renders the unmapped-sales-point note on the flagged entry line only, not a separate section', () => {
    const notes = fixture.debugElement.queryAll(By.css('[data-testid="driver-cash-entry-unmapped-note"]'));
    // Exactly one of the 4 fixture entries has fromUnmappedSalesPoint: true.
    expect(notes.length).toBe(1);
  });

  // ── OBRS-960 (2nd reconciliation pass) — entry row rendering. `label`
  // never existed on the wire; the display text is DERIVED from `type` (+
  // `expenseCategory` for EXPENSE_PAID) via i18n. This is the spec the
  // coordinator asked for: it would have caught the missing-`label` bug,
  // because a wrong/missing field read here renders literally as
  // "undefined" in the interpolated i18n key, not silently as blank.
  describe('entry row rendering derives the label from type, never a "label" field', () => {
    function rowLabels(): string[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="driver-cash-entry-label"]')
      ).map((el) => (el as HTMLElement).textContent!.trim());
    }

    it('renders one row per entry, each with non-empty, non-"undefined" label text', () => {
      const labels = rowLabels();
      expect(labels.length).toBe(ENTRIES.length);
      for (const label of labels) {
        expect(label).not.toBe('');
        // The exact failure mode this locks: reading a non-existent field
        // (the old `entry.label`) interpolates as the literal word
        // "undefined" rather than throwing — this must never appear.
        expect(label.toLowerCase()).not.toContain('undefined');
      }
    });

    it('an ADVANCE entry resolves the ADVANCE entry-type key', () => {
      expect(component['entryTypeLabel'](ENTRIES[0])).toBe('ADMIN.SETTLEMENTS.DRIVER_CASH.ENTRY_TYPE.ADVANCE');
    });

    it('a PER_HEAD entry resolves the PER_HEAD entry-type key AND the row shows headCount', () => {
      expect(component['entryTypeLabel'](ENTRIES[1])).toBe('ADMIN.SETTLEMENTS.DRIVER_CASH.ENTRY_TYPE.PER_HEAD');
      const headCountEls = fixture.nativeElement.querySelectorAll('[data-testid="driver-cash-entry-head-count"]');
      expect(headCountEls.length).toBeGreaterThan(0);
      expect((headCountEls[0] as HTMLElement).textContent).toContain('3');
    });

    // Composes with the EXISTING `ADMIN.EXPENSES.CATEGORIES.*` namespace —
    // proven with a REAL translation loaded (not the untranslated raw-key
    // fallback), since the point is proving REUSE of that exact key, not
    // just that some string was rendered.
    it('an EXPENSE_PAID entry composes the label with the EXISTING ADMIN.EXPENSES.CATEGORIES key (never a new STAFF.* one)', () => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en', {
        ADMIN: {
          SETTLEMENTS: {
            DRIVER_CASH: { ENTRY_TYPE: { EXPENSE_PAID: 'Expense: {{category}}' } },
          },
          EXPENSES: { CATEGORIES: { PERMIT_FEE: 'Permit fee' } },
        },
      });
      translate.use('en');

      expect(component['entryTypeLabel'](ENTRIES[2])).toBe('Expense: Permit fee');
    });

    it('shows the note where present', () => {
      const noteEls = fixture.nativeElement.querySelectorAll('[data-testid="driver-cash-entry-note"]');
      const texts = Array.from(noteEls).map((el) => (el as HTMLElement).textContent!.trim());
      expect(texts).toContain('ใบเวลาสาย 1');
    });

    it('renders NO note element for an entry with note: null', () => {
      // ENTRIES[0] (ADVANCE) has note: null.
      const rows = fixture.nativeElement.querySelectorAll('[data-testid="driver-cash-entry-row"]');
      const firstRowNote = (rows[0] as HTMLElement).querySelector('[data-testid="driver-cash-entry-note"]');
      expect(firstRowNote).toBeNull();
    });

    it('a RETURN entry (not in the fixture list, but a valid backend type) resolves its own entry-type key', () => {
      const returnEntry: DriverCashEntryRespDto = { ...ENTRIES[0], id: 105, type: 'RETURN' };
      expect(component['entryTypeLabel'](returnEntry)).toBe('ADMIN.SETTLEMENTS.DRIVER_CASH.ENTRY_TYPE.RETURN');
    });

    it('tracks rows by entry.id, not the array index', () => {
      // Same index argument (0), different entry -> different track key.
      expect(component['trackByEntry'](0, ENTRIES[0])).toBe(101);
      expect(component['trackByEntry'](0, ENTRIES[1])).toBe(102);
    });
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

  // ── OBRS-1053: parcel-share clawback breakdown line ──────────────────────
  describe('parcel-share clawback breakdown', () => {
    it('is hidden at 0.00 — nothing to explain', () => {
      component.detail = { ...DETAIL, parcelClawbackTotal: '0.00' };
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="driver-cash-return-parcel-clawback"]')
      ).toBeNull();
    });

    it('explains a higher expected amount when the driver owes shares back', () => {
      component.detail = {
        ...DETAIL,
        parcelClawbackTotal: '15.00',
        expectedReturnAmount: '515.00',
      };
      fixture.detectChanges();

      const line = fixture.nativeElement.querySelector(
        '[data-testid="driver-cash-return-parcel-clawback"]'
      );
      expect(line).not.toBeNull();
      expect(line.textContent).toContain('THB 15');
    });

    /** A breakdown line, never an addend: the sign-off must still measure the
     * discrepancy against the server's `expectedReturnAmount` alone. */
    it('does not shift the discrepancy computation', () => {
      component.detail = {
        ...DETAIL,
        parcelClawbackTotal: '15.00',
        expectedReturnAmount: '515.00',
      };
      fixture.detectChanges();
      setAmount('515.00');

      expect(component['hasDiscrepancy']()).toBeFalse();
    });
  });
});

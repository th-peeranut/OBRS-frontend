import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { Observable, of, throwError } from 'rxjs';
import { AppRefundDestinationFieldsComponent } from './refund-destination-fields.component';
import { buildRefundDestinationForm } from '../../lib/refund-destination-form';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf, mountInChain } from '../../../testing/contrast';
import { BankService } from '../../../services/bank/bank.service';
import { BankDto } from '../../interfaces/bank.interface';

const BANKS: BankDto[] = [
  { code: '002', nameTh: 'ธนาคารกรุงเทพ', nameEn: 'Bangkok Bank', nameZh: '盘谷银行' },
  { code: '004', nameTh: 'ธนาคารกสิกรไทย', nameEn: 'Kasikornbank', nameZh: '开泰银行' },
  { code: '014', nameTh: 'ธนาคารไทยพาณิชย์', nameEn: 'Siam Commercial Bank', nameZh: '汇商银行' },
];

/** Stands in for the real HTTP-backed service — `banks$` is swapped per test. */
class BankServiceStub {
  banks$: Observable<BankDto[]> = of(BANKS);
  resetCalls = 0;
  getBanks(): Observable<BankDto[]> {
    return this.banks$;
  }
  resetCache(): void {
    this.resetCalls += 1;
  }
}

describe('AppRefundDestinationFieldsComponent (OBRS-286)', () => {
  let fixture: ComponentFixture<AppRefundDestinationFieldsComponent>;
  let component: AppRefundDestinationFieldsComponent;
  let bankService: BankServiceStub;

  beforeEach(async () => {
    bankService = new BankServiceStub();

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [AppRefundDestinationFieldsComponent],
      providers: [{ provide: BankService, useValue: bankService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AppRefundDestinationFieldsComponent);
    component = fixture.componentInstance;
    component.formGroup = buildRefundDestinationForm(TestBed.inject(FormBuilder));
    fixture.detectChanges();
  });

  /** Opens the bank_account branch and returns the bank combobox input. */
  function openBankAccountMode(): HTMLInputElement {
    fixture.debugElement.queryAll(By.css('.rdf-toggle-btn'))[0].nativeElement.click();
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('#rdf-bank') as HTMLInputElement;
  }

  it('renders no destination fields until a mode is chosen (§3.1: no pre-selection)', () => {
    expect(fixture.debugElement.query(By.css('.rdf-input'))).toBeNull();
    expect(fixture.debugElement.queryAll(By.css('.rdf-toggle-btn')).length).toBe(2);
  });

  it('shows the three bank fields when bank_account is selected', () => {
    fixture.debugElement.queryAll(By.css('.rdf-toggle-btn'))[0].nativeElement.click();
    fixture.detectChanges();

    expect(component.formGroup.get('mode')?.value).toBe('bank_account');
    expect(fixture.debugElement.queryAll(By.css('.rdf-field')).length).toBe(3);
    expect(fixture.debugElement.query(By.css('#rdf-promptpay-phone'))).toBeNull();
  });

  it('shows only the promptpay phone field when promptpay is selected', () => {
    fixture.debugElement.queryAll(By.css('.rdf-toggle-btn'))[1].nativeElement.click();
    fixture.detectChanges();

    expect(component.formGroup.get('mode')?.value).toBe('promptpay');
    expect(fixture.debugElement.query(By.css('#rdf-promptpay-phone'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('#rdf-account-name'))).toBeNull();
  });

  it('surfaces the check-digit error distinctly from the generic pattern error', () => {
    fixture.debugElement.queryAll(By.css('.rdf-toggle-btn'))[1].nativeElement.click();
    const control = component.formGroup.get('promptpayPhone')!;
    control.setValue('1101700156175');
    control.markAsTouched();
    fixture.detectChanges();

    const errors = fixture.debugElement.queryAll(By.css('.rdf-error'));
    expect(errors.length).toBe(1);
    expect(errors[0].nativeElement.textContent).toContain('REFUND_DESTINATION.ERROR.CHECK_DIGIT');
  });

  it('accepts a valid 13-digit national ID with no error shown (OBRS-1462)', () => {
    fixture.debugElement.queryAll(By.css('.rdf-toggle-btn'))[1].nativeElement.click();
    const control = component.formGroup.get('promptpayPhone')!;
    control.setValue('1101700156176');
    control.markAsTouched();
    fixture.detectChanges();

    expect(control.valid).toBeTrue();
    expect(fixture.debugElement.queryAll(By.css('.rdf-error')).length).toBe(0);
  });

  it('ignores clicks while disabled', () => {
    component.disabled = true;
    fixture.detectChanges();
    fixture.debugElement.queryAll(By.css('.rdf-toggle-btn'))[0].nativeElement.click();
    expect(component.formGroup.get('mode')?.value).toBeNull();
  });

  // ── OBRS-1463: the bank field is a picker over `EThaiBank`, not free text.
  describe('the bank picker (OBRS-1463)', () => {
    it('writes the BANK CODE to the form, never the name the user read', () => {
      const input = openBankAccountMode();
      input.dispatchEvent(new Event('focus'));
      fixture.detectChanges();

      const options = fixture.debugElement.queryAll(By.css('.rdf-bank-option'));
      expect(options.length).toBe(BANKS.length);
      options[1].nativeElement.click();
      fixture.detectChanges();

      // "ธนาคารกสิกรไทย" is what the customer saw; "004" is what the backend validates.
      expect(component.formGroup.get('bank')?.value).toBe('004');
      expect(input.value).toBe('ธนาคารกสิกรไทย');
    });

    it('typing filters the list and leaves the form untouched until an option is picked', () => {
      const input = openBankAccountMode();
      input.dispatchEvent(new Event('focus'));
      fixture.detectChanges();

      input.value = 'กสิกร';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const options = fixture.debugElement.queryAll(By.css('.rdf-bank-option'));
      expect(options.length).toBe(1);
      // The whole point of the card: what was typed is not what gets stored.
      expect(component.formGroup.get('bank')?.value).toBe('');
    });

    it('filters on the 3-digit code too — a customer who knows only that should not have to guess our spelling', () => {
      const input = openBankAccountMode();
      input.dispatchEvent(new Event('focus'));
      input.value = '014';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const options = fixture.debugElement.queryAll(By.css('.rdf-bank-option'));
      expect(options.length).toBe(1);
      expect(options[0].nativeElement.textContent).toContain('ธนาคารไทยพาณิชย์');
    });

    it('shows a retry instead of an empty picker when the list cannot be loaded', () => {
      bankService.banks$ = throwError(() => new Error('offline'));
      const rebuilt = TestBed.createComponent(AppRefundDestinationFieldsComponent);
      rebuilt.componentInstance.formGroup = buildRefundDestinationForm(TestBed.inject(FormBuilder));
      rebuilt.detectChanges();
      rebuilt.debugElement.queryAll(By.css('.rdf-toggle-btn'))[0].nativeElement.click();
      rebuilt.detectChanges();

      const retry = rebuilt.nativeElement.querySelector('.rdf-retry') as HTMLButtonElement;
      expect(retry).not.toBeNull();
      expect((rebuilt.nativeElement.querySelector('#rdf-bank') as HTMLInputElement).disabled).toBeTrue();

      bankService.banks$ = of(BANKS);
      retry.click();
      rebuilt.detectChanges();

      // resetCache is what makes the retry mean anything: shareReplay would
      // otherwise hand the same failure to every later subscriber.
      expect(bankService.resetCalls).toBe(1);
      expect(rebuilt.nativeElement.querySelector('.rdf-retry')).toBeNull();
      rebuilt.destroy();
    });
  });

  // ── OBRS-286 UI spec — cross-shell contrast, measured in all FOUR
  // combinations (customer light/dark × admin light/dark). A themed
  // foreground is only correct over a themed background (design-system
  // §2.4.0) — `mountInChain`/`effectiveBg` from src/app/testing/contrast.ts
  // measure the REAL painted ancestor rather than assuming one. Working
  // reference: override-cancel-modal.component.spec.ts (FRONTEND-GOTCHAS).
  describe('contrast across the four shell/theme combinations', () => {
    let teardown: (() => void) | null = null;

    afterEach(() => {
      teardown?.();
      teardown = null;
    });

    function selectPromptpay(): void {
      fixture.debugElement.queryAll(By.css('.rdf-toggle-btn'))[1].nativeElement.click();
      fixture.detectChanges();
    }

    const cases: { label: string; chain: string[]; dark: boolean }[] = [
      { label: 'customer light', chain: [], dark: false },
      { label: 'customer dark', chain: [], dark: true },
      { label: 'admin light', chain: ['admin-shell theme-admin', 'admin-modal'], dark: false },
      { label: 'admin dark', chain: ['admin-shell theme-admin', 'admin-modal'], dark: true },
    ];

    for (const { label, chain, dark } of cases) {
      it(`${label}: the title text meets AA on its real ancestor background`, () => {
        teardown = mountInChain(fixture.nativeElement, chain, dark);
        fixture.detectChanges();

        const title = fixture.nativeElement.querySelector('.rdf-title') as HTMLElement;
        const ratio = contrast(fgOf(title), effectiveBg(title));

        // eslint-disable-next-line no-console
        console.log(`[OBRS-286 contrast] ${label} .rdf-title = ${ratio.toFixed(2)}:1`);
        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${label}: the selected toggle's own fill/text pair meets AA`, () => {
        teardown = mountInChain(fixture.nativeElement, chain, dark);
        selectPromptpay();

        const selected = fixture.nativeElement.querySelector('.rdf-toggle-btn.is-selected') as HTMLElement;
        const ratio = contrast(fgOf(selected), effectiveBg(selected));

        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });

  describe('account number grouping (OBRS-1465)', () => {
    /** Opens bank_account mode and returns the account-number input. */
    function accountNumberInput(): HTMLInputElement {
      openBankAccountMode();
      return fixture.nativeElement.querySelector('#rdf-account-number') as HTMLInputElement;
    }

    /** Types `text` into the field the way a browser does: the element already
     * holds the new value and the caret sits at `caret` when `input` fires. */
    function type(input: HTMLInputElement, text: string, caret = text.length): void {
      input.value = text;
      input.setSelectionRange(caret, caret);
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('shows the number grouped while the control keeps bare digits (AC-2)', () => {
      const input = accountNumberInput();

      type(input, '1480622621');

      expect(input.value).toBe('148-0-62262-1');
      expect(component.formGroup.get('accountNumber')?.value).toBe('1480622621');
    });

    it('accepts a number pasted with its dashes already in it (AC-3)', () => {
      const input = accountNumberInput();

      type(input, '148-0-62262-1');

      expect(component.formGroup.get('accountNumber')?.value).toBe('1480622621');
      expect(input.value).toBe('148-0-62262-1');
    });

    it('keeps a non-digit out of the control, as obrsDigitsOnly used to (OBRS-1464)', () => {
      const input = accountNumberInput();

      type(input, '148x0');

      expect(component.formGroup.get('accountNumber')?.value).toBe('1480');
      expect(input.value).toBe('148-0');
    });

    it('leaves the caret after the digit just typed mid-string, not at the end (AC-4)', () => {
      const input = accountNumberInput();
      type(input, '1480622621');

      // Caret after the '0' (index 5 of '148-0-62262-1'), then a 9 is typed.
      type(input, '148-09-62262-1', 6);

      expect(input.value).toBe('148-0-96226-2-1');
      // The 9 is the 5th digit; the caret belongs right after it, at index 7.
      expect(input.selectionStart).toBe(7);
      expect(input.selectionStart).not.toBe(input.value.length);
    });

    it('regroups when the bank changes, with no keystroke involved', () => {
      const input = accountNumberInput();
      type(input, '054590056674');
      expect(input.value).toBe('054-5-90056-6-74');

      component.formGroup.get('bank')?.setValue('030');
      fixture.detectChanges();

      expect(input.value).toBe('0-5459005667-4');
      expect(component.formGroup.get('accountNumber')?.value).toBe('054590056674');
    });

    it('marks the control touched on blur so the required error can show', () => {
      const input = accountNumberInput();

      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(component.formGroup.get('accountNumber')?.touched).toBeTrue();
    });
  });
});

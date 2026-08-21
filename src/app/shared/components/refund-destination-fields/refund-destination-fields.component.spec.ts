import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { AppRefundDestinationFieldsComponent } from './refund-destination-fields.component';
import { buildRefundDestinationForm } from '../../lib/refund-destination-form';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf, mountInChain } from '../../../testing/contrast';

describe('AppRefundDestinationFieldsComponent (OBRS-286)', () => {
  let fixture: ComponentFixture<AppRefundDestinationFieldsComponent>;
  let component: AppRefundDestinationFieldsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [AppRefundDestinationFieldsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AppRefundDestinationFieldsComponent);
    component = fixture.componentInstance;
    component.formGroup = buildRefundDestinationForm(TestBed.inject(FormBuilder));
    fixture.detectChanges();
  });

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
});

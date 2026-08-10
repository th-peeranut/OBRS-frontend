import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReportUsabilityFabComponent } from './report-usability-fab.component';
import { UsabilityReportService } from '../../../services/usability-report/usability-report.service';
import { AlertService } from '../../services/alert.service';
import { SelectButtonModule } from 'primeng/selectbutton';
import { CommonModule } from '@angular/common';
import { UsabilityReportReceipt } from '../../interfaces/usability-report.interface';

describe('ReportUsabilityFabComponent', () => {
  let fixture: ComponentFixture<ReportUsabilityFabComponent>;
  let component: ReportUsabilityFabComponent;
  let usabilityReportServiceSpy: jasmine.SpyObj<UsabilityReportService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    usabilityReportServiceSpy = jasmine.createSpyObj('UsabilityReportService', ['submitReport']);
    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot(), SelectButtonModule],
      declarations: [ReportUsabilityFabComponent],
      providers: [
        { provide: UsabilityReportService, useValue: usabilityReportServiceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
        { provide: Router, useValue: { url: '/home' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportUsabilityFabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // (a) FAB renders; clicking opens modal synchronously
  it('should render the FAB button and open the modal synchronously on click', () => {
    const fab = fixture.nativeElement.querySelector('.report-fab') as HTMLButtonElement;
    expect(fab).withContext('FAB button should be in the DOM').toBeTruthy();
    expect(component['isModalOpen']).toBeFalse();

    fab.click();

    // Modal must be open IMMEDIATELY — no async/setTimeout
    expect(component['isModalOpen']).withContext('Modal should open synchronously').toBeTrue();

    usabilityReportServiceSpy.submitReport.calls.reset();
    expect(usabilityReportServiceSpy.submitReport).not.toHaveBeenCalled();
  });

  // (b) Submit with empty description shows required error and does NOT call submitReport
  it('should show description required error and not call submitReport when description is empty', () => {
    component['isModalOpen'] = true;
    fixture.detectChanges();

    // Ensure description is empty
    component['form'].get('description')?.setValue('');
    component.onSubmit();

    fixture.detectChanges();

    expect(usabilityReportServiceSpy.submitReport)
      .withContext('submitReport must NOT be called when description is empty')
      .not.toHaveBeenCalled();

    const descCtrl = component['form'].get('description');
    expect(descCtrl?.touched).withContext('description control should be touched').toBeTrue();
    expect(component['descriptionInvalid'])
      .withContext('descriptionInvalid should be true')
      .toBeTrue();
  });

  // (b2) Whitespace-only description: no HTTP dispatched AND the required message is rendered in the DOM
  it('should block submit and render the required error message for whitespace-only description', () => {
    component['isModalOpen'] = true;
    fixture.detectChanges();

    // Set whitespace-only value — Validators.required would pass this, trimmedRequired must not
    component['form'].get('description')?.setValue('   ');
    component.onSubmit();
    fixture.detectChanges();

    expect(usabilityReportServiceSpy.submitReport)
      .withContext('submitReport must NOT be called for whitespace-only description')
      .not.toHaveBeenCalled();

    expect(component['descriptionInvalid'])
      .withContext('descriptionInvalid must be true for whitespace-only input')
      .toBeTrue();

    // The REQUIRED message must be rendered in the DOM (not just in component state)
    const errorEls = fixture.nativeElement.querySelectorAll('.report-field__error') as NodeListOf<HTMLElement>;
    const requiredMsgEl = Array.from(errorEls).find((el) =>
      el.textContent?.includes('USABILITY_REPORT.DESCRIPTION.REQUIRED')
    );
    expect(requiredMsgEl)
      .withContext('The description required error element must be visible in the DOM')
      .toBeTruthy();
  });

  // (b3) OBRS-108: optional reporter email — field exists, empty submits, valid email is sent
  it('should render an optional email field and submit successfully with no email', () => {
    component['isModalOpen'] = true;
    fixture.detectChanges();

    const emailInput = fixture.nativeElement.querySelector(
      '#report-email'
    ) as HTMLInputElement;
    expect(emailInput).withContext('optional email input should be in the DOM').toBeTruthy();

    const receipt: UsabilityReportReceipt = {
      id: 1,
      category: 'bug',
      status: 'new',
      imageCount: 0,
      createdAt: '',
    };
    usabilityReportServiceSpy.submitReport.and.returnValue(of(receipt));

    component['form'].get('description')?.setValue('Some description');
    component['form'].get('reporterEmail')?.setValue('');
    component.onSubmit();

    expect(usabilityReportServiceSpy.submitReport)
      .withContext('submit must succeed with an empty (anonymous) email')
      .toHaveBeenCalledTimes(1);
    const sentFormData = usabilityReportServiceSpy.submitReport.calls.mostRecent()
      .args[0] as FormData;
    expect(sentFormData.get('reporterEmail')).toBe('');
  });

  it('should include a valid reporter email in the submit payload', () => {
    component['isModalOpen'] = true;
    fixture.detectChanges();

    const receipt: UsabilityReportReceipt = {
      id: 1,
      category: 'bug',
      status: 'new',
      imageCount: 0,
      createdAt: '',
    };
    usabilityReportServiceSpy.submitReport.and.returnValue(of(receipt));

    component['form'].get('description')?.setValue('Some description');
    component['form'].get('reporterEmail')?.setValue('reporter@example.com');
    component.onSubmit();

    expect(usabilityReportServiceSpy.submitReport).toHaveBeenCalledTimes(1);
    const sentFormData = usabilityReportServiceSpy.submitReport.calls.mostRecent()
      .args[0] as FormData;
    expect(sentFormData.get('reporterEmail')).toBe('reporter@example.com');
  });

  it('should block submit on an invalid (non-empty) reporter email and show an inline hint', () => {
    component['isModalOpen'] = true;
    fixture.detectChanges();

    component['form'].get('description')?.setValue('Some description');
    component['form'].get('reporterEmail')?.setValue('not-an-email');
    component.onSubmit();
    fixture.detectChanges();

    expect(usabilityReportServiceSpy.submitReport)
      .withContext('submitReport must NOT be called with an invalid email')
      .not.toHaveBeenCalled();
    expect(component['emailInvalid'])
      .withContext('emailInvalid should be true for a malformed, non-empty email')
      .toBeTrue();

    const errorEls = fixture.nativeElement.querySelectorAll('.report-field__error') as NodeListOf<HTMLElement>;
    const invalidMsgEl = Array.from(errorEls).find((el) =>
      el.textContent?.includes('USABILITY_REPORT.EMAIL.INVALID')
    );
    expect(invalidMsgEl)
      .withContext('the invalid-email hint must be visible in the DOM')
      .toBeTruthy();
  });

  // (c) Error code mapping: known → specific key; unknown → GENERIC; reads err?.error?.errorCode
  it('should map known errorCode to specific i18n key and unknown to GENERIC', () => {
    const translateService = TestBed.inject(TranslateService);
    spyOn(translateService, 'instant').and.callFake((key: string) => key);

    component['isModalOpen'] = true;
    fixture.detectChanges();

    const receipt: UsabilityReportReceipt = {
      id: 1,
      category: 'bug',
      status: 'new',
      imageCount: 0,
      createdAt: '',
    };
    usabilityReportServiceSpy.submitReport.and.returnValue(of(receipt));

    // Test known error code: REPORT_RATE_LIMITED
    const rateLimitedError = { error: { errorCode: 'REPORT_RATE_LIMITED' } };
    usabilityReportServiceSpy.submitReport.and.returnValue(throwError(() => rateLimitedError));

    component['form'].get('description')?.setValue('Some description');
    component.onSubmit();

    expect(component['submitError'])
      .withContext('Known error code should resolve to specific key')
      .toBe('USABILITY_REPORT.ERROR.REPORT_RATE_LIMITED');

    // Test unknown error code falls back to GENERIC
    const unknownError = { error: { errorCode: 'UNKNOWN_CODE_XYZ' } };
    usabilityReportServiceSpy.submitReport.and.returnValue(throwError(() => unknownError));

    component['form'].get('description')?.setValue('Some description');
    component.onSubmit();

    expect(component['submitError'])
      .withContext('Unknown error code should fall back to GENERIC key')
      .toBe('USABILITY_REPORT.ERROR.GENERIC');

    // Test missing errorCode (reads from err?.error?.errorCode, not err.message)
    const noCodeError = { error: {}, message: 'Http error' };
    usabilityReportServiceSpy.submitReport.and.returnValue(throwError(() => noCodeError));

    component['form'].get('description')?.setValue('Some description');
    component.onSubmit();

    expect(component['submitError'])
      .withContext('Missing errorCode should fall back to GENERIC; must NOT read from err.message')
      .toBe('USABILITY_REPORT.ERROR.GENERIC');
  });

  // ── OBRS-1207: yield the click when something clickable is underneath ──────
  //
  // The E2E gate (`e2e/tests/obrs-1207-fab-occlusion.spec.ts`) is what proves
  // this works in a real cascade at a real scroll offset; these cover what it
  // cannot see, because they are about the DECISION rather than the outcome:
  // which elements count as a reason to yield, and that the decision does not
  // depend on the FAB appearing in the hit-test — which it does not, once
  // `pointer-events: none` has taken it out of the stack.
  describe('yield behaviour', () => {
    let fab: HTMLButtonElement;

    /** The FAB's stubbed box below; a victim centred here is one it covers. */
    const FAB_BOX = { left: 100, right: 200, top: 100, bottom: 148 };

    const boxAround = (cx: number, cy: number): DOMRect =>
      ({
        left: cx - 20, right: cx + 20, top: cy - 10, bottom: cy + 10,
        width: 40, height: 20, x: cx - 20, y: cy - 10,
      }) as DOMRect;

    /** Centred inside the FAB — the click point is taken. */
    const covered = (el: Element): Element => {
      spyOn(el, 'getBoundingClientRect').and.returnValue(boxAround(150, 124));
      return el;
    };

    /** Overlaps the FAB's edge but its centre is well clear of it. */
    const edgeOnly = (el: Element): Element => {
      spyOn(el, 'getBoundingClientRect').and.returnValue(boxAround(60, 124));
      return el;
    };

    /**
     * Drives `isClickableUnderFab` with a stubbed `elementsFromPoint`. Faking
     * the hit-test rather than the layout is deliberate: Karma's host has no
     * scrollable page to position anything under, so a "real" version of this
     * would be asserting against a layout that does not exist.
     */
    const withStack = (stack: Element[]): boolean => {
      const original = document.elementsFromPoint;
      document.elementsFromPoint = () => stack;
      try {
        return component['isClickableUnderFab'](fab);
      } finally {
        document.elementsFromPoint = original;
      }
    };

    beforeEach(() => {
      fab = fixture.nativeElement.querySelector('.report-fab') as HTMLButtonElement;
      // The method bails on a zero-sized box, and Karma's container gives it
      // one. The numbers are arbitrary; only non-zero matters.
      spyOn(fab, 'getBoundingClientRect').and.returnValue({
        ...FAB_BOX, width: 100, height: 48, x: FAB_BOX.left, y: FAB_BOX.top,
      } as DOMRect);
    });

    it('yields when it covers a clickable element\'s click point', () => {
      expect(withStack([covered(document.createElement('button'))])).toBeTrue();
    });

    it('does NOT yield when it only clips an edge and the click point is clear', () => {
      // Measured on 2026-08-10: yielding on any overlap left the FAB inert at
      // 54% of reachable offsets on /schedule-booking and 37% on /, because the
      // pill clips something clickable most of the way down a dense page. A
      // centre that is clear is still clickable at that centre, which is where
      // users and Playwright both aim — and is exactly what the E2E gate asserts.
      expect(withStack([edgeOnly(document.createElement('button'))])).toBeFalse();
    });

    it('does not yield for plain content underneath', () => {
      expect(
        withStack([covered(document.createElement('div')), covered(document.createElement('p'))])
      ).toBeFalse();
    });

    it('does not count ITSELF, its own children or its ancestors as a reason to yield', () => {
      // The failure mode this guards: once yielded, the FAB has
      // `pointer-events: none` and drops out of the hit-test entirely. A check
      // written as "anything below the FAB in the stack" would then find
      // nothing, clear the class, and re-detect on the next frame — forever.
      const icon = fab.querySelector('.material-symbols-outlined')!;
      const host = fab.parentElement!;
      expect(withStack([fab, covered(icon), covered(host), document.body])).toBeFalse();
    });

    it('yields for a role="button" that is not a <button>', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'button');
      expect(withStack([covered(div)])).toBeTrue();
    });

    it('ignores tabindex="-1", which is focusable by script but not by the user', () => {
      const div = document.createElement('div');
      div.setAttribute('tabindex', '-1');
      expect(withStack([covered(div)])).toBeFalse();
    });

    it('never yields while the modal is open — nothing underneath is reachable anyway', () => {
      const original = document.elementsFromPoint;
      document.elementsFromPoint = () => [covered(document.createElement('button'))];
      try {
        component['isModalOpen'] = true;
        component['applyYieldState']();
        expect(fab.classList.contains('report-fab--yield')).toBeFalse();

        component['isModalOpen'] = false;
        component['applyYieldState']();
        expect(fab.classList.contains('report-fab--yield')).toBeTrue();
      } finally {
        document.elementsFromPoint = original;
      }
    });

    it('tears down its listeners and any pending frame on destroy', () => {
      const removeSpy = spyOn(window, 'removeEventListener').and.callThrough();
      component['yieldRafId'] = requestAnimationFrame(() => undefined);
      fixture.destroy();
      expect(component['yieldRafId']).toBeNull();
      expect(removeSpy).toHaveBeenCalledWith('scroll', jasmine.any(Function), jasmine.anything());
      expect(component['yieldTeardown'].length).toBe(0);
    });
  });
});

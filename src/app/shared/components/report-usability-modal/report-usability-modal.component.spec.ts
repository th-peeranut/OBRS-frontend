import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ReportUsabilityModalComponent } from './report-usability-modal.component';
import { UsabilityReportService } from '../../../services/usability-report/usability-report.service';
import { AlertService } from '../../services/alert.service';
import { SelectButtonModule } from 'primeng/selectbutton';
import { CommonModule } from '@angular/common';
import { UsabilityReportReceipt } from '../../interfaces/usability-report.interface';
import { PendingButtonDirective } from '../../directives/pending-button.directive';
import { ReportUsabilityModalService } from '../../services/report-usability-modal.service';

describe('ReportUsabilityModalComponent', () => {
  let fixture: ComponentFixture<ReportUsabilityModalComponent>;
  let component: ReportUsabilityModalComponent;
  let usabilityReportServiceSpy: jasmine.SpyObj<UsabilityReportService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    usabilityReportServiceSpy = jasmine.createSpyObj('UsabilityReportService', ['submitReport']);
    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot(), SelectButtonModule],
      declarations: [ReportUsabilityModalComponent, PendingButtonDirective],
      providers: [
        { provide: UsabilityReportService, useValue: usabilityReportServiceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
        { provide: Router, useValue: { url: '/home' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportUsabilityModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // (a) OBRS-1832: the modal no longer owns a button. It renders NOTHING until a
  // trigger somewhere in the chrome asks, and that ask must land synchronously —
  // the user pressed a control and expects the dialog, not a frame later.
  it('renders nothing until the service asks, then opens synchronously', () => {
    expect(fixture.nativeElement.querySelector('.report-modal-backdrop'))
      .withContext('nothing may be painted before a trigger asks')
      .toBeNull();
    expect(component['isModalOpen']).toBeFalse();

    TestBed.inject(ReportUsabilityModalService).open();

    expect(component['isModalOpen']).withContext('opens synchronously').toBeTrue();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.report-modal-backdrop')).toBeTruthy();
  });

  // (a2) The element this card exists to remove must not come back in any form.
  it('paints no floating button of its own', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.report-fab')).toBeNull();
    expect(host.querySelector('button')).withContext('no button at rest').toBeNull();
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

});

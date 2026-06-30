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

  // (c) Error code mapping: known → specific key; unknown → GENERIC; reads err?.error?.errorCode
  it('should map known errorCode to specific i18n key and unknown to GENERIC', () => {
    const translateService = TestBed.inject(TranslateService);
    spyOn(translateService, 'instant').and.callFake((key: string) => key);

    component['isModalOpen'] = true;
    fixture.detectChanges();

    const receipt: UsabilityReportReceipt = {
      id: '1',
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

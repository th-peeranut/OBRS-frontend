import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { MyReportEditFormComponent } from './my-report-edit-form.component';
import { UsabilityReportService } from '../../../../services/usability-report/usability-report.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { MyUsabilityReportDetail } from '../../../../shared/interfaces/usability-report.interface';

describe('MyReportEditFormComponent', () => {
  let fixture: ComponentFixture<MyReportEditFormComponent>;
  let component: MyReportEditFormComponent;
  let serviceSpy: jasmine.SpyObj<UsabilityReportService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;

  const detail: MyUsabilityReportDetail = {
    id: 1,
    category: 'bug',
    status: 'new',
    description: 'Original description',
    routeUrl: '/home',
    images: [{ id: '5', publicUrl: 'https://x/5.png', contentType: 'image/png', sizeBytes: 10, position: 1 }],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    triageNote: null,
    editable: true,
    followUps: [],
  };

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj('UsabilityReportService', ['updateMyReport']);
    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [MyReportEditFormComponent],
      providers: [
        { provide: UsabilityReportService, useValue: serviceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MyReportEditFormComponent);
    component = fixture.componentInstance;
    component.detail = detail;
    fixture.detectChanges();
  });

  it('pre-seeds the form from the detail (category + description) and keepImageIds from existing images', () => {
    expect(component['form'].get('category')?.value).toBe('bug');
    expect(component['form'].get('description')?.value).toBe('Original description');
    expect(component['keepImageIds']).toEqual([5]);
  });

  // ── Scrutinize fix: existingImages is a SNAPSHOT, not a live getter ───────
  it('existingImagesSnapshot is captured ONCE at ngOnInit — a later @Input reseat does not change it', () => {
    const initialSnapshot = component['existingImagesSnapshot'];
    expect(initialSnapshot).toEqual(detail.images);

    // Simulate the parent modal reseating `detail` to a wholesale new object
    // (e.g. a background re-fetch landing) WHILE this form is still mounted —
    // Angular re-binds @Input()s on every parent CD pass regardless of
    // OnChanges, so this assigns the new reference exactly the way the real
    // binding would.
    component.detail = {
      ...detail,
      images: [
        { id: '99', publicUrl: 'https://x/99.png', contentType: 'image/png', sizeBytes: 1, position: 1 },
      ],
    };
    fixture.detectChanges();

    expect(component['existingImagesSnapshot'])
      .withContext('the snapshot must be immune to a later parent reseat of detail.images')
      .toEqual(initialSnapshot);
    expect(component['existingImagesSnapshot']).not.toEqual(component.detail.images);
  });

  it('blocks submit and shows the required error for a blank description', () => {
    component['form'].get('description')?.setValue('   ');
    component['onSubmit']();

    expect(serviceSpy.updateMyReport).not.toHaveBeenCalled();
    expect(component['descriptionInvalid']).toBeTrue();
  });

  it('onCategoryChange reads $event.id from the dropdown-obrs option object', () => {
    component['onCategoryChange']({ id: 'suggestion', label: 'Suggestion' });
    expect(component['form'].get('category')?.value).toBe('suggestion');
  });

  it('submits a multipart FormData with category/description/keepImageIds/images and emits saved on 200', () => {
    const updated: MyUsabilityReportDetail = { ...detail, description: 'Updated' };
    serviceSpy.updateMyReport.and.returnValue(of({ code: 200, message: 'OK', data: updated }));
    const savedSpy = jasmine.createSpy();
    component.saved.subscribe(savedSpy);

    component['form'].get('description')?.setValue('Updated');
    component['onSubmit']();

    expect(serviceSpy.updateMyReport).toHaveBeenCalledWith(1, jasmine.any(FormData));
    const formData = serviceSpy.updateMyReport.calls.mostRecent().args[1] as FormData;
    expect(formData.get('category')).toBe('bug');
    expect(formData.get('description')).toBe('Updated');
    expect(formData.getAll('keepImageIds')).toEqual(['5']);

    expect(alertServiceSpy.success).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalledWith(updated);
  });

  it('on REPORT_NOT_EDITABLE: shows an AlertService.error toast and emits stale (not an inline banner)', () => {
    serviceSpy.updateMyReport.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { errorCode: 'REPORT_NOT_EDITABLE' } }))
    );
    const staleSpy = jasmine.createSpy();
    component.stale.subscribe(staleSpy);

    component['onSubmit']();

    expect(alertServiceSpy.error).toHaveBeenCalled();
    expect(staleSpy).toHaveBeenCalled();
    expect(component['inlineError']).toBe('');
  });

  it('on CONCURRENT_MODIFICATION: shows an AlertService.error toast and emits stale', () => {
    serviceSpy.updateMyReport.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: 'CONCURRENT_MODIFICATION' } }))
    );
    const staleSpy = jasmine.createSpy();
    component.stale.subscribe(staleSpy);

    component['onSubmit']();

    expect(alertServiceSpy.error).toHaveBeenCalled();
    expect(staleSpy).toHaveBeenCalled();
  });

  it('on an image-validation error code: shows an INLINE banner, stays in edit mode (no stale emit), keeps the draft', () => {
    serviceSpy.updateMyReport.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { errorCode: 'REPORT_TOO_MANY_IMAGES' } }))
    );
    const staleSpy = jasmine.createSpy();
    component.stale.subscribe(staleSpy);
    component['form'].get('description')?.setValue('still my draft text');

    component['onSubmit']();

    expect(staleSpy).not.toHaveBeenCalled();
    expect(alertServiceSpy.error).not.toHaveBeenCalled();
    expect(component['inlineError']).toBeTruthy();
    expect(component['form'].get('description')?.value).toBe('still my draft text');
  });

  it('onCancel emits cancelled', () => {
    const spy = jasmine.createSpy();
    component.cancelled.subscribe(spy);
    component['onCancel']();
    expect(spy).toHaveBeenCalled();
  });
});

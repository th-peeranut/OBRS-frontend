import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MenuModule } from 'primeng/menu';
import { Subject, of, throwError } from 'rxjs';
import { ExportButtonComponent } from './export-button.component';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import { ExportError, ExportService } from '../../../services/export/export.service';
import { PendingButtonDirective } from '../../directives/pending-button.directive';
import { LoadingStateComponent } from '../loading-state/loading-state.component';

describe('ExportButtonComponent', () => {
  let fixture: ComponentFixture<ExportButtonComponent>;
  let component: ExportButtonComponent;
  let exportServiceSpy: jasmine.SpyObj<ExportService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;

  function setup(hasRole: boolean): void {
    exportServiceSpy = jasmine.createSpyObj('ExportService', ['export']);
    authServiceSpy = jasmine.createSpyObj('AuthService', ['hasAnyRole']);
    authServiceSpy.hasAnyRole.and.returnValue(hasRole);
    alertServiceSpy = jasmine.createSpyObj('AlertService', ['error']);

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), MenuModule],
      declarations: [ExportButtonComponent, PendingButtonDirective, LoadingStateComponent],
      providers: [
        { provide: ExportService, useValue: exportServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportButtonComponent);
    component = fixture.componentInstance;
    component.datasetKey = 'bookings';
    component.requiredRole = 'admin';
  }

  it('should create and show the trigger button when the user has the required role', () => {
    setup(true);
    fixture.detectChanges();

    expect(authServiceSpy.hasAnyRole).toHaveBeenCalledWith(['admin']);
    const button = fixture.nativeElement.querySelector('button.export-button-trigger');
    expect(button).withContext('trigger button should render when canExport is true').toBeTruthy();
    expect(button.classList).not.toContain('admin-btn-primary');
  });

  it('should hide entirely (not just disable) when the user lacks the required role', () => {
    setup(false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button.export-button-trigger');
    expect(button).withContext('button must not render at all when role is missing').toBeFalsy();
  });

  it('calls ExportService.export with the requested format when a menu item is invoked', () => {
    setup(true);
    exportServiceSpy.export.and.returnValue(of(undefined));
    component.params = { status: 'confirmed' };
    fixture.detectChanges();

    component['doExport']('xlsx');

    expect(exportServiceSpy.export).toHaveBeenCalledWith('bookings', 'xlsx', {
      status: 'confirmed',
    });
  });

  it('toggles loading on while the export request is in flight and back off on success, without a success toast', () => {
    setup(true);
    const subject = new Subject<void>();
    exportServiceSpy.export.and.returnValue(subject.asObservable());
    fixture.detectChanges();

    component['doExport']('csv');
    expect(component['loading']).toBeTrue();

    subject.next();
    subject.complete();

    expect(component['loading']).toBeFalse();
    expect(alertServiceSpy.error).not.toHaveBeenCalled();
  });

  it('returns to idle and calls AlertService.error with the mapped message on failure', () => {
    setup(true);
    exportServiceSpy.export.and.returnValue(
      throwError(() => ({ errorCode: 'EXPORT_ERROR_ROW_LIMIT_EXCEEDED' } as ExportError))
    );
    fixture.detectChanges();

    component['doExport']('csv');

    expect(component['loading']).toBeFalse();
    expect(alertServiceSpy.error).toHaveBeenCalledWith('COMMON.EXPORT.ERROR_ROW_LIMIT_EXCEEDED');
  });

  it('falls back to the generic error message for an unrecognized/missing errorCode', () => {
    setup(true);
    exportServiceSpy.export.and.returnValue(throwError(() => ({ errorCode: 'SOMETHING_NEW' } as ExportError)));
    fixture.detectChanges();

    component['doExport']('csv');

    expect(alertServiceSpy.error).toHaveBeenCalledWith('COMMON.EXPORT.ERROR_GENERIC');
  });

  it('ignores a second doExport call while a request is already loading', () => {
    setup(true);
    exportServiceSpy.export.and.returnValue(new Subject<void>().asObservable());
    fixture.detectChanges();

    component['doExport']('csv');
    component['doExport']('xlsx');

    expect(exportServiceSpy.export).toHaveBeenCalledTimes(1);
  });

  // OBRS-668 (scrutinize follow-up): `label` is optional so every existing call
  // site (no [label] bound) stays byte-identical — falls back to the generic key.
  it('falls back to the generic COMMON.EXPORT.BUTTON_LABEL key when no label is provided', () => {
    setup(true);
    fixture.detectChanges();

    // nth-child(3): PendingButtonDirective (OBRS-910) inserts the spinner slot as the
    // button's first child, so the label span is now the third child, not the second.
    const labelSpan = fixture.nativeElement.querySelector('button.export-button-trigger > span:nth-child(3)');
    expect(labelSpan.textContent.trim()).toBe('COMMON.EXPORT.BUTTON_LABEL');
  });

  it('uses the provided label key instead of the generic default', () => {
    setup(true);
    component.label = 'ADMIN.REPORTS.EXPORT_REVENUE_PER_VEHICLE';
    fixture.detectChanges();

    // nth-child(3): PendingButtonDirective (OBRS-910) inserts the spinner slot as the
    // button's first child, so the label span is now the third child, not the second.
    const labelSpan = fixture.nativeElement.querySelector('button.export-button-trigger > span:nth-child(3)');
    expect(labelSpan.textContent.trim()).toBe('ADMIN.REPORTS.EXPORT_REVENUE_PER_VEHICLE');
  });

  // scrutinize finding 2 (OBRS-910 review): [appPending] only ever adds/shows
  // its own spinner slot — it never removes this component's own `download`
  // icon — so the un-reverted `@if` removal left both visible together while
  // loading. The fix hides `download` with [style.visibility], not `@if`, so
  // (a) only one icon reads as active at a time and (b) the icon keeps its
  // layout box, which is what keeps the button's rendered width unchanged.
  describe('single active icon while loading (scrutinize finding 2)', () => {
    it('hides the download icon (visibility, not removed from the DOM) while loading, and restores it after', () => {
      setup(true);
      const subject = new Subject<void>();
      exportServiceSpy.export.and.returnValue(subject.asObservable());
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button.export-button-trigger');
      const downloadIcon: HTMLElement = button.querySelector('.material-symbols-outlined');
      expect(downloadIcon.textContent?.trim()).toBe('download');
      expect(getComputedStyle(downloadIcon).visibility).toBe('visible');

      component['doExport']('csv');
      fixture.detectChanges();
      expect(getComputedStyle(downloadIcon).visibility)
        .withContext('download icon must not compete with the spinner while loading')
        .toBe('hidden');
      const ring = button.querySelector('.loading-state-ring');
      expect(getComputedStyle(ring as Element).visibility).toBe('visible');

      subject.next();
      subject.complete();
      fixture.detectChanges();
      expect(getComputedStyle(downloadIcon).visibility).toBe('visible');
      expect(getComputedStyle(ring as Element).visibility).toBe('hidden');
    });

    it('does not change the button-s rendered width between loading and idle (AC-3)', () => {
      setup(true);
      const subject = new Subject<void>();
      exportServiceSpy.export.and.returnValue(subject.asObservable());
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button.export-button-trigger');
      const before = button.getBoundingClientRect().width;

      component['doExport']('csv');
      fixture.detectChanges();
      const during = button.getBoundingClientRect().width;

      subject.next();
      subject.complete();
      fixture.detectChanges();
      const after = button.getBoundingClientRect().width;

      expect(during).toBeCloseTo(before, 0);
      expect(after).toBeCloseTo(before, 0);
    });
  });
});

import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { UsabilityReportService } from '../../../../services/usability-report/usability-report.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  MyUsabilityReportDetail,
  UsabilityReportCategory,
} from '../../../../shared/interfaces/usability-report.interface';
import { extractApiErrorCode, mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { UsabilityReportImagePickerChange } from '../../../../shared/components/usability-report-image-picker/usability-report-image-picker.component';

interface CategoryOption {
  id: UsabilityReportCategory;
  label: string;
}

// The two errorCodes for which the report went stale UNDERNEATH the reporter
// (moved out of 'new', or a concurrent edit elsewhere) — the parent modal
// must re-fetch so the now-stale Edit button disappears (locked UX spec).
const STALE_ERROR_CODES: ReadonlySet<string> = new Set(['REPORT_NOT_EDITABLE', 'CONCURRENT_MODIFICATION']);

/**
 * OBRS-433: category `app-dropdown-obrs` + description textarea (`.mr-textarea`)
 * + `UsabilityReportImagePickerComponent`. Owns its own PATCH call and ALL of
 * its own success/error toasts (single submit boundary) — the parent modal
 * only reacts to `saved`/`stale`/`cancelled` to sync its own state, it never
 * duplicates a toast.
 */
@Component({
  selector: 'app-my-report-edit-form',
  templateUrl: './my-report-edit-form.component.html',
  styleUrl: './my-report-edit-form.component.scss',
})
export class MyReportEditFormComponent implements OnInit, OnDestroy {
  @Input() detail!: MyUsabilityReportDetail;

  @Output() saved = new EventEmitter<MyUsabilityReportDetail>();
  @Output() stale = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  protected form!: FormGroup;
  protected categoryOptions: CategoryOption[] = [];
  protected isSaving = false;
  protected inlineError = '';

  private keepImageIds: number[] = [];
  private newFiles: File[] = [];

  private readonly trimmedRequired = (control: AbstractControl): ValidationErrors | null => {
    const val: string = control.value ?? '';
    return val.trim().length > 0 ? null : { required: true };
  };

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly usabilityReportService: UsabilityReportService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      category: [this.detail.category],
      description: [this.detail.description, this.trimmedRequired],
    });
    // Scrutinize fix: SNAPSHOT the existing images once, at edit-start — the
    // old implementation exposed a live getter reading `this.detail.images`
    // on every template re-evaluation. `detail` is an `@Input()` Angular
    // re-binds on every parent change-detection pass regardless of whether
    // this component reacts via OnChanges, so a later parent reseat of
    // `detail` (a wholesale new object — e.g. a background re-fetch) would
    // silently swap the array reference the picker sees, re-triggering its
    // `ngOnChanges` and DISCARDING any new files the reporter had already
    // attached during this edit session. Snapshotting once means this
    // component's own copy is immune to any later parent reseat for the
    // rest of the edit session.
    this.existingImagesSnapshot = [...this.detail.images];
    this.keepImageIds = this.existingImagesSnapshot.map((img) => Number(img.id));
    this.buildCategoryOptions();

    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.buildCategoryOptions());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get descriptionInvalid(): boolean {
    const ctrl = this.form.get('description');
    return !!(ctrl?.invalid && ctrl.touched);
  }

  // Populated once in ngOnInit — see the doc comment there. Not a getter.
  protected existingImagesSnapshot: MyUsabilityReportDetail['images'] = [];

  // DropdownObrsComponent emits the WHOLE matched option object on
  // (currentValue) — read `.id` for the category value (design-system's
  // dropdown-obrs contract, NOT app-admin-dropdown's raw-value (valueChange)).
  protected onCategoryChange(option: CategoryOption): void {
    this.form.get('category')?.setValue(option?.id ?? this.detail.category);
  }

  protected onImagesChange(change: UsabilityReportImagePickerChange): void {
    this.keepImageIds = change.keepImageIds;
    this.newFiles = change.newFiles;
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }

  protected onSubmit(): void {
    this.inlineError = '';
    this.form.get('description')?.markAsTouched();
    if (this.form.invalid) {
      return;
    }

    const category = this.form.get('category')?.value as UsabilityReportCategory;
    const description: string = (this.form.get('description')?.value ?? '').trim();

    const formData = new FormData();
    formData.append('category', category);
    formData.append('description', description);
    for (const id of this.keepImageIds) {
      formData.append('keepImageIds', String(id));
    }
    for (const file of this.newFiles) {
      formData.append('images', file);
    }

    this.isSaving = true;
    this.usabilityReportService
      .updateMyReport(this.detail.id, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isSaving = false;
          if (!response.data) {
            return;
          }
          this.alertService.success(this.translate.instant('USABILITY_REPORT.MY_REPORTS.EDIT_FORM.SUCCESS'));
          this.saved.emit(response.data);
        },
        error: (err: unknown) => {
          this.isSaving = false;
          const code = extractApiErrorCode(err, null);

          if (code && STALE_ERROR_CODES.has(code)) {
            this.alertService.error(this.translate.instant(this.staleErrorKey(code)));
            this.stale.emit();
            return;
          }

          // Image-validation codes (and anything else unrecognized): inline
          // banner, stay in edit mode, keep the draft (per the locked UX
          // spec — don't drop what the reporter already typed/picked).
          this.inlineError = this.translate.instant(this.mapErrorCodeKey(code));
        },
      });
  }

  private staleErrorKey(code: string): string {
    return code === 'REPORT_NOT_EDITABLE'
      ? 'USABILITY_REPORT.MY_REPORTS.ERROR.REPORT_NOT_EDITABLE'
      : 'USABILITY_REPORT.MY_REPORTS.ERROR.CONCURRENT_MODIFICATION';
  }

  private mapErrorCodeKey(code: string | null): string {
    const knownCodes: Record<string, string> = {
      REPORT_TOO_MANY_IMAGES: 'USABILITY_REPORT.ERROR.REPORT_TOO_MANY_IMAGES',
      REPORT_IMAGE_TOO_LARGE: 'USABILITY_REPORT.ERROR.REPORT_IMAGE_TOO_LARGE',
      REPORT_UNSUPPORTED_MEDIA_TYPE: 'USABILITY_REPORT.ERROR.REPORT_UNSUPPORTED_MEDIA_TYPE',
      // Backend derives errorCode by upper-casing the message key `report.validation-failed`
      // -> REPORT_VALIDATION_FAILED (DomainException.deriveErrorCode). The bare
      // VALIDATION_FAILED is the generic bean-validation code and is NOT what this
      // multipart endpoint emits for a bad keepImageId / category — keep it only as a
      // harmless fallback and map the code the service actually throws.
      REPORT_VALIDATION_FAILED: 'USABILITY_REPORT.ERROR.VALIDATION_FAILED',
      VALIDATION_FAILED: 'USABILITY_REPORT.ERROR.VALIDATION_FAILED',
      REPORT_NOT_FOUND: 'USABILITY_REPORT.MY_REPORTS.ERROR.REPORT_NOT_FOUND',
    };
    return mapApiErrorCode(code, knownCodes, 'USABILITY_REPORT.ERROR.GENERIC');
  }

  private buildCategoryOptions(): void {
    this.categoryOptions = [
      { id: 'bug', label: this.translate.instant('USABILITY_REPORT.CATEGORY.BUG') },
      {
        id: 'ux_ui_improvement',
        label: this.translate.instant('USABILITY_REPORT.CATEGORY.UX_UI_IMPROVEMENT'),
      },
      { id: 'suggestion', label: this.translate.instant('USABILITY_REPORT.CATEGORY.SUGGESTION') },
    ];
  }
}

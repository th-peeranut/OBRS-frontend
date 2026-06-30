import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AlertService } from '../../services/alert.service';
import { UsabilityReportService } from '../../../services/usability-report/usability-report.service';

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-report-usability-fab',
  templateUrl: './report-usability-fab.component.html',
  styleUrl: './report-usability-fab.component.scss',
})
export class ReportUsabilityFabComponent implements OnInit, OnDestroy {
  protected isModalOpen = false;
  protected isSubmitting = false;
  protected imageError = '';
  protected submitError = '';
  protected attachedFiles: File[] = [];
  protected thumbnailUrls: string[] = [];
  protected categoryOptions: SelectOption[] = [];

  protected readonly MAX_FILES = 5;
  protected readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  protected readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  protected form!: FormGroup;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly translate: TranslateService,
    private readonly usabilityReportService: UsabilityReportService,
    private readonly alertService: AlertService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      category: ['bug'],
      description: ['', Validators.required],
    });

    this.buildCategoryOptions();

    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.buildCategoryOptions());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.revokeThumbnails();
  }

  protected openModal(): void {
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden';
  }

  protected closeModal(): void {
    this.isModalOpen = false;
    document.body.style.overflow = '';
    this.resetForm();
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    this.imageError = '';
    const incoming = Array.from(input.files);
    const combined = [...this.attachedFiles, ...incoming];

    if (combined.length > this.MAX_FILES) {
      this.imageError = this.translate.instant('USABILITY_REPORT.IMAGES.TOO_MANY');
      input.value = '';
      return;
    }

    const invalidType = incoming.find((f) => !this.ALLOWED_MIME_TYPES.includes(f.type));
    if (invalidType) {
      this.imageError = this.translate.instant('USABILITY_REPORT.IMAGES.INVALID_TYPE');
      input.value = '';
      return;
    }

    const overSize = incoming.find((f) => f.size > this.MAX_FILE_SIZE_BYTES);
    if (overSize) {
      this.imageError = this.translate.instant('USABILITY_REPORT.IMAGES.TOO_LARGE');
      input.value = '';
      return;
    }

    for (const file of incoming) {
      this.attachedFiles.push(file);
      this.thumbnailUrls.push(URL.createObjectURL(file));
    }

    input.value = '';
  }

  protected removeFile(index: number): void {
    URL.revokeObjectURL(this.thumbnailUrls[index]);
    this.attachedFiles.splice(index, 1);
    this.thumbnailUrls.splice(index, 1);
    this.imageError = '';
  }

  protected triggerFileInput(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  onSubmit(): void {
    this.submitError = '';
    const descriptionRaw: string = this.form.get('description')?.value ?? '';
    const description = descriptionRaw.trim();

    if (!description) {
      this.form.get('description')?.markAsTouched();
      return;
    }

    const category: string = this.form.get('category')?.value ?? 'bug';
    const routeUrl = this.router.url;

    const formData = new FormData();
    formData.append('category', category);
    formData.append('description', description);
    formData.append('routeUrl', routeUrl);
    for (const file of this.attachedFiles) {
      formData.append('images', file);
    }

    this.isSubmitting = true;
    this.usabilityReportService
      .submitReport(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.alertService.success(
            this.translate.instant('USABILITY_REPORT.SUBMIT_SUCCESS')
          );
          this.closeModal();
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          const errorCode =
            (err as { error?: { errorCode?: string } })?.error?.errorCode;
          this.submitError = this.mapErrorCode(errorCode);
        },
      });
  }

  protected get descriptionInvalid(): boolean {
    const ctrl = this.form.get('description');
    return !!(ctrl?.invalid && ctrl.touched);
  }

  private mapErrorCode(errorCode: string | undefined): string {
    const knownCodes: Record<string, string> = {
      REPORT_INVALID_CATEGORY: 'USABILITY_REPORT.ERROR.REPORT_INVALID_CATEGORY',
      REPORT_TOO_MANY_IMAGES: 'USABILITY_REPORT.ERROR.REPORT_TOO_MANY_IMAGES',
      REPORT_UNSUPPORTED_MEDIA_TYPE: 'USABILITY_REPORT.ERROR.REPORT_UNSUPPORTED_MEDIA_TYPE',
      REPORT_IMAGE_TOO_LARGE: 'USABILITY_REPORT.ERROR.REPORT_IMAGE_TOO_LARGE',
      REPORT_PAYLOAD_TOO_LARGE: 'USABILITY_REPORT.ERROR.REPORT_PAYLOAD_TOO_LARGE',
      REPORT_RATE_LIMITED: 'USABILITY_REPORT.ERROR.REPORT_RATE_LIMITED',
      VALIDATION_FAILED: 'USABILITY_REPORT.ERROR.VALIDATION_FAILED',
    };

    const key = errorCode ? (knownCodes[errorCode] ?? 'USABILITY_REPORT.ERROR.GENERIC') : 'USABILITY_REPORT.ERROR.GENERIC';
    return this.translate.instant(key);
  }

  private buildCategoryOptions(): void {
    this.categoryOptions = [
      { label: this.translate.instant('USABILITY_REPORT.CATEGORY.BUG'), value: 'bug' },
      {
        label: this.translate.instant('USABILITY_REPORT.CATEGORY.UX_UI_IMPROVEMENT'),
        value: 'ux_ui_improvement',
      },
      {
        label: this.translate.instant('USABILITY_REPORT.CATEGORY.SUGGESTION'),
        value: 'suggestion',
      },
    ];
  }

  private resetForm(): void {
    this.form.reset({ category: 'bug', description: '' });
    this.submitError = '';
    this.imageError = '';
    this.revokeThumbnails();
    this.attachedFiles = [];
    this.thumbnailUrls = [];
    this.isSubmitting = false;
  }

  private revokeThumbnails(): void {
    for (const url of this.thumbnailUrls) {
      URL.revokeObjectURL(url);
    }
  }
}

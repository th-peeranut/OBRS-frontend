import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UsabilityReportService } from '../../../../services/usability-report/usability-report.service';
import { UsabilityReportFollowUp, UsabilityReportImage } from '../../../../shared/interfaces/usability-report.interface';
import { UsabilityReportImagePickerChange } from '../../../../shared/components/usability-report-image-picker/usability-report-image-picker.component';
import { UsabilityReportPendingFollowUp } from '../../../../shared/components/usability-report-follow-up-timeline/usability-report-follow-up-timeline.component';

const NOTE_MAX_LENGTH = 5000;

/**
 * OBRS-433: note textarea + `UsabilityReportImagePickerComponent` with
 * `existingImages=[]` (degenerates to add-only, same shape as the FAB's
 * picker). Allowed in ANY report status — no status gate here. Optimistic
 * append (locked UX spec): emits `pending` synchronously before the POST,
 * then `added` on success or `failed` on error (keeping the typed note/files
 * in the form either way, so the reporter can retry without retyping).
 */
@Component({
  selector: 'app-my-report-follow-up-composer',
  templateUrl: './my-report-follow-up-composer.component.html',
  styleUrl: './my-report-follow-up-composer.component.scss',
})
export class MyReportFollowUpComposerComponent implements OnDestroy {
  @Input() reportId!: number;

  @Output() pending = new EventEmitter<UsabilityReportPendingFollowUp>();
  @Output() added = new EventEmitter<UsabilityReportFollowUp>();
  @Output() failed = new EventEmitter<void>();

  protected readonly form: FormGroup;
  protected isSubmitting = false;
  // A STABLE reference (design-system §10 mutate-@Input warning applies to
  // the CHILD picker's own copy, not this) — the image picker's ngOnChanges
  // re-seeds only when this reference actually changes, so it must stay the
  // SAME array between keystrokes/re-renders and only be swapped for a new
  // `[]` instance when we deliberately want to reset the picker (after a
  // successful post).
  protected existingImagesInput: UsabilityReportImage[] = [];

  private keepImageIds: number[] = [];
  private newFiles: File[] = [];

  private readonly trimmedRequired = (control: AbstractControl): ValidationErrors | null => {
    const val: string = control.value ?? '';
    return val.trim().length > 0 ? null : { required: true };
  };

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly usabilityReportService: UsabilityReportService
  ) {
    this.form = this.fb.group({
      note: ['', [this.trimmedRequired, Validators.maxLength(NOTE_MAX_LENGTH)]],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get noteInvalid(): boolean {
    const ctrl = this.form.get('note');
    return !!(ctrl?.invalid && ctrl.touched);
  }

  protected onImagesChange(change: UsabilityReportImagePickerChange): void {
    // A follow-up has no existing SERVER images to keep — every file here is
    // new (keepImageIds is always empty for this composer).
    this.keepImageIds = change.keepImageIds;
    this.newFiles = change.newFiles;
  }

  protected onSubmit(): void {
    this.form.get('note')?.markAsTouched();
    if (this.form.invalid) {
      return;
    }

    const note: string = (this.form.get('note')?.value ?? '').trim();
    const files = [...this.newFiles];
    const thumbnailUrls = files.map((f) => URL.createObjectURL(f));

    const formData = new FormData();
    formData.append('note', note);
    for (const file of files) {
      formData.append('images', file);
    }

    // Optimistic append — synchronous, before the POST resolves.
    this.pending.emit({ note, thumbnailUrls });
    this.isSubmitting = true;
    this.resetForm();

    this.usabilityReportService
      .addFollowUp(this.reportId, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isSubmitting = false;
          this.revokeThumbnails(thumbnailUrls);
          if (response.data) {
            this.added.emit(response.data);
          }
        },
        error: () => {
          this.isSubmitting = false;
          this.revokeThumbnails(thumbnailUrls);
          // Keep the typed note/files so the reporter can retry without
          // retyping (per the locked UX spec) — restore the draft rather
          // than leaving the form blank after the optimistic reset above.
          this.form.get('note')?.setValue(note);
          this.failed.emit();
        },
      });
  }

  private resetForm(): void {
    this.form.reset({ note: '' });
    this.keepImageIds = [];
    this.newFiles = [];
    // A fresh reference intentionally resets the image picker's own state.
    this.existingImagesInput = [];
  }

  private revokeThumbnails(urls: string[]): void {
    for (const url of urls) {
      URL.revokeObjectURL(url);
    }
  }
}

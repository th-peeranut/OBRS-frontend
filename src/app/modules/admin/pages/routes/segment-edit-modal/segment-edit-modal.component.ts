import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { SegmentRow, StopPoint, toSegmentUpdatePayload } from '../routes.mappers';

@Component({
  selector: 'app-segment-edit-modal',
  templateUrl: './segment-edit-modal.component.html',
  styleUrl: './segment-edit-modal.component.scss',
})
export class SegmentEditModalComponent {
  @Input() stops: StopPoint[] = [];
  @Input() allSegments: SegmentRow[] = [];
  @Input() routeSlug = '';
  @Input() reloadStructure!: () => Promise<void>;
  @Output() saved = new EventEmitter<void>();

  protected isOpen = false;
  protected isSavingSegmentEdit = false;
  protected selectedSegment: SegmentRow | null = null;

  protected readonly editSegmentForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.editSegmentForm = this.formBuilder.group({
      fromStopSlug: ['', [Validators.required]],
      toStopSlug: ['', [Validators.required]],
      fare: [
        '',
        [
          Validators.required,
          Validators.pattern(/^\d+(\.\d{1,2})?$/),
          Validators.min(0.01),
        ],
      ],
      estimatedDurationMinutes: [
        '',
        [
          Validators.required,
          Validators.pattern(/^\d+$/),
          Validators.min(1),
        ],
      ],
    });
  }

  /** Called by the parent page when a segment row's Edit action is triggered. */
  open(segment: SegmentRow): void {
    this.selectedSegment = segment;
    this.editSegmentForm.reset({
      fromStopSlug: segment.fromStopSlug,
      toStopSlug: segment.toStopSlug,
      fare: segment.fare.toFixed(2),
      estimatedDurationMinutes: segment.estimatedDurationMinutes ?? '',
    });
    this.isOpen = true;
  }

  protected closeModal(): void {
    if (this.isSavingSegmentEdit) {
      return;
    }

    this.isOpen = false;
    this.selectedSegment = null;
    this.editSegmentForm.reset();
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.editSegmentForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasFieldError(fieldName: string, errorName: string): boolean {
    const field = this.editSegmentForm.get(fieldName);
    return !!field?.hasError(errorName) && (field.dirty || field.touched);
  }

  protected async submitSegmentEdit(): Promise<void> {
    if (!this.selectedSegment || !this.routeSlug) {
      return;
    }

    if (this.editSegmentForm.invalid) {
      this.editSegmentForm.markAllAsTouched();
      return;
    }

    const raw = this.editSegmentForm.getRawValue();
    const editedFromStopSlug = String(raw['fromStopSlug'] ?? '').trim();
    const editedToStopSlug = String(raw['toStopSlug'] ?? '').trim();
    const newFare = Number(raw['fare'] ?? 0);
    const estimatedDurationMinutes = Number(raw['estimatedDurationMinutes'] ?? 0);

    if (!this.validateSegmentStops(editedFromStopSlug, editedToStopSlug)) {
      return;
    }

    const payload = toSegmentUpdatePayload(
      this.selectedSegment,
      editedFromStopSlug,
      editedToStopSlug,
      newFare,
      estimatedDurationMinutes,
      this.allSegments,
      this.routeSlug
    );
    this.isSavingSegmentEdit = true;
    let isUpdated = false;

    try {
      await firstValueFrom(this.adminApiService.updateSegments(payload));
      await this.reloadStructure();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      isUpdated = true;
      this.saved.emit();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSavingSegmentEdit = false;
      if (isUpdated) {
        this.closeModal();
      }
    }
  }

  private validateSegmentStops(fromStopSlug: string, toStopSlug: string): boolean {
    const fromStop = this.getStopPointBySlug(fromStopSlug);
    const toStop = this.getStopPointBySlug(toStopSlug);
    const toStopControl = this.editSegmentForm.get('toStopSlug');

    if (!fromStop || !toStop) {
      toStopControl?.setErrors({ required: true });
      toStopControl?.markAsTouched();
      return false;
    }

    if (fromStop.slug === toStop.slug) {
      toStopControl?.setErrors({ sameStop: true });
      toStopControl?.markAsTouched();
      return false;
    }

    if (toStop.stopOrder <= fromStop.stopOrder) {
      toStopControl?.setErrors({ stopOrder: true });
      toStopControl?.markAsTouched();
      return false;
    }

    return true;
  }

  private getStopPointBySlug(slug: string): StopPoint | undefined {
    const normalizedSlug = String(slug ?? '').trim();
    return this.stops.find((stop) => stop.slug === normalizedSlug);
  }
}

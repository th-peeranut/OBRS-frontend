import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { hasOwnKey } from '../../../../../shared/lib/own-key';
import { TranslateService } from '@ngx-translate/core';
import {
  NewSegmentFare,
  SegmentRow,
  StopPoint,
  VehicleTypeOption,
  findStopPairProblem,
  normalizeVehicleTypeKey,
  toSegmentAppendPayload,
  toVehicleTypeOptions,
} from '../routes.mappers';

/**
 * OBRS-1074: adds a stop pair the route has NO row for.
 *
 * Kept separate from {@link SegmentEditModalComponent} rather than folded into it
 * as a second mode: that one edits ONE vehicle type's fare and owns the
 * duration field plus its blast-radius warning (OBRS-1031), none of which apply
 * when the pair does not exist yet. Reworking the edit dialog to show both
 * vehicle types is OBRS-1034 and is not this card.
 *
 * Both dialogs share the direction rule (`findStopPairProblem`) and the payload
 * builders in `routes.mappers`, which is where the overlap actually is.
 */
@Component({
    selector: 'app-add-segment-modal',
    templateUrl: './add-segment-modal.component.html',
    styleUrl: './add-segment-modal.component.scss',
    standalone: false
})
export class AddSegmentModalComponent {
  @Input() stops: StopPoint[] = [];
  @Input() allSegments: SegmentRow[] = [];
  @Input() routeSlug = '';
  @Input() reloadStructure!: () => Promise<void>;
  @Output() saved = new EventEmitter<void>();

  protected isOpen = false;
  protected isSaving = false;

  /**
   * Derived from the route's existing segments, the same source the table's fare
   * columns come from, so the dialog cannot offer a vehicle type the table does
   * not show. A route with no segments at all therefore has none to offer - the
   * button that opens this dialog is disabled there (see the panel template).
   */
  protected vehicleTypeOptions: VehicleTypeOption[] = [];

  protected readonly addSegmentForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.addSegmentForm = this.formBuilder.group({
      fromStopSlug: ['', [Validators.required]],
      toStopSlug: ['', [Validators.required]],
      fares: this.formBuilder.group({}),
    });
  }

  /** Called by the parent page when "add stop pair" is triggered. */
  open(): void {
    this.vehicleTypeOptions = toVehicleTypeOptions(this.allSegments);
    this.addSegmentForm.setControl('fares', this.buildFaresGroup());
    this.addSegmentForm.patchValue({ fromStopSlug: '', toStopSlug: '' });
    this.addSegmentForm.markAsUntouched();
    this.isOpen = true;
  }

  /**
   * One optional control per vehicle type. Optional on purpose: a blank fare
   * means "do not create a row for this vehicle type", which is the only way to
   * price a pair for the van and leave the minibus alone. `0` is not that answer
   * - it reads as free - so the pattern refuses it and the submit path refuses
   * an all-blank form.
   */
  private buildFaresGroup(): FormGroup {
    const group = this.formBuilder.group({});

    for (const option of this.vehicleTypeOptions) {
      group.addControl(
        this.fareControlName(option.slug),
        this.formBuilder.control('', [
          Validators.pattern(/^\d+(\.\d{1,2})?$/),
          Validators.min(0.01),
        ])
      );
    }

    return group;
  }

  /** Vehicle-type slugs are lower-cased before they become control names so the
   *  template and the submit path address the same control. */
  protected fareControlName(vehicleTypeSlug: string): string {
    return normalizeVehicleTypeKey(vehicleTypeSlug);
  }

  protected closeModal(): void {
    if (this.isSaving) {
      return;
    }

    this.isOpen = false;
    this.addSegmentForm.reset();
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.addSegmentForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasFieldError(fieldName: string, errorName: string): boolean {
    const field = this.addSegmentForm.get(fieldName);
    return !!field?.hasError(errorName) && (field.dirty || field.touched);
  }

  protected isFareInvalid(vehicleTypeSlug: string): boolean {
    return this.isFieldInvalid(`fares.${this.fareControlName(vehicleTypeSlug)}`);
  }

  protected async submit(): Promise<void> {
    if (!this.routeSlug) {
      return;
    }

    if (this.addSegmentForm.invalid) {
      this.addSegmentForm.markAllAsTouched();
      return;
    }

    const raw = this.addSegmentForm.getRawValue();
    const fromStopSlug = String(raw['fromStopSlug'] ?? '').trim();
    const toStopSlug = String(raw['toStopSlug'] ?? '').trim();

    if (!this.validateStops(fromStopSlug, toStopSlug)) {
      return;
    }

    const fares = this.collectFares(raw['fares'] as Record<string, unknown>);

    if (fares.length === 0) {
      this.setToStopError('noFare');
      return;
    }

    if (!this.validateNotAlreadyPriced(fromStopSlug, toStopSlug, fares)) {
      return;
    }

    const payload = toSegmentAppendPayload(
      fromStopSlug,
      toStopSlug,
      fares,
      this.allSegments,
      this.routeSlug
    );
    this.isSaving = true;
    let isSaved = false;

    try {
      await firstValueFrom(this.adminApiService.updateSegments(payload));
      await this.reloadStructure();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      isSaved = true;
      this.saved.emit();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSaving = false;
      if (isSaved) {
        this.closeModal();
      }
    }
  }

  private collectFares(rawFares: Record<string, unknown>): NewSegmentFare[] {
    const fares: NewSegmentFare[] = [];

    for (const option of this.vehicleTypeOptions) {
      const controlName = this.fareControlName(option.slug);
      // ADR-0028: `rawFares[controlName]` alone would resolve 'constructor' to a FUNCTION,
      // which is both non-nullish and truthy, so `?? ''` would not catch it.
      if (!rawFares || !hasOwnKey(rawFares, controlName)) {
        continue;
      }

      const value = String(rawFares[controlName] ?? '').trim();
      if (!value) {
        continue;
      }

      fares.push({ vehicleTypeSlug: option.slug, fare: Number(value) });
    }

    return fares;
  }

  private validateStops(fromStopSlug: string, toStopSlug: string): boolean {
    const problem = findStopPairProblem(
      this.getStopPointBySlug(fromStopSlug),
      this.getStopPointBySlug(toStopSlug)
    );

    if (!problem) {
      return true;
    }

    this.setToStopError(problem === 'unknownStop' ? 'required' : problem);
    return false;
  }

  /**
   * The pair may already exist for one vehicle type and not the other. Refusing
   * only the types the owner actually priced keeps "van has a fare, minibus does
   * not" addable, and it is the same condition the backend answers with a 400
   * (`@UniqueStopPairs` sees the appended pair twice inside one block) - refused
   * here so the owner reads which vehicle type it was, not a validation message.
   */
  private validateNotAlreadyPriced(
    fromStopSlug: string,
    toStopSlug: string,
    fares: NewSegmentFare[]
  ): boolean {
    const clash = fares.find((entry) =>
      this.allSegments.some(
        (segment) =>
          segment.fromStopSlug === fromStopSlug &&
          segment.toStopSlug === toStopSlug &&
          normalizeVehicleTypeKey(segment.vehicleTypeSlug) ===
            normalizeVehicleTypeKey(entry.vehicleTypeSlug)
      )
    );

    if (!clash) {
      return true;
    }

    const control = this.addSegmentForm.get(
      `fares.${this.fareControlName(clash.vehicleTypeSlug)}`
    );
    control?.setErrors({ alreadyPriced: true });
    control?.markAsTouched();
    return false;
  }

  private setToStopError(errorName: string): void {
    const toStopControl = this.addSegmentForm.get('toStopSlug');
    toStopControl?.setErrors({ [errorName]: true });
    toStopControl?.markAsTouched();
  }

  private getStopPointBySlug(slug: string): StopPoint | undefined {
    const normalizedSlug = String(slug ?? '').trim();
    return this.stops.find((stop) => stop.slug === normalizedSlug);
  }
}

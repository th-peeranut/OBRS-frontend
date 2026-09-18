import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { hasOwnKey } from '../../../../../shared/lib/own-key';
import { TranslateService } from '@ngx-translate/core';
import {
  NewSegmentFare,
  SegmentFareCell,
  SegmentPivotRow,
  SegmentRow,
  StopPoint,
  findStopPairProblem,
  normalizeVehicleTypeKey,
  toSegmentUpdatePayload,
} from '../routes.mappers';

@Component({
    selector: 'app-segment-edit-modal',
    templateUrl: './segment-edit-modal.component.html',
    styleUrl: './segment-edit-modal.component.scss',
    standalone: false
})
export class SegmentEditModalComponent implements OnDestroy {
  @Input() stops: StopPoint[] = [];
  @Input() allSegments: SegmentRow[] = [];
  @Input() routeSlug = '';
  @Input() reloadStructure!: () => Promise<void>;
  @Output() saved = new EventEmitter<void>();

  protected isOpen = false;
  protected isSavingSegmentEdit = false;

  /**
   * OBRS-1034: the whole stop pair, not one vehicle type's row. The table shows
   * both fares side by side since OBRS-1027; the dialog behind it used to open
   * on one of them, so re-pricing a pair took two saves and two transactions.
   */
  protected selectedRow: SegmentPivotRow | null = null;

  /**
   * Where the edited pair sits in `allSegments` TODAY. The form's own from/to
   * may have been moved by the owner, but the payload still has to find the
   * rows it replaces by where they are now - and it matches on stop slugs, not
   * on `SegmentRow.id`, since the two vehicle types' rows for one pair carry
   * different ids.
   */
  private originalFromStopSlug = '';
  private originalToStopSlug = '';

  /**
   * OBRS-1031: how many OTHER stop pairs on this route read the arrival minute this edit is about
   * to overwrite. The backend does not store a per-segment duration - it stores the destination
   * stop's `offset_minutes_from_origin` and derives every pair's duration from it - so editing one
   * row silently moves every pair that shares that stop, plus the arrival times customers and the
   * Walk-in Sell screen see. The number is announced before saving; it used to change in silence.
   *
   * Counted across ALL vehicle types on purpose: `route_stops` is per ROUTE, so a minibus edit
   * moves the van rows too. Every row of the EDITED pair is excluded (OBRS-1034) - both vehicle
   * types of that pair are saved by this one dialog, so the sibling row is not collateral.
   *
   * Recomputed on open and whenever the destination stop changes, NOT in a template getter - a
   * getter would re-filter `allSegments` on every change-detection cycle for a number that only
   * moves on those two events.
   */
  protected affectedPairCount = 0;

  /** Display name of the stop whose arrival minute gets overwritten - set alongside the count. */
  protected affectedDestinationName = '';

  protected readonly editSegmentForm: FormGroup;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.editSegmentForm = this.formBuilder.group({
      fromStopSlug: ['', [Validators.required]],
      toStopSlug: ['', [Validators.required]],
      fares: this.formBuilder.group({}),
      estimatedDurationMinutes: [
        '',
        [
          Validators.required,
          Validators.pattern(/^\d+$/),
          Validators.min(1),
        ],
      ],
    });

    this.editSegmentForm
      .get('toStopSlug')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.recountAffectedPairs());
  }

  /** Called by the parent page when a stop pair's Edit action is triggered. */
  open(row: SegmentPivotRow): void {
    this.selectedRow = row;

    const pricedCells = this.getPricedCells(row);
    this.originalFromStopSlug = pricedCells[0]?.segment?.fromStopSlug ?? row.originSlug;
    this.originalToStopSlug = pricedCells[0]?.segment?.toStopSlug ?? '';

    const faresGroup = this.buildFaresGroup(pricedCells);
    this.editSegmentForm.setControl('fares', faresGroup);
    // Every control is listed: `reset(value)` nulls whatever the value object
    // omits, which on a required control would leave the form silently invalid.
    this.editSegmentForm.reset({
      fromStopSlug: this.originalFromStopSlug,
      toStopSlug: this.originalToStopSlug,
      fares: faresGroup.getRawValue(),
      // The pivot row's `duration` is an already-formatted display string. The
      // raw minutes come off a priced row instead; the pair's rows derive it
      // from the same route stop, so the first one answers for all of them.
      estimatedDurationMinutes: pricedCells[0]?.segment?.estimatedDurationMinutes ?? '',
    });
    this.recountAffectedPairs();
    this.isOpen = true;
  }

  /** The vehicle types this pair actually has a row for. A type with no row is
   *  shown as "not set" and gets neither a control nor a payload block - never
   *  a 0.00, which reads as "free" rather than "no data". */
  private getPricedCells(row: SegmentPivotRow): SegmentFareCell[] {
    return row.fares.filter((cell) => !!cell.segment);
  }

  private buildFaresGroup(pricedCells: SegmentFareCell[]): FormGroup {
    const group = this.formBuilder.group({});

    for (const cell of pricedCells) {
      group.addControl(
        this.fareControlName(cell.vehicleTypeSlug),
        this.formBuilder.control(cell.segment?.fare.toFixed(2) ?? '', [
          Validators.required,
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

  /** See {@link affectedPairCount}. */
  private recountAffectedPairs(): void {
    const destinationSlug = String(
      this.editSegmentForm.get('toStopSlug')?.value ?? ''
    ).trim();

    if (!this.selectedRow || !destinationSlug) {
      this.affectedPairCount = 0;
      this.affectedDestinationName = '';
      return;
    }

    this.affectedDestinationName =
      this.getStopPointBySlug(destinationSlug)?.name ?? destinationSlug;
    this.affectedPairCount = this.allSegments.filter(
      (segment) =>
        !this.isEditedPair(segment) &&
        (segment.fromStopSlug === destinationSlug ||
          segment.toStopSlug === destinationSlug)
    ).length;
  }

  private isEditedPair(segment: SegmentRow): boolean {
    return (
      segment.fromStopSlug === this.originalFromStopSlug &&
      segment.toStopSlug === this.originalToStopSlug
    );
  }

  protected closeModal(): void {
    if (this.isSavingSegmentEdit) {
      return;
    }

    this.isOpen = false;
    this.selectedRow = null;
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

  protected isFareInvalid(vehicleTypeSlug: string): boolean {
    return this.isFieldInvalid(`fares.${this.fareControlName(vehicleTypeSlug)}`);
  }

  protected async submitSegmentEdit(): Promise<void> {
    if (!this.selectedRow || !this.routeSlug) {
      return;
    }

    if (this.editSegmentForm.invalid) {
      this.editSegmentForm.markAllAsTouched();
      return;
    }

    const raw = this.editSegmentForm.getRawValue();
    const editedFromStopSlug = String(raw['fromStopSlug'] ?? '').trim();
    const editedToStopSlug = String(raw['toStopSlug'] ?? '').trim();
    const estimatedDurationMinutes = Number(raw['estimatedDurationMinutes'] ?? 0);

    if (!this.validateSegmentStops(editedFromStopSlug, editedToStopSlug)) {
      return;
    }

    const fares = this.collectFares(
      raw['fares'] as Record<string, unknown>,
      this.selectedRow
    );

    if (fares.length === 0) {
      return;
    }

    const payload = toSegmentUpdatePayload(
      this.originalFromStopSlug,
      this.originalToStopSlug,
      editedFromStopSlug,
      editedToStopSlug,
      fares,
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

  private collectFares(
    rawFares: Record<string, unknown>,
    row: SegmentPivotRow
  ): NewSegmentFare[] {
    const fares: NewSegmentFare[] = [];

    for (const cell of this.getPricedCells(row)) {
      const controlName = this.fareControlName(cell.vehicleTypeSlug);
      // ADR-0028: `rawFares[controlName]` alone would resolve 'constructor' to a FUNCTION,
      // which is both non-nullish and truthy, so `?? ''` would not catch it.
      if (!rawFares || !hasOwnKey(rawFares, controlName)) {
        continue;
      }

      const value = String(rawFares[controlName] ?? '').trim();
      if (!value) {
        continue;
      }

      fares.push({ vehicleTypeSlug: cell.vehicleTypeSlug, fare: Number(value) });
    }

    return fares;
  }

  private validateSegmentStops(fromStopSlug: string, toStopSlug: string): boolean {
    // OBRS-1074: the comparison itself lives in routes.mappers so the add-pair
    // modal enforces the SAME rule instead of a second copy of it.
    const problem = findStopPairProblem(
      this.getStopPointBySlug(fromStopSlug),
      this.getStopPointBySlug(toStopSlug)
    );

    if (!problem) {
      return true;
    }

    const toStopControl = this.editSegmentForm.get('toStopSlug');
    toStopControl?.setErrors(
      problem === 'unknownStop' ? { required: true } : { [problem]: true }
    );
    toStopControl?.markAsTouched();
    return false;
  }

  private getStopPointBySlug(slug: string): StopPoint | undefined {
    const normalizedSlug = String(slug ?? '').trim();
    return this.stops.find((stop) => stop.slug === normalizedSlug);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

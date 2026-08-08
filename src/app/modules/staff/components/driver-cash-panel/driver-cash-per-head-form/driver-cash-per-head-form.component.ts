import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DriverCashPerHeadRateLineDto } from '../../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-960 — dumb: the per-head-count action's inline form. Stop options
 * come from `[rates]` (the day response's `perHeadRates[]`) — per the card,
 * `boarding-list.store.ts`'s stop coverage is fully subsumed by this field,
 * so no separate stop-list fetch was added (see `DriverCashPanelComponent`'s
 * doc comment).
 *
 * The "rate not configured" warning renders PRE-EMPTIVELY off the selected
 * line's `configured` flag, before submit; the POST response's own
 * `perHeadRateApplied`/`perHeadRateConfigured` (surfaced via
 * `[lastAppliedRate]`) remain the source of truth for what was actually
 * recorded.
 */
@Component({
    selector: 'app-driver-cash-per-head-form',
    templateUrl: './driver-cash-per-head-form.component.html',
    styleUrl: './driver-cash-per-head-form.component.scss',
    standalone: false
})
export class DriverCashPerHeadFormComponent implements OnChanges {
  @Input() rates: DriverCashPerHeadRateLineDto[] = [];
  @Input() isSubmitting = false;
  @Input() submitError: string | null = null;

  @Output() submitPerHead = new EventEmitter<{ stopId: number; headCount: number }>();

  protected selectedStopId = '';
  protected headCountInput: number | null = null;

  protected get stopOptions(): { value: string; label: string }[] {
    return this.rates.map((r) => ({ value: String(r.stopId), label: r.stopName }));
  }

  protected get selectedRate(): DriverCashPerHeadRateLineDto | null {
    if (!this.selectedStopId) return null;
    return this.rates.find((r) => String(r.stopId) === this.selectedStopId) ?? null;
  }

  /** Pre-emptive "rate not configured" — the card's central requirement:
   * shown BEFORE the salesperson submits, not only after the POST echoes
   * `perHeadRateConfigured: false`.
   *
   * OBRS-1073 added the `salesPointId` guard, and without it this warning
   * became noise the moment the rate moved onto the counter: a rate belongs to
   * a SALES POINT now, and only 10 of the 101 seeded stops belong to one, so
   * `!configured` alone would fire on almost every stop of every route for
   * money nobody was ever owed. A stop with no sales point has no counter —
   * 0 is the correct answer there, not a missing setting. */
  protected get showRateNotConfiguredWarning(): boolean {
    return this.selectedRate !== null && this.selectedRate.salesPointId !== null && !this.selectedRate.configured;
  }

  protected get canSubmit(): boolean {
    return (
      !this.isSubmitting &&
      this.selectedStopId !== '' &&
      Number.isInteger(this.headCountInput) &&
      (this.headCountInput ?? 0) > 0
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['isSubmitting'] &&
      changes['isSubmitting'].previousValue === true &&
      !this.isSubmitting &&
      !this.submitError
    ) {
      this.selectedStopId = '';
      this.headCountInput = null;
    }
  }

  protected onStopChange(value: string): void {
    this.selectedStopId = value;
  }

  protected onSubmit(): void {
    if (!this.canSubmit) return;
    this.submitPerHead.emit({
      stopId: Number(this.selectedStopId),
      headCount: Number(this.headCountInput),
    });
  }
}

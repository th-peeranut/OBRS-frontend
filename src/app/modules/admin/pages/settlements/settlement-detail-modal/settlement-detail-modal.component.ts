import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  SettlementConfirmPayload,
  SettlementHandoverCandidate,
  SettlementPendingItemDto,
  SettlementScheduleDetailDto,
} from '../../../../../shared/interfaces/settlement.interface';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';

/**
 * Dumb (presentational) settlement detail modal. Owns no server state and makes
 * no API calls — the smart page (`SettlementsPageComponent`) owns the detail
 * cache, the fetch, the handover-candidate list, and the confirm orchestration
 * (AlertService.confirm + POST + error-code branching). This component renders
 * its inputs, owns the sign-off FORM's local state, and emits intent.
 *
 * OBRS-671 made the confirm body mandatory: the owner must count the cash in the
 * drawer, pick who handed it over, and — only when the count doesn't reconcile
 * against the round's expected cash — give a reason. So the single "Confirm"
 * button is now gated on a small inline form (counted cash + hander picker +
 * conditional reason) rather than firing immediately. The expected-cash figure
 * is the `cash` bucket of `live.byMethod` (the SAME "cash" the backend
 * reconciles against, OBRS-670-corrected) — card/gateway money never enters the
 * drawer.
 *
 * Opens optimistically: the page seeds `[summary]` from the row already in hand
 * before the detail GET resolves (design-system.md §6), so this modal never
 * gates its render on `[detail]` being present — `[isFetching]` drives a
 * skeleton for the breakdown tables only.
 *
 * The PENDING (`detail.live`) and SETTLED (`detail.settled`) breakdowns are
 * DIFFERENT shapes — the live one is recomputed-on-read (full ticketCount +
 * remote flag), the settled one is a frozen snapshot (amount only, per
 * `docs/api/settlements.md`) — so the template renders two distinct table
 * blocks gated on `detail.status`, not one table reused for both.
 */
@Component({
  selector: 'app-settlement-detail-modal',
  templateUrl: './settlement-detail-modal.component.html',
  styleUrl: './settlement-detail-modal.component.scss',
})
export class SettlementDetailModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() summary: SettlementPendingItemDto | null = null;
  @Input() detail: SettlementScheduleDetailDto | null = null;
  @Input() isFetching = false;
  @Input() isConfirming = false;
  @Input() fetchError = '';
  // OBRS-671: salespeople selectable as the cash hand-over person, supplied by
  // the smart page (from the user-management list). May be empty while the page
  // is still loading them or if the lookup failed — the picker shows an empty
  // note and the confirm stays blocked in that case.
  @Input() handoverCandidates: SettlementHandoverCandidate[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() confirmRequested = new EventEmitter<SettlementConfirmPayload>();
  @Output() retryFetch = new EventEmitter<void>();

  protected readonly skeletonRows = Array.from({ length: 3 });

  // ── OBRS-671 sign-off form (local, reset per round) ──────────────────────
  // Money as a decimal STRING (never arithmetic on it beyond cents-parsing for
  // the discrepancy check — matches the interface's money convention).
  protected countedCashInput = '';
  protected handedOverById: number | null = null;
  protected discrepancyReasonInput = '';

  // The round the form's current state belongs to — so a detail patch on the
  // SAME round (optimistic-open → GET resolves) doesn't wipe half-typed input,
  // but opening a DIFFERENT round starts clean.
  private formScheduleId: number | null = null;

  constructor(private readonly translate: TranslateService) {}

  ngOnChanges(_changes: SimpleChanges): void {
    // `summary` is seeded synchronously on open (before `detail`), so key the
    // reset off whichever scheduleId is known first.
    const scheduleId = this.summary?.scheduleId ?? this.detail?.scheduleId ?? null;
    if (scheduleId !== this.formScheduleId) {
      this.formScheduleId = scheduleId;
      this.resetForm();
    }
  }

  private resetForm(): void {
    this.countedCashInput = '';
    this.handedOverById = null;
    this.discrepancyReasonInput = '';
  }

  // The round's expected CASH — the `cash` method bucket only (OBRS-670:
  // card/gateway money never lands in the drawer). Zero when the round took no
  // cash. This is what the counted amount is reconciled against.
  protected expectedCashAmount(): string {
    const cash = this.detail?.live.byMethod.find((b) => b.method === 'cash');
    return cash?.amount ?? '0.00';
  }

  // Cents of the counted input, or null when it isn't a valid money string.
  protected get countedCents(): number | null {
    return SettlementDetailModalComponent.toCents(this.countedCashInput);
  }

  // Signed counted − expected, in cents; null while the counted input is
  // invalid/blank so the template can hide the discrepancy line until there is
  // something to compare.
  protected get discrepancyCents(): number | null {
    const counted = this.countedCents;
    if (counted === null) {
      return null;
    }
    const expected = SettlementDetailModalComponent.toCents(this.expectedCashAmount()) ?? 0;
    return counted - expected;
  }

  // Mirrors the backend's `counted.compareTo(expectedCash) != 0` — a reason is
  // mandatory exactly when this is true.
  protected hasDiscrepancy(): boolean {
    return this.discrepancyCents !== null && this.discrepancyCents !== 0;
  }

  // The signed discrepancy as a money string (e.g. "-200.00"), for formatMoney
  // + isNegativeMoney in the template. Empty when there's nothing to show yet.
  protected discrepancyAmount(): string {
    const cents = this.discrepancyCents;
    return cents === null ? '' : (cents / 100).toFixed(2);
  }

  protected get canConfirm(): boolean {
    return (
      !this.isConfirming &&
      !!this.detail &&
      this.detail.status === 'PENDING' &&
      this.countedCents !== null &&
      this.handedOverById !== null &&
      (!this.hasDiscrepancy() || this.discrepancyReasonInput.trim().length > 0)
    );
  }

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected methodLabel(method: string): string {
    return this.translate.instant(`ADMIN.SETTLEMENTS.METHOD.${method.toUpperCase()}`);
  }

  protected channelLabel(channel: string): string {
    return this.translate.instant(`ADMIN.SETTLEMENTS.CHANNEL.${channel.toUpperCase()}`);
  }

  // OBRS-670. `cancelled` / `no_show` — mapped to an i18n key, never the raw
  // slug. Distinct from methodLabel: these are ticket dispositions, not payment
  // methods, and AC 2 keeps them conversationally separate (part-refunded vs.
  // 100%-forfeit) even though the maths is identical.
  protected notTravelledStatusLabel(status: string): string {
    return this.translate.instant(`ADMIN.SETTLEMENTS.NOT_TRAVELLED.STATUS.${status.toUpperCase()}`);
  }

  // OBRS-670 AC 5 / OBRS-671. `retainedAmount` and the cash `discrepancyAmount`
  // are both deliberately un-clamped, so an over-refund / short drawer yields a
  // negative figure — the template flags it (never hides or zero-clamps it).
  protected isNegativeMoney(value: string): boolean {
    return Number(value) < 0;
  }

  // OBRS-670. Not-travelled buckets key on `key` (a method slug or a status
  // slug), unlike the travelled rows which key on method/channel.
  protected trackByNotTravelledKey(_index: number, row: { key: string }): string {
    return row.key;
  }

  protected onBackdropDismiss(): void {
    this.closed.emit();
  }

  protected onConfirmClick(): void {
    if (!this.canConfirm) {
      return;
    }
    const counted = this.countedCents;
    if (counted === null || this.handedOverById === null) {
      return;
    }
    const reason = this.discrepancyReasonInput.trim();
    this.confirmRequested.emit({
      countedCashAmount: (counted / 100).toFixed(2),
      handedOverBy: this.handedOverById,
      // The server only wants a reason when the count doesn't reconcile — omit
      // it otherwise so a stray keystroke on a balanced drawer isn't recorded.
      discrepancyReason: this.hasDiscrepancy() ? reason : undefined,
    });
  }

  // Structural (not nominal) param types so the same trackBy fn works for
  // both the live (full) and settled (thin, amount-only) breakdown rows.
  protected trackByMethod(_index: number, row: { method: string }): string {
    return row.method;
  }

  protected trackByChannel(_index: number, row: { channel: string }): string {
    return row.channel;
  }

  protected trackByCandidate(_index: number, row: SettlementHandoverCandidate): number {
    return row.id;
  }

  // A money string is valid iff it's a non-negative decimal with at most two
  // fraction digits. Cents (integer) avoid binary-float drift in the
  // reconcile-against-expected comparison.
  private static toCents(value: string): number | null {
    const trimmed = value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return null;
    }
    return Math.round(Number(trimmed) * 100);
  }
}

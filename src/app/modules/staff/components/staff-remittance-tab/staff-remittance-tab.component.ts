import {
  Component,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { Subject, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  StaffRemittanceDto,
  StaffRemittanceFareLineDto,
  StaffRemittancePerHeadLineDto,
  StaffRemittanceSubmitReqDto,
} from '../../../../shared/interfaces/staff-remittance.interface';
import { extractApiErrorCode, mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';
import { toCents } from '../../../../shared/lib/money-cents';
import { formatMoney } from '../../../../shared/lib/money-display';
import { formatDisplayTime } from '../../../../shared/lib/display-date-time';
import { confirmDiscardUnsavedSettings } from '../../../admin/pages/system-settings/unsaved-settings-prompt';

/**
 * Every server code this screen can be told, mapped to a sentence that is true
 * for THIS action. `mapApiErrorCode` (not a bare lookup) because these come
 * straight off the wire and an object-literal map inherits `Object.prototype`.
 *
 * `SETTLEMENT_SUBMIT_AMOUNT_STALE` deliberately has NO number in its copy: the
 * new figure travels in `messageArgs`, and the screen re-reads the round rather
 * than parsing a localized sentence for it (spec §2B).
 */
const SUBMIT_ERROR_KEYS: Record<string, string> = {
  SETTLEMENT_SUBMIT_ADVANCE_NOT_ALLOWED: 'STAFF.REMITTANCE.ERROR.ADVANCE_NOT_ALLOWED',
  SETTLEMENT_SUBMIT_PER_HEAD_NOT_ALLOWED: 'STAFF.REMITTANCE.ERROR.PER_HEAD_NOT_ALLOWED',
  SETTLEMENT_SUBMIT_AMOUNT_STALE: 'STAFF.REMITTANCE.ERROR.AMOUNT_STALE',
  SETTLEMENT_ROUND_NOT_DEPARTED: 'STAFF.REMITTANCE.ERROR.NOT_DEPARTED',
  SETTLEMENT_ALREADY_SETTLED: 'STAFF.REMITTANCE.ERROR.ALREADY_SETTLED',
  SETTLEMENT_SCOPE_FORBIDDEN: 'STAFF.REMITTANCE.ERROR.SCOPE_FORBIDDEN',
  SETTLEMENT_SCHEDULE_NOT_FOUND: 'STAFF.REMITTANCE.ERROR.NOT_FOUND',
  SETTLEMENT_IDEMPOTENCY_MISMATCH: 'STAFF.REMITTANCE.ERROR.IDEMPOTENCY_MISMATCH',
  SETTLEMENT_IDEMPOTENCY_INCOMPLETE: 'STAFF.REMITTANCE.ERROR.IDEMPOTENCY_INCOMPLETE',
  ACCESS_DENIED: 'STAFF.REMITTANCE.ERROR.ACCESS_DENIED',
  DRIVER_CASH_SCHEDULE_NO_VEHICLE: 'STAFF.REMITTANCE.ERROR.NO_VEHICLE',
  DRIVER_CASH_SCHEDULE_NO_DRIVER: 'STAFF.REMITTANCE.ERROR.NO_DRIVER',
  DRIVER_CASH_DAY_ALREADY_RETURNED: 'STAFF.DRIVER_CASH.ERROR.DAY_ALREADY_RETURNED',
};

/** `advance.blockedReason` — why the box is read-only rather than absent. */
const ADVANCE_BLOCKED_KEYS: Record<string, string> = {
  NO_VEHICLE: 'STAFF.REMITTANCE.ADVANCE.BLOCKED.NO_VEHICLE',
  NO_DRIVER: 'STAFF.REMITTANCE.ADVANCE.BLOCKED.NO_DRIVER',
  NOT_DEPARTED: 'STAFF.REMITTANCE.ADVANCE.BLOCKED.NOT_DEPARTED',
};

/** Decimal string → integer satang. Accepts the MINUS the money regex refuses (see `expectedCents`). */
function toSignedCents(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/**
 * OBRS-1755 — the 4th tab of `/staff/sell`: what the salesperson personally
 * owes the owner for the SELECTED round, and the one button that hands it over.
 *
 * <p><b>One button for the whole screen</b> (owner ruling 2026-09-09). "ส่งยอด"
 * records the driver cash advance typed above it AND submits the round, in one
 * server transaction under one `Idempotency-Key` — there is no separate
 * "บันทึกเงินทดรอง" button any more. That is why the embedded
 * `app-driver-cash-advance-form` is given `[showSubmit]="false"`: it is the
 * SAME component `/staff/boarding/:scheduleId` uses, extended additively rather
 * than forked, and its own submit button is simply not rendered here.
 *
 * <p><b>Nothing on this screen is computed from scratch.</b> `myExpectedCash`
 * and `roundExpectedCash` are the server's (BR-4/BR-5); the only arithmetic
 * here is the PENDING DELTA — money typed but not yet sent — applied to the
 * server's own figure so the button says what the clerk is about to hand over.
 *
 * <p><b>The two counters differ by `remitCadence` alone</b> (BR-6), which the
 * server derives from `sales_points.ticket_cash_remit_cadence`. `ROUND` gets the
 * advance box and no per-head row; `DAY` gets the per-head row and no advance
 * box. No stop name is hard-coded anywhere, and the clerk is never asked which
 * kind of counter they are standing at.
 */
@Component({
  selector: 'app-staff-remittance-tab',
  templateUrl: './staff-remittance-tab.component.html',
  styleUrl: './staff-remittance-tab.component.scss',
  standalone: false,
})
export class StaffRemittanceTabComponent implements OnChanges, OnDestroy {
  @Input() scheduleId: number | null = null;

  /**
   * Whether this tab is the one on screen. `p-tabpanel` is NOT lazy by default
   * (`lazy` is false, so `shouldRender()` is true for every panel), which means
   * this component is constructed the moment a trip is selected — fetching in
   * `ngOnInit` would put a request on the wire for every round the clerk clicks
   * in the left-hand list, whether or not they ever open this tab.
   *
   * <p>Gating the FETCH rather than the component is also what keeps a
   * half-typed advance alive across a trip to "ขึ้นรถ" and back: an `@if` around
   * the panel content would destroy it instead.
   */
  @Input() active = false;

  protected remittance: StaffRemittanceDto | null = null;
  protected isLoading = false;
  protected loadError: string | null = null;

  /**
   * Mirror of the embedded advance form's raw text, so the "หักเงินที่คนขับ
   * ขอเบิกไป" row can move as it is typed (mockup ③ → ⑦).
   */
  protected advanceAmountInput = '';

  /** stopId → typed head count. Seeded from the payload; always overridable (BR-10). */
  protected headCountInputs: Record<number, string> = {};

  protected isSubmitting = false;
  protected submitError: string | null = null;

  /**
   * The key in flight and the payload it belongs to — the `driver-settlement-page`
   * contract verbatim: one key per ATTEMPT OF THE SAME CONTENT, reused on a
   * retry of an identical payload so a dropped response replays instead of
   * paying the driver twice, and dropped whenever the payload changes.
   */
  private pendingIdempotencyKey: string | null = null;
  private pendingPayloadSignature: string | null = null;

  /** The round the data on screen belongs to — not necessarily `scheduleId` yet. */
  private loadedScheduleId: number | null = null;

  private readonly load$ = new Subject<number>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    // switchMap, not mergeMap: clicking through rounds must CANCEL the previous
    // answer, or the slower response for the round the clerk has already left
    // overwrites the one they are looking at.
    this.load$
      .pipe(
        switchMap((scheduleId) =>
          this.staffApiService.getMyRemittance(scheduleId).pipe(
            map((response) => ({ data: response?.data ?? null, error: null as unknown })),
            catchError((error: unknown) => of({ data: null, error }))
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(({ data, error }) => this.applyLoaded(data, error));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['scheduleId'] && !changes['active']) return;
    // A different round is different money: whatever was typed belongs to the
    // round that was on screen, and keeping it would file it against this one.
    if (changes['scheduleId'] && this.scheduleId !== this.loadedScheduleId) {
      this.resetEntryState();
      this.remittance = null;
    }
    if (this.active && this.scheduleId !== null && this.scheduleId !== this.loadedScheduleId) {
      this.requestLoad(this.scheduleId);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Unsaved-work guards (BR-18) ──────────────────────────────────────────

  /**
   * Money has left the drawer (or a head count was corrected) and the server
   * still does not know. Both are lost silently on a navigation, which is
   * exactly the case the owner asked to be warned about when the standalone
   * "บันทึกเงินทดรอง" button was removed.
   */
  protected get hasUnsubmittedWork(): boolean {
    if ((toCents(this.advanceAmountInput) ?? 0) > 0) return true;
    return this.perHeadLines.some(
      (line) => this.headCountOf(line) !== this.seededHeadCountOf(line)
    );
  }

  /** Implements `CanComponentDeactivate`, reached through the sell page. */
  canDeactivate(): boolean | Promise<boolean> {
    return confirmDiscardUnsavedSettings(
      { pristine: !this.hasUnsubmittedWork },
      this.alertService,
      this.translate,
      {
        titleKey: 'STAFF.REMITTANCE.UNSAVED.TITLE',
        textKey: 'STAFF.REMITTANCE.UNSAVED.TEXT',
        confirmKey: 'STAFF.REMITTANCE.UNSAVED.CONFIRM',
        cancelKey: 'STAFF.REMITTANCE.UNSAVED.CANCEL',
      }
    );
  }

  /**
   * The other half of BR-18. A route guard cannot see a tab close, a reload or
   * a back button — only this can, and browsers show their own wording, so
   * `preventDefault()` is the whole of the contract.
   */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsubmittedWork) return;
    event.preventDefault();
    event.returnValue = '';
  }

  // ── Derived view state ───────────────────────────────────────────────────

  protected get isRoundCadence(): boolean {
    return this.remittance?.remitCadence === 'ROUND';
  }

  /** BR-6: the advance box exists only where the counter remits at the round. */
  protected get showAdvanceBox(): boolean {
    return this.isRoundCadence;
  }

  /** BR-6: the per-head row exists only where the counter keeps the fee. */
  protected get showPerHeadBox(): boolean {
    return !this.isRoundCadence && (this.remittance?.hasPerHead ?? false);
  }

  protected get perHeadLines(): StaffRemittancePerHeadLineDto[] {
    if (!this.showPerHeadBox) return [];
    return this.remittance?.perHeadLines ?? [];
  }

  /** BR-3: the deduction rows are the WHOLE round's, so say so rather than dividing. */
  protected get isSharedRound(): boolean {
    return (this.remittance?.roundSellerCount ?? 1) > 1;
  }

  /**
   * BR-13 — the ONE advance figure on this screen. Rendered in box ③ and again
   * as the deduction row in box ⑦; `advance.recordedAmount` is the same number
   * server-side, but reading one field twice is what makes two different
   * numbers impossible rather than merely unlikely.
   */
  protected get recordedAdvanceCents(): number {
    return toSignedCents(this.remittance?.deductions.advancePaidOut);
  }

  /**
   * ⑥ / BR-25 — the return-leg row is drawn only when there is one.
   *
   * Unlike `deferredTicketCash` (always in the payload, never drawn — BR-7),
   * this row appears exactly when it carries money: most rounds sell no return
   * tickets at all, and a permanent `+0` line would be noise on every one of
   * them.
   */
  protected get showReturnLegRow(): boolean {
    return toSignedCents(this.remittance?.returnLeg.cashAmount) !== 0;
  }

  /**
   * Whether ANY cash passed through the drawer on this round — the C1/C2 split
   * below. A predicate over the two positive terms, deliberately NOT a subtotal:
   * `myExpectedCash` already has the return leg folded in server-side (owner
   * ruling 2026-09-13), and the screen must never add it a second time.
   */
  private get anyCashThroughDrawer(): boolean {
    return (
      toSignedCents(this.remittance?.myTickets.cashAmount) !== 0 ||
      toSignedCents(this.remittance?.returnLeg.cashAmount) !== 0
    );
  }

  /** What is typed into the advance box right now, in satang. */
  protected get typedAdvanceCents(): number {
    return toCents(this.advanceAmountInput) ?? 0;
  }

  /** The advance row as it will read once this submit lands. */
  protected get pendingAdvanceCents(): number {
    return this.recordedAdvanceCents + this.typedAdvanceCents;
  }

  /** What the server has recorded for the per-head fee, in satang. */
  protected get recordedPerHeadCents(): number {
    return toSignedCents(this.remittance?.deductions.perHeadDeducted);
  }

  /** The per-head fee implied by the head counts currently on screen. */
  protected get pendingPerHeadCents(): number {
    if (!this.showPerHeadBox) return this.recordedPerHeadCents;
    return this.perHeadLines
      .filter((line) => line.configured)
      .reduce(
        (sum, line) => sum + this.headCountOf(line) * toSignedCents(line.ratePerHead),
        0
      );
  }

  /**
   * What the clerk is about to hand over, in satang.
   *
   * ⛔ NOT a re-derivation of BR-4. It starts from the server's own
   * `myExpectedCash` and applies only the deltas the server has not seen yet —
   * the advance about to be written, and any head-count correction. With
   * nothing typed it equals the server's figure exactly.
   *
   * SIGNED throughout: a round where the drawer paid out more than it took in is
   * a correct state (BR-4), not an error to clamp.
   */
  protected get pendingExpectedCents(): number {
    const server = toSignedCents(this.remittance?.myExpectedCash);
    const perHeadDelta = this.pendingPerHeadCents - this.recordedPerHeadCents;
    return server - this.typedAdvanceCents - perHeadDelta;
  }

  /** ⑮ A/B/C1/C2 — four different things one number can mean, and they must not share a sentence. */
  protected get expectedCashState(): 'POSITIVE' | 'NEGATIVE' | 'ZERO_NO_CASH' | 'ZERO_NETTED' {
    const cents = this.pendingExpectedCents;
    if (cents > 0) return 'POSITIVE';
    if (cents < 0) return 'NEGATIVE';
    // C1 vs C2: zero because nothing ever passed through the drawer, or zero
    // because real money came in and was paid straight back out. The figure is
    // identical; only one of them leaves a driver's advance slip behind.
    return this.anyCashThroughDrawer ? 'ZERO_NETTED' : 'ZERO_NO_CASH';
  }

  /** Displayed magnitude — the sign is carried by the sentence, not by a minus (mockup ⑮). */
  protected get expectedCashMagnitude(): number {
    return Math.abs(this.pendingExpectedCents) / 100;
  }

  protected get submission(): StaffRemittanceDto['submission'] {
    return this.remittance?.submission ?? null;
  }

  protected get isStale(): boolean {
    return this.submission?.stale ?? false;
  }

  /**
   * BR-17 — cash to take back out of the envelope (negative) or to add to it
   * (positive), against what was already submitted. Derived from two fields, not
   * from the 409's sentence.
   */
  protected get staleDeltaCents(): number {
    if (!this.submission) return 0;
    return this.pendingExpectedCents - toSignedCents(this.submission.submittedExpectedCash);
  }

  protected get staleDeltaMagnitude(): number {
    return Math.abs(this.staleDeltaCents) / 100;
  }

  protected get advanceBlockedKey(): string | null {
    const advance = this.remittance?.advance;
    if (!advance || advance.allowed) return null;
    return mapApiErrorCode(
      advance.blockedReason,
      ADVANCE_BLOCKED_KEYS,
      'STAFF.REMITTANCE.ADVANCE.BLOCKED.GENERIC'
    );
  }

  /** A round the owner has already signed off, or one that has not left, cannot be submitted. */
  protected get submitBlockedKey(): string | null {
    if (!this.remittance) return null;
    if (this.remittance.status === 'SETTLED') return 'STAFF.REMITTANCE.BLOCKED.SETTLED';
    if (!this.remittance.departed) return 'STAFF.REMITTANCE.BLOCKED.NOT_DEPARTED';
    return null;
  }

  protected get canSubmit(): boolean {
    return !!this.remittance && !this.isSubmitting && this.submitBlockedKey === null;
  }

  // ── Per-head editing ─────────────────────────────────────────────────────

  /** The head count on screen for a stop; falls back to what the system counted. */
  protected headCountOf(line: StaffRemittancePerHeadLineDto): number {
    const raw = this.headCountInputs[line.stopId];
    if (raw === undefined || raw.trim() === '') return this.seededHeadCountOf(line);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return this.seededHeadCountOf(line);
    return Math.floor(parsed);
  }

  /**
   * What the box opened on: the count already recorded for this round if there
   * is one, otherwise the system's own count (owner ruling 2026-09-09 — prefill,
   * and keep the system number visible beside it either way).
   */
  protected seededHeadCountOf(line: StaffRemittancePerHeadLineDto): number {
    return line.recordedHeadCount > 0 ? line.recordedHeadCount : line.systemHeadCount;
  }

  /** True when the clerk has typed over the system's count — the screen SAYS so (BR-10). */
  protected isHeadCountOverridden(line: StaffRemittancePerHeadLineDto): boolean {
    return this.headCountOf(line) !== line.systemHeadCount;
  }

  protected onHeadCountInput(stopId: number, value: string): void {
    this.headCountInputs = { ...this.headCountInputs, [stopId]: value };
  }

  protected onAdvanceAmountChange(value: string): void {
    this.advanceAmountInput = value;
  }

  // ── Labels ───────────────────────────────────────────────────────────────

  /**
   * BR-8 — `occupantType` decides first. `ParcelIntakeService.buildParcelTicket`
   * never sets `fareCategorySnapshot`, so a seat bought for a parcel falls back
   * to the entity default `"adult"`; grouping by fare category alone would print
   * a parcel row labelled "ผู้ใหญ่".
   */
  protected fareLineLabelKey(line: StaffRemittanceFareLineDto): string {
    if (line.occupantType === 'parcel') return 'STAFF.REMITTANCE.TICKETS.OCCUPANT.PARCEL';
    if (line.fareCategory === 'child') return 'STAFF.REMITTANCE.TICKETS.FARE.CHILD';
    return 'STAFF.REMITTANCE.TICKETS.FARE.ADULT';
  }

  /**
   * The same slug→key transform `settlement-detail-modal.methodLabel()` uses
   * (`ADMIN.SETTLEMENTS.METHOD.${method.toUpperCase()}`), so the owner's screen
   * and the seller's screen cannot name one payment method two ways. The wire
   * carries lowercase slugs; the bundle keys are upper.
   */
  protected methodLabelKey(method: string): string {
    return `ADMIN.SETTLEMENTS.METHOD.${method.toUpperCase()}`;
  }

  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

  protected displayTime(value: string | null | undefined): string {
    return formatDisplayTime(value);
  }

  // ── Load / submit ────────────────────────────────────────────────────────

  protected reload(): void {
    if (this.scheduleId === null) return;
    this.requestLoad(this.scheduleId);
  }

  private requestLoad(scheduleId: number): void {
    this.isLoading = true;
    this.loadError = null;
    this.load$.next(scheduleId);
  }

  private applyLoaded(data: StaffRemittanceDto | null, error: unknown): void {
    this.isLoading = false;
    if (error) {
      this.loadError = this.mapError(error);
      return;
    }
    this.loadError = null;
    this.remittance = data;
    this.loadedScheduleId = data?.scheduleId ?? this.loadedScheduleId;
    this.seedHeadCounts(data);
  }

  /**
   * Rebuilt on load rather than merged. Safe because every load is preceded by
   * `resetEntryState()` (a new round, or a successful submit) or by a stale
   * refresh, which is precisely the moment the seeded numbers are wrong — there
   * is never a mid-edit value here to overwrite.
   */
  private seedHeadCounts(data: StaffRemittanceDto | null): void {
    const seeded: Record<number, string> = {};
    for (const line of data?.perHeadLines ?? []) {
      seeded[line.stopId] = String(
        line.recordedHeadCount > 0 ? line.recordedHeadCount : line.systemHeadCount
      );
    }
    this.headCountInputs = seeded;
  }

  protected onSubmit(): void {
    if (!this.canSubmit || this.scheduleId === null) return;
    const payload = this.buildPayload();

    const signature = JSON.stringify(payload);
    if (this.pendingIdempotencyKey === null || this.pendingPayloadSignature !== signature) {
      this.pendingIdempotencyKey = generateIdempotencyKey();
      this.pendingPayloadSignature = signature;
    }

    this.isSubmitting = true;
    this.submitError = null;
    this.staffApiService
      .postRemittanceSubmit(this.scheduleId, payload, this.pendingIdempotencyKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // The 200 is the SAME shape as the GET, so the screen repaints from
          // the answer instead of asking again. Order matters: clearing the
          // entry state flips `isSubmitting` to false with no error, which is
          // the signal the embedded advance form clears its own field on.
          this.resetEntryState();
          this.remittance = response?.data ?? this.remittance;
          this.loadedScheduleId = response?.data?.scheduleId ?? this.loadedScheduleId;
          this.seedHeadCounts(response?.data ?? null);
        },
        error: (error: unknown) => {
          this.isSubmitting = false;
          // The key and its signature are KEPT: pressing submit again on the
          // same payload replays the server's answer rather than handing the
          // driver a second advance.
          this.submitError = this.mapError(error);
          if (extractApiErrorCode(error, null) === 'SETTLEMENT_SUBMIT_AMOUNT_STALE') {
            // The whole submit rolled back, so what was typed is still
            // unrecorded and must survive — only the round's figures are
            // re-read, so the button shows the number the server just refused
            // to accept the old one against.
            this.reload();
          }
        },
      });
  }

  private buildPayload(): StaffRemittanceSubmitReqDto {
    const advanceCents = this.showAdvanceBox ? this.typedAdvanceCents : 0;
    return {
      // Explicit null, never `undefined`: `JSON.stringify` DROPS undefined keys,
      // which would make "no advance" and "a 500-baht advance removed again"
      // serialize identically and share one idempotency key.
      advanceAmount: advanceCents > 0 ? (advanceCents / 100).toFixed(2) : null,
      perHead: this.perHeadLines
        .filter((line) => line.configured)
        .map((line) => ({ stopId: line.stopId, headCount: this.headCountOf(line) })),
      // ⛔ NOT `toCents()`. Its regex refuses a leading minus and returns null,
      // which a `?? 0` then turns into a silent "0.00" — and a negative
      // expectation is a legitimate state here (BR-19, measured on OBRS-1772).
      expectedCashAmount: (this.pendingExpectedCents / 100).toFixed(2),
    };
  }

  private resetEntryState(): void {
    this.isSubmitting = false;
    this.submitError = null;
    this.advanceAmountInput = '';
    this.pendingIdempotencyKey = null;
    this.pendingPayloadSignature = null;
  }

  private mapError(error: unknown): string {
    return mapApiErrorCode(
      extractApiErrorCode(error, null),
      SUBMIT_ERROR_KEYS,
      'STAFF.REMITTANCE.ERROR.GENERIC'
    );
  }
}

import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import {
  NotificationMessageLocale,
  NotificationMessageLocaleStatusDto,
  PlaceholderErrorDto,
} from '../../../../../shared/interfaces/notification-message-override.interface';
import { extractPlaceholderIndices } from '../../../../../shared/lib/notification-message-placeholder';

/** AC12: "While typing: bodyChange debounced 500 ms → POST .../credit-preview". */
const CREDIT_PREVIEW_DEBOUNCE_MS = 500;

/**
 * OBRS-1308 — dumb owner edit form: one `<textarea class="admin-field">`
 * (§5's textarea exception — 12px radius, not the pill), required only.
 * Placeholder/format validity is server-side ONLY — the `{n}` regex here
 * (via `extractPlaceholderIndices`) is display-only, for the live hint chip
 * row, never a save gate.
 *
 * <p><b>`canSave` is only `body.trim().length > 0 && !submitting`</b> — the
 * credit panel (AC12) is display-only and must never disable Save or raise a
 * validation error, an explicit user decision (card comment 12321).
 */
@Component({
    selector: 'app-notification-message-edit-form',
    templateUrl: './notification-message-edit-form.component.html',
    styleUrl: './notification-message-edit-form.component.scss',
    standalone: false
})
export class NotificationMessageEditFormComponent implements OnChanges, OnDestroy {
  @Input() detail: NotificationMessageLocaleStatusDto | null = null;
  @Input() locale: NotificationMessageLocale = 'th';
  @Input() sampleArgs: string[] = [];
  @Input() submitting = false;
  @Input() validationError: PlaceholderErrorDto | null = null;

  /** Debounced (500ms) — feeds the credit-preview call. Raw `body` (below)
   * still drives the hint/preview on every keystroke, undebounced. */
  @Output() bodyChange = new EventEmitter<string>();
  @Output() save = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  protected body = '';

  // OBRS-1308 (design-system §6/§11 "optimistic-open" pristine guard): once
  // the owner has typed, a later `detail` patch (the one-off GET landing
  // after this form already rendered from a cache-hit) must never clobber
  // the in-flight edit.
  private bodyTouchedByUser = false;

  private readonly bodyChangeSubject = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor() {
    this.bodyChangeSubject
      .pipe(
        debounceTime(CREDIT_PREVIEW_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((value) => this.bodyChange.emit(value));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['detail'] && !this.bodyTouchedByUser) {
      this.body = this.initialBody();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get placeholderIndices(): number[] {
    return extractPlaceholderIndices(this.body);
  }

  protected get canSave(): boolean {
    return this.body.trim().length > 0 && !this.submitting;
  }

  protected onInput(value: string): void {
    this.bodyTouchedByUser = true;
    this.body = value;
    this.bodyChangeSubject.next(value);
  }

  protected onSave(): void {
    if (!this.canSave) {
      return;
    }
    this.save.emit(this.body);
  }

  protected onCancel(): void {
    this.cancel.emit();
  }

  /**
   * The locked GET contract carries `baseline`/`liveBody`/`status`/
   * `rejectReason` per locale — there is no field distinct from `liveBody`
   * for "the exact body of a REJECTED attempt" (only `rejectReason`, which
   * is WHY it was rejected, not WHAT was submitted). `liveBody` (the current
   * live text) is therefore the closest available starting point in every
   * status, REJECTED included — flagged for QA/Scrutinize as a contract gap
   * worth resolving with the backend team if a literal "last proposed body"
   * turns out to matter more than "what's live today".
   */
  private initialBody(): string {
    return this.detail?.liveBody ?? '';
  }
}

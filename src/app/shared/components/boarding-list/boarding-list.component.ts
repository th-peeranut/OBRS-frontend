import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal';
import { HttpErrorResponse } from '@angular/common/http';
// OBRS-266: type-only import — `@zxing/browser` (which pulls in the
// multi-format `@zxing/library` decoder) is loaded via a dynamic `import()`
// in `startCameraScan()` instead, so it code-splits into its own on-demand
// chunk rather than landing in the eager initial bundle (a static value
// import here measured +500kB raw / +94kB gzip on the initial chunk, well
// past the design-system/CLAUDE.md 1.5MB warning budget — most staff never
// open camera mode, so it shouldn't cost every visitor that weight upfront).
import type { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Subject, Subscription, firstValueFrom } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import { parseAdminStatus } from '../../../services/admin/admin-api.service';
import {
  boardingScanErrorIcon,
  boardingScanErrorSeverity,
  extractBoardingScanErrorCode,
  mapBoardingScanErrorCode,
} from '../../lib/boarding-scan-error';
import { extractBoardingActionErrorCode, mapBoardingActionErrorCode } from '../../lib/boarding-action-error';
import { extractChildFareFlagErrorCode, mapChildFareFlagErrorCode } from '../../lib/child-fare-flag-error';
import { extractScheduleStatusErrorCode, mapScheduleStatusErrorCode } from '../../lib/schedule-status-error';
import { extractApiErrorMessage } from '../../lib/api-error';
import { extractScheduleDelayErrorCode, mapScheduleDelayErrorCode } from '../../lib/schedule-delay-error';
import { formatDisplayDateTime } from '../../lib/display-date-time';
import {
  combineBangkokDateTime,
  controlValueToDateString,
  controlValueToTimeString,
  dateStringToControlValue,
  splitApiOffsetDateTime,
  timeStringToControlValue,
} from '../../lib/api-date-time';
import { BoardingScanResultDto } from '../../interfaces/ticket-boarding.interface';
import { BoardingListItemDto, StaffApiService } from '../../../services/staff/staff-api.service';
import { BoardingListStore } from './boarding-list.store';

/** OBRS-100: supplementary trip-header data for the print manifest (and,
 * incidentally, informational display) — self-fetched by
 * `BoardingListComponent` via `StaffApiService.getScheduleById()`, never
 * threaded through either host (ADR 0014 keeps the `[scheduleId]`-only
 * contract). Seats-sold / boarded counts are NOT part of this shape — they
 * are derived from `items` already held by the component.
 *
 * OBRS-256: `statusCode` (`scheduled|departed|arrived|unknown`, from
 * `parseAdminStatus(schedule?.status).code`) additionally drives the
 * on-screen status pill + forward-transition control + the boarding
 * count-lock once a schedule reaches `arrived`.
 *
 * OBRS-272: `departureDateTimeRaw` carries the schedule's original (raw,
 * offset-ISO) `departureDateTime` alongside the already-formatted display
 * string, so the delay dialog can client-validate "ETA strictly after the
 * original departure" without re-parsing a localized display string.
 * `delayedDepartureDateTime`/`delayReason` mirror `AdminScheduleDto` — `null`
 * (the default) means the schedule isn't delayed; "delayed" is a DERIVED UI
 * state off these two fields, never a status code (`statusCode` stays
 * `scheduled`).
 *
 * OBRS-451: `assignedToMe` mirrors `AdminScheduleDto.assignedToMe` — the
 * backend's own answer to "is the current session assigned to this
 * schedule", used to hide the departed/arrived control from a driver on a
 * schedule that isn't theirs (see `canShowScheduleStatusAction()` below).
 * `null` means the fetch response omitted the field (a cached payload
 * predating this card) — treated as "not assigned" for a pure driver, never
 * as "assigned"; irrelevant for salesperson/admin/owner. */
export interface BoardingManifestHeader {
  routeLabel: string;
  departureDateTime: string;
  departureDateTimeRaw: string | null;
  vehicleLabel: string;
  driverName: string;
  statusCode: string;
  delayedDepartureDateTime: string | null;
  delayReason: string | null;
  assignedToMe: boolean | null;
}

/** OBRS-256: the single forward transition available from the CURRENT
 * schedule status, or `null` when there is none (`arrived`/`unknown`/no
 * `tripHeader`). `code` is the value PATCHed to
 * `StaffApiService.updateScheduleStatus()`. */
export interface ScheduleStatusAction {
  code: 'departed' | 'arrived';
  labelKey: string;
  icon: string;
  requiresConfirm: boolean;
}

/** Inline result of the manual boarding-scan box — success carries the
 * boarded passenger/seat/time, failure carries the errorCode-derived i18n
 * key + severity + icon (design-system §11: never distinguish by color
 * alone). */
export interface BoardingScanErrorResult {
  messageKey: string;
  severity: 'danger' | 'warning';
  icon: string;
}

/** OBRS-266: camera QR-scan lifecycle for the boarding-scan box.
 * `idle` — camera mode not active / just torn down.
 * `requesting` — `getUserMedia` prompt in flight.
 * `active` — stream bound to `#scanVideo`, decoding continuously.
 * `denied` / `no-camera` / `unsupported` / `error` — terminal fallback states,
 * each rendering the shared full-section empty-state (design-system §12). */
export type BoardingCameraStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'denied'
  | 'no-camera'
  | 'unsupported'
  | 'error';

/**
 * OBRS-130: the driver-manifest / walk-in-boarding-tab shared presentational
 * component. Self-sufficient — owns its own `BoardingListStore` instance
 * (component-scoped, see `providers` below) and calls `StaffApiService`
 * directly, so either host only needs to pass `[scheduleId]`.
 *
 * **Single-owner re-bind contract**: only `ngOnChanges` calls
 * `store.setScheduleId()` + `refresh()`. A host must NOT call
 * `store.setScheduleId()` itself — doing so from both places would
 * double-fetch on mount.
 */
@Component({
  selector: 'app-boarding-list',
  templateUrl: './boarding-list.component.html',
  styleUrl: './boarding-list.component.scss',
  providers: [BoardingListStore],
})
export class BoardingListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() scheduleId!: number;

  @ViewChild('printTemplate', { static: true }) protected printTemplate!: TemplateRef<unknown>;
  /** OBRS-266: only present in the DOM while `scanMode === 'camera'` (see
   * template) — `undefined` in text mode / before the camera view renders. */
  @ViewChild('scanVideo') protected videoElement?: ElementRef<HTMLVideoElement>;

  protected items: BoardingListItemDto[] = [];
  protected isRefreshing = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  /** OBRS-100: supplementary print/export trip header — see `loadTripHeader()`.
   * `null` while loading and on any fetch failure (silent degrade; template
   * falls back to '-' per field). */
  protected tripHeader: BoardingManifestHeader | null = null;
  private headerRequestScheduleId: number | null = null;

  /** OBRS-100: exposes the global `String` ctor to the template so
   * `[params]="{ scheduleId: String(scheduleId) }"` can stringify the
   * numeric input — `ExportButtonComponent.params` is typed
   * `Record<string, string>` under strictTemplates. */
  protected readonly String = String;

  private printPortalHost: HTMLElement | null = null;
  private printPortalOutlet: DomPortalOutlet | null = null;
  private readonly handleAfterPrint = (): void => this.disposePrintPortal();

  /** Ticket ids with a board() call in flight (button spinner/disabled state). */
  protected boardingIds = new Set<number>();
  /** Ticket ids with an unboard() call in flight. */
  protected unboardingIds = new Set<number>();

  /** Un-board is salesperson/admin only (admin inherits via ROLE_GRANTS) —
   * hidden, not disabled, for a driver. Same precedent as
   * `ExportButtonComponent.canExport`. */
  protected readonly canUnboard: boolean;

  /** OBRS-296: ticket ids with a flagChildFare() call in flight. */
  protected flaggingIds = new Set<number>();
  /** OBRS-296: ticket ids with an unflagChildFare() call in flight. */
  protected unflaggingIds = new Set<number>();

  /** OBRS-296: unflag is salesperson/admin only — hidden, not disabled, for a
   * driver. Same shape as `canUnboard` above. */
  protected readonly canUnflagChildFare: boolean;

  /** OBRS-256/OBRS-434: the schedule departed/arrived control. Salesperson/admin
   * for any trip, and a DRIVER for the trip they are assigned to — the driver is
   * the only person actually at the final stop when it ends, and the last stop is
   * often not a station. The backend scopes a driver to their own assignment
   * (`ScheduleService.transitionStatus`); this flag is ROLE ONLY, so a driver
   * opening someone else's `:scheduleId` still passes it — `canShowScheduleStatusAction()`
   * below narrows that case using the backend's own `assignedToMe` answer, so the
   * button no longer renders just to 403 on click (OBRS-451). */
  protected readonly canControlScheduleStatus: boolean;

  /** OBRS-451: raw held roles (`AuthService.getRoles()`), never `hasAnyRole()` —
   * salesperson/admin/owner all GRANT 'driver' through `ROLE_GRANTS`, so
   * `hasAnyRole(['driver'])` is true for them too and would wrongly count a
   * salesperson as a "pure" driver. `true` only when the session holds
   * `driver` and none of salesperson/admin/owner. Drives
   * `canShowScheduleStatusAction()` — salesperson/admin/owner are completely
   * unaffected by the `assignedToMe` gate. */
  protected readonly isPureDriver: boolean;

  /** OBRS-272/OBRS-434: the "mark delayed"/"update ETA" control stays
   * salesperson/admin only — its endpoint (`PATCH /schedules/{id}/delay`) is
   * still `hasRole('SALESPERSON')`, so rendering it for a driver would only
   * produce a 403. Split out of `canControlScheduleStatus` when OBRS-434 opened
   * the departed/arrived control to drivers; the two gates are no longer the
   * same question. */
  protected readonly canDelaySchedule: boolean;

  /** OBRS-471: admin/owner-only escape hatch for the vehicle-turnaround gate
   * (`VEHICLE_PREVIOUS_TRIP_NOT_ARRIVED` on a `departed` transition) — the
   * ROLE_GRANTS table already makes `hasAnyRole(['admin'])` true for an owner
   * session (`auth.service.ts:46`), same precedent as `canUnboard`. Drives
   * BOTH whether `onScheduleStatusAction()`'s error handler offers the
   * override confirm dialog AND the `overrideTurnaroundGate` flag it sends
   * on the confirmed retry — everyone else only sees the server's warning
   * text, no override control (AC2/AC5). */
  protected readonly canOverrideTurnaroundGate: boolean;

  /** OBRS-256: true while a departed/arrived PATCH is in flight — disables
   * the transition button and (together with `isScheduleArrived`) the
   * boarding controls. */
  protected isUpdatingScheduleStatus = false;

  // Manual boarding-scan box (OBRS-96) — text-entry token, always present as
  // the fallback input regardless of scanMode (OBRS-266).
  protected scanToken = '';
  protected isScanning = false;
  protected scanResult: BoardingScanResultDto | null = null;
  protected scanError: BoardingScanErrorResult | null = null;

  // OBRS-272: "Mark delayed"/"Update ETA" dialog — inline, component-local
  // state (mirrors OBRS-256's onScheduleStatusAction(), not a separate
  // component/NgRx slice — see docs/adr/0017).
  protected delayForm!: FormGroup;
  protected isDelayFormOpen = false;
  protected isSubmittingDelay = false;
  /** True when the client-side "ETA strictly after the original departure"
   * check fails — cleared on the next date/time edit or dialog (re)open. */
  protected delayEtaAfterError = false;
  /** True when the backend rejected the ETA (`SCHEDULE_DELAY_ETA_INVALID` or a
   * bean-validation 400) — rendered as the SAME inline field message as
   * `delayEtaAfterError` (never a duplicate `AlertService.error()` toast). */
  protected delayEtaServerError = false;

  /** OBRS-266: camera QR scanner — segmented alternative to the text box. */
  protected scanMode: 'text' | 'camera' = 'text';
  protected cameraStatus: BoardingCameraStatus = 'idle';
  private scannerControls: IScannerControls | null = null;
  /** One reader instance reused across camera sessions in this component's
   * lifetime — `decodeFromVideoDevice()` can be called again after `stop()`.
   * Lazily created on the first `startCameraScan()` call (see the dynamic
   * `import()` there) — `null` until the operator actually opens camera mode. */
  private codeReader: BrowserMultiFormatReader | null = null;
  /** Debounce: ignore a re-decode of the same token within `SCAN_DEBOUNCE_MS`
   * (a QR code sitting in frame decodes on every tick otherwise). */
  private lastScannedToken: string | null = null;
  private lastScannedAt = 0;
  private static readonly SCAN_DEBOUNCE_MS = 3000;
  private static readonly SUCCESS_AUTO_DISMISS_MS = 4000;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly subscriptions = new Subscription();
  /** OBRS-256: scopes the `updateScheduleStatus()` HTTP subscription only —
   * every other async flow in this component already uses `firstValueFrom`
   * (a single-shot promise, no subscription to leak).
   * OBRS-272: also scopes `delaySchedule()`'s subscription and the delay
   * form's `valueChanges` resets. */
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly authService: AuthService,
    protected readonly store: BoardingListStore,
    private readonly viewContainerRef: ViewContainerRef,
    private readonly formBuilder: FormBuilder,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.canUnboard = this.authService.hasAnyRole(['salesperson']);
    this.canControlScheduleStatus = this.authService.hasAnyRole(['salesperson', 'driver']);
    this.canDelaySchedule = this.authService.hasAnyRole(['salesperson']);
    this.canUnflagChildFare = this.authService.hasAnyRole(['salesperson']);
    this.canOverrideTurnaroundGate = this.authService.hasAnyRole(['admin']);
    const heldRoles = this.authService.getRoles();
    this.isPureDriver =
      heldRoles.includes('driver') &&
      !heldRoles.some((role) => role === 'salesperson' || role === 'admin' || role === 'owner');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scheduleId']) {
      // OBRS-266: a re-bind to a different schedule must not leave a live
      // camera stream open against the previous trip's boarding-scan box —
      // tear it down BEFORE the store re-init runs.
      this.stopCameraStream();
      this.scanMode = 'text';
      this.store.setScheduleId(this.scheduleId);
      void this.store.refresh();
      void this.loadTripHeader(this.scheduleId);
    }
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        this.items = data ?? [];
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((r) => (this.isRefreshing = r))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('STAFF.MESSAGES.LOAD_BOARDING_FAILED');
        } else {
          this.errorMessage = '';
        }
      })
    );

    this.delayForm = this.formBuilder.group({
      delayedDate: [null, [Validators.required]],
      delayedTime: [null, [Validators.required]],
      delayReason: ['', [Validators.maxLength(500)]],
    });
    // Clear a stale client/server ETA error the moment the operator edits
    // either control again, so an old message doesn't linger over a fresh value.
    this.delayForm
      .get('delayedDate')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.resetDelayEtaErrors());
    this.delayForm
      .get('delayedTime')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.resetDelayEtaErrors());
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    // OBRS-100: guard against a leaked body node if the operator navigates
    // away while the print dialog is still open (afterprint alone can't be
    // relied on for that case) — see docs/adr/0015.
    this.disposePrintPortal();
    // OBRS-266: unconditional — a live camera stream must never survive the
    // component being torn down (e.g. navigating off the boarding tab).
    this.stopCameraStream();
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /** OBRS-256: strict equality only — a `null`/`unknown` `tripHeader` must
   * resolve `false` (never accidentally freeze or unlock the boarding UI via
   * a negation or a fallback-to-true/false trick). */
  protected get isScheduleArrived(): boolean {
    return this.tripHeader?.statusCode === 'arrived';
  }

  protected get scheduleStatusPillClass(): string {
    switch (this.tripHeader?.statusCode) {
      case 'scheduled':
        return 'is-neutral';
      case 'departed':
        return 'is-info';
      case 'arrived':
        return 'is-success';
      default:
        return 'is-neutral';
    }
  }

  protected get scheduleStatusPillIcon(): string {
    switch (this.tripHeader?.statusCode) {
      case 'scheduled':
        return 'schedule';
      case 'departed':
        return 'directions_bus';
      case 'arrived':
        return 'check_circle';
      default:
        return 'help';
    }
  }

  protected get scheduleStatusPillLabelKey(): string {
    switch (this.tripHeader?.statusCode) {
      case 'scheduled':
        return 'STAFF.SCHEDULE_STATUS.PILL.SCHEDULED';
      case 'departed':
        return 'STAFF.SCHEDULE_STATUS.PILL.DEPARTED';
      case 'arrived':
        return 'STAFF.SCHEDULE_STATUS.PILL.ARRIVED';
      default:
        return 'STAFF.SCHEDULE_STATUS.PILL.UNKNOWN';
    }
  }

  /** OBRS-256: the single forward transition available from the CURRENT
   * status, or `null` (arrived / unknown / no `tripHeader` — no button
   * renders). */
  protected get scheduleStatusAction(): ScheduleStatusAction | null {
    switch (this.tripHeader?.statusCode) {
      case 'scheduled':
        return {
          code: 'departed',
          labelKey: 'STAFF.SCHEDULE_STATUS.ACTION.MARK_DEPARTED',
          icon: 'departure_board',
          requiresConfirm: false,
        };
      case 'departed':
        return {
          code: 'arrived',
          labelKey: 'STAFF.SCHEDULE_STATUS.ACTION.MARK_ARRIVED',
          icon: 'flag',
          requiresConfirm: true,
        };
      default:
        return null;
    }
  }

  /**
   * OBRS-451: second, narrower gate the template ANDs alongside
   * `canControlScheduleStatus` before rendering the departed/arrived button.
   * Salesperson/admin/owner: always `true` — this getter exists solely to
   * further restrict a driver's OWN view, it must never affect anyone else.
   * A pure driver (`isPureDriver`): `true` only when the backend's own
   * `tripHeader.assignedToMe` says so.
   *
   * Fail-closed by construction, not just by intent: `tripHeader` is `null`
   * on ANY `loadTripHeader()` failure (including a driver 403'd off a
   * schedule they don't own), and the whole `.boarding-trip-header` strip —
   * this button included — is already `*ngIf="tripHeader"`-gated in the
   * template, so a null header hides the button regardless of this getter.
   * The `=== true` check below (not `!== false`) is a second, explicit guard
   * for the remaining case: `tripHeader` populated but `assignedToMe` itself
   * `null`/missing (a response predating this field) — that also renders
   * nothing for a pure driver, never "unknown, so show it".
   */
  protected get canShowScheduleStatusAction(): boolean {
    if (!this.isPureDriver) {
      return true;
    }
    return this.tripHeader?.assignedToMe === true;
  }

  /** OBRS-272: "delayed" is DERIVED off `delayedDepartureDateTime`, never a
   * status code — `parseAdminStatus`/`statusCode` never returns `delayed`.
   * The pill/indicator below is a separate branch from `scheduleStatusPill*`. */
  protected get isScheduleDelayed(): boolean {
    return this.tripHeader?.delayedDepartureDateTime != null;
  }

  /** The "Mark delayed"/"Update ETA" pill only ever renders when the schedule
   * is still `scheduled` (see the template's `*ngIf`) — this getter just picks
   * the label between the two states. */
  protected get delayPillLabelKey(): string {
    return this.isScheduleDelayed ? 'STAFF.SCHEDULE_DELAY.PILL_UPDATE' : 'STAFF.SCHEDULE_DELAY.PILL_MARK';
  }

  /** Bangkok-pinned display string for the current delayed ETA — reuses
   * `formatDisplayDateTime()` (design-system: don't hand-roll a UTC format). */
  protected get formattedDelayedEta(): string {
    return formatDisplayDateTime(this.tripHeader?.delayedDepartureDateTime, this.translate.currentLang);
  }

  protected isDelayFieldInvalid(name: string): boolean {
    const control = this.delayForm.get(name);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  /**
   * OBRS-272: opens the inline delay dialog, pre-filling date/time/reason from
   * the CURRENT `tripHeader` when the trip is already marked delayed (re-mark
   * flow) — split via `splitApiOffsetDateTime()`. Opens optimistically off the
   * `tripHeader` already held (design-system §6), no fetch.
   */
  protected openDelayDialog(): void {
    this.resetDelayEtaErrors();

    const currentEta = this.tripHeader?.delayedDepartureDateTime ?? null;
    const split = currentEta ? splitApiOffsetDateTime(currentEta) : { date: '', time: '' };

    this.delayForm.reset({
      delayedDate: dateStringToControlValue(split.date),
      delayedTime: timeStringToControlValue(split.time),
      delayReason: this.tripHeader?.delayReason ?? '',
    });

    this.isDelayFormOpen = true;
  }

  protected closeDelayDialog(): void {
    if (this.isSubmittingDelay) {
      return;
    }
    this.isDelayFormOpen = false;
  }

  private resetDelayEtaErrors(): void {
    this.delayEtaAfterError = false;
    this.delayEtaServerError = false;
  }

  /**
   * OBRS-272: submits `PATCH /api/private/schedules/{id}/delay`. Client-side
   * validates the combined ETA is strictly after `tripHeader.departureDateTimeRaw`
   * (when known) WITHOUT calling the API on failure (design-system: fail fast,
   * no wasted round-trip). On success: closes the dialog, patches `tripHeader`
   * in place from the response (mirrors `onScheduleStatusAction()` — no full
   * reload needed), fires a background `loadTripHeader()` reconcile, and shows
   * the `{{count}}` success toast. On error: a 400 (`SCHEDULE_DELAY_ETA_INVALID`
   * or bean-validation) renders as an INLINE field error, never a toast;
   * anything else (409 `SCHEDULE_DELAY_NOT_SCHEDULED` / generic) is an
   * `AlertService.error()` toast — branch on `error.error.errorCode`
   * (`extractScheduleDelayErrorCode()`, the reused extractor — see
   * schedule-delay-error.ts), never the localized message.
   */
  protected submitDelaySchedule(): void {
    if (this.isSubmittingDelay) {
      return;
    }

    this.delayForm.markAllAsTouched();
    if (this.delayForm.invalid) {
      return;
    }

    const dateValue = controlValueToDateString(this.delayForm.get('delayedDate')?.value ?? null);
    const timeValue = controlValueToTimeString(this.delayForm.get('delayedTime')?.value ?? null);
    if (!dateValue || !timeValue) {
      return;
    }

    const eta = combineBangkokDateTime(dateValue, timeValue);
    const originalDeparture = this.tripHeader?.departureDateTimeRaw;
    if (originalDeparture && !(new Date(eta).getTime() > new Date(originalDeparture).getTime())) {
      this.delayEtaAfterError = true;
      return;
    }
    this.delayEtaAfterError = false;
    this.delayEtaServerError = false;

    const reason = String(this.delayForm.get('delayReason')?.value ?? '').trim();
    const scheduleId = this.scheduleId;

    this.isSubmittingDelay = true;
    this.staffApiService
      .delaySchedule(scheduleId, {
        delayedDepartureDateTime: eta,
        ...(reason ? { delayReason: reason } : {}),
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isSubmittingDelay = false;
        })
      )
      .subscribe({
        next: (response) => {
          this.isDelayFormOpen = false;
          if (response?.data && this.tripHeader) {
            this.tripHeader = {
              ...this.tripHeader,
              delayedDepartureDateTime: response.data.delayedDepartureDateTime,
              delayReason: response.data.delayReason ?? null,
            };
          }
          void this.alertService.success(
            this.translate.instant('STAFF.SCHEDULE_DELAY.SUCCESS', {
              count: response?.data?.affectedBookingCount ?? 0,
            })
          );
          void this.loadTripHeader(scheduleId);
        },
        error: (error) => {
          const errorCode = extractScheduleDelayErrorCode(error);
          const status = error instanceof HttpErrorResponse ? error.status : undefined;
          if (status === 400) {
            // SCHEDULE_DELAY_ETA_INVALID or a bean-validation null-ETA 400 —
            // both render as the SAME inline field message, never a toast.
            this.delayEtaServerError = true;
          } else {
            void this.alertService.error(this.translate.instant(mapScheduleDelayErrorCode(errorCode)));
          }
        },
      });
  }

  /** OBRS-130: boarded state is `boardedAt != null` — status-neutral, not
   * `status.code === 'checked_in'` (see docs/adr/0030-boarding-state-model.md,
   * backend, and the OBRS-130 frontend ADR). */
  protected isBoarded(item: BoardingListItemDto): boolean {
    return item.boardedAt != null;
  }

  protected isBoarding(item: BoardingListItemDto): boolean {
    return this.boardingIds.has(item.ticketId);
  }

  /** OBRS-100: "Boarded" count for the print header — derived from `items`
   * (already held), not part of `tripHeader` (design-system §10: don't
   * duplicate state the component already has). */
  protected get boardedCount(): number {
    return this.items.filter((item) => this.isBoarded(item)).length;
  }

  protected isUnboarding(item: BoardingListItemDto): boolean {
    return this.unboardingIds.has(item.ticketId);
  }

  /** OBRS-130: manual Board action — replaces the retired check-in flow. */
  protected async board(item: BoardingListItemDto): Promise<void> {
    // OBRS-256: count-lock — once the schedule is `arrived`, no boarding
    // write is attempted client-side (mirrors the backend's own
    // BOARDING_ROUND_ARRIVED guard).
    if (this.isScheduleArrived || this.isBoarded(item) || this.isBoarding(item)) {
      return;
    }

    this.boardingIds.add(item.ticketId);
    const originalBoardedAt = item.boardedAt;
    const originalBoardedByName = item.boardedByName;
    // You are the operator clicking Board right now, so it's correct (not the
    // pre-existing-row misattribution bug) to optimistically label *this one
    // row* with your own name — it reconciles with the backend-resolved name
    // on the next refresh.
    const boarderName = this.authService.getUsername() ?? undefined;

    this.store.mutate((items) =>
      items.map((i) =>
        i.ticketId === item.ticketId
          ? { ...i, boardedAt: new Date().toISOString(), boardedByName: boarderName }
          : i
      )
    );

    try {
      await firstValueFrom(this.staffApiService.board(item.ticketId));
      await this.alertService.success(this.translate.instant('STAFF.BOARDING.BOARD_SUCCESS'));
      void this.store.refresh();
    } catch (error) {
      this.store.mutate((items) =>
        items.map((i) =>
          i.ticketId === item.ticketId
            ? { ...i, boardedAt: originalBoardedAt, boardedByName: originalBoardedByName }
            : i
        )
      );
      const errorCode = extractBoardingActionErrorCode(error);
      await this.alertService.error(this.translate.instant(mapBoardingActionErrorCode(errorCode)));
    } finally {
      this.boardingIds.delete(item.ticketId);
    }
  }

  /** OBRS-130: reverse a boarding stamp. Salesperson/admin only (hidden for
   * drivers, see `canUnboard`) and requires a confirm, since it reverses a
   * recorded fact. */
  protected async unboard(item: BoardingListItemDto): Promise<void> {
    // OBRS-256: count-lock — see the matching guard in `board()`.
    if (this.isScheduleArrived || !this.canUnboard || !this.isBoarded(item) || this.isUnboarding(item)) {
      return;
    }

    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_TITLE'),
      text: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_CONFIRM'),
      cancelButtonText: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.unboardingIds.add(item.ticketId);
    const originalBoardedAt = item.boardedAt;
    const originalBoardedByName = item.boardedByName;

    this.store.mutate((items) =>
      items.map((i) =>
        i.ticketId === item.ticketId ? { ...i, boardedAt: undefined, boardedByName: undefined } : i
      )
    );

    try {
      await firstValueFrom(this.staffApiService.unboard(item.ticketId));
      await this.alertService.success(this.translate.instant('STAFF.BOARDING.UNBOARD_SUCCESS'));
      void this.store.refresh();
    } catch (error) {
      this.store.mutate((items) =>
        items.map((i) =>
          i.ticketId === item.ticketId
            ? { ...i, boardedAt: originalBoardedAt, boardedByName: originalBoardedByName }
            : i
        )
      );
      const errorCode = extractBoardingActionErrorCode(error);
      await this.alertService.error(this.translate.instant(mapBoardingActionErrorCode(errorCode)));
    } finally {
      this.unboardingIds.delete(item.ticketId);
    }
  }

  /** OBRS-296: only child-fare rows get the flag/unflag surface. */
  protected isChildFare(item: BoardingListItemDto): boolean {
    return item.fareCategory === 'child';
  }

  /** OBRS-296: flagged state is `childFareFlaggedAt != null` — the same
   * status-neutral shape as `isBoarded()`. */
  protected isFlagged(item: BoardingListItemDto): boolean {
    return item.childFareFlaggedAt != null;
  }

  protected isFlagging(item: BoardingListItemDto): boolean {
    return this.flaggingIds.has(item.ticketId);
  }

  protected isUnflagging(item: BoardingListItemDto): boolean {
    return this.unflaggingIds.has(item.ticketId);
  }

  /** OBRS-296: flag a fare-category mismatch. Low-stakes — no confirm,
   * mirrors `board()`. Never blocks the boarding controls (a separate
   * optimistic mutate scoped to the flag fields only). */
  protected async flagChildFare(item: BoardingListItemDto): Promise<void> {
    if (this.isFlagged(item) || this.isFlagging(item)) {
      return;
    }

    this.flaggingIds.add(item.ticketId);
    const originalFlaggedAt = item.childFareFlaggedAt;
    const originalFlaggedBy = item.childFareFlaggedByName;
    // Same "you are the operator acting right now" reasoning as board()'s
    // optimistic name seed — correct for the row you just acted on, never for
    // a pre-existing flagged row.
    const flaggerName = this.authService.getUsername() ?? undefined;

    this.store.mutate((items) =>
      items.map((i) =>
        i.ticketId === item.ticketId
          ? { ...i, childFareFlaggedAt: new Date().toISOString(), childFareFlaggedByName: flaggerName }
          : i
      )
    );

    try {
      await firstValueFrom(this.staffApiService.flagChildFare(item.ticketId));
      await this.alertService.success(this.translate.instant('STAFF.BOARDING.CHILD_FARE_FLAG_SUCCESS'));
      void this.store.refresh();
    } catch (error) {
      this.store.mutate((items) =>
        items.map((i) =>
          i.ticketId === item.ticketId
            ? { ...i, childFareFlaggedAt: originalFlaggedAt, childFareFlaggedByName: originalFlaggedBy }
            : i
        )
      );
      const errorCode = extractChildFareFlagErrorCode(error);
      await this.alertService.error(this.translate.instant(mapChildFareFlagErrorCode(errorCode)));
    } finally {
      this.flaggingIds.delete(item.ticketId);
    }
  }

  /** OBRS-296: reverse a fare-category mismatch flag. Salesperson/admin only
   * (hidden for drivers, see `canUnflagChildFare`) and requires a confirm —
   * same shape as `unboard()`. */
  protected async unflagChildFare(item: BoardingListItemDto): Promise<void> {
    if (!this.canUnflagChildFare || !this.isFlagged(item) || this.isUnflagging(item)) {
      return;
    }

    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('STAFF.BOARDING.CHILD_FARE_UNFLAG_CONFIRM_TITLE'),
      text: this.translate.instant('STAFF.BOARDING.CHILD_FARE_UNFLAG_CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('STAFF.BOARDING.CHILD_FARE_UNFLAG_CONFIRM_CONFIRM'),
      cancelButtonText: this.translate.instant('STAFF.BOARDING.CHILD_FARE_UNFLAG_CONFIRM_CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.unflaggingIds.add(item.ticketId);
    const originalFlaggedAt = item.childFareFlaggedAt;
    const originalFlaggedBy = item.childFareFlaggedByName;

    this.store.mutate((items) =>
      items.map((i) =>
        i.ticketId === item.ticketId
          ? { ...i, childFareFlaggedAt: undefined, childFareFlaggedByName: undefined }
          : i
      )
    );

    try {
      await firstValueFrom(this.staffApiService.unflagChildFare(item.ticketId));
      await this.alertService.success(this.translate.instant('STAFF.BOARDING.CHILD_FARE_UNFLAG_SUCCESS'));
      void this.store.refresh();
    } catch (error) {
      this.store.mutate((items) =>
        items.map((i) =>
          i.ticketId === item.ticketId
            ? { ...i, childFareFlaggedAt: originalFlaggedAt, childFareFlaggedByName: originalFlaggedBy }
            : i
        )
      );
      const errorCode = extractChildFareFlagErrorCode(error);
      await this.alertService.error(this.translate.instant(mapChildFareFlagErrorCode(errorCode)));
    } finally {
      this.unflaggingIds.delete(item.ticketId);
    }
  }

  /**
   * OBRS-96: validate a manually-entered/pasted boarding token against this
   * schedule and mark the ticket boarded. `scheduleId` always comes from the
   * `[scheduleId]` input, never user input. The caller-side empty-check stays
   * here; `submitToken()` (OBRS-266) owns everything else so the camera
   * decode callback can share the exact same path. Text-entry behavior is
   * unchanged.
   */
  protected async validateScan(): Promise<void> {
    // OBRS-256: count-lock — see the matching guard in `board()`.
    if (this.isScheduleArrived) {
      return;
    }

    const token = this.scanToken.trim();
    if (!token) {
      return;
    }

    await this.submitToken(token);
  }

  /**
   * OBRS-266: shared submit path for BOTH the manual scan button
   * (`validateScan()`) and the camera decode callback. Re-checks
   * `isScheduleArrived` at the top — a camera decode is async, so the
   * schedule can lock (mark-arrived) between the frame decoding and this
   * call landing. Errors branch on `error.error.errorCode` via
   * `boarding-scan-error.ts`, same as before.
   */
  private async submitToken(token: string): Promise<void> {
    if (this.isScheduleArrived || this.isScanning) {
      return;
    }

    this.isScanning = true;
    this.scanResult = null;
    this.scanError = null;
    this.clearAutoDismissTimer();

    try {
      const response = await firstValueFrom(
        this.staffApiService.boardingScan({ token, scheduleId: this.scheduleId })
      );
      if (response?.data) {
        this.scanResult = response.data;
        this.scanToken = '';
        this.reflectBoardedInList(response.data);
        // OBRS-266: camera mode auto-dismisses the success banner so the next
        // scan isn't blocked by a stale confirmation; text mode stays manual
        // (the operator typed it, they dismiss it).
        if (this.scanMode === 'camera') {
          this.autoDismissTimer = setTimeout(() => {
            this.autoDismissTimer = null;
            this.dismissScanResult();
          }, BoardingListComponent.SUCCESS_AUTO_DISMISS_MS);
        }
      }
    } catch (error) {
      // scanError is sticky in BOTH modes — never auto-dismissed on a timer,
      // a WRONG_SCHEDULE/NOT_CONFIRMED rejection must stay visible until the
      // operator acknowledges it (design-system: never hide a rejection).
      const errorCode = extractBoardingScanErrorCode(error);
      this.scanError = {
        messageKey: mapBoardingScanErrorCode(errorCode),
        severity: boardingScanErrorSeverity(errorCode),
        icon: boardingScanErrorIcon(errorCode),
      };
    } finally {
      this.isScanning = false;
    }
  }

  protected dismissScanResult(): void {
    this.clearAutoDismissTimer();
    this.scanResult = null;
    this.scanError = null;
  }

  private clearAutoDismissTimer(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }

  /**
   * OBRS-266: segmented text/camera toggle. Switching to camera is guarded —
   * a no-op once the schedule is `arrived` (mirrors every other write-path
   * count-lock guard in this component); the template also disables both
   * toggle buttons in that state, this is defense-in-depth for a
   * programmatic call. Switching to text always tears the camera down first
   * via the single `stopCameraStream()` teardown helper.
   */
  protected setScanMode(mode: 'text' | 'camera'): void {
    if (mode === this.scanMode) {
      return;
    }

    if (mode === 'text') {
      this.stopCameraStream();
      this.scanMode = 'text';
      return;
    }

    if (this.isScheduleArrived) {
      return;
    }

    this.scanMode = 'camera';
    void this.startCameraScan();
  }

  /** Retry affordance on the `denied`/`error` fallback empty-states. */
  protected retryCamera(): void {
    if (this.isScheduleArrived) {
      return;
    }
    void this.startCameraScan();
  }

  /**
   * OBRS-266: requests the camera and starts continuous decode against
   * `#scanVideo`. `decodeFromVideoDevice(undefined, ...)` (no explicit
   * deviceId) asks `@zxing/browser` to pick a device itself, preferring the
   * environment-facing (rear) camera when the platform reports one — no
   * manual `enumerateDevices()`/`facingMode` plumbing needed here.
   *
   * `@zxing/browser` itself is loaded via a dynamic `import()` here (not a
   * top-level value import — see the import statement at the top of this
   * file) so the ~500kB decoder only downloads the first time an operator
   * actually opens camera mode, instead of on every staff page load.
   */
  private async startCameraScan(): Promise<void> {
    this.cameraStatus = 'requesting';

    if (!navigator.mediaDevices?.getUserMedia) {
      // Covers both "no MediaDevices API" and a non-secure context (browsers
      // withhold `navigator.mediaDevices` off HTTPS/localhost).
      this.cameraStatus = 'unsupported';
      return;
    }

    // The <video #scanVideo> only renders once cameraStatus is
    // 'requesting'/'active' (see template). setScanMode()/retryCamera() call us
    // synchronously from a click handler — BEFORE Angular's own change
    // detection runs — so the *ngIf hasn't added the <video> yet and the
    // ViewChild is still undefined at this point on the FIRST open (a bare
    // `if (!this.videoElement)` here would wrongly fall straight to 'error' and
    // the camera could never open). Flush CD now so the just-set 'requesting'
    // state renders the <video> and the ViewChild query resolves before we hand
    // its nativeElement to zxing. (OBRS-266 fix — the unit test masked this by
    // pre-assigning `videoElement`; a real browser never reached 'active'.)
    this.cdr.detectChanges();
    if (!this.videoElement) {
      this.cameraStatus = 'error';
      return;
    }

    try {
      if (!this.codeReader) {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        this.codeReader = new BrowserMultiFormatReader();
      }

      const controls = await this.codeReader.decodeFromVideoDevice(
        undefined,
        this.videoElement.nativeElement,
        (result) => {
          if (!result) {
            return;
          }
          const token = result.getText();
          const now = Date.now();
          if (token === this.lastScannedToken && now - this.lastScannedAt < BoardingListComponent.SCAN_DEBOUNCE_MS) {
            return;
          }
          this.lastScannedToken = token;
          this.lastScannedAt = now;
          // OBRS-266: the decode callback fires OUTSIDE Angular's zone (the
          // library drives it via its own scan loop, not an Angular-patched
          // API) — re-enter the zone so submitToken()'s state changes (row
          // update / result banner) actually trigger change detection.
          this.ngZone.run(() => {
            void this.submitToken(token);
          });
        }
      );
      // OBRS-266: a teardown (toggle-to-text, scheduleId re-bind,
      // arrived-transition, destroy) can run WHILE this start is still
      // awaiting getUserMedia/decode — the mode toggle isn't disabled during
      // the 'requesting' phase, so an operator can tap "Text" mid-startup.
      // stopCameraStream() nulls scannerControls + flips cameraStatus off
      // 'requesting', but it can't stop a stream whose controls hadn't
      // resolved yet. Detect that here and stop now, so we never store an
      // orphaned live MediaStream (camera stays lit in text mode otherwise).
      if (this.cameraStatus !== 'requesting') {
        controls.stop();
        return;
      }
      this.scannerControls = controls;
      this.cameraStatus = 'active';
    } catch (error) {
      this.cameraStatus = this.mapCameraError(error);
    }
  }

  private mapCameraError(error: unknown): BoardingCameraStatus {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'NotAllowedError') {
      return 'denied';
    }
    if (name === 'NotFoundError') {
      return 'no-camera';
    }
    return 'error';
  }

  /**
   * OBRS-266: single idempotent teardown for every camera-stop path
   * (ngOnChanges re-bind, toggle-to-text, handleArrivedTransition,
   * ngOnDestroy). Mirrors `disposePrintPortal()`'s guard style — safe to call
   * with no active stream, never throws.
   */
  private stopCameraStream(): void {
    this.scannerControls?.stop();
    this.scannerControls = null;
    this.cameraStatus = 'idle';
  }

  /**
   * OBRS-266: `isScheduleArrived` is a pure getter — it can't stop the camera
   * itself when the schedule flips to `arrived`, so both places that can
   * cause that flip (`onScheduleStatusAction()` success and
   * `loadTripHeader()` success) call this explicitly. Camera mode is left
   * selected (`scanMode` untouched) — the lock banner + disabled toggle
   * already communicate the freeze; only the live stream needs to stop.
   */
  private handleArrivedTransition(): void {
    this.stopCameraStream();
  }

  protected get isCameraFallbackStatus(): boolean {
    return (
      this.cameraStatus === 'denied' ||
      this.cameraStatus === 'no-camera' ||
      this.cameraStatus === 'unsupported' ||
      this.cameraStatus === 'error'
    );
  }

  protected get cameraFallbackIcon(): string {
    switch (this.cameraStatus) {
      case 'denied':
        return 'videocam_off';
      case 'no-camera':
        return 'no_photography';
      case 'unsupported':
        return 'block';
      default:
        return 'error';
    }
  }

  protected get cameraFallbackMessageKey(): string {
    switch (this.cameraStatus) {
      case 'denied':
        return 'STAFF.BOARDING.SCAN.CAMERA.DENIED';
      case 'no-camera':
        return 'STAFF.BOARDING.SCAN.CAMERA.NO_CAMERA';
      case 'unsupported':
        return 'STAFF.BOARDING.SCAN.CAMERA.UNSUPPORTED';
      default:
        return 'STAFF.BOARDING.SCAN.CAMERA.ERROR';
    }
  }

  /** OBRS-130: status-neutral — stamps `boardedAt` from the scan response
   * only, no fake `status: 'checked_in'`. Same "you are the actual boarder"
   * reasoning as `board()` applies to the name: you just scanned this ticket
   * yourself, so seeding your own name on *this* freshly-boarded row is
   * correct; it reconciles with the backend-resolved name on next refresh. */
  private reflectBoardedInList(result: BoardingScanResultDto): void {
    const boarderName = this.authService.getUsername() ?? undefined;
    this.store.mutate((items) =>
      items.map((item) =>
        item.ticketId === result.ticketId
          ? { ...item, boardedAt: result.boardedAt, boardedByName: boarderName }
          : item
      )
    );
  }

  /**
   * OBRS-100: self-fetches the supplementary print/export trip header via
   * `StaffApiService.getScheduleById()` — NOT threaded through either host
   * (ADR 0014: both mounts stay `[scheduleId]`-only). Stale-guarded with
   * `headerRequestScheduleId` so a fast re-bind (the Sell Tab-3 host changes
   * `[scheduleId]` when the salesperson picks a different trip) can't let a
   * slower, earlier response clobber the header for the schedule now
   * showing. Degrades to `null` (template falls back to '-' per field) on
   * any failure — e.g. a driver 403'd off a schedule they don't own — since
   * the header is supplementary and export/print must never be blocked by
   * it (separate endpoint, separate failure domain).
   */
  private async loadTripHeader(scheduleId: number): Promise<void> {
    this.headerRequestScheduleId = scheduleId;

    try {
      const response = await firstValueFrom(this.staffApiService.getScheduleById(scheduleId));
      if (this.headerRequestScheduleId !== scheduleId) {
        return; // a newer scheduleId arrived while this fetch was in flight
      }

      const schedule = response?.data;
      this.tripHeader = {
        routeLabel: schedule?.route?.code ?? schedule?.route?.slug ?? '-',
        departureDateTime: schedule?.departureDateTime
          ? formatDisplayDateTime(schedule.departureDateTime, this.translate.currentLang)
          : '-',
        // OBRS-272: raw (offset-ISO) departure — used to client-validate the
        // delay dialog's ETA without re-parsing the localized display string.
        departureDateTimeRaw: schedule?.departureDateTime ?? null,
        vehicleLabel: schedule?.vehicle?.numberPlate ?? schedule?.vehicle?.vehicleNumber ?? '-',
        driverName: schedule?.driver?.fullName ?? '-',
        // OBRS-256: reuses the same `parseAdminStatus` helper other admin
        // status handling already uses — no second status parser.
        statusCode: parseAdminStatus(schedule?.status).code,
        // OBRS-272: derived-state fields — see BoardingManifestHeader's doc
        // comment. `status` itself never becomes `delayed`.
        delayedDepartureDateTime: schedule?.delayedDepartureDateTime ?? null,
        delayReason: schedule?.delayReason ?? null,
        // OBRS-451: the backend's own assignment answer — never derived from
        // a client-held id. `?? null`, not `?? false`, so a response
        // predating this field is distinguishable from an explicit `false`
        // (both fail closed identically in canShowScheduleStatusAction()).
        assignedToMe: schedule?.assignedToMe ?? null,
      };
      // OBRS-266: isScheduleArrived is a pure getter (no side effects), so the
      // camera-stop on an arrived transition has to be triggered explicitly
      // from every place tripHeader.statusCode can become 'arrived' — this is
      // one of the two (the other is onScheduleStatusAction() below).
      if (this.tripHeader.statusCode === 'arrived') {
        this.handleArrivedTransition();
      }
    } catch {
      if (this.headerRequestScheduleId === scheduleId) {
        this.tripHeader = null;
      }
    }
  }

  /**
   * OBRS-256: fires the current schedule's forward transition
   * (`scheduled→departed` or `departed→arrived`). `arrived` requires an
   * `AlertService.confirm()` (irreversible from the UI — the backend is
   * forward-only). Delegates the actual submit to `submitScheduleStatusUpdate()`
   * (OBRS-471 — shared with the turnaround-gate override retry below).
   */
  protected async onScheduleStatusAction(): Promise<void> {
    const action = this.scheduleStatusAction;
    if (!action || this.isUpdatingScheduleStatus) {
      return;
    }

    if (action.requiresConfirm) {
      const confirmed = await this.alertService.confirm({
        title: this.translate.instant('STAFF.SCHEDULE_STATUS.CONFIRM.ARRIVED_CONFIRM_TITLE'),
        text: this.translate.instant('STAFF.SCHEDULE_STATUS.CONFIRM.ARRIVED_CONFIRM_TEXT'),
        confirmButtonText: this.translate.instant('STAFF.SCHEDULE_STATUS.CONFIRM.ARRIVED_CONFIRM_CONFIRM'),
        cancelButtonText: this.translate.instant('STAFF.SCHEDULE_STATUS.CONFIRM.ARRIVED_CONFIRM_CANCEL'),
      });
      if (!confirmed) {
        return;
      }
    }

    await this.submitScheduleStatusUpdate(action.code, false);
  }

  /**
   * OBRS-471: shared submit path for `onScheduleStatusAction()` — also
   * re-invoked with `overrideTurnaroundGate=true` from
   * `handleScheduleStatusError()` below, after the admin/owner confirms the
   * override dialog. On success, patches `tripHeader.statusCode` from the
   * response so the pill/lock/button react immediately. On error, delegates
   * to `handleScheduleStatusError()`.
   */
  private async submitScheduleStatusUpdate(
    code: 'departed' | 'arrived',
    overrideTurnaroundGate: boolean
  ): Promise<void> {
    this.isUpdatingScheduleStatus = true;
    const scheduleId = this.scheduleId;
    const successKey =
      code === 'departed'
        ? 'STAFF.SCHEDULE_STATUS.ACTION.MARK_DEPARTED_SUCCESS'
        : 'STAFF.SCHEDULE_STATUS.ACTION.MARK_ARRIVED_SUCCESS';

    this.staffApiService
      .updateScheduleStatus(scheduleId, code, overrideTurnaroundGate)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isUpdatingScheduleStatus = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response?.data && this.tripHeader) {
            this.tripHeader = { ...this.tripHeader, statusCode: response.data.status };
          }
          // OBRS-266: the second of the two arrived-transition trigger sites
          // (see loadTripHeader() above).
          if (response?.data?.status === 'arrived') {
            this.handleArrivedTransition();
          }
          void this.alertService.success(this.translate.instant(successKey));
        },
        error: (error) => {
          void this.handleScheduleStatusError(error, code, scheduleId, overrideTurnaroundGate);
        },
      });
  }

  /**
   * OBRS-471: `VEHICLE_PREVIOUS_TRIP_NOT_ARRIVED` gets special handling — the
   * server message (already localized, names the stuck trip) is shown
   * VERBATIM rather than mapped to a static FE string (`schedule-status-error.ts`
   * deliberately excludes this code from its `knownCodes` map for exactly this
   * reason). Admin/owner (`canOverrideTurnaroundGate`) additionally get a
   * confirm dialog offering to depart anyway; confirming re-submits with
   * `overrideTurnaroundGate: true`. Everyone else only sees the warning — no
   * override control (AC2/AC5). Every other error code keeps the existing
   * generic mapped-toast + reconcile behavior.
   *
   * `alreadyOverridden` is the flag the failed request itself carried. The
   * override retry routes its errors back through here, so without it a server
   * that answered this same 409 to an `overrideTurnaroundGate=true` request
   * would re-open the confirm dialog and loop forever on every confirm. The
   * backend is not supposed to do that — but "safe because the other side
   * promised" is not a guard, and this handler cannot see the backend.
   */
  private async handleScheduleStatusError(
    error: unknown,
    code: 'departed' | 'arrived',
    scheduleId: number,
    alreadyOverridden: boolean
  ): Promise<void> {
    const errorCode = extractScheduleStatusErrorCode(error);

    if (errorCode === 'VEHICLE_PREVIOUS_TRIP_NOT_ARRIVED') {
      // Fall back to the code's own mapped text: extractApiErrorMessage returns
      // '' for a body with an errorCode but no message (OBRS-567), and this one
      // is used as a confirm dialog's `text:` — an empty string there would ask
      // the user to override a gate without saying which gate.
      const serverMessage =
        extractApiErrorMessage(error) ||
        this.translate.instant(mapScheduleStatusErrorCode(errorCode));

      if (this.canOverrideTurnaroundGate && !alreadyOverridden) {
        const confirmed = await this.alertService.confirm({
          title: this.translate.instant('STAFF.SCHEDULE_STATUS.CONFIRM.TURNAROUND_OVERRIDE_TITLE'),
          text: serverMessage,
          confirmButtonText: this.translate.instant(
            'STAFF.SCHEDULE_STATUS.CONFIRM.TURNAROUND_OVERRIDE_CONFIRM'
          ),
          cancelButtonText: this.translate.instant('STAFF.SCHEDULE_STATUS.CONFIRM.TURNAROUND_OVERRIDE_CANCEL'),
        });
        if (confirmed) {
          // The retry's own success/error handling (including reconcile on a
          // further failure) takes over from here — nothing changed
          // server-side yet, so no loadTripHeader() call belongs on this path.
          await this.submitScheduleStatusUpdate(code, true);
        }
        // Cancelled: nothing changed server-side, nothing to reconcile.
        return;
      }

      void this.alertService.error(serverMessage);
      void this.loadTripHeader(scheduleId);
      return;
    }

    void this.alertService.error(this.translate.instant(mapScheduleStatusErrorCode(errorCode)));
    void this.loadTripHeader(scheduleId);
  }

  /**
   * OBRS-100: teleports the dedicated `#printTemplate` to a `document.body`
   * child via a CDK `DomPortalOutlet`, so `window.print()` only ever sees
   * this one element — immune to whatever `p-tabView`/grid ancestors sit
   * above either mount, and to any *other* body-appended overlay
   * (`p-menu[appendTo="body"]`, SweetAlert2's `.swal2-container`). The
   * `.boarding-manifest-print-portal` class is the marker the global
   * `@media print` rule in `admin-theme.scss` hides everything else for.
   * See docs/adr/0015.
   */
  protected printManifest(): void {
    this.disposePrintPortal(); // idempotent guard — clears any stray prior instance first

    const host = document.createElement('div');
    host.className = 'boarding-manifest-print-portal';
    document.body.appendChild(host);
    // OBRS-100: gate the global `@media print` isolation on this marker class so
    // it only applies while a manifest portal is live — otherwise a native
    // Ctrl+P on any other page would blank-print (the hide rule would match
    // `app-root`). Removed in disposePrintPortal(). See admin-theme.scss / ADR 0015.
    document.body.classList.add('boarding-manifest-printing');
    this.printPortalHost = host;

    this.printPortalOutlet = new DomPortalOutlet(host);
    this.printPortalOutlet.attach(new TemplatePortal(this.printTemplate, this.viewContainerRef));

    window.addEventListener('afterprint', this.handleAfterPrint);
    setTimeout(() => window.print(), 0);
  }

  /**
   * Idempotent teardown — safe to call from the `afterprint` handler, from
   * the top of a subsequent `printManifest()` call, and from `ngOnDestroy`
   * (the scrutinize-flagged case: the operator navigates away while the
   * print dialog/preview is still open, so `afterprint` never fires and the
   * portal host would otherwise leak as an orphaned `document.body` node).
   */
  private disposePrintPortal(): void {
    if (!this.printPortalHost) {
      return;
    }
    window.removeEventListener('afterprint', this.handleAfterPrint);
    document.body.classList.remove('boarding-manifest-printing');
    this.printPortalOutlet?.dispose();
    this.printPortalHost.remove();
    this.printPortalOutlet = null;
    this.printPortalHost = null;
  }
}

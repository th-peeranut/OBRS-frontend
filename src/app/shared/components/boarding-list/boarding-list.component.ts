import {
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
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal';
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
import { extractScheduleStatusErrorCode, mapScheduleStatusErrorCode } from '../../lib/schedule-status-error';
import { formatDisplayDateTime } from '../../lib/display-date-time';
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
 * count-lock once a schedule reaches `arrived`. */
export interface BoardingManifestHeader {
  routeLabel: string;
  departureDateTime: string;
  vehicleLabel: string;
  driverName: string;
  statusCode: string;
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

  /** OBRS-256: the schedule departed/arrived control is salesperson/admin
   * only — identical shape to `canUnboard` above (hidden, not disabled, for
   * a driver). */
  protected readonly canControlScheduleStatus: boolean;

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
   * (a single-shot promise, no subscription to leak). */
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly authService: AuthService,
    protected readonly store: BoardingListStore,
    private readonly viewContainerRef: ViewContainerRef,
    private readonly ngZone: NgZone
  ) {
    this.canUnboard = this.authService.hasAnyRole(['salesperson']);
    this.canControlScheduleStatus = this.authService.hasAnyRole(['salesperson']);
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

    // The <video> only renders once cameraStatus is 'requesting'/'active'
    // (see template) — Angular commits that DOM change before this async
    // function's first awaited call resumes, so the ViewChild is present by
    // the time decodeFromVideoDevice() needs it. Still guard defensively.
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
        vehicleLabel: schedule?.vehicle?.numberPlate ?? schedule?.vehicle?.vehicleNumber ?? '-',
        driverName: schedule?.driver?.fullName ?? '-',
        // OBRS-256: reuses the same `parseAdminStatus` helper other admin
        // status handling already uses — no second status parser.
        statusCode: parseAdminStatus(schedule?.status).code,
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
   * forward-only). On success, patches `tripHeader.statusCode` from the
   * response so the pill/lock/button react immediately. On error, maps
   * `error.error.errorCode` via `schedule-status-error.ts` and re-fetches
   * `loadTripHeader()` to reconcile against actual server state (in case of
   * a race/stale button).
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

    this.isUpdatingScheduleStatus = true;
    const scheduleId = this.scheduleId;
    const successKey =
      action.code === 'departed'
        ? 'STAFF.SCHEDULE_STATUS.ACTION.MARK_DEPARTED_SUCCESS'
        : 'STAFF.SCHEDULE_STATUS.ACTION.MARK_ARRIVED_SUCCESS';

    this.staffApiService
      .updateScheduleStatus(scheduleId, action.code)
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
          const errorCode = extractScheduleStatusErrorCode(error);
          void this.alertService.error(this.translate.instant(mapScheduleStatusErrorCode(errorCode)));
          void this.loadTripHeader(scheduleId);
        },
      });
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

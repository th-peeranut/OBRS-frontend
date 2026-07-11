import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import {
  boardingScanErrorIcon,
  boardingScanErrorSeverity,
  extractBoardingScanErrorCode,
  mapBoardingScanErrorCode,
} from '../../lib/boarding-scan-error';
import { extractBoardingActionErrorCode, mapBoardingActionErrorCode } from '../../lib/boarding-action-error';
import { formatDisplayDateTime } from '../../lib/display-date-time';
import { BoardingScanResultDto } from '../../interfaces/ticket-boarding.interface';
import { BoardingListItemDto, StaffApiService } from '../../../services/staff/staff-api.service';
import { BoardingListStore } from './boarding-list.store';

/** OBRS-100: supplementary trip-header data for the print manifest (and,
 * incidentally, informational display) — self-fetched by
 * `BoardingListComponent` via `StaffApiService.getScheduleById()`, never
 * threaded through either host (ADR 0014 keeps the `[scheduleId]`-only
 * contract). Seats-sold / boarded counts are NOT part of this shape — they
 * are derived from `items` already held by the component. */
export interface BoardingManifestHeader {
  routeLabel: string;
  departureDateTime: string;
  vehicleLabel: string;
  driverName: string;
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

  // Manual boarding-scan box (OBRS-96) — text-entry token only, camera
  // scanning is out of scope for this card.
  protected scanToken = '';
  protected isScanning = false;
  protected scanResult: BoardingScanResultDto | null = null;
  protected scanError: BoardingScanErrorResult | null = null;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly authService: AuthService,
    protected readonly store: BoardingListStore,
    private readonly viewContainerRef: ViewContainerRef
  ) {
    this.canUnboard = this.authService.hasAnyRole(['salesperson']);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scheduleId']) {
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
    // OBRS-100: guard against a leaked body node if the operator navigates
    // away while the print dialog is still open (afterprint alone can't be
    // relied on for that case) — see docs/adr/0015.
    this.disposePrintPortal();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
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
    if (this.isBoarded(item) || this.isBoarding(item)) {
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
    if (!this.canUnboard || !this.isBoarded(item) || this.isUnboarding(item)) {
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
   * `[scheduleId]` input, never user input. Errors branch on
   * `error.error.errorCode` (never the localized message) via
   * `boarding-scan-error.ts`.
   */
  protected async validateScan(): Promise<void> {
    const token = this.scanToken.trim();
    if (!token || this.isScanning) {
      return;
    }

    this.isScanning = true;
    this.scanResult = null;
    this.scanError = null;

    try {
      const response = await firstValueFrom(
        this.staffApiService.boardingScan({ token, scheduleId: this.scheduleId })
      );
      if (response?.data) {
        this.scanResult = response.data;
        this.scanToken = '';
        this.reflectBoardedInList(response.data);
      }
    } catch (error) {
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
    this.scanResult = null;
    this.scanError = null;
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
      };
    } catch {
      if (this.headerRequestScheduleId === scheduleId) {
        this.tripHeader = null;
      }
    }
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

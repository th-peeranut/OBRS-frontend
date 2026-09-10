import {
  Component,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import QRCode from 'qrcode';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { WaybillRespDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * Smart page: `/staff/parcels/:id/waybill` (salesperson-only). Renders
 * `WaybillRespDto` via the dumb `ParcelWaybillPaperComponent` — reused
 * on-screen AND as the CDK-portal print-only template content, so there is
 * exactly one "paper" look either way.
 *
 * Print isolation follows `docs/adr/0015-boarding-manifest-print-isolation.md`
 * (`BoardingListComponent.printManifest()`) exactly: teleport a dedicated
 * `#printTemplate` to a `document.body` child via `DomPortalOutlet`, gated by
 * a `body.parcel-waybill-printing` marker class (admin-theme.scss) so a
 * native Ctrl+P elsewhere in the app is unaffected. Teardown is idempotent
 * and bound to both `afterprint` and `ngOnDestroy`.
 */
@Component({
    selector: 'app-parcel-waybill-page',
    templateUrl: './parcel-waybill-page.component.html',
    styleUrl: './parcel-waybill-page.component.scss',
    standalone: false
})
export class ParcelWaybillPageComponent implements OnInit, OnDestroy {
  @ViewChild('printTemplate') printTemplate!: TemplateRef<unknown>;

  protected waybill: WaybillRespDto | null = null;
  protected qrDataUrl = '';
  protected trackQrDataUrl = '';
  protected termsQrDataUrl = '';
  protected isLoading = true;
  protected hasError = false;

  private printPortalHost: HTMLElement | null = null;
  private printPortalOutlet: DomPortalOutlet | null = null;
  private printTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly handleAfterPrint = (): void => this.disposePrintPortal();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly staffApiService: StaffApiService,
    private readonly viewContainerRef: ViewContainerRef
  ) {}

  ngOnInit(): void {
    const parcelId = Number(this.route.snapshot.paramMap.get('id'));
    if (!parcelId) {
      this.isLoading = false;
      this.hasError = true;
      return;
    }

    // OBRS-629: the terms QR carries no parcel data, so it does not wait on the fetch — and it is
    // the same URL on every waybill, which is exactly why it must never be built from `waybill`.
    void this.renderQr(`${window.location.origin}/parcel-policy`).then((url) => {
      this.termsQrDataUrl = url;
    });

    this.staffApiService
      .getWaybill(parcelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.waybill = resp?.data ?? null;
          this.isLoading = false;
          this.hasError = !this.waybill;
          if (this.waybill?.collectionToken) {
            void this.renderQr(this.waybill.collectionToken).then((url) => {
              this.qrDataUrl = url;
            });
          }
          if (this.waybill?.trackingNumber) {
            void this.renderQr(this.trackUrl(this.waybill.trackingNumber)).then((url) => {
              this.trackQrDataUrl = url;
            });
          }
        },
        error: () => {
          this.isLoading = false;
          this.hasError = true;
        },
      });
  }

  ngOnDestroy(): void {
    this.disposePrintPortal();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * OBRS-1353: the sender's tracking link. `window.location.origin` rather than a
   * configured app origin — there is no such config (`environment.base.ts` carries
   * `apiUrl` only), and the waybill is served from the very origin the sender would
   * visit, so the running page already knows the answer.
   */
  private trackUrl(trackingNumber: string): string {
    return `${window.location.origin}/track-parcel/${encodeURIComponent(trackingNumber)}`;
  }

  private async renderQr(text: string): Promise<string> {
    try {
      return await QRCode.toDataURL(text, {
        width: 140,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch {
      return '';
    }
  }

  protected printWaybill(): void {
    this.disposePrintPortal(); // idempotent guard — clears any stray prior instance first

    const host = document.createElement('div');
    host.className = 'parcel-waybill-print-portal';
    document.body.appendChild(host);
    document.body.classList.add('parcel-waybill-printing');
    this.printPortalHost = host;

    this.printPortalOutlet = new DomPortalOutlet(host);
    this.printPortalOutlet.attach(new TemplatePortal(this.printTemplate, this.viewContainerRef));

    window.addEventListener('afterprint', this.handleAfterPrint);
    this.printTimer = setTimeout(() => window.print(), 0);
  }

  /** Idempotent teardown — safe from `afterprint`, the top of a subsequent
   * `printWaybill()` call, and `ngOnDestroy` (navigating away mid-print-dialog). */
  private disposePrintPortal(): void {
    if (this.printTimer) {
      clearTimeout(this.printTimer);
      this.printTimer = null;
    }
    if (!this.printPortalHost) {
      return;
    }
    window.removeEventListener('afterprint', this.handleAfterPrint);
    document.body.classList.remove('parcel-waybill-printing');
    this.printPortalOutlet?.dispose();
    this.printPortalHost.remove();
    this.printPortalOutlet = null;
    this.printPortalHost = null;
  }
}

import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ParcelTrackingService } from '../../../../services/parcel-tracking/parcel-tracking.service';
import { ParcelTrackRespDto } from '../../../../shared/interfaces/parcel.interface';
import {
  parcelCustomerStatusLabelKey,
  parcelDeliveryStatusChip,
  ParcelStatusChip,
} from '../../../../shared/lib/parcel-delivery-status';
import { parcelStopLabel } from '../../../../shared/lib/parcel-stop-label';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

type TrackingContentState = 'idle' | 'loading' | 'found' | 'not-found';

/**
 * Public parcel tracking (`/track-parcel`, `/track-parcel/:trackingNumber`) —
 * `customerArea: true`, no `requireAuth` (refund-policy precedent, no
 * access-model change). A deep link with a tracking number auto-runs the
 * lookup on load.
 */
@Component({
    selector: 'app-parcel-tracking-page',
    templateUrl: './parcel-tracking-page.component.html',
    styleUrl: './parcel-tracking-page.component.scss',
    standalone: false
})
export class ParcelTrackingPageComponent implements OnInit, OnDestroy {
  protected readonly form: FormGroup;
  protected contentState: TrackingContentState = 'idle';
  protected result: ParcelTrackRespDto | null = null;
  protected readonly parcelStopLabel = parcelStopLabel;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly trackingService: ParcelTrackingService,
    private readonly translate: TranslateService
  ) {
    this.form = this.fb.group({
      trackingNumber: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    const deepLinkTrackingNumber = this.route.snapshot.paramMap.get('trackingNumber')?.trim();
    if (deepLinkTrackingNumber) {
      this.form.patchValue({ trackingNumber: deepLinkTrackingNumber });
      this.track();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.track();
  }

  private track(): void {
    const trackingNumber = String(this.form.value.trackingNumber ?? '').trim();
    if (!trackingNumber) return;

    this.contentState = 'loading';
    this.result = null;

    this.trackingService
      .track(trackingNumber)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.result = resp?.data ?? null;
          this.contentState = this.result ? 'found' : 'not-found';
        },
        error: () => {
          // 404 (unknown tracking number) and any other failure both render
          // as a neutral not-found state — the API doc: "no distinction
          // between not-found and any other state".
          this.result = null;
          this.contentState = 'not-found';
        },
      });
  }

  protected chipFor(status: string): ParcelStatusChip {
    return parcelDeliveryStatusChip(status);
  }

  /** OBRS-415/UX §8, OBRS-427: the CUSTOMER-facing label for a status — every
   * slug resolves to its own `PARCEL_TRACKING.STATUS.*` key, never the
   * driver/back-office copy `chipFor().i18nKey` renders (the exact STAFF.*
   * namespace leak this card closes). */
  protected statusLabelKey(status: string): string {
    return parcelCustomerStatusLabelKey(status);
  }

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }
}

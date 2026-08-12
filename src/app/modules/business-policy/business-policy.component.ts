import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BookingPolicyService } from '../../services/booking-policy/booking-policy.service';
import {
  BUSINESS_POLICY_EFFECTIVE_DATE,
  BUSINESS_POLICY_VERSION,
} from './business-policy.version';

export interface BusinessPolicyParams {
  maxAdvanceDays: number;
  cutoffMinutes: number;
}

// OBRS-564: policy item 1 ("Ticket sales are divided into 2 types") used to
// hardcode "60 days advance / 12 hours cutoff" in i18n — neither number was
// real (no advance cap existed in the code at all; the real cutoff is 20
// minutes). Fix: item 1 moved to its own key (POLICY.BUSINESS.SALES_CHANNELS,
// see business-policy.component.html) rendered ONLY from this component's
// `policyParams`, fetched from the PUBLIC `GET /api/booking-policy` endpoint
// (BookingPolicyService) — the same two numbers an owner edits at
// admin/settings/booking-policy. The rule going forward: these numbers are
// NEVER hardcoded in i18n again.
@Component({
    selector: 'app-business-policy',
    templateUrl: './business-policy.component.html',
    styleUrl: './business-policy.component.scss',
    standalone: false
})
export class BusinessPolicyComponent implements OnInit, OnDestroy {
  // Starts null; assigned ONCE when the API resolves (never rebuilt on every
  // change-detection cycle). TranslatePipe is impure and re-subscribes to
  // TranslateService.onLangChange on its own, so a language switch
  // re-interpolates the new language's string against this SAME object —
  // this must survive the switch untouched, not be re-fetched (the config
  // values are locale-independent). The template's `*ngIf="policyParams"`
  // gate is what guarantees a user can never see a raw `{{maxAdvanceDays}}`
  // literal — showing a WRONG policy number was the actual defect reported
  // against this page, so a failed fetch must NEVER fall back to a
  // hardcoded number; it shows an inline error + retry instead (see html).
  protected policyParams: BusinessPolicyParams | null = null;
  protected policyLoadFailed = false;

  // OBRS-658 AC 2 (ADR-0125): read from the version module, never re-typed into i18n — a date
  // living in three translation files drifts into three different dates (the same rule
  // privacy-policy.component follows). Rendered unconditionally, NOT inside the policyParams
  // gate above: the version identifies the WORDING, which is on the page whether or not the live
  // config fetch succeeded, and a customer reading the terms during an outage still needs to know
  // which terms they are reading.
  protected readonly version = BUSINESS_POLICY_VERSION;
  protected readonly effectiveDate = BUSINESS_POLICY_EFFECTIVE_DATE;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly bookingPolicyService: BookingPolicyService) {}

  ngOnInit(): void {
    this.loadPolicyParams();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected retryPolicyParams(): void {
    this.loadPolicyParams();
  }

  private loadPolicyParams(): void {
    this.policyLoadFailed = false;
    this.bookingPolicyService
      .getBookingPolicy()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.policyParams = {
              maxAdvanceDays: response.data.maxAdvanceDays,
              cutoffMinutes: response.data.cutoffMinutes,
            };
          } else {
            this.policyLoadFailed = true;
          }
        },
        error: () => {
          this.policyLoadFailed = true;
        },
      });
  }
}

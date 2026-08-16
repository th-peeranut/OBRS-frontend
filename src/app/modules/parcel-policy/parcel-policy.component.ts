import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ParcelPolicyService } from '../../services/parcel-policy/parcel-policy.service';
import {
  ProhibitedCategoryView,
  toProhibitedCategoryViews,
} from '../../shared/lib/parcel-prohibited-categories';
import {
  PARCEL_POLICY_EFFECTIVE_DATE,
  PARCEL_POLICY_VERSION,
} from './parcel-policy.version';

/** The three limits POLICY.PARCEL.LIMITS interpolates. */
export interface ParcelPolicyLimits {
  maxWeightKg: number;
  carryOnFreeSizeMaxInch: number;
  carryOnFreeAisleMaxPerTrip: number;
}

// OBRS-629 AC-1/AC-2: the parcel carriage terms, which did not exist on the site while the
// service was already selling and taking money. Third sibling of BusinessPolicyComponent and
// PrivacyPolicyComponent and built the same way on purpose.
//
// AC-3/AC-4 are why this page talks to the API at all: the weight/size limits and the
// prohibited-item list are read from GET /api/parcel-policy — the same config
// ParcelIntakeService enforces — so the published terms cannot state one rule while intake
// applies another. A failed fetch shows an inline error, never a hardcoded fallback: a WRONG
// number in front of a customer is the defect this endpoint exists to remove (OBRS-564).
//
// carryOnFreeSizeMinInch is deliberately absent, both here and from the wording. It is seeded in
// system_configs but PublicParcelPolicyRespDto refuses to serve it because no main-source line
// reads it — classifyOnSeat compares against the MAX only. The draft wording said carry-on
// "from 16 to 28 inches" travels free, which would have published a floor nothing applies and
// would have implied, falsely, that something under 16 inches is treated differently.
@Component({
    selector: 'app-parcel-policy',
    templateUrl: './parcel-policy.component.html',
    styleUrl: './parcel-policy.component.scss',
    standalone: false
})
export class ParcelPolicyComponent implements OnInit, OnDestroy {
  // Assigned ONCE when the API resolves, then read by an impure TranslatePipe that re-interpolates
  // it on every language change — so this object must survive a language switch untouched (the
  // config values are locale-independent). Same contract as BusinessPolicyComponent#policyParams.
  protected limits: ParcelPolicyLimits | null = null;
  protected policyLoadFailed = false;
  protected prohibitedCategories: ProhibitedCategoryView[] = [];

  protected readonly version = PARCEL_POLICY_VERSION;
  protected readonly effectiveDate = PARCEL_POLICY_EFFECTIVE_DATE;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly parcelPolicyService: ParcelPolicyService) {}

  ngOnInit(): void {
    this.loadPolicy();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected retryPolicy(): void {
    this.loadPolicy();
  }

  private loadPolicy(): void {
    this.policyLoadFailed = false;
    this.parcelPolicyService
      .getParcelPolicy()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const data = response.data;
          if (!data) {
            this.policyLoadFailed = true;
            return;
          }
          this.limits = {
            maxWeightKg: data.maxWeightKg,
            carryOnFreeSizeMaxInch: data.carryOnFreeSizeMaxInch,
            carryOnFreeAisleMaxPerTrip: data.carryOnFreeAisleMaxPerTrip,
          };
          // An empty list is a meaningful answer, not a missing one: the config has no hardcoded
          // fallback, so an unset row means intake blocks nothing and the page must say so
          // (PARCEL.PROHIBITED.EMPTY) rather than reprint five categories from memory.
          this.prohibitedCategories = toProhibitedCategoryViews(data.prohibitedCategories);
        },
        error: () => {
          this.policyLoadFailed = true;
        },
      });
  }
}

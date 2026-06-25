import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  SegmentStopRefDto,
  StaffApiService,
  WalkInTripDto,
} from '../../../../services/staff/staff-api.service';
import { TITLE_OPTIONS } from '../../../../shared/constants/title-options';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { TranslateService } from '@ngx-translate/core';

export interface WalkInCheckoutPayload {
  contact: {
    title: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    identityCardNumber?: string;
    email?: string;
  };
  /** Pickup stop slug for the booked segment. */
  fromStop: string;
  /** Drop-off stop slug for the booked segment. */
  toStop: string;
  /** Resolved per-seat fare for the chosen segment (THB). */
  pricePerSeat: number;
  cashReceived: number;
}

@Component({
  selector: 'app-walk-in-checkout',
  templateUrl: './walk-in-checkout.component.html',
  styleUrl: './walk-in-checkout.component.scss',
})
export class WalkInCheckoutComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedTrip: WalkInTripDto | null = null;
  @Input() routeSlug: string | null = null;
  @Input() selectedSeats: string[] = [];
  @Input() isSelling = false;

  @Output() sell = new EventEmitter<WalkInCheckoutPayload>();
  /** Emitted whenever staff change the passenger type, so the sell page can
   *  colour the seat map and stamp the booking with the chosen lookup slug. */
  @Output() passengerTypeChange = new EventEmitter<string>();

  protected readonly titleOptions: Dropdown[] = TITLE_OPTIONS;
  // passenger_type lookup slugs the backend accepts (category 'passenger_type').
  protected readonly passengerTypeOptions: { value: string; labelKey: string }[] = [
    { value: 'male', labelKey: 'STAFF.SELL.PTYPE_MALE' },
    { value: 'female', labelKey: 'STAFF.SELL.PTYPE_FEMALE' },
    { value: 'monk', labelKey: 'STAFF.SELL.PTYPE_MONK' },
    { value: 'nun', labelKey: 'STAFF.SELL.PTYPE_NUN' },
  ];
  protected passengerType = 'male';
  protected readonly contactForm: FormGroup;
  protected selectedPaymentMethod: 'cash' = 'cash';
  protected cashReceived = 0;

  // Pickup / drop-off selection, sourced from the route's stop pairs.
  protected orderedStops: SegmentStopRefDto[] = [];
  protected pickupSlug = '';
  protected dropoffSlug = '';
  protected isLoadingSegments = false;
  // key: `${fromSlug}|${toSlug}` → per-seat fare (THB), filtered to the trip's
  // vehicle type.
  private fareMap = new Map<string, number>();

  private readonly phonePattern = /^0\d{9}$/;
  private readonly idCardPattern = /^\d{13}$/;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly translate: TranslateService,
    private readonly staffApiService: StaffApiService
  ) {
    this.contactForm = this.fb.group({
      title: ['', [Validators.required]],
      firstName: ['', [Validators.required, Validators.maxLength(100)]],
      lastName: ['', [Validators.required, Validators.maxLength(100)]],
      phoneNumber: ['', [Validators.required, Validators.pattern(this.phonePattern)]],
      identityCardNumber: ['', [Validators.pattern(this.idCardPattern)]],
      // Email is REQUIRED for walk-in: the backend rejects walk-in/agent/kiosk
      // bookings with a blank contact email (BookingReqDtoValidator).
      email: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    this.contactForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // trigger change detection for canSell
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedSeats'] || changes['selectedTrip']) {
      // reset cash received when seats change
      this.cashReceived = 0;
    }
    // (Re)load the route's stop pairs whenever the route or vehicle type changes.
    if (changes['routeSlug'] || changes['selectedTrip']) {
      this.loadSegments();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected titleLabel(option: Dropdown): string {
    return this.translate.currentLang === 'th' ? option.nameThai : option.nameEnglish;
  }

  /** Stops eligible as a pickup: every stop except the final destination. */
  protected get pickupOptions(): SegmentStopRefDto[] {
    return this.orderedStops.slice(0, Math.max(0, this.orderedStops.length - 1));
  }

  /** Stops downstream of the chosen pickup (a forward segment must exist). */
  protected get dropoffOptions(): SegmentStopRefDto[] {
    const fromIdx = this.orderedStops.findIndex((s) => s.slug === this.pickupSlug);
    if (fromIdx < 0) return [];
    return this.orderedStops
      .slice(fromIdx + 1)
      .filter((s) => this.fareMap.has(`${this.pickupSlug}|${s.slug}`));
  }

  /** Per-seat fare for the current pickup→drop-off pair, or null if invalid. */
  protected get segmentFare(): number | null {
    if (!this.pickupSlug || !this.dropoffSlug) return null;
    const fare = this.fareMap.get(`${this.pickupSlug}|${this.dropoffSlug}`);
    return fare === undefined ? null : fare;
  }

  protected onPassengerTypeChange(): void {
    this.passengerTypeChange.emit(this.passengerType);
  }

  protected onPickupChange(): void {
    // Keep drop-off valid: clear it if it's no longer downstream of the pickup.
    if (!this.dropoffOptions.some((s) => s.slug === this.dropoffSlug)) {
      this.dropoffSlug = this.dropoffOptions[0]?.slug ?? '';
    }
  }

  protected get totalAmount(): number {
    const fare = this.segmentFare;
    if (fare === null) return 0;
    return fare * this.selectedSeats.length;
  }

  protected get changeDue(): number {
    return this.cashReceived - this.totalAmount;
  }

  protected get canSell(): boolean {
    return (
      this.contactForm.valid &&
      this.selectedSeats.length >= 1 &&
      this.segmentFare !== null &&
      this.cashReceived >= this.totalAmount
    );
  }

  private loadSegments(): void {
    const routeSlug = this.routeSlug;
    const vehicleType = this.selectedTrip?.vehicleType ?? null;

    this.orderedStops = [];
    this.fareMap = new Map<string, number>();
    this.pickupSlug = '';
    this.dropoffSlug = '';

    if (!routeSlug) return;

    this.isLoadingSegments = true;
    this.staffApiService
      .getRouteSegments(routeSlug)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          // Guard against a stale response: if the selected route changed while
          // this request was in flight, a newer load owns the state — drop this.
          if (this.routeSlug !== routeSlug) return;
          const allPairs = resp?.data?.stopPairs ?? [];
          // Prefer pairs matching the trip's vehicle type; fall back to all
          // pairs if the data has no match (defensive — keeps the sale possible).
          const typed = vehicleType
            ? allPairs.filter((p) => p.vehicleType?.slug === vehicleType)
            : allPairs;
          const pairs = typed.length > 0 ? typed : allPairs;

          this.fareMap = new Map<string, number>();
          for (const p of pairs) {
            const fare = parseFloat(p.fare ?? '0');
            this.fareMap.set(
              `${p.fromStop.slug}|${p.toStop.slug}`,
              Number.isFinite(fare) ? fare : 0
            );
          }
          this.orderedStops = this.buildOrderedStops(pairs);
          this.applyDefaultStops();
          this.isLoadingSegments = false;
        },
        error: () => {
          if (this.routeSlug !== routeSlug) return;
          this.isLoadingSegments = false;
        },
      });
  }

  /** Order stops by in-degree (count of distinct upstream pickups). In a fully
   *  forward-connected route this yields origin → … → destination. */
  private buildOrderedStops(
    pairs: { fromStop: SegmentStopRefDto; toStop: SegmentStopRefDto }[]
  ): SegmentStopRefDto[] {
    const stops = new Map<string, SegmentStopRefDto>();
    const upstream = new Map<string, Set<string>>();
    for (const p of pairs) {
      stops.set(p.fromStop.slug, p.fromStop);
      stops.set(p.toStop.slug, p.toStop);
      const set = upstream.get(p.toStop.slug) ?? new Set<string>();
      set.add(p.fromStop.slug);
      upstream.set(p.toStop.slug, set);
    }
    return Array.from(stops.values()).sort(
      (a, b) => (upstream.get(a.slug)?.size ?? 0) - (upstream.get(b.slug)?.size ?? 0)
    );
  }

  /** Default to the full route: origin (first) → destination (last). */
  private applyDefaultStops(): void {
    if (this.orderedStops.length < 2) return;
    this.pickupSlug = this.orderedStops[0].slug;
    const dest = this.orderedStops[this.orderedStops.length - 1].slug;
    this.dropoffSlug = this.fareMap.has(`${this.pickupSlug}|${dest}`)
      ? dest
      : this.dropoffOptions[0]?.slug ?? '';
  }

  protected onSell(): void {
    if (!this.canSell || this.isSelling) return;
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid) return;

    const v = this.contactForm.value as {
      title: string;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      identityCardNumber: string;
      email: string;
    };

    const payload: WalkInCheckoutPayload = {
      contact: {
        title: String(v.title ?? ''),
        firstName: String(v.firstName ?? ''),
        lastName: String(v.lastName ?? ''),
        phoneNumber: String(v.phoneNumber ?? ''),
      },
      fromStop: this.pickupSlug,
      toStop: this.dropoffSlug,
      pricePerSeat: this.segmentFare ?? 0,
      cashReceived: this.cashReceived,
    };

    if (v.identityCardNumber && v.identityCardNumber.trim()) {
      payload.contact.identityCardNumber = v.identityCardNumber.trim();
    }
    if (v.email && v.email.trim()) {
      payload.contact.email = v.email.trim();
    }

    this.sell.emit(payload);
  }

  protected fieldError(fieldName: string): string | null {
    const ctrl = this.contactForm.get(fieldName);
    if (!ctrl || !ctrl.invalid || !(ctrl.dirty || ctrl.touched)) return null;
    const errors = ctrl.errors ?? {};
    if (errors['required']) return 'STAFF.VALIDATION.REQUIRED';
    if (errors['email']) return 'STAFF.VALIDATION.EMAIL_INVALID';
    if (errors['pattern'] || errors['maxlength'] || errors['minlength']) {
      if (fieldName === 'phoneNumber') return 'STAFF.VALIDATION.PHONE_INVALID';
      if (fieldName === 'identityCardNumber') return 'STAFF.VALIDATION.ID_CARD_INVALID';
    }
    return 'STAFF.VALIDATION.FIELD_INVALID';
  }

  protected isFieldInvalid(fieldName: string): boolean {
    return !!this.fieldError(fieldName);
  }

  protected getControl(name: string): AbstractControl | null {
    return this.contactForm.get(name);
  }
}

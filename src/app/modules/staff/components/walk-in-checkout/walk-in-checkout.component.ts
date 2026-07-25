import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  WalkInTripDto,
} from '../../../../services/staff/staff-api.service';
import { TITLE_OPTIONS } from '../../../../shared/constants/title-options';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { localizedDropdownName } from '../../../../shared/lib/localized-dropdown-name';
import { TranslateService } from '@ngx-translate/core';
import {
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
} from '../../../../shared/constants/thai-msisdn';

export interface WalkInCheckoutPayload {
  contact: {
    title: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    identityCardNumber?: string;
    email?: string;
  };
  cashReceived: number;
}

@Component({
  selector: 'app-walk-in-checkout',
  templateUrl: './walk-in-checkout.component.html',
  styleUrl: './walk-in-checkout.component.scss',
})
export class WalkInCheckoutComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedTrip: WalkInTripDto | null = null;
  @Input() selectedSeats: string[] = [];
  @Input() isSelling = false;
  /** Per-seat fare from sell-page (after segment resolution). */
  @Input() pricePerSeat = 0;
  // OBRS-324 (Epic OBRS-318 open seating, 318-d): 'ASSIGNED' is the safe
  // default — every existing call site that doesn't pass this binding (and
  // every pre-existing spec in this file) keeps requiring `selectedSeats`,
  // byte-identical to before this card.
  @Input() seatingMode: 'OPEN' | 'ASSIGNED' = 'ASSIGNED';
  /** OPEN-mode headcount from sell-page (no seat picker to derive a count from). */
  @Input() passengerCount = 0;
  // OBRS-85: parity/forward-compat input for a future walk-in round-trip
  // discount. Dormant today — sell-page.component.ts hardcodes
  // bookingType:'one_way' for every walk-in sale, so this can never be > 0
  // under current functionality (see AGENT_MEMORY.md Finding 2).
  @Input() discountAmount: number | null = null;

  @Output() sell = new EventEmitter<WalkInCheckoutPayload>();

  protected readonly titleOptions: Dropdown[] = TITLE_OPTIONS;
  protected readonly contactForm: FormGroup;
  protected selectedPaymentMethod: 'cash' = 'cash';
  protected cashReceived = 0;

  private readonly phonePattern = /^0\d{9}$/;
  private readonly idCardPattern = /^\d{13}$/;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly translate: TranslateService
  ) {
    this.contactForm = this.fb.group({
      title: ['', [Validators.required]],
      firstName: ['', [Validators.required, Validators.maxLength(100)]],
      lastName: ['', [Validators.required, Validators.maxLength(100)]],
      phoneNumber: ['', [Validators.required, separatorTolerantPattern(this.phonePattern)]],
      identityCardNumber: ['', [Validators.pattern(this.idCardPattern)]],
      // OBRS-197: email is now OPTIONAL for walk-in/offline channels — the
      // backend accepts a blank contact email (contact_email_snapshot is
      // nullable). Keep Validators.email so a typed-in value must still look
      // like an email; just stop forcing one to exist.
      email: ['', [Validators.email]],
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
    if (
      changes['selectedSeats'] ||
      changes['selectedTrip'] ||
      changes['passengerCount'] ||
      changes['seatingMode']
    ) {
      // reset cash received when seats/passenger count change
      this.cashReceived = 0;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected titleLabel(option: Dropdown): string {
    return localizedDropdownName(option, this.translate.currentLang);
  }

  // OBRS-691: same focus/blur regrouping idiom as account-page.component.ts.
  // onSell() below always strips dashes before the value reaches the payload.
  protected onPhoneFocus(): void {
    const control = this.contactForm.get('phoneNumber');
    control?.setValue(stripPhoneSeparators(control.value));
  }

  protected onPhoneBlur(): void {
    const control = this.contactForm.get('phoneNumber');
    control?.setValue(formatThaiMobile(control.value));
  }

  // OBRS-324: OPEN sells by headcount (no seat picker); ASSIGNED keeps counting
  // selectedSeats exactly as before.
  protected get ticketCount(): number {
    return this.seatingMode === 'OPEN' ? this.passengerCount : this.selectedSeats.length;
  }

  protected get totalAmount(): number {
    if (this.pricePerSeat === 0) return 0;
    return this.pricePerSeat * this.ticketCount;
  }

  // OBRS-85: netAmount === totalAmount while discountAmount is null/0 (today,
  // always — see the @Input() comment above), so this is a no-op today and
  // only takes effect once a future walk-in round-trip flow can populate it.
  protected get netAmount(): number {
    return this.totalAmount - (this.discountAmount ?? 0);
  }

  protected get changeDue(): number {
    return this.cashReceived - this.netAmount;
  }

  protected get canSell(): boolean {
    return (
      this.contactForm.valid &&
      this.ticketCount >= 1 &&
      this.pricePerSeat > 0 &&
      this.cashReceived >= this.netAmount
    );
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
        // OBRS-691: the control may carry display dashes (regrouped on blur) —
        // the backend stores/validates bare digits only.
        phoneNumber: stripPhoneSeparators(v.phoneNumber ?? ''),
      },
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

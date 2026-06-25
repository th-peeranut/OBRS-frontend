import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected titleLabel(option: Dropdown): string {
    return this.translate.currentLang === 'th' ? option.nameThai : option.nameEnglish;
  }

  protected get totalAmount(): number {
    if (this.pricePerSeat === 0) return 0;
    return this.pricePerSeat * this.selectedSeats.length;
  }

  protected get changeDue(): number {
    return this.cashReceived - this.totalAmount;
  }

  protected get canSell(): boolean {
    return (
      this.contactForm.valid &&
      this.selectedSeats.length >= 1 &&
      this.pricePerSeat > 0 &&
      this.cashReceived >= this.totalAmount
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
        phoneNumber: String(v.phoneNumber ?? ''),
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

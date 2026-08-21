import { Component, ElementRef, HostListener, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { BankService } from '../../../services/bank/bank.service';
import { BankDto, bankNameFor } from '../../interfaces/bank.interface';
import { RefundDestinationType } from '../../interfaces/refund-destination.interface';

/**
 * OBRS-286 — dumb, cross-shell input control for a refund bank/PromptPay
 * destination. Renders inside BOTH the customer shell
 * (`CancelBookingModalComponent` — renamed from
 * `CancelRefundDestinationModalComponent` by OBRS-942) and the admin shell
 * (`OverrideCancelModalComponent`), and is declared in `SharedModule` for
 * exactly that reason (precedent: `AdminModalBackdropDirective`, ADR-0017).
 *
 * Deliberately dumb: the caller owns the `FormGroup` (built via
 * `buildRefundDestinationForm()`, `shared/lib/refund-destination-form.ts`) and
 * all NgRx concerns — this component only renders the fields bound to it
 * and reflects `[disabled]` while a submit is in flight. See
 * `docs/adr/0032-cross-shell-refund-destination-fields-component.md` for the
 * `--rdf-*` token-override pattern this component's stylesheet uses to render
 * correctly in four combinations (customer/admin × light/dark) with no
 * dependency on `.admin-field`'s `--admin-*` tokens (which don't resolve
 * outside `.admin-shell`).
 *
 * OBRS-1463 narrowed "and all HTTP concerns" out of that rule for ONE call:
 * `BankService.getBanks()`. The rule exists so this component stays free of
 * per-shell state; a root-provided service returning a static national list,
 * deduped across the whole session, carries no shell coupling at all. The
 * alternative was the same fetch, error state and retry wired three times over
 * in three callers that would then have to stay identical — strictly more code
 * for a list none of them varies.
 */
@Component({
    selector: 'app-refund-destination-fields',
    templateUrl: './refund-destination-fields.component.html',
    styleUrl: './refund-destination-fields.component.scss',
    standalone: false
})
export class AppRefundDestinationFieldsComponent implements OnInit {
  @Input({ required: true }) formGroup!: FormGroup;
  @Input() disabled = false;

  protected banks: BankDto[] = [];
  protected banksState: 'loading' | 'ready' | 'error' = 'loading';
  protected bankListOpen = false;
  /** What the user has typed to filter with — empty means "show the whole list". */
  protected bankQuery = '';

  constructor(
    private readonly bankService: BankService,
    private readonly translate: TranslateService,
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.loadBanks();
  }

  protected loadBanks(): void {
    this.banksState = 'loading';
    this.bankService.getBanks().subscribe({
      next: (banks) => {
        this.banks = banks;
        this.banksState = 'ready';
      },
      error: () => {
        this.banks = [];
        this.banksState = 'error';
      },
    });
  }

  protected retryBanks(): void {
    this.bankService.resetCache();
    this.loadBanks();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeBankList();
    }
  }

  protected selectMode(mode: RefundDestinationType): void {
    if (this.disabled) {
      return;
    }
    this.formGroup.get('mode')?.setValue(mode);
    this.formGroup.get('mode')?.markAsDirty();
  }

  protected get mode(): RefundDestinationType | null {
    return (this.formGroup.get('mode')?.value ?? null) as RefundDestinationType | null;
  }

  protected isInvalid(controlName: string): boolean {
    const control = this.formGroup.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected hasError(controlName: string, errorKey: string): boolean {
    return !!this.formGroup.get(controlName)?.errors?.[errorKey];
  }

  /** The name of whichever bank the form currently holds the code of, or `''`. */
  protected get selectedBankName(): string {
    const code = this.formGroup.get('bank')?.value as string | null;
    const bank = this.banks.find((candidate) => candidate.code === code);
    return bank ? this.bankName(bank) : '';
  }

  protected bankName(bank: BankDto): string {
    return bankNameFor(bank, this.translate.currentLang);
  }

  /** Matches on the name AS RENDERED plus the code — a customer who knows their
   * bank only by its 3-digit code should not have to guess our spelling of it. */
  protected get filteredBanks(): BankDto[] {
    const query = this.bankQuery.trim().toLowerCase();
    if (!query) {
      return this.banks;
    }
    return this.banks.filter(
      (bank) =>
        this.bankName(bank).toLowerCase().includes(query) || bank.code.includes(query)
    );
  }

  protected openBankList(): void {
    if (this.disabled || this.banksState !== 'ready') {
      return;
    }
    this.bankQuery = '';
    this.bankListOpen = true;
  }

  protected onBankQueryInput(value: string): void {
    this.bankQuery = value;
    this.bankListOpen = true;
  }

  protected selectBank(bank: BankDto): void {
    const control = this.formGroup.get('bank');
    control?.setValue(bank.code);
    control?.markAsDirty();
    control?.markAsTouched();
    this.closeBankList();
  }

  private closeBankList(): void {
    this.bankListOpen = false;
    this.bankQuery = '';
  }
}

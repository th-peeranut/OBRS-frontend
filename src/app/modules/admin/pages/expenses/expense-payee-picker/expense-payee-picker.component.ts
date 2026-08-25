import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminExpensePayeeDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import {
  PayeeType,
  filterPayeesByQuery,
  findPayeeByExactName,
  inferPayeeTypeFromCategory,
} from '../../expense-payees/expense-payees.mappers';

/**
 * OBRS-1577 (AC1–AC5): the "who did this money go to" control on the bill form.
 *
 * <p>A picker rather than the free-text box the form has had until now, because free text cannot
 * answer the question the owner actually asked — "how much did I pay this garage this year". Two
 * spellings of one garage are two answers, and nothing on screen says so.
 *
 * <p>Built as a plain input + list rather than reaching for PrimeNG's AutoComplete: measured
 * 2026-08-24, this app imports exactly two PrimeNG modules into admin (DatePicker, ToggleSwitch) and
 * every other control on these screens is native markup styled with the `admin-*` classes. Pulling a
 * third in for one field would make this the odd control on the page and add a dependency the
 * bundle does not carry today.
 *
 * <p><b>It can create.</b> An owner halfway through entering a bill for a garage that is not yet on
 * record must not have to abandon the form, go to another screen, add it, and come back — they would
 * type the name free-hand instead, which is the behaviour this card exists to end. The server's
 * create is idempotent by normalized name, so pressing it twice, or racing another tab, returns the
 * same row rather than a duplicate.
 */
@Component({
    selector: 'app-expense-payee-picker',
    templateUrl: './expense-payee-picker.component.html',
    styleUrl: './expense-payee-picker.component.scss',
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => ExpensePayeePickerComponent),
            multi: true,
        },
    ],
    standalone: false
})
export class ExpensePayeePickerComponent implements ControlValueAccessor {
  /**
   * The rows to offer: ACTIVE payees only. The parent filters — see `ExpensePayeesStore`.
   *
   * <p><b>Not narrowed by type, and that is not an oversight.</b> LANE-BRIEFS' "the field must show
   * only garages" ruling is scoped to OBRS-1576's multi-bill screen, whose field is labelled
   * อู่ซ่อมรถ and means it; THIS field is on the general bill form and means "whoever received the
   * money", so narrowing it would hide real payees. Measured on the owner's own 5 bills
   * (OBRS-1578, 2026-08-24): 3 of 5 payees filed under ค่าซ่อม are not garages at all — a glass
   * shop, a battery shop and a gas-system company. A type-filtered list would have hidden every one
   * of them behind an "add it" button that creates the duplicate this card exists to prevent. The
   * type is shown as a badge on each row instead, which is what the ruling was actually protecting.
   *
   * <p>`GET /expense-payees?type=` exists for OBRS-1576's narrower field; it is deliberately unused
   * here rather than unused everywhere.
   */
  @Input() payees: AdminExpensePayeeDto[] = [];

  /**
   * OBRS-1577 decision 1: the bill's own category, which decides what type a payee added from here
   * is created as. Read live rather than captured on open — an owner may set the category after
   * touching this field, and the button has to say the type it will actually use.
   */
  @Input() category = '';

  /**
   * The name of the currently selected payee when it is NOT in `payees` — i.e. a bill whose garage
   * has since been retired. Without this the field would render blank on an old bill, and saving
   * that form would look like a deliberate "no payee" while actually dropping a link the owner
   * never touched.
   */
  @Input() fallbackName = '';

  /**
   * OBRS-1577: whether "add the one I am typing" is offered at all.
   *
   * False for an admin. Every OTHER payee operation resolves through
   * `getCurrentOwnerScope()`, which an admin satisfies — but CREATE goes through
   * `getCurrentOwnerId()`, which throws for an admin, who owns no fleet for the row to belong to.
   * The button is therefore hidden rather than shown-and-failing: an affordance whose only outcome
   * is a server error is worse than no affordance, because the user cannot tell it apart from a
   * bug. The picker still LISTS and SELECTS normally for them.
   */
  @Input() canCreate = true;

  /**
   * OBRS-1576: the type to show when nothing has been typed. `''` (the default, and what the
   * general bill form passes) shows everything, exactly as before this card.
   *
   * <p>The multi-bill screen sets `'GARAGE'`, because the owner's ruling on 2026-08-24 was that its
   * field — labelled อู่ซ่อมรถ and meaning it — must not have petrol stations in the list.
   *
   * <p><b>The restriction applies to BROWSING only, never to searching.</b> That is the whole design
   * and not a shortcut: measured on the owner's own five ค่าซ่อม bills (OBRS-1578, 2026-08-24),
   * THREE of the five payees are not garages — a glass shop, a battery shop, a gas-system company.
   * A list that hid them while typing would put "+ add this one" in front of a name that is already
   * on record, and the duplicate that creates is the exact failure OBRS-1577 exists to prevent. So
   * the closed list obeys the ruling and a typed query still reaches every payee.
   */
  @Input() restrictToType: PayeeType | '' = '';

  @Input() disabled = false;

  /** Emitted after a successful create so the parent can revalidate the registry cache. */
  @Output() payeeCreated = new EventEmitter<AdminExpensePayeeDto>();

  @ViewChild('queryInput') private queryInput?: ElementRef<HTMLInputElement>;

  protected isOpen = false;
  protected isCreating = false;
  protected query = '';
  /** OBRS-1576: which match the arrow keys are on. 0 rather than -1 so the very first Enter after
   * typing takes the top match, which is the whole point of typing two letters. */
  protected activeIndex = 0;
  protected selectedId: number | null = null;

  /**
   * Payees created from inside this picker, held until the parent's store revalidation brings them
   * back down through `payees`.
   *
   * Without this the field goes BLANK the instant it succeeds: `select()` sets an id that
   * `selectedLabel` cannot resolve, because `payees` is an @Input the parent has not refreshed yet.
   * The owner would see the name they just added replaced by the placeholder, and the natural read
   * of that is "it did not save" — so they add it again.
   */
  private createdLocally: AdminExpensePayeeDto[] = [];

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  writeValue(value: number | null): void {
    this.selectedId = value ?? null;
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  /** Everything this picker can offer or resolve: the parent's list plus anything created here that
   * has not made the round trip back yet, de-duplicated by id so a refresh cannot double a row. */
  private get knownPayees(): AdminExpensePayeeDto[] {
    const pending = this.createdLocally.filter(
      (created) => !this.payees.some((payee) => payee.id === created.id)
    );
    return pending.length ? [...this.payees, ...pending] : this.payees;
  }

  /** What the closed control shows. Falls back to the name carried on the bill (a retired payee),
   * then to the placeholder — never to a bare id, which means nothing to an owner. */
  protected get selectedLabel(): string {
    const selected = this.knownPayees.find((payee) => payee.id === this.selectedId);
    if (selected) {
      return selected.name;
    }
    return this.selectedId !== null ? this.fallbackName : '';
  }

  protected get visiblePayees(): AdminExpensePayeeDto[] {
    const typed = this.query.trim();
    if (this.restrictToType && !typed) {
      return this.knownPayees.filter((payee) => payee.type === this.restrictToType);
    }
    return filterPayeesByQuery(this.knownPayees, this.query);
  }

  /**
   * OBRS-1576 AC4: Enter takes the highlighted row, arrows move it, Escape gives up — the owner has
   * a paper bill in the other hand and cannot reach the mouse. Enter also prevents default, or the
   * keystroke that picks a garage would submit the bill behind it.
   *
   * <p>With nothing highlighted (a name typed that matches nobody), Enter is what CREATES — which is
   * what the approved mock annotates on this field, and it is the same key doing the same thing:
   * "take what I typed".
   */
  protected onQueryKeydown(event: KeyboardEvent): void {
    const matches = this.visiblePayees;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!matches.length) {
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex = Math.min(Math.max(this.activeIndex + step, 0), matches.length - 1);
        return;
      }
      case 'Enter': {
        event.preventDefault();
        const active = matches[this.activeIndex];
        if (active) {
          this.select(active);
          return;
        }
        if (this.showCreateOption) {
          void this.createFromQuery();
        }
        return;
      }
      case 'Escape':
        // Not prevented: this panel closes, and the modal above it stays the owner of the key.
        this.close();
        return;
      default:
        return;
    }
  }

  protected isActive(index: number): boolean {
    return this.activeIndex === index;
  }

  /** Every keystroke re-cuts the match list, so an index kept from the previous one would highlight
   * an unrelated payee — and Enter would then select it. */
  protected onQueryChange(value: string): void {
    this.query = value;
    this.activeIndex = 0;
  }

  /** The type a payee added right now would be created as — shown ON the button, never inferred
   * silently (owner decision 1, 2026-08-24). */
  protected get inferredType(): PayeeType {
    return inferPayeeTypeFromCategory(this.category);
  }

  /**
   * Whether to offer "add this one". Requires a non-blank query with NO exact registry match — a
   * substring match is not enough, because a shorter name is a legitimately different payee.
   */
  protected get showCreateOption(): boolean {
    if (!this.canCreate) {
      return false;
    }
    const typed = this.query.trim();
    return typed.length > 0 && !findPayeeByExactName(this.knownPayees, typed);
  }

  protected toggle(): void {
    if (this.disabled) {
      return;
    }
    this.isOpen = !this.isOpen;
    this.onTouched();
    if (this.isOpen) {
      this.query = '';
      this.activeIndex = 0;
      // The input only exists once the panel is rendered.
      setTimeout(() => this.queryInput?.nativeElement.focus());
    }
  }

  protected select(payee: AdminExpensePayeeDto): void {
    this.selectedId = payee.id;
    this.onChange(payee.id);
    this.close();
  }

  /** AC1: blank is a real answer. Every bill written before this card has no payee, and an owner
   * who does not remember who a bill went to must be able to leave it that way. */
  protected clear(): void {
    this.selectedId = null;
    this.onChange(null);
    this.close();
  }

  protected async createFromQuery(): Promise<void> {
    const name = this.query.trim();
    // `canCreate` is re-tested here and not only in the template: hiding a button is a UI decision,
    // and this method is the one that actually spends a request the server will refuse.
    if (!name || this.isCreating || !this.canCreate) {
      return;
    }

    this.isCreating = true;
    try {
      const response = await firstValueFrom(
        this.adminApiService.createExpensePayee({ name, type: this.inferredType })
      );
      const created = response?.data;
      if (!created) {
        // A 200 with no body is not something this screen can act on: selecting nothing while
        // saying "added" would leave the owner believing the bill is linked when it is not.
        throw new Error('empty create response');
      }
      this.createdLocally.push(created);
      this.payeeCreated.emit(created);
      this.select(created);
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isCreating = false;
    }
  }

  protected trackById(_index: number, payee: AdminExpensePayeeDto): number {
    return payee.id;
  }

  private close(): void {
    this.isOpen = false;
    this.query = '';
    this.activeIndex = 0;
  }
}

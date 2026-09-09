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
  AdminMaintenancePartDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import {
  MAINTENANCE_PART_KIND_CODES,
  MaintenancePartKind,
  filterMaintenancePartsByQuery,
  findMaintenancePartByExactName,
  maintenancePartLabel,
} from '../../maintenance-parts/maintenance-parts.mappers';

/**
 * OBRS-1613 (AC1, AC2): the "what was this line for" control on the multi-bill screen.
 *
 * <p>It replaces a dropdown over the 13 fixed `EMaintenancePart` codes. Measured on the owner's own
 * five bills (OBRS-1578, 2026-08-25), that list could name 1 of 14 lines; the registry names 9. The
 * other 5 are labour and sundries the enum has no word for, and until now they were typed into
 * `description` — where two spellings of one job are two price histories and nothing says so.
 *
 * <p>Deliberately a near-copy of `ExpensePayeePickerComponent` rather than a generalisation of it:
 * that component belongs to a Done card, and the two differ in the place that matters (below), so
 * the parameter that unified them would be the bug.
 *
 * <p><b>The one real difference: the kind is chosen, never inferred.</b> The payee picker infers a
 * type from the bill's category, which works because a bill has exactly one category. A repair bill
 * has both parts and labour on it, line by line, so there is nothing to infer from — and inferring
 * wrong is expensive here: the server runs `assertSameKind` BEFORE its idempotent branch, so a name
 * that already exists under the other kind is a 409, not a reuse. So "add it" is two buttons that
 * each say which kind they will create, which is also what the owner's 2026-08-24 ruling on the
 * sibling field asked for — the kind shown ON the button, never applied silently.
 */
@Component({
    selector: 'app-expense-part-picker',
    templateUrl: './expense-part-picker.component.html',
    styleUrl: './expense-part-picker.component.scss',
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => ExpensePartPickerComponent),
            multi: true,
        },
    ],
    standalone: false
})
export class ExpensePartPickerComponent implements ControlValueAccessor {
  /** The registry, ACTIVE rows only — the parent filters. Retiring an entry is how the owner says
   * "stop offering this", so a picker that showed retired rows would make the action do nothing. */
  @Input() parts: AdminMaintenancePartDto[] = [];

  /**
   * Whether "add the one I am typing" is offered at all. False for an admin, for the reason
   * `ExpensePayeePickerComponent#canCreate` gives in full: every other registry operation resolves
   * through `getCurrentOwnerScope()`, which an admin satisfies, but CREATE goes through
   * `getCurrentOwnerId()`, which throws for an admin who owns no fleet. The picker still lists and
   * selects normally for them.
   */
  @Input() canCreate = true;

  /**
   * The name of the selected part when it is NOT in `parts` — i.e. an EDIT of a bill whose part has
   * since been retired. Fed from the server-resolved `AdminExpenseItemDto#partName`.
   *
   * <p>Without it the field renders BLANK on a line whose link is perfectly intact, because the
   * pickers carry ACTIVE rows only and `selectedLabel` can then resolve nothing. A blank field on a
   * bill the owner opened to change something else reads as "this line has no part", and the
   * natural repair is to pick one — discarding a correct historical link by hand. Saving without
   * touching it was never destructive; being LIED TO about it is the damage.
   */
  @Input() fallbackName = '';

  @Input() disabled = false;

  /** Emitted after a successful create so the parent can revalidate the registry cache. */
  @Output() partCreated = new EventEmitter<AdminMaintenancePartDto>();

  @ViewChild('queryInput') private queryInput?: ElementRef<HTMLInputElement>;

  protected readonly kinds = MAINTENANCE_PART_KIND_CODES;

  protected isOpen = false;
  protected isCreating = false;
  protected query = '';
  /** Which match the arrow keys are on. 0 rather than -1 so the first Enter after typing takes the
   * top match — the same reasoning as the payee picker. */
  protected activeIndex = 0;
  protected selectedId: number | null = null;

  /**
   * Parts created from inside this picker, held until the parent's store revalidation brings them
   * back down through `parts`. Without it the field goes BLANK the instant a create succeeds, and
   * the natural read of that is "it did not save" — so the owner adds it again.
   */
  private createdLocally: AdminMaintenancePartDto[] = [];

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
  private get knownParts(): AdminMaintenancePartDto[] {
    const pending = this.createdLocally.filter(
      (created) => !this.parts.some((part) => part.id === created.id)
    );
    return pending.length ? [...this.parts, ...pending] : this.parts;
  }

  /** The 13 seeded rows are translated, the owner's own are Thai verbatim (owner ruling
   * 2026-08-25). One function decides that, for this picker and the registry screen alike. */
  protected label(part: AdminMaintenancePartDto): string {
    return maintenancePartLabel(part, (key) => this.translate.instant(key));
  }

  protected kindLabel(kind: MaintenancePartKind): string {
    return this.translate.instant(`ADMIN.MAINTENANCE_PARTS.KINDS.${kind}`);
  }

  /** What the closed control shows. Falls back to the name the bill carries (a retired part), then
   * to the placeholder — never to a bare id, which means nothing to an owner. */
  protected get selectedLabel(): string {
    const selected = this.knownParts.find((part) => part.id === this.selectedId);
    if (selected) {
      return this.label(selected);
    }
    return this.selectedId !== null ? this.fallbackName : '';
  }

  protected get visibleParts(): AdminMaintenancePartDto[] {
    return filterMaintenancePartsByQuery(this.knownParts, this.query, (part) => this.label(part));
  }

  /**
   * Whether to offer "add this one". Requires a non-blank query with NO exact match — a substring
   * match is not enough, because "สายพาน" is a legitimately different entry from "สายพานราวลิ้น".
   *
   * <p>The exact-match test runs on `name`, not on the displayed label: `name` is what the server
   * dedups on, so agreeing with it here is what stops the button offering a create the server will
   * answer with the existing row anyway.
   */
  protected get showCreateOption(): boolean {
    if (!this.canCreate) {
      return false;
    }
    const typed = this.query.trim();
    return typed.length > 0 && !findMaintenancePartByExactName(this.knownParts, typed);
  }

  /**
   * Enter takes the highlighted row, arrows move it, Escape gives up — the owner has a paper bill
   * in the other hand. Enter does NOT create here, unlike the payee picker: creating needs a kind,
   * and there is no key that says which one.
   */
  protected onQueryKeydown(event: KeyboardEvent): void {
    const matches = this.visibleParts;
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
        }
        return;
      }
      case 'Escape':
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
   * an unrelated row — and Enter would then select it. */
  protected onQueryChange(value: string): void {
    this.query = value;
    this.activeIndex = 0;
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
      setTimeout(() => this.queryInput?.nativeElement.focus());
    }
  }

  protected select(part: AdminMaintenancePartDto): void {
    this.selectedId = part.id;
    this.onChange(part.id);
    this.close();
  }

  /** OBRS-1374 AC3: "not a part" is a real answer, not an empty one — labour written as free text,
   * service, sundries. It is an option in the list rather than something you achieve by deleting. */
  protected clear(): void {
    this.selectedId = null;
    this.onChange(null);
    this.close();
  }

  protected async createFromQuery(kind: MaintenancePartKind): Promise<void> {
    const name = this.query.trim();
    // `canCreate` is re-tested here and not only in the template: hiding a button is a UI decision,
    // and this method is the one that actually spends a request the server will refuse.
    if (!name || this.isCreating || !this.canCreate) {
      return;
    }

    this.isCreating = true;
    try {
      const response = await firstValueFrom(
        this.adminApiService.createMaintenancePart({ name, kind })
      );
      const created = response?.data;
      if (!created) {
        // A 200 with no body is not something this screen can act on: selecting nothing while
        // saying "added" would leave the owner believing the line is keyed when it is not.
        throw new Error('empty create response');
      }
      this.createdLocally.push(created);
      this.partCreated.emit(created);
      this.select(created);
    } catch (error) {
      // The message the owner most needs here is the 409 for a name that already exists under the
      // OTHER kind, which the server words itself — so it is shown verbatim rather than replaced.
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isCreating = false;
    }
  }

  protected trackById(_index: number, part: AdminMaintenancePartDto): number {
    return part.id;
  }

  private close(): void {
    this.isOpen = false;
    this.query = '';
    this.activeIndex = 0;
  }
}

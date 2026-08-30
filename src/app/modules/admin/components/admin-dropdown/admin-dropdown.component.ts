import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** OBRS-1576: `activeIndex` when the highlighted row is the placeholder/clear entry above the
 * options, which is not a member of `visibleOptions` and so has no index of its own. */
const ACTIVE_INDEX_PLACEHOLDER = -1;

@Component({
    selector: 'app-admin-dropdown',
    templateUrl: './admin-dropdown.component.html',
    styleUrl: './admin-dropdown.component.scss',
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => AdminDropdownComponent),
            multi: true,
        },
    ],
    standalone: false
})
export class AdminDropdownComponent implements ControlValueAccessor {
  @Input() options: unknown[] = [];
  @Input() placeholder = '';
  @Input() valueKey = 'value';
  @Input() labelKey = 'label';
  @Input() icon = '';
  @Input() disabled = false;
  /**
   * OBRS-1576 AC5: turns the trigger into a text box you can type into, and makes the list
   * keyboard-navigable — Tab in, type to narrow, arrows to move, Enter to take it.
   *
   * <p><b>Opt-in, and it has to be.</b> Measured on `origin/dev` 2026-08-25: **71** uses of this
   * control, of which **21 pass no placeholder at all**. (The card's own "66 in 31 files" is the
   * 2026-08-23 count; `dev` has moved since, and quoting the older number as if it were current is
   * how a stale measurement gets a second life.) Making search the default would change every one of
   * them — including the many that offer three options, where a text cursor invites typing that
   * nothing needs and a filtered-to-empty list is a state those screens never had. So the default
   * path below is untouched: when this is false the component renders and behaves exactly as it did
   * before this card.
   *
   * <p>What it is FOR is not "the list is long". The owner sits with a paper bill in one hand, so
   * the cost that matters is taking the other hand off the keyboard to reach the mouse — which is
   * why the vehicle field gets this despite the fleet being six vans (seeded V8; the live count is
   * not measured).
   */
  @Input() searchable = false;
  /**
   * OBRS-1643: whether the placeholder row in the panel is a CHOICE. Default `true` = the
   * behaviour every call site has today, so 75 of the 81 uses on `origin/dev` are untouched.
   *
   * <p><b>Why an opt-out and not a fix.</b> On a field that cannot be empty (year, month,
   * granularity, status) `''` is not a value at all, so OBRS-1626/-1631 put a guard in the
   * handler that drops it. The guard stops the wrong request, but the control has already
   * written `selectedValue = ''` on itself before emitting — the parent refusing the value
   * changes no binding, so no `SimpleChange` arrives, `writeValue()` never runs, and the
   * button is left reading "ปี" over a table still showing 2026. Removing the row is the
   * only cut that leaves nothing to refuse. The guards stay as a second layer for a call
   * site that forgets to opt out.
   */
  @Input() placeholderSelectable = true;
  @Input() set value(value: unknown) {
    this.selectedValue = String(value ?? '');
  }

  @Output() valueChange = new EventEmitter<string>();

  protected isOpen = false;
  protected selectedValue = '';
  /** OBRS-1576: what has been typed into the trigger this time it was open. Blank whenever the
   * control is closed, so reopening always starts from the whole list rather than from a filter the
   * user set minutes ago and cannot see. */
  protected query = '';
  protected activeIndex = ACTIVE_INDEX_PLACEHOLDER;

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  writeValue(value: unknown): void {
    this.selectedValue = String(value ?? '');
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  protected toggleDropdown(): void {
    if (this.disabled) {
      return;
    }

    if (this.isOpen) {
      this.close();
      return;
    }
    this.isOpen = true;
    this.query = '';
    this.activeIndex = this.firstActiveIndex;
    this.onTouched();
  }

  protected selectOption(option: unknown): void {
    const value = this.getOptionValue(option);
    this.selectedValue = value;
    this.close();
    this.onChange(value);
    this.valueChange.emit(value);
  }

  /**
   * OBRS-1576: what the trigger shows. Open, it shows what is being typed — including the empty
   * string, so the first keystroke replaces the current selection instead of appending to it.
   * Closed, it shows the selection, which is the only state the non-searchable control has.
   *
   * <p>Deliberately NOT `selectedLabel`, which falls back to the placeholder TEXT: in a button that
   * renders as grey hint text, but in an input it would be a real value, and the owner would be
   * saving a bill whose vehicle field says "ทะเบียนรถ". The placeholder belongs on the input's own
   * `placeholder` attribute, where it stays hint text.
   */
  protected get triggerText(): string {
    if (this.isOpen) {
      return this.query;
    }
    const selectedOption = this.options.find((option) => this.isSelected(option));
    return selectedOption ? this.getOptionLabel(selectedOption) : '';
  }

  /** OBRS-1576: the options the query leaves standing. Matched on the LABEL, because the label is
   * what is on screen — filtering on the code would hide rows the user can see and is reading. */
  protected get visibleOptions(): unknown[] {
    const typed = this.query.trim().toLocaleLowerCase();
    if (!typed) {
      return this.options;
    }
    return this.options.filter((option) =>
      this.getOptionLabel(option).toLocaleLowerCase().includes(typed)
    );
  }

  /** Clicking the search trigger OPENS but never closes: the caret has to be able to land in the
   * middle of what was typed, and a toggle would shut the panel on that click. */
  protected onTriggerClick(): void {
    if (!this.isOpen) {
      this.toggleDropdown();
    }
  }

  protected onQueryInput(value: string): void {
    this.query = value;
    this.isOpen = true;
    // Typing re-cuts the list, so an index kept from the old one would highlight an unrelated row.
    this.activeIndex = this.firstActiveIndex;
  }

  /**
   * OBRS-1576 AC4: the whole keyboard contract in one place — arrows move, Enter takes, Escape
   * abandons. Enter also PREVENTS DEFAULT: every use of this control is inside a form, and without
   * that the same keystroke that picks a vehicle would submit the bill behind it.
   */
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (this.disabled) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.isOpen) {
          this.isOpen = true;
          this.activeIndex = this.firstActiveIndex;
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const lowest = this.firstActiveIndex;
        const highest = this.visibleOptions.length - 1;
        this.activeIndex = Math.min(Math.max(this.activeIndex + step, lowest), Math.max(highest, lowest));
        return;
      }
      case 'Enter':
        event.preventDefault();
        if (!this.isOpen) {
          this.toggleDropdown();
          return;
        }
        if (this.activeIndex === ACTIVE_INDEX_PLACEHOLDER) {
          this.selectOption('');
          return;
        }
        if (this.visibleOptions[this.activeIndex] !== undefined) {
          this.selectOption(this.visibleOptions[this.activeIndex]);
        }
        return;
      case 'Escape':
        // Not preventDefault: closing this list is what Escape does HERE, but the same key also
        // closes the modal these fields sit in, and swallowing it would strand a user one layer up.
        this.close();
        return;
      case 'Tab':
        // Leaving the field commits nothing — the typed text was a filter, never a value.
        this.close();
        return;
      default:
        return;
    }
  }

  /**
   * OBRS-1576 scrutinize fix: gated on `searchable`. `toggleDropdown()` (the non-searchable
   * button's own click handler) sets `activeIndex` via `firstActiveIndex` on every open, and
   * `firstActiveIndex` falls through to `0` whenever `placeholder` is unset — true for 21 of the
   * 66 pre-existing call sites (measured: `grep` for `<app-admin-dropdown` blocks with no
   * `[placeholder]` binding). Without this gate those 21 sites would highlight their first option
   * with the new `.is-active` wash the instant they open, which is not "byte-identical to before
   * this card" — the claim the opt-in `searchable` flag exists to keep true. The keyboard highlight
   * itself is a `searchable`-only feature (a plain `<button>` has no arrow-key handler to move
   * `activeIndex` off its initial value), so gating here costs the searchable path nothing.
   */
  protected isActive(index: number): boolean {
    return this.searchable && this.isOpen && this.activeIndex === index;
  }

  /**
   * The topmost row the arrows may reach, and where the highlight sits after every re-cut of the
   * list: the placeholder/clear entry when it is rendered, otherwise the first real option.
   *
   * <p><b>A typed query moves it off the placeholder</b>, and that is the AC4 flow, not a detail:
   * with the highlight parked on "clear", typing a plate and pressing Enter would BLANK the field
   * the owner was filling in — the opposite of what those two keystrokes mean. Clearing is
   * something you go up to, never something you land on by typing.
   *
   * <p>OBRS-1643: `placeholderSelectable` belongs here and not only in the template. This is the
   * ONLY producer of `ACTIVE_INDEX_PLACEHOLDER` — `toggleDropdown`, `onQueryInput`, `close` and
   * the arrow branch (whose floor is this getter) all take their index from it — so gating it
   * here is what keeps Enter off a row the panel does not render. Gating the template alone
   * would leave the keyboard able to pick the row that is no longer on screen.
   */
  private get firstActiveIndex(): number {
    return this.placeholder && this.placeholderSelectable && !this.query.trim()
      ? ACTIVE_INDEX_PLACEHOLDER
      : 0;
  }

  private close(): void {
    this.isOpen = false;
    this.query = '';
    this.activeIndex = this.firstActiveIndex;
  }

  protected get selectedLabel(): string {
    const selectedOption = this.options.find((option) => this.isSelected(option));
    return selectedOption ? this.getOptionLabel(selectedOption) : this.placeholder;
  }

  protected isSelected(option: unknown): boolean {
    return String(this.getOptionValue(option)) === String(this.selectedValue ?? '');
  }

  protected get hasEmptySelection(): boolean {
    return String(this.selectedValue ?? '') === '';
  }

  protected getOptionValue(option: unknown): string {
    if (this.isRecord(option)) {
      return String(option[this.valueKey] ?? '');
    }

    return String(option ?? '');
  }

  protected getOptionLabel(option: unknown): string {
    if (this.isRecord(option)) {
      return String(option[this.labelKey] ?? option[this.valueKey] ?? '');
    }

    return String(option ?? '');
  }

  // Arrow-function field: NgForOf invokes trackBy as a free function, so a
  // regular method would lose `this` and `this.getOptionValue` would be undefined.
  //
  // OBRS-967: `getOptionValue` collapses every option that lacks `valueKey` (or
  // holds an empty one) to the SAME '' key, so two such options in one list would
  // hand @for duplicate keys and Angular would log NG0955. No call site in the app
  // produces that today (measured: 56 <app-admin-dropdown> uses, 55 pass valueKey,
  // and the one that does not supplies options carrying the default key `value`),
  // so this is hardening against a data shape, not a live defect. A real value is
  // still returned unchanged -- only the empty case is namespaced on the index.
  trackByOption = (index: number, option: unknown): string => {
    const value = this.getOptionValue(option);
    return value === '' ? `__empty_${index}__` : value;
  };

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}

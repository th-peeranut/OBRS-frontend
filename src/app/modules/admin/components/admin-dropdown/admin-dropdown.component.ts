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
  @Input() set value(value: unknown) {
    this.selectedValue = String(value ?? '');
  }

  @Output() valueChange = new EventEmitter<string>();

  protected isOpen = false;
  protected selectedValue = '';

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen = false;
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

    this.isOpen = !this.isOpen;
    this.onTouched();
  }

  protected selectOption(option: unknown): void {
    const value = this.getOptionValue(option);
    this.selectedValue = value;
    this.isOpen = false;
    this.onChange(value);
    this.valueChange.emit(value);
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

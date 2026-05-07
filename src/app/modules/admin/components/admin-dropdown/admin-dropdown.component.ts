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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}

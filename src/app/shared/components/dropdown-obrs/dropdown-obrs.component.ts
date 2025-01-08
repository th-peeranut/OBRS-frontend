import {
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  OnChanges,
  Output,
  Renderer2,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { Dropdown } from '../../../interfaces/dropdown.interface';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dropdown-obrs',
  templateUrl: './dropdown-obrs.component.html',
  styleUrl: './dropdown-obrs.component.scss',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DropdownObrsComponent),
      multi: true,
    },
  ],
  imports: [CommonModule, TranslateModule],
})
export class DropdownObrsComponent implements ControlValueAccessor, OnChanges {
  @Input() isLabel: boolean = false;
  @Input() label: string = '';
  @Input() options: Dropdown[] = [];
  @Input() isBorder: boolean = false;

  @Output() currentValue = new EventEmitter<number>();

  isDropdownOpen: boolean = false;
  selectedValue!: Dropdown;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  // ControlValueAccessor handlers
  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private renderer: Renderer2, private elementRef: ElementRef) {}

  ngOnChanges(changes: SimpleChanges) {
    const defaultData = this.options.find((value) => value.isDefault);
    if (defaultData) {
      this.setCurrentValue(defaultData);
    }
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
    }
  }

  handleOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown =
      this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton =
      this.dropdownButton.nativeElement.contains(targetElement);

    if (clickedInsideDropdown || clickedDropdownButton) {
      this.isDropdownOpen = true;
    } else {
      this.isDropdownOpen = false;
    }
  }

  setCurrentValue(data: Dropdown) {
    this.selectedValue = data;
    this.currentValue.emit(data.id);
    this.onChange(data.id);
  }

  writeValue(value: number): void {
    this.selectedValue = this.options.find((option) => option.id === value)!;
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {}
}

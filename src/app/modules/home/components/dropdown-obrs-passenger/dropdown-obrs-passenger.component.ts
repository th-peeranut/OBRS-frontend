import { CommonModule } from '@angular/common';
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
import { TranslateModule } from '@ngx-translate/core';
import { DropdownPassenger } from '../../../../shared/interfaces/dropdown.interface';

@Component({
  selector: 'app-dropdown-obrs-passenger',
  templateUrl: './dropdown-obrs-passenger.component.html',
  styleUrl: './dropdown-obrs-passenger.component.scss',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DropdownObrsPassengerComponent),
      multi: true,
    },
  ],
  imports: [CommonModule, TranslateModule],
})
export class DropdownObrsPassengerComponent
  implements ControlValueAccessor, OnChanges
{
  @Input() data?: DropdownPassenger;
  @Output() currentValue = new EventEmitter<DropdownPassenger[]>();

  isDropdownOpen: boolean = false;
  selectedValue: DropdownPassenger[] = this.getDefaultPassengers();

  private getDefaultPassengers(): DropdownPassenger[] {
    return [
      {
        type: 'ADULT',
        count: 0,
      },
      {
        type: 'KIDS',
        count: 0,
      },
    ];
  }

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  private documentClickListener!: () => void;

  private onChange: (value: DropdownPassenger[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private renderer: Renderer2, private elementRef: ElementRef) {}

  ngOnChanges(changes: SimpleChanges): void {}

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

    const isPassengerControlButton =
      targetElement.classList.contains('passenger-add') ||
      targetElement.classList.contains('passenger-minus');

    if (clickedInsideDropdown && isPassengerControlButton) {
      event.stopPropagation();
      return;
    }

    if (!clickedDropdownButton && !clickedInsideDropdown) {
      this.isDropdownOpen = false;

      if (this.documentClickListener) {
        this.documentClickListener();
      }
    }
  }

  get sumPassenger() {
    return this.getSelectedPassengers().reduce((n, { count }) => n + count, 0);
  }

  get sumAdultPassenger() {
    return this.getPassengerCount('ADULT');
  }

  get sumKidsPassenger() {
    return this.getPassengerCount('KIDS');
  }

  updatePassengerCount(type: string, action: string) {
    // Create a shallow clone of the array and its objects
    const updatedPassengers = this.getSelectedPassengers().map((passenger) => ({
      ...passenger,
    }));

    updatedPassengers.forEach((passenger) => {
      if (passenger.type === type) {
        if (action === 'ADD') {
          passenger.count += 1;
        } else if (action === 'MINUS' && passenger.count > 0) {
          passenger.count -= 1;
        }
      }
    });

    this.selectedValue = updatedPassengers;
    this.currentValue.emit(this.selectedValue);
    this.onChange(this.selectedValue);
  }

  writeValue(value: DropdownPassenger[]): void {
    this.selectedValue = Array.isArray(value)
      ? value
      : this.getDefaultPassengers();
  }

  registerOnChange(fn: (value: DropdownPassenger[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {}

  private getPassengerCount(type: string): number {
    return (
      this.getSelectedPassengers().find((value) => value.type === type)?.count ?? 0
    );
  }

  private getSelectedPassengers(): DropdownPassenger[] {
    if (Array.isArray(this.selectedValue)) {
      return this.selectedValue;
    }

    this.selectedValue = this.getDefaultPassengers();
    return this.selectedValue;
  }
}

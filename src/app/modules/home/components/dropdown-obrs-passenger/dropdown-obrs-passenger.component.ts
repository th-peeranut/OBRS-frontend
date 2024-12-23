import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Output,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { DropdownPassenger } from '../../../../interfaces/dropdown.interface';

@Component({
  selector: 'app-dropdown-obrs-passenger',
  templateUrl: './dropdown-obrs-passenger.component.html',
  styleUrl: './dropdown-obrs-passenger.component.scss',
  standalone: true,
  imports: [CommonModule, TranslateModule],
})
export class DropdownObrsPassengerComponent {
  @Output() currentValue = new EventEmitter<DropdownPassenger[]>();

  isDropdownOpen: boolean = false;
  selectedValue: DropdownPassenger[] = [
    {
      type: "ADULT",
      count: 0
    },
    {
      type: "KIDS",
      count: 0
    }
  ];

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  constructor(private renderer: Renderer2, private elementRef: ElementRef) {}

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

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isDropdownOpen = true;
    } else {
      this.isDropdownOpen = false;
    }
  }

  get sumPassenger(){
    return this.selectedValue.reduce((n, { count }) => n + count, 0);
  }

  get sumAdultPassenger(){
    return this.selectedValue.find((value) => value.type === "ADULT")?.count;
  }

  get sumKidsPassenger(){
    return this.selectedValue.find((value) => value.type === "KIDS")?.count;
  }

  updatePassengerCount(type: string, action: string) {
    this.selectedValue.forEach((passenger) => {
      if (passenger.type === type) {
        if (action === "ADD") {
          passenger.count += 1;
        } else if (action === "MINUS" && passenger.count > 0) {
          passenger.count -= 1;
        }
      }
    });

    this.currentValue.emit(this.selectedValue);
  }
}

import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  Renderer2,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Dropdown } from '../../../interfaces/dropdown.interface';

@Component({
  selector: 'app-dropdown-obrs',
  templateUrl: './dropdown-obrs.component.html',
  styleUrl: './dropdown-obrs.component.scss',
  standalone: true,
  imports: [CommonModule, TranslateModule],
})
export class DropdownObrsComponent implements OnChanges {
  @Input() isLabel: boolean = false;
  @Input() label: string = '';
  @Input() options: Dropdown[] = [];
  @Input() isBorder: boolean = false;

  @Output() currentValue = new EventEmitter<Dropdown>();

  isDropdownOpen: boolean = false;
  selectedValue: Dropdown;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

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

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isDropdownOpen = true;
    } else {
      this.isDropdownOpen = false;
    }
  }

  setCurrentValue(data: Dropdown) {
    this.currentValue.emit(data);
    this.selectedValue = data;
  }
}

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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dropdown-group-obrs',
  templateUrl: './dropdown-group-obrs.component.html',
  styleUrls: ['./dropdown-group-obrs.component.scss'],
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DropdownGroupObrsComponent),
      multi: true,
    },
  ],
  imports: [CommonModule, TranslateModule],
})
export class DropdownGroupObrsComponent
  implements ControlValueAccessor, OnChanges
{
  @Input() isLabel: boolean = false;
  @Input() label: string = '';
  @Input() options: any[] = []; 
  @Input() isBorder: boolean = false;
  @Input() value: any = null;
  @Input() isDisabled: boolean = false;

  @Output() currentValue = new EventEmitter<any>();

  isDropdownOpen = false;
  selectedValue: any = null;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private renderer: Renderer2,
    private elementRef: ElementRef,
    public translate: TranslateService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.value) {
      for (const group of this.options) {
        const match = group.stations.find(
          (station: any) => station.id === this.value
        );
        if (match) {
          this.selectedValue = match;
          this.currentValue.emit(match);
          this.onChange(match);
          break;
        }
      }
    }
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) {
      this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
    }
  }

  handleOutsideClick(event: Event): void {
    const targetElement = event.target as HTMLElement;
    const inside =
      this.elementRef.nativeElement.contains(targetElement) ||
      this.dropdownButton.nativeElement.contains(targetElement);

    if (!inside) {
      this.isDropdownOpen = false;
    }
  }

  setCurrentValue(data: any): void {
    this.selectedValue = data;
    this.currentValue.emit(data);
    this.onChange(data);
  }

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {}

  getValue(option: any): string {
    if (!option) return '';
    return this.translate.currentLang === 'th'
      ? option.nameThai
      : option.nameEnglish;
  }
}

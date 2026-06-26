import {
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  Renderer2,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { localizedDropdownName } from '../../lib/localized-dropdown-name';

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
  implements ControlValueAccessor, OnChanges, OnDestroy
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
  private unlistenDropdown?: () => void;

  constructor(
    private renderer: Renderer2,
    private elementRef: ElementRef,
    public translate: TranslateService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    const options = this.getOptions();

    if (!this.value) {
      this.selectedValue = null;
      return;
    }

    if (this.isGroupedOptions()) {
      for (const group of options) {
        const stations = Array.isArray(group?.stations) ? group.stations : [];
        const match = stations.find(
          (station: any) => station.id === this.value
        );
        if (match) {
          this.selectedValue = match;
          return;
        }
      }
    }

    const selected = options.find((option: any) => option.id === this.value);
    this.selectedValue = selected ?? null;
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) {
      this.unlistenDropdown?.();
      this.unlistenDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
    } else {
      this.unlistenDropdown?.();
      this.unlistenDropdown = undefined;
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

  ngOnDestroy(): void {
    this.unlistenDropdown?.();
  }

  setDisabledState?(isDisabled: boolean): void {}

  getValue(option: any): string {
    if (!option) return '';
    const fromName = localizedDropdownName(option, this.translate.currentLang);
    if (fromName) return fromName;

    const locale = this.translate.currentLang === 'th' ? 'th' : 'en';
    const localizedLabel =
      this.getTranslationLabel(option.display, locale) ??
      this.getTranslationLabel(option.translations, locale) ??
      this.getTranslationLabel(option.display, 'en') ??
      this.getTranslationLabel(option.translations, 'en');

    return localizedLabel ?? option.label ?? option.name ?? option.slug ?? option.code ?? '';
  }

  isGroupedOptions(): boolean {
    const options = this.getOptions();
    if (options.length === 0) return false;
    return Array.isArray(options[0]?.stations);
  }

  private getOptions(): any[] {
    return Array.isArray(this.options) ? this.options : [];
  }

  get optionList(): any[] {
    return this.getOptions();
  }

  getGroupStations(group: any): any[] {
    return Array.isArray(group?.stations) ? group.stations : [];
  }

  private getTranslationLabel(
    translations: unknown,
    locale: string
  ): string | null {
    if (!translations) {
      return null;
    }

    if (Array.isArray(translations)) {
      const matched = translations.find(
        (item: any) => String(item?.locale ?? '').toLowerCase() === locale
      );

      return matched?.label ?? translations.find((item: any) => item?.label)?.label ?? null;
    }

    if (typeof translations === 'object') {
      const translationMap = translations as Record<string, any>;
      return (
        translationMap[locale]?.label ??
        Object.values(translationMap).find((item: any) => item?.label)?.label ??
        null
      );
    }

    return null;
  }
}

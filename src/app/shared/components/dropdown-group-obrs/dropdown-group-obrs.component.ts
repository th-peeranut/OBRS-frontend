import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor, FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
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
  imports: [CommonModule, TranslateModule, FormsModule],
})
export class DropdownGroupObrsComponent
  implements ControlValueAccessor, OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @Input() isLabel: boolean = false;
  @Input() label: string = '';
  @Input() options: any[] = [];
  @Input() isBorder: boolean = false;
  @Input() value: any = null;
  @Input() isDisabled: boolean = false;
  /** Opt-in search/filter row inside the dropdown panel. Default false keeps every
   *  existing template byte-identical; only the station pickers set this to true
   *  (design-system §10: extend with an optional, false-default @Input()). */
  @Input() searchable: boolean = false;

  @Output() currentValue = new EventEmitter<any>();

  isDropdownOpen = false;
  selectedValue: any = null;

  /** Current search box text. */
  searchQuery = '';
  /** Flat-branch render list — a plain field recomputed in onSearchInput/applyFilter,
   *  never a template getter (getValue()'s localization fallback chain is too
   *  expensive to re-run every CD tick — see UX-OBRS-562 §4). */
  displayList: any[] = [];
  /** True when a search query is active and matched nothing (distinct from
   *  "no options at all"). */
  showNoSearchResults = false;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;
  @ViewChild('stationSearchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  /** trackBy MUST be an arrow-function class property — a bare method passed as
   *  [trackBy] loses its `this` binding when Angular invokes it detached. */
  trackByOptionId = (_: number, option: any): unknown => option?.id;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  private unlistenShown?: () => void;
  private unlistenHidden?: () => void;
  /** Precomputed lowercased searchKey per flat option, rebuilt on options change
   *  and on language change — never derived inline in the filter predicate. */
  private searchKeyMap = new Map<any, string>();
  private destroy$ = new Subject<void>();

  constructor(
    private renderer: Renderer2,
    public translate: TranslateService
  ) {}

  ngOnInit(): void {
    // The active language can change while a station list is already loaded
    // (e.g. th -> en mid-session with stations cached) — the precomputed
    // searchKey would otherwise go stale silently.
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.rebuildSearchKeys();
      this.applyFilter();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.rebuildSearchKeys();
      this.applyFilter();
    }

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

  ngAfterViewInit(): void {
    // Bootstrap fires shown.bs.dropdown / hidden.bs.dropdown on the TOGGLE
    // BUTTON (this._element in bootstrap.js), not the host and not
    // .dropdown-menu — listening anywhere else silently never fires.
    const btn = this.dropdownButton.nativeElement;
    this.unlistenShown = this.renderer.listen(btn, 'shown.bs.dropdown', () => {
      this.isDropdownOpen = true;
      this.searchInputRef?.nativeElement.focus();
    });
    this.unlistenHidden = this.renderer.listen(btn, 'hidden.bs.dropdown', () => {
      this.isDropdownOpen = false;
      this.searchQuery = '';
      this.applyFilter();
    });
  }

  onSearchInput(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.applyFilter();
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
    this.unlistenShown?.();
    this.unlistenHidden?.();
    this.destroy$.next();
    this.destroy$.complete();
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

  /** Precompute a lowercased searchKey per flat option ONCE — matched against
   *  the same localized string getValue()/the template renders, never a raw
   *  field, so a query never matches text the user can't see. Left unused for
   *  the (currently unreachable) grouped branch — harmless, since that branch
   *  never reads displayList/searchKeyMap. */
  private rebuildSearchKeys(): void {
    this.searchKeyMap = new Map<any, string>();
    for (const option of this.getOptions()) {
      this.searchKeyMap.set(option, this.normalize(this.getValue(option)));
    }
  }

  /** Recomputes displayList into a plain field — called from onSearchInput,
   *  ngOnChanges (options change) and the translate.onLangChange handler.
   *  Never called from the template. */
  private applyFilter(): void {
    const options = this.getOptions();
    const q = this.normalize(this.searchQuery);

    if (!this.searchable || !q) {
      this.displayList = options;
      this.showNoSearchResults = false;
      return;
    }

    const filtered = options.filter((option) => (this.searchKeyMap.get(option) ?? '').includes(q));

    this.displayList = filtered;
    this.showNoSearchResults = options.length > 0 && filtered.length === 0;
  }

  private normalize(text: string | null | undefined): string {
    return (text ?? '').trim().toLocaleLowerCase();
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

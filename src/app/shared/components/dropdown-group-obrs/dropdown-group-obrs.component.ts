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

import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { localizedDropdownName } from '../../lib/localized-dropdown-name';

/**
 * One rendered group: the group object the header is drawn from, plus the
 * children that survived the current search.
 *
 * <p>The children are a SEPARATE array rather than a clone of the group with a
 * narrowed `stations` field, so the object the template tracks stays identical
 * across keystrokes — cloning would rebuild every header's DOM on each input
 * event, and `getValue()` (the expensive part, see UX-OBRS-562 §4) would rerun
 * for each one.
 */
export interface DropdownGroupView {
  group: any;
  stations: any[];
}

@Component({
    selector: 'app-dropdown-group-obrs',
    templateUrl: './dropdown-group-obrs.component.html',
    styleUrls: ['./dropdown-group-obrs.component.scss'],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => DropdownGroupObrsComponent),
            multi: true,
        },
    ],
    imports: [TranslateModule, FormsModule]
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
  /** Opt-in typeahead. Default false keeps every existing template byte-identical;
   *  only the station pickers set this to true (design-system §10: extend with an
   *  optional, false-default @Input()).
   *
   *  OBRS-1224 changed what it SWITCHES ON, not who switches it on: it used to add
   *  a search row at the top of the panel, and now it makes the trigger itself a
   *  typeable combobox. The panel row was measured opening 525-585 px above the
   *  field on desktop (Popper flips a 60vh-capped panel upward), so "near the
   *  field" was not something CSS could restore — the box had to BE the field. */
  @Input() searchable: boolean = false;
  /** Optional i18n KEY (not literal text) shown in the trigger while nothing is
   *  selected. Left empty on purpose: with no override the template derives
   *  "SHARED.SELECT_PLACEHOLDER" from `label` — so every call site that already
   *  passes a label gets "เลือกต้นทาง"/"Select Source" without being touched, and
   *  only a site wanting different wording has to pass anything (OBRS-901). */
  @Input() placeholder: string = '';

  @Output() currentValue = new EventEmitter<any>();

  isDropdownOpen = false;
  selectedValue: any = null;

  /** Current search box text. */
  searchQuery = '';
  /** Flat-branch render list — a plain field recomputed in onSearchInput/applyFilter,
   *  never a template getter (getValue()'s localization fallback chain is too
   *  expensive to re-run every CD tick — see UX-OBRS-562 §4). */
  displayList: any[] = [];
  /** Grouped-branch render list — the exact counterpart of `displayList`.
   *
   *  OBRS-1212: the grouped branch used to iterate `optionList`, the RAW input,
   *  while only the flat branch iterated the filtered `displayList`. That was
   *  invisible for as long as `isGroupedOptions()` stayed false at runtime, and
   *  would have surfaced as "the search box silently stops filtering" on the
   *  very commit that first supplied grouped data (AC#2). Both branches now
   *  render from a filtered field and neither reads the raw list. */
  displayGroups: DropdownGroupView[] = [];
  /** True when a search query is active and matched nothing (distinct from
   *  "no options at all"). */
  showNoSearchResults = false;

  /** OBRS-1224. Every option currently RENDERED, flattened across group
   *  boundaries and in DOM order — the list keyboard navigation walks, and the
   *  list `aria-activedescendant` indexes into. Rebuilt by applyFilter() beside
   *  displayList/displayGroups so it can never describe a different list from
   *  the one on screen. */
  visibleOptions: any[] = [];
  /** Index into `visibleOptions` of the keyboard-active option, or -1 for none.
   *  -1 (not 0) on open: pre-highlighting an option would make Enter select
   *  something the customer never aimed at. */
  activeIndex = -1;
  /** option -> its index in `visibleOptions`. A map, because the template needs
   *  this per rendered option on every change-detection tick and indexOf() would
   *  make that quadratic in the number of stops. */
  private optionIndexMap = new Map<any, number>();

  /** Resolves to the `<input role="combobox">` when `searchable`, and to the
   *  `<button>` otherwise — whichever one Bootstrap treats as the toggle. NOT
   *  `static: true` any more: the two live in different `@if` branches, and a
   *  static query runs before those are evaluated, so it would resolve to
   *  undefined for both. */
  @ViewChild('dropdownButton') dropdownButton?: ElementRef<HTMLElement>;

  /** trackBy MUST be an arrow-function class property — a bare method passed as
   *  [trackBy] loses its `this` binding when Angular invokes it detached. */
  trackByOptionId = (_: number, option: any): unknown => option?.id;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  private unlistenShown?: () => void;
  private unlistenHidden?: () => void;
  /** Live only while the combobox panel is open — see the shown/hidden handlers. */
  private unlistenDocumentClick?: () => void;
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
    }
    // `searchable` is included deliberately: applyFilter()'s first branch keys
    // off it, so a call site that ever binds it dynamically (rather than to a
    // static literal, as all 7 do today) would otherwise leave displayList
    // stuck on the last filtered result after searchable flips to false.
    if (changes['options'] || changes['searchable']) {
      this.applyFilter();
    }

    // Runs for the `[value]` @Input() path only. The reactive-forms path never
    // reaches here (writeValue() is not an input binding, so no SimpleChange is
    // produced) — writeValue() calls the same resolver directly. Both paths must
    // keep going through resolveSelectedValue(), never re-implement it (OBRS-916).
    this.resolveSelectedValue();
  }

  /**
   * Resolves `selectedValue` (the option OBJECT the template renders) from
   * `value` (the option ID the component accepts from either binding path).
   *
   * Shared by `ngOnChanges` and `writeValue` — the whole OBRS-916 defect was
   * that this logic lived inside `ngOnChanges` alone, so a `formControlName`
   * value landed in `this.value` and was never resolved: the trigger kept
   * rendering `.is-placeholder` + "เลือกต้นทาง" while the control held a real
   * station. After OBRS-901 that reads as a confident lie rather than as a
   * blank box, which is why it is fixed here rather than left latent.
   */
  private resolveSelectedValue(): void {
    const options = this.getOptions();

    // Deliberately NOT `!this.value`: id `0` is a legitimate option id and must
    // not be read as "nothing selected". Only a genuinely absent value clears.
    if (this.value === null || this.value === undefined || this.value === '') {
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
    // element (this._element in bootstrap.js), not the host and not
    // .dropdown-menu — listening anywhere else silently never fires.
    const btn = this.dropdownButton?.nativeElement;
    if (!btn) return;
    this.unlistenShown = this.renderer.listen(btn, 'shown.bs.dropdown', () => {
      this.isDropdownOpen = true;
      if (!this.searchable) return;
      // Focus the trigger, which IS the text box when searchable. It is usually
      // focused already (the customer clicked it), but not when the panel was
      // opened from the keyboard — and an open panel nobody can type into is the
      // whole defect this card exists to fix, so it is asserted, not assumed.
      btn.focus();
      // Bootstrap's own outside-click close (`clearMenus`) only looks at elements
      // carrying `data-bs-toggle="dropdown"`, and this trigger deliberately does
      // not (see the template). Owning the open means owning the close too.
      // Registered only while the panel is open, so six of these on a page cost
      // one document listener, not six.
      this.unlistenDocumentClick?.();
      this.unlistenDocumentClick = this.renderer.listen('document', 'click', (event: Event) =>
        this.onDocumentClick(event)
      );
    });
    this.unlistenHidden = this.renderer.listen(btn, 'hidden.bs.dropdown', () => {
      this.isDropdownOpen = false;
      this.searchQuery = '';
      this.activeIndex = -1;
      this.unlistenDocumentClick?.();
      this.unlistenDocumentClick = undefined;
      this.applyFilter();
      // Closing the panel is this control's blur — the only moment that means
      // "the user has finished with this field". Without it `onTouched` was
      // registered and never called, so a required-station validator could
      // never show its error (OBRS-916 R4).
      this.onTouched();
    });
  }

  onSearchInput(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.applyFilter();
    // Typing into a closed field must open the list. Bootstrap opens on CLICK,
    // so a customer who reaches the field with Tab and starts typing would
    // otherwise filter a panel they cannot see (OBRS-1224).
    if (this.searchable && !this.isDropdownOpen) {
      this.bootstrapDropdown()?.show();
    }
  }

  /**
   * OBRS-1224. Clicking the field OPENS the panel; clicking it again while open
   * leaves it open, because while open this is a text box the customer may need
   * to click into — to fix a typo, to place the caret, to select a word. A
   * toggle would close the list under them and (via the hidden handler) throw
   * their query away.
   */
  onTriggerClick(): void {
    if (this.searchable && !this.isDropdownOpen && !this.isDisabled) {
      this.bootstrapDropdown()?.show();
    }
  }

  /**
   * Focus opens the panel too, and it is not a nicety: while the panel is CLOSED
   * the box holds the chosen station, so someone who arrives by Tab and starts
   * typing would append to that station's name and filter on "Bangkokx" — a
   * query matching nothing, in a list they cannot see. Opening on focus empties
   * the box first (the shown handler does that), so the first keystroke is the
   * first character of the query no matter how the customer got here.
   */
  onTriggerFocus(): void {
    if (this.searchable && !this.isDropdownOpen && !this.isDisabled) {
      this.bootstrapDropdown()?.show();
    }
  }

  /**
   * The outside-click close Bootstrap's `clearMenus` would have given us if this
   * trigger carried `data-bs-toggle`. Registered only while the panel is open.
   *
   * The containment test covers BOTH the field and the panel, and it has to: the
   * very click that opens the panel is still travelling when this listener is
   * registered (`shown.bs.dropdown` fires inside `show()`, synchronously, from
   * the click handler), so without it the panel would close on the click that
   * just opened it.
   */
  private onDocumentClick(event: Event): void {
    if (!this.isDropdownOpen) return;
    const trigger = this.dropdownButton?.nativeElement;
    const target = event.target as Node | null;
    if (!trigger || !target) return;
    const menu = trigger.parentElement?.querySelector('.dropdown-menu') ?? null;
    if (trigger.contains(target) || menu?.contains(target)) return;
    this.bootstrapDropdown()?.hide();
  }

  /**
   * Keyboard model for the combobox: ArrowDown/ArrowUp walk the rendered
   * options, Enter takes the active one.
   *
   * Escape is handled here rather than left to Bootstrap: its keydown data-api
   * only fires for elements carrying `data-bs-toggle`, which this one does not
   * (see the template). AC#3 names Escape explicitly, so it is a case in both
   * this spec's unit tests and the e2e measurement, not an inherited assumption.
   */
  onTriggerKeydown(event: KeyboardEvent): void {
    if (!this.searchable || this.isDisabled) return;

    if (event.key === 'Escape' && this.isDropdownOpen) {
      event.preventDefault();
      this.bootstrapDropdown()?.hide();
      return;
    }

    // Tab moves focus out of the field, so the panel it belongs to has to go
    // with it — handled on keydown rather than on blur because a blur fires when
    // the customer presses the mouse on an OPTION too, and closing there would
    // remove the option before the click could land on it.
    if (event.key === 'Tab' && this.isDropdownOpen) {
      this.bootstrapDropdown()?.hide();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Without this the caret jumps to one end of the query text on every
      // arrow press, so navigating the list would silently move the insertion
      // point the next keystroke lands on.
      event.preventDefault();
      if (!this.isDropdownOpen) {
        this.bootstrapDropdown()?.show();
        return;
      }
      this.moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' && this.isDropdownOpen && this.activeIndex >= 0) {
      // Only with an active option. With none, Enter is left to whatever form
      // the field sits in — every call site has a Search button, and swallowing
      // its submit would be a regression this card was not asked for.
      event.preventDefault();
      // setCurrentValue() closes the panel itself — the same path a mouse click
      // on the option takes, so keyboard and mouse cannot drift apart.
      this.setCurrentValue(this.visibleOptions[this.activeIndex]);
    }
  }

  private moveActiveOption(step: number): void {
    const total = this.visibleOptions.length;
    if (total === 0) {
      this.activeIndex = -1;
      return;
    }
    this.activeIndex =
      this.activeIndex < 0
        ? step > 0
          ? 0
          : total - 1
        : (this.activeIndex + step + total) % total;

    // `block: 'nearest'` scrolls the panel only when the option is actually out
    // of view — 'start'/'center' would yank the list on every arrow press.
    const active = this.activeOptionId ? document.getElementById(this.activeOptionId) : null;
    active?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Bootstrap is loaded as a global script (`angular.json` -> scripts), NOT as an
   * ES import. Importing `bootstrap` here would bundle a SECOND copy whose
   * data-api handlers register a second time, so every toggle would fire twice.
   * Reading the global keeps one instance; returning null when it is absent
   * keeps the component constructible in a unit test that never loaded it.
   */
  private bootstrapDropdown(): { show(): void; hide(): void } | null {
    const el = this.dropdownButton?.nativeElement;
    if (!el) return null;
    const api = (
      window as unknown as {
        bootstrap?: {
          Dropdown?: { getOrCreateInstance(element: Element): { show(): void; hide(): void } };
        };
      }
    ).bootstrap;
    return api?.Dropdown?.getOrCreateInstance(el) ?? null;
  }

  setCurrentValue(data: any): void {
    this.selectedValue = data;
    // `value` is kept in step with `selectedValue` so a later resolve (options
    // arriving late, a language change) re-derives the SAME option instead of
    // reverting to whatever the previous binding said.
    this.value = this.toControlValue(data);

    // The (currentValue) @Output() keeps emitting the OPTION OBJECT — all 7
    // existing call sites bind [value] + (currentValue) and read `$event.id`.
    this.currentValue.emit(data);
    // The CVA channel emits the option ID instead: it must be the same shape
    // writeValue() accepts, or the component cannot round-trip its own output
    // (OBRS-916 R3). Two channels, two shapes, on purpose.
    this.onChange(this.value);

    // Picking an option ends the interaction. On the button branch Bootstrap's
    // `clearMenus` closes the panel for us; the combobox trigger is outside that
    // machinery by design (see the template), so it closes its own panel — and
    // has to, or the list would sit open over a field that already has its
    // answer (OBRS-1224).
    if (this.searchable && this.isDropdownOpen) {
      this.bootstrapDropdown()?.hide();
    }
  }

  /**
   * The CVA-side counterpart of `[value]`. Angular calls this directly, WITHOUT
   * producing a SimpleChange, so the resolve has to happen here — see
   * `resolveSelectedValue()`.
   */
  writeValue(value: any): void {
    this.value = value;
    this.resolveSelectedValue();
  }

  /** An option id is what both binding paths accept; an option that carries no
   *  `id` cannot round-trip, so it is passed through untouched rather than
   *  silently collapsing to null. */
  private toControlValue(option: any): any {
    return option?.id ?? option ?? null;
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
    // A component destroyed with its panel open (route change, *ngIf) would
    // otherwise leave a document-level listener behind holding this instance.
    this.unlistenDocumentClick?.();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Non-optional on purpose: a no-op here left `form.disable()` cosmetic —
   *  the trigger button stayed operable and the user could still pick an option
   *  out of a disabled control (OBRS-916 R5). Writes the same field `[isDisabled]`
   *  writes; a call site must drive disabled-ness from ONE of the two, not both. */
  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

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

  /** id of the panel, for `aria-controls`. Derived from the same `label` the
   *  trigger id already uses, so the two can never drift apart. */
  get menuId(): string {
    return 'dropdownObrsMenu' + this.label;
  }

  optionDomId(index: number): string {
    return this.menuId + '-option-' + index;
  }

  optionIndex(option: any): number {
    return this.optionIndexMap.get(option) ?? -1;
  }

  get activeOptionId(): string | null {
    return this.activeIndex >= 0 ? this.optionDomId(this.activeIndex) : null;
  }

  /**
   * What the combobox input SHOWS.
   *
   * Open, it shows the query — which starts empty, so the customer can type
   * immediately instead of first deleting the station they already picked. The
   * previous pick is not lost: it moves to the placeholder (below) for as long
   * as the panel is open. Closed, it shows the selected station, which is the
   * exact text the `<button>` branch renders in `.value-text`.
   */
  get triggerText(): string {
    return this.isDropdownOpen ? this.searchQuery : this.getValue(this.selectedValue);
  }

  get triggerPlaceholder(): string {
    if (this.isDropdownOpen && this.selectedValue) {
      return this.getValue(this.selectedValue);
    }
    return this.promptText();
  }

  /** The accessible NAME of the combobox stays the field ("ต้นทาง"), never the
   *  chosen value — the value is already exposed as the input's own value. */
  get triggerAriaLabel(): string {
    return this.label ? this.translate.instant(this.label) : this.promptText();
  }

  /** The `<button>` branch builds this in the template with the translate pipe.
   *  An `<input>` needs a STRING for its placeholder attribute, so the same three
   *  cases are resolved here instead — same keys, same order, same precedence
   *  (explicit placeholder key > label-derived > generic), so OBRS-901's
   *  behaviour is one implementation reproduced in two renderers, not two
   *  behaviours that happen to agree today. */
  private promptText(): string {
    if (this.placeholder) {
      return this.translate.instant(this.placeholder);
    }
    if (this.label) {
      return this.translate.instant('SHARED.SELECT_PLACEHOLDER', {
        item: this.translate.instant(this.label),
      });
    }
    return this.translate.instant('SHARED.SELECT_PLACEHOLDER_GENERIC');
  }

  isGroupedOptions(): boolean {
    const options = this.getOptions();
    if (options.length === 0) return false;
    return Array.isArray(options[0]?.stations);
  }

  private getOptions(): any[] {
    return Array.isArray(this.options) ? this.options : [];
  }

  /** Precompute a lowercased searchKey per SELECTABLE option ONCE — matched
   *  against the same localized string getValue()/the template renders, never a
   *  raw field, so a query never matches text the user can't see.
   *
   *  OBRS-1212: grouped input is keyed on the STATIONS, not on the groups. A
   *  group header is a heading, not something the customer can pick — keying it
   *  too would let "ชลบุรี" match a heading and leave the list under it empty. */
  private rebuildSearchKeys(): void {
    this.searchKeyMap = new Map<any, string>();
    const grouped = this.isGroupedOptions();
    for (const option of this.getOptions()) {
      if (grouped) {
        for (const station of this.getGroupStations(option)) {
          this.searchKeyMap.set(station, this.normalize(this.getValue(station)));
        }
        continue;
      }
      this.searchKeyMap.set(option, this.normalize(this.getValue(option)));
    }
  }

  /** Recomputes displayList into a plain field — called from onSearchInput,
   *  ngOnChanges (options change) and the translate.onLangChange handler.
   *  Never called from the template. */
  private applyFilter(): void {
    const options = this.getOptions();
    const q = this.normalize(this.searchQuery);
    const grouped = this.isGroupedOptions();

    if (!this.searchable || !q) {
      this.displayList = grouped ? [] : options;
      this.displayGroups = grouped
        ? options.map((group) => ({ group, stations: this.getGroupStations(group) }))
        : [];
      this.showNoSearchResults = false;
      this.reindexVisibleOptions();
      return;
    }

    if (grouped) {
      const views: DropdownGroupView[] = [];
      let total = 0;
      for (const group of options) {
        const stations = this.getGroupStations(group);
        total += stations.length;
        const matched = stations.filter(
          (station) => (this.searchKeyMap.get(station) ?? '').includes(q)
        );
        // A group whose every child was filtered out is DROPPED, not rendered
        // empty: a province heading with nothing under it reads as "no stops
        // here match", which is a different — and false — statement from "this
        // province has no stops at all" (AC#2).
        if (matched.length > 0) {
          views.push({ group, stations: matched });
        }
      }

      this.displayList = [];
      this.displayGroups = views;
      this.showNoSearchResults = total > 0 && views.length === 0;
      this.reindexVisibleOptions();
      return;
    }

    const filtered = options.filter((option) => (this.searchKeyMap.get(option) ?? '').includes(q));

    this.displayList = filtered;
    this.displayGroups = [];
    this.showNoSearchResults = options.length > 0 && filtered.length === 0;
    this.reindexVisibleOptions();
  }

  /** Rebuilds `visibleOptions` + `optionIndexMap` from whichever branch just
   *  rendered, and drops the keyboard highlight.
   *
   *  Resetting `activeIndex` here is the point, not housekeeping: it is indexed
   *  into a list that just changed, so keeping it would leave Enter selecting a
   *  DIFFERENT station from the one highlighted before the keystroke that
   *  refiltered the list (OBRS-1224). */
  private reindexVisibleOptions(): void {
    this.visibleOptions = this.displayGroups.length
      ? this.displayGroups.flatMap((entry) => entry.stations)
      : this.displayList;

    this.optionIndexMap = new Map<any, number>();
    this.visibleOptions.forEach((option, index) => this.optionIndexMap.set(option, index));
    this.activeIndex = -1;
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

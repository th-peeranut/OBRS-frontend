import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DropdownGroupObrsComponent } from './dropdown-group-obrs.component';
import { createTranslateStub } from '../../../testing/test-stubs';

// Fixtures shaped like the REAL `GET /api/stops` response (StationApi,
// shared/interfaces/station.interface.ts) — flat, no `stations` field. Per
// UX-OBRS-562 §1, isGroupedOptions() is always false at runtime for this
// data; the grouped branch is intentionally left untested here.
const STATION_OPTIONS = [
  {
    id: 1,
    slug: 'bangkok-mochit',
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
    display: [
      { locale: 'th', label: 'สถานีหมอชิต' },
      { locale: 'en', label: 'Bangkok Mo Chit Station' },
    ],
  },
  {
    id: 2,
    slug: 'chiangmai-arcade',
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
    display: [
      { locale: 'th', label: 'สถานีเชียงใหม่อาเขต' },
      { locale: 'en', label: 'Chiang Mai Arcade Station' },
    ],
  },
];

describe('DropdownGroupObrsComponent', () => {
  describe('smoke', () => {
    it('should create (direct construction, constructor DI only)', () => {
      const component = new DropdownGroupObrsComponent(
        {} as never,
        createTranslateStub()
      );
      expect(component).toBeTruthy();
    });
  });

  describe('rendered behavior', () => {
    let fixture: ComponentFixture<DropdownGroupObrsComponent>;
    let component: DropdownGroupObrsComponent;

    function setup(searchable: boolean): void {
      TestBed.configureTestingModule({
        imports: [DropdownGroupObrsComponent, TranslateModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(DropdownGroupObrsComponent);
      component = fixture.componentInstance;
      // fixture.componentRef.setInput(...) (not a bare property assignment) —
      // a bare `component.options = STATION_OPTIONS` does NOT run ngOnChanges
      // when the component is created directly via TestBed (no host template
      // binding drives it), so the searchKey/displayList precompute in
      // ngOnChanges would silently never fire.
      fixture.componentRef.setInput('label', 'START_STATION');
      fixture.componentRef.setInput('isBorder', true);
      fixture.componentRef.setInput('isLabel', true);
      fixture.componentRef.setInput('searchable', searchable);
      fixture.componentRef.setInput('options', STATION_OPTIONS);
      // Real focus() only moves document.activeElement for an element that
      // is actually attached to the document.
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    }

    afterEach(() => {
      fixture.nativeElement.remove();
    });

    function searchInput(): HTMLInputElement | null {
      return fixture.nativeElement.querySelector('.dropdown-search-input');
    }

    function typeQuery(value: string): void {
      const input = searchInput()!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    describe('searchable = true (station pickers)', () => {
      beforeEach(() => setup(true));

      it('matches a substring anywhere in the localized label, not just a prefix', () => {
        // "Chit" is mid-word inside "Bangkok Mo Chit Station" — a prefix-only
        // match would miss it.
        typeQuery('Chit');
        expect(component.displayList.map((o) => o.id)).toEqual([1]);
      });

      it('matches case-insensitively', () => {
        typeQuery('BANGKOK');
        expect(component.displayList.map((o) => o.id)).toEqual([1]);
      });

      it('matches against the LOCALIZED string the template renders, not a raw hidden field', () => {
        // currentLang defaults to unset -> the component's own `=== 'th'`
        // check resolves that to English, so the Thai label is never
        // rendered on screen — searching its raw text must not match.
        typeQuery('หมอชิต');
        expect(component.displayList).toEqual([]);
        expect(component.showNoSearchResults).toBeTrue();
      });

      it('re-keys against the newly active language on translate.onLangChange (list already loaded)', () => {
        // Real TranslateService.use() — exercises the actual onLangChange
        // plumbing, not a stub subject.
        component.translate.use('th');
        fixture.detectChanges();

        typeQuery('หมอชิต');
        expect(component.displayList.map((o) => o.id)).toEqual([1]);
      });

      it('clears the query and resets the list when the panel closes (hidden.bs.dropdown)', async () => {
        // AC: "คำค้นถูกล้าง ... และค่าที่เลือกไว้เดิมยังคงอยู่" — the close reset
        // must clear the query WITHOUT dropping the already-selected option.
        component.setCurrentValue(STATION_OPTIONS[1]);
        typeQuery('Chit');
        expect(component.displayList.length).toBe(1);

        const button = fixture.nativeElement.querySelector('button.dropdown-btn');
        button.dispatchEvent(new Event('hidden.bs.dropdown'));
        fixture.detectChanges();

        expect(component.searchQuery).toBe('');
        expect(component.isDropdownOpen).toBeFalse();
        expect(component.displayList.map((o) => o.id)).toEqual([1, 2]);
        // Assert the RENDERED input too, not just the field — clearing
        // searchQuery only wipes the visible box via the [ngModel] binding,
        // and a field-only assertion stays green if that binding is dropped
        // (user would see stale query text over a full list). NgModel defers
        // its write-back to a microtask (resolvedPromise.then in
        // NgModel#_updateValue), so this needs whenStable, not detectChanges.
        await fixture.whenStable();
        expect(searchInput()!.value).toBe('');
        expect(component.selectedValue).toBe(STATION_OPTIONS[1]);
      });

      it('focuses the search input and sets isDropdownOpen on shown.bs.dropdown, fired on the TOGGLE BUTTON', () => {
        // Spy on .focus() rather than asserting document.activeElement —
        // headless/iframe test runners don't reliably grant real window
        // focus, which would make this assertion flaky for reasons
        // unrelated to the component under test.
        const focusSpy = spyOn(searchInput()!, 'focus');
        const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.dropdown-btn');
        button.dispatchEvent(new Event('shown.bs.dropdown'));
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeTrue();
        expect(focusSpy).toHaveBeenCalled();
      });

      it('does nothing when shown.bs.dropdown is dispatched on the menu or host instead of the button', () => {
        const menu: HTMLUListElement = fixture.nativeElement.querySelector('.dropdown-menu');
        menu.dispatchEvent(new Event('shown.bs.dropdown'));
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeFalse();
      });

      it('stops a click landing on the search row PADDING (not the input) from bubbling to close the panel', () => {
        const row: HTMLLIElement = fixture.nativeElement.querySelector('.dropdown-search-row');
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        spyOn(event, 'stopPropagation');

        row.dispatchEvent(event);

        expect(event.stopPropagation).toHaveBeenCalled();
      });

      it('binds aria-labelledby to the SAME id as the toggle button (not the dangling static value)', () => {
        const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.dropdown-btn');
        const menu: HTMLUListElement = fixture.nativeElement.querySelector('.dropdown-menu');

        expect(menu.getAttribute('aria-labelledby')).toBe(button.id);
      });

      it('trackByOptionId is a bound arrow function usable detached from the instance', () => {
        const detached = component.trackByOptionId;
        expect(detached(0, { id: 42 })).toBe(42);
      });
    });

    describe('searchable = false (default — e.g. parcel-trip-form scheduleId picker)', () => {
      beforeEach(() => setup(false));

      it('renders no search row and no filter input at all', () => {
        expect(fixture.nativeElement.querySelector('.dropdown-search-row')).toBeNull();
        expect(searchInput()).toBeNull();
      });

      it('renders the full, unfiltered option list', () => {
        expect(component.displayList.map((o: any) => o.id)).toEqual([1, 2]);
      });
    });
  });

  // OBRS-901: before this, the trigger rendered `getValue(null)` === '' — a box
  // with nothing in it, which reads as an empty TEXT INPUT and sent users typing
  // into a <button>. Every case here asserts the RENDERED trigger text, because
  // that is the surface that was broken; a field-only assertion would stay green
  // if the template binding were dropped again.
  describe('placeholder shown while nothing is selected', () => {
    let fixture: ComponentFixture<DropdownGroupObrsComponent>;
    let translate: TranslateService;

    // Real translations, not the bare key — the defect is what the USER reads,
    // and `label`-interpolation ("เลือก" + "ต้นทาง") is exactly the part that
    // an untranslated stub would hide.
    const TH = {
      SHARED: {
        SELECT_PLACEHOLDER: 'เลือก{{item}}',
        SELECT_PLACEHOLDER_GENERIC: 'เลือก',
      },
      HOME: { HOME_BOOKING: { START_STATION: 'ต้นทาง' } },
      CUSTOM: { PICK_A_STOP: 'ระบุจุดจอด' },
    };
    const EN = {
      SHARED: {
        SELECT_PLACEHOLDER: 'Select {{item}}',
        SELECT_PLACEHOLDER_GENERIC: 'Select',
      },
      HOME: { HOME_BOOKING: { START_STATION: 'Source' } },
      CUSTOM: { PICK_A_STOP: 'Pick a stop' },
    };

    function setup(inputs: Record<string, unknown> = {}): void {
      TestBed.configureTestingModule({
        imports: [DropdownGroupObrsComponent, TranslateModule.forRoot()],
      }).compileComponents();

      translate = TestBed.inject(TranslateService);
      translate.setTranslation('th', TH);
      translate.setTranslation('en', EN);
      translate.use('th');

      fixture = TestBed.createComponent(DropdownGroupObrsComponent);
      fixture.componentRef.setInput('isBorder', true);
      fixture.componentRef.setInput('options', STATION_OPTIONS);
      for (const [key, value] of Object.entries(inputs)) {
        fixture.componentRef.setInput(key, value);
      }
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    }

    afterEach(() => {
      fixture.nativeElement.remove();
    });

    function valueText(): HTMLElement {
      return fixture.nativeElement.querySelector('.value-text');
    }

    it('renders the label-derived prompt instead of an empty box (the reported defect)', () => {
      setup({ label: 'HOME.HOME_BOOKING.START_STATION' });

      expect(valueText().textContent!.trim()).toBe('เลือกต้นทาง');
      // The old markup produced ''. Assert non-empty explicitly so a future
      // regression to a blank trigger fails on its own terms, not incidentally.
      expect(valueText().textContent!.trim().length).toBeGreaterThan(0);
    });

    it('marks the prompt with .is-placeholder so it is styled as muted, not as a chosen value', () => {
      setup({ label: 'HOME.HOME_BOOKING.START_STATION' });

      expect(valueText().classList).toContain('is-placeholder');
    });

    it('CONTROL: once a value is selected it renders the station name and drops .is-placeholder', () => {
      setup({ label: 'HOME.HOME_BOOKING.START_STATION', value: 1 });

      expect(valueText().textContent!.trim()).toBe('สถานีหมอชิต');
      expect(valueText().classList).not.toContain('is-placeholder');
    });

    it('falls back to the generic prompt when the call site passes no label (parcel scheduleId picker)', () => {
      setup();

      expect(valueText().textContent!.trim()).toBe('เลือก');
    });

    it('honours an explicit placeholder KEY over the label-derived one', () => {
      setup({ label: 'HOME.HOME_BOOKING.START_STATION', placeholder: 'CUSTOM.PICK_A_STOP' });

      expect(valueText().textContent!.trim()).toBe('ระบุจุดจอด');
    });

    it('follows a LIVE language switch with no reload', () => {
      setup({ label: 'HOME.HOME_BOOKING.START_STATION' });
      expect(valueText().textContent!.trim()).toBe('เลือกต้นทาง');

      translate.use('en');
      fixture.detectChanges();

      expect(valueText().textContent!.trim()).toBe('Select Source');
    });

    // The station lists are NOT available on the first render: home-booking and
    // parcel-trip-form both bind `[value]` from a form control that can already
    // hold an id while `[options]` is still the initial `[]` waiting on
    // `GET /api/stops`. ngOnChanges resolves `selectedValue` by searching
    // `options` for `value`, so during that window a BOUND value resolves to
    // null and the trigger takes the placeholder branch. This pins both halves:
    // the prompt during the window, and that it is replaced (not merely
    // re-styled) the moment the options land.
    it('shows the prompt while `value` is bound but `options` have not arrived, then drops it when they do', () => {
      setup({ label: 'HOME.HOME_BOOKING.START_STATION', options: [], value: 1 });

      expect(valueText().textContent!.trim()).toBe('เลือกต้นทาง');
      expect(valueText().classList).toContain('is-placeholder');

      fixture.componentRef.setInput('options', STATION_OPTIONS);
      fixture.detectChanges();

      expect(valueText().textContent!.trim()).toBe('สถานีหมอชิต');
      expect(valueText().classList).not.toContain('is-placeholder');
    });

    // The reverse transition. `.is-placeholder` is applied by a binding, not by
    // an ngIf that recreates the node, so a stale class on a re-used element is
    // a real failure mode — and the selected -> cleared direction is the one no
    // other case walks.
    it('returns to the prompt when the selection is cleared (value -> null)', () => {
      setup({ label: 'HOME.HOME_BOOKING.START_STATION', value: 1 });
      expect(valueText().textContent!.trim()).toBe('สถานีหมอชิต');
      expect(valueText().classList).not.toContain('is-placeholder');

      fixture.componentRef.setInput('value', null);
      fixture.detectChanges();

      expect(valueText().textContent!.trim()).toBe('เลือกต้นทาง');
      expect(valueText().classList).toContain('is-placeholder');
    });
  });
});

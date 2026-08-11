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

    // OBRS-1224: the box you type into is the TRIGGER now, not a row inside the
    // panel. Every helper below deliberately looks for it where a customer looks
    // for it — at the field — so a regression that puts a second box back in the
    // panel cannot satisfy these tests.
    function searchInput(): HTMLInputElement | null {
      return fixture.nativeElement.querySelector('input.dropdown-combo-input');
    }

    function toggleElement(): HTMLElement {
      return fixture.nativeElement.querySelector('.dropdown-btn');
    }

    function typeQuery(value: string): void {
      const input = searchInput()!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    function openPanel(): void {
      toggleElement().dispatchEvent(new Event('shown.bs.dropdown'));
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

      it('clears the query and resets the list when the panel closes (hidden.bs.dropdown)', () => {
        // AC: "คำค้นถูกล้าง ... และค่าที่เลือกไว้เดิมยังคงอยู่" — the close reset
        // must clear the query WITHOUT dropping the already-selected option.
        openPanel();
        component.setCurrentValue(STATION_OPTIONS[1]);
        typeQuery('Chit');
        expect(component.displayList.length).toBe(1);

        toggleElement().dispatchEvent(new Event('hidden.bs.dropdown'));
        fixture.detectChanges();

        expect(component.searchQuery).toBe('');
        expect(component.isDropdownOpen).toBeFalse();
        expect(component.displayList.map((o) => o.id)).toEqual([1, 2]);
        // Assert the RENDERED box too, not just the field — a field-only
        // assertion stays green if the [value] binding is dropped, and the
        // customer would be left looking at their stale query over a full list.
        // Closed, that box shows the SELECTED station: this is the trigger now,
        // so "cleared" means "back to showing the value", not "empty".
        expect(searchInput()!.value).toBe('Chiang Mai Arcade Station');
        expect(component.selectedValue).toBe(STATION_OPTIONS[1]);
      });

      it('focuses the trigger and sets isDropdownOpen on shown.bs.dropdown, fired on the TOGGLE', () => {
        // Spy on .focus() rather than asserting document.activeElement —
        // headless/iframe test runners don't reliably grant real window
        // focus, which would make this assertion flaky for reasons
        // unrelated to the component under test.
        const focusSpy = spyOn(searchInput()!, 'focus');
        toggleElement().dispatchEvent(new Event('shown.bs.dropdown'));
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeTrue();
        expect(focusSpy).toHaveBeenCalled();
      });

      it('does nothing when shown.bs.dropdown is dispatched on the menu or host instead of the toggle', () => {
        const menu: HTMLUListElement = fixture.nativeElement.querySelector('.dropdown-menu');
        menu.dispatchEvent(new Event('shown.bs.dropdown'));
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeFalse();
      });

      it('binds aria-labelledby to the SAME id as the toggle (not the dangling static value)', () => {
        const menu: HTMLUListElement = fixture.nativeElement.querySelector('.dropdown-menu');

        expect(menu.getAttribute('aria-labelledby')).toBe(toggleElement().id);
      });

      it('trackByOptionId is a bound arrow function usable detached from the instance', () => {
        const detached = component.trackByOptionId;
        expect(detached(0, { id: 42 })).toBe(42);
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // OBRS-1224 — the trigger IS the search box.
    //
    // The defect these cases pin was never "there is no way to filter": the
    // filter existed and worked. It was WHERE it appeared — a sticky row at the
    // top of a panel that Popper flips upward on desktop, measured 525-585 px
    // above the field on prod. So the assertions below are about the box's
    // IDENTITY (it is the toggle) and about there being exactly one of them; a
    // fix that filters correctly from a second box in the panel is the bug.
    // ─────────────────────────────────────────────────────────────────────────
    describe('combobox trigger (OBRS-1224)', () => {
      beforeEach(() => setup(true));

      it('the toggle IS an input with role=combobox — there is no second box in the panel', () => {
        const toggle = toggleElement();

        expect(toggle.tagName).toBe('INPUT');
        expect(toggle.getAttribute('role')).toBe('combobox');
        // A LOAD-BEARING ABSENCE. Bootstrap's data-api is registered with
        // capture (`addEventListener(type, fn, isDelegated)`), so restoring this
        // attribute puts `Dropdown.toggle()` in front of every handler in this
        // component and a click into an open field closes the panel again. The
        // four interaction cases below would go red, but this says WHY first.
        expect(toggle.getAttribute('data-bs-toggle')).toBeNull();
        // The row this card removed. Its absence is half the fix: a search row
        // left behind would make the typeable trigger a THIRD box, not a move.
        expect(fixture.nativeElement.querySelector('.dropdown-search-row')).toBeNull();
        expect(fixture.nativeElement.querySelectorAll('input').length).toBe(1);
      });

      it('shows the selected station while closed, and the prompt while nothing is selected', () => {
        expect(searchInput()!.value).toBe('');
        expect(searchInput()!.getAttribute('placeholder')).toBe('SHARED.SELECT_PLACEHOLDER');

        component.setCurrentValue(STATION_OPTIONS[0]);
        fixture.detectChanges();

        expect(searchInput()!.value).toBe('Bangkok Mo Chit Station');
      });

      it('empties the box on open and keeps the current station visible as the placeholder', () => {
        // The alternative — leaving the station as TEXT — makes the customer
        // delete it before they can type, which is the friction this card is
        // about. Losing it entirely would make them forget what they picked.
        component.setCurrentValue(STATION_OPTIONS[0]);
        fixture.detectChanges();

        openPanel();

        expect(searchInput()!.value).toBe('');
        expect(searchInput()!.getAttribute('placeholder')).toBe('Bangkok Mo Chit Station');
        // ...and the list is NOT pre-filtered by the existing selection.
        expect(component.displayList.length).toBe(2);
      });

      it('restores the selected station in the box when the panel closes again', () => {
        component.setCurrentValue(STATION_OPTIONS[0]);
        openPanel();
        typeQuery('Chiang');
        expect(searchInput()!.value).toBe('Chiang');

        toggleElement().dispatchEvent(new Event('hidden.bs.dropdown'));
        fixture.detectChanges();

        expect(searchInput()!.value).toBe('Bangkok Mo Chit Station');
      });

      it('ArrowDown highlights the first option and points aria-activedescendant at it', () => {
        openPanel();

        searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        fixture.detectChanges();

        const options = fixture.nativeElement.querySelectorAll('.dropdown-option');
        expect(component.activeIndex).toBe(0);
        expect(options[0].classList).toContain('is-active-option');
        expect(searchInput()!.getAttribute('aria-activedescendant')).toBe(options[0].id);
        expect(options[0].id).toBeTruthy();
      });

      it('ArrowUp from nothing wraps to the LAST option', () => {
        openPanel();

        searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        fixture.detectChanges();

        expect(component.activeIndex).toBe(1);
      });

      it('Enter picks the highlighted option', () => {
        openPanel();
        const emitted: unknown[] = [];
        component.currentValue.subscribe((v) => emitted.push(v));

        searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        fixture.detectChanges();
        searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        fixture.detectChanges();

        expect(emitted).toEqual([STATION_OPTIONS[0]]);
      });

      // Must-NOT case: with no option highlighted, Enter belongs to the form the
      // field sits in (every call site has a Search button). Swallowing it would
      // be a regression this card was not asked for.
      it('Enter with nothing highlighted selects nothing', () => {
        openPanel();
        const emitted: unknown[] = [];
        component.currentValue.subscribe((v) => emitted.push(v));

        searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        fixture.detectChanges();

        expect(emitted).toEqual([]);
      });

      it('drops the highlight when the query changes the list under it', () => {
        // Otherwise index 0 of the OLD list is still highlighted while index 0
        // of the NEW list is what is rendered there — and Enter takes a station
        // the customer never aimed at.
        openPanel();
        searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        fixture.detectChanges();
        expect(component.activeIndex).toBe(0);

        typeQuery('Chiang');

        expect(component.activeIndex).toBe(-1);
        expect(searchInput()!.getAttribute('aria-activedescendant')).toBeNull();
      });

      it('exposes the panel as a listbox of options, wired to the trigger', () => {
        const menu: HTMLElement = fixture.nativeElement.querySelector('.dropdown-menu');
        const option: HTMLElement = fixture.nativeElement.querySelector('.dropdown-option');

        expect(menu.getAttribute('role')).toBe('listbox');
        expect(searchInput()!.getAttribute('aria-controls')).toBe(menu.id);
        expect(menu.id).toBeTruthy();
        expect(option.getAttribute('role')).toBe('option');
        expect(option.getAttribute('aria-selected')).toBe('false');
      });

      it('marks the chosen option aria-selected', () => {
        component.setCurrentValue(STATION_OPTIONS[0]);
        fixture.detectChanges();

        const options = fixture.nativeElement.querySelectorAll('.dropdown-option');
        expect(options[0].getAttribute('aria-selected')).toBe('true');
        expect(options[1].getAttribute('aria-selected')).toBe('false');
      });

      // The next four cases drive the REAL Bootstrap Dropdown loaded by
      // karma.conf's scripts, not a synthetic `shown.bs.dropdown` — because what
      // they are about IS the interaction with Bootstrap. Measured while writing
      // them: Bootstrap registers its data-api with
      // `addEventListener(type, fn, isDelegated)`, whose third argument is
      // CAPTURE, so with `data-bs-toggle` on this input its toggle ran on
      // `document` BEFORE any handler here and closed the panel on a click meant
      // to place the caret. That is why the trigger drives the Dropdown instance
      // instead, and why these assert the OUTCOME (is the panel still open)
      // rather than that some method was called.
      it('opens the panel when the closed field is clicked', () => {
        expect(component.isDropdownOpen).toBeFalse();

        searchInput()!.click();
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeTrue();
      });

      it('STAYS open when the field is clicked again — a customer clicking into their own query', () => {
        searchInput()!.click();
        fixture.detectChanges();

        searchInput()!.click();
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeTrue();
      });

      it('closes on a click outside the field and the panel', () => {
        searchInput()!.click();
        fixture.detectChanges();
        expect(component.isDropdownOpen).toBeTrue();

        document.body.click();
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeFalse();
      });

      it('closes on Escape (AC#3)', () => {
        searchInput()!.click();
        fixture.detectChanges();
        expect(component.isDropdownOpen).toBeTrue();

        searchInput()!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeFalse();
      });

      it('closes when an option is picked', () => {
        searchInput()!.click();
        fixture.detectChanges();

        (fixture.nativeElement.querySelector('.dropdown-option') as HTMLElement).click();
        fixture.detectChanges();

        expect(component.isDropdownOpen).toBeFalse();
        expect(component.selectedValue).toBe(STATION_OPTIONS[0]);
      });

      it('is disabled as an input when the control is disabled', () => {
        fixture.componentRef.setInput('isDisabled', true);
        fixture.detectChanges();

        expect((searchInput() as HTMLInputElement).disabled).toBeTrue();
      });
    });

    describe('searchable = false (default — e.g. parcel-trip-form scheduleId picker)', () => {
      beforeEach(() => setup(false));

      it('renders no search row and no filter input at all', () => {
        expect(fixture.nativeElement.querySelector('.dropdown-search-row')).toBeNull();
        expect(searchInput()).toBeNull();
        expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
      });

      it('keeps the plain BUTTON trigger — the OBRS-916 CVA contract is written against it', () => {
        const toggle = toggleElement();

        expect(toggle.tagName).toBe('BUTTON');
        expect(toggle.getAttribute('role')).toBeNull();
        expect(fixture.nativeElement.querySelector('.value-text')).not.toBeNull();
      });

      it('adds no listbox/option roles to a plain dropdown', () => {
        const menu: HTMLElement = fixture.nativeElement.querySelector('.dropdown-menu');
        const option: HTMLElement = fixture.nativeElement.querySelector('.dropdown-option');

        expect(menu.getAttribute('role')).toBeNull();
        expect(option.getAttribute('role')).toBeNull();
        expect(option.getAttribute('aria-selected')).toBeNull();
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

  /**
   * OBRS-1212: the grouped branch. It shipped with the component and had never
   * once executed — `isGroupedOptions()` is `Array.isArray(options[0]?.stations)`
   * and `/api/stops` has no such field — so everything below is a first
   * assertion, not a regression net.
   */
  describe('grouped options (OBRS-1212)', () => {
    let fixture: ComponentFixture<DropdownGroupObrsComponent>;
    let component: DropdownGroupObrsComponent;

    /** The shape `home-booking` now binds: province groups whose `stations` are
     *  the same StationApi objects the flat branch used to receive. */
    const GROUPED_OPTIONS = [
      {
        slug: 'chonburi',
        nameThai: 'ชลบุรี',
        nameEnglish: 'Chonburi',
        nameChinese: '春武里',
        stations: [STATION_OPTIONS[1]],
      },
      {
        slug: 'bangkok',
        nameThai: 'กรุงเทพมหานคร',
        nameEnglish: 'Bangkok',
        stations: [STATION_OPTIONS[0]],
      },
    ];

    function setupGrouped(options: unknown[] = GROUPED_OPTIONS): void {
      TestBed.configureTestingModule({
        imports: [DropdownGroupObrsComponent, TranslateModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(DropdownGroupObrsComponent);
      component = fixture.componentInstance;
      // `currentLang` is unset by default, and every label resolution in this
      // component keys off `=== 'th'` — leaving it unset renders the ENGLISH
      // labels, which is a real behaviour but not the one a Thai customer
      // sees, and it makes a Thai search term match nothing.
      TestBed.inject(TranslateService).use('th');
      fixture.componentRef.setInput('label', 'START_STATION');
      fixture.componentRef.setInput('searchable', true);
      fixture.componentRef.setInput('options', options);
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    }

    afterEach(() => fixture.nativeElement.remove());

    function headers(): string[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll('.dropdown-header') as NodeListOf<HTMLElement>
      ).map((el) => el.textContent!.trim());
    }

    function items(): string[] {
      return Array.from(
        fixture.nativeElement.querySelectorAll('.dropdown-option') as NodeListOf<HTMLElement>
      ).map((el) => el.textContent!.trim());
    }

    function typeQuery(value: string): void {
      // OBRS-1224: typed into the trigger, which is where the box lives now.
      const input: HTMLInputElement =
        fixture.nativeElement.querySelector('input.dropdown-combo-input');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('takes the grouped branch and renders a header per group', () => {
      setupGrouped();

      expect(component.isGroupedOptions()).toBeTrue();
      expect(headers()).toEqual(['ชลบุรี', 'กรุงเทพมหานคร']);
      expect(items()).toEqual(['สถานีเชียงใหม่อาเขต', 'สถานีหมอชิต']);
    });

    it('AC#2: the search box still filters — this is the branch that used to iterate the RAW list', () => {
      setupGrouped();

      typeQuery('เชียงใหม่');

      expect(items()).toEqual(['สถานีเชียงใหม่อาเขต']);
    });

    it('AC#2: a group whose every station was filtered out disappears WITH its header', () => {
      setupGrouped();

      typeQuery('เชียงใหม่');

      // The Bangkok heading must go too — a heading with nothing under it says
      // "this province has no stops", which is false.
      expect(headers()).toEqual(['ชลบุรี']);
    });

    it('AC#2: filters ACROSS groups, matching stations in more than one province at once', () => {
      setupGrouped();

      typeQuery('สถานี');

      expect(headers()).toEqual(['ชลบุรี', 'กรุงเทพมหานคร']);
      expect(items().length).toBe(2);
    });

    it('AC#2: a query matching only a GROUP NAME shows nothing — a heading is not selectable', () => {
      setupGrouped();

      typeQuery('ชลบุรี');

      expect(items()).toEqual([]);
      expect(component.showNoSearchResults).toBeTrue();
    });

    it('AC#2: clearing the query restores every group and every station', () => {
      setupGrouped();
      typeQuery('เชียงใหม่');
      typeQuery('');

      expect(headers()).toEqual(['ชลบุรี', 'กรุงเทพมหานคร']);
      expect(items().length).toBe(2);
    });

    it('AC#3: resolves a bound value to the station INSIDE a group — the grouped branch of resolveSelectedValue() that had never run', () => {
      setupGrouped();

      fixture.componentRef.setInput('value', STATION_OPTIONS[0].id);
      fixture.detectChanges();

      expect(component.selectedValue).toBe(STATION_OPTIONS[0]);
      // The trigger is the combobox input here (searchable = true), so the
      // rendered value is its `value`, not `.value-text`'s text (OBRS-1224).
      expect(
        (fixture.nativeElement.querySelector('input.dropdown-combo-input') as HTMLInputElement)
          .value
      ).toBe('สถานีหมอชิต');
    });

    it('AC#3: picking a station emits the station, not its group', () => {
      setupGrouped();
      const emitted: unknown[] = [];
      component.currentValue.subscribe((v) => emitted.push(v));

      (
        fixture.nativeElement.querySelectorAll('.dropdown-option')[0] as HTMLElement
      ).click();

      expect(emitted).toEqual([STATION_OPTIONS[1]]);
    });

    it('AC#9: renders the station label as-is, with no sequence number in front', () => {
      setupGrouped();

      for (const text of items()) {
        expect(text).not.toMatch(/^\s*\d+[.)\s]/);
      }
    });

    it('falls back to the flat branch when the options are plain stations, so a failed province lookup costs the headings and nothing else', () => {
      setupGrouped(STATION_OPTIONS);

      expect(component.isGroupedOptions()).toBeFalse();
      expect(headers()).toEqual([]);
      expect(items().length).toBe(2);
    });
  });
});

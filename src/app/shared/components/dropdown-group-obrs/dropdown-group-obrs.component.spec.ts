import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
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

      it('clears the query and resets the list when the panel closes (hidden.bs.dropdown)', () => {
        typeQuery('Chit');
        expect(component.displayList.length).toBe(1);

        const button = fixture.nativeElement.querySelector('button.dropdown-btn');
        button.dispatchEvent(new Event('hidden.bs.dropdown'));
        fixture.detectChanges();

        expect(component.searchQuery).toBe('');
        expect(component.isDropdownOpen).toBeFalse();
        expect(component.displayList.map((o) => o.id)).toEqual([1, 2]);
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
});

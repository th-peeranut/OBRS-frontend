import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { RouteDetailPanelComponent, SegmentDisplayLine } from './route-detail-panel.component';
import { AdminSharedModule } from '../../../admin-shared.module';
import { SegmentRow, StopPoint } from '../routes.mappers';

const STOP_A: StopPoint = {
  slug: 'stop-a',
  name: 'Stop A',
  distance: '0 km',
  duration: '0 mins',
  stopOrder: 1,
  offsetMinutesFromOrigin: 0,
};

function makeSegment(overrides: Partial<SegmentRow> = {}): SegmentRow {
  return {
    id: 1,
    origin: 'Alpha',
    destination: 'Beta',
    fare: 10,
    duration: '20 mins',
    estimatedDurationMinutes: 20,
    fromStopSlug: 'alpha',
    toStopSlug: 'beta',
    vehicleTypeSlug: 'van',
    vehicleTypeName: 'Van',
    ...overrides,
  };
}

/** `count` destinations under ONE origin, van only. */
function makeGroupOf(originSlug: string, count: number, startId = 1): SegmentRow[] {
  return Array.from({ length: count }, (_, index) =>
    makeSegment({
      id: startId + index,
      origin: originSlug.toUpperCase(),
      fromStopSlug: originSlug,
      destination: `dest-${index}`,
      toStopSlug: `${originSlug}-dest-${index}`,
      fare: 100 + index,
    })
  );
}

function makeTranslateStub(): TranslateService {
  // `instant` echoing the key is enough: every assertion below checks WHICH
  // string was chosen, never its Thai/English wording.
  return {
    onLangChange: new EventEmitter<unknown>(),
    instant: (key: string) => key,
  } as unknown as TranslateService;
}

// ── Plain-instance tests: getters, view-state, ngOnChanges logic ───────────
describe('RouteDetailPanelComponent (logic)', () => {
  function makeComponent(): RouteDetailPanelComponent {
    return new RouteDetailPanelComponent(makeTranslateStub());
  }

  /** Loads segments the way the parent does (settled load) so the derived view
   *  is built through the real code path. */
  function load(component: RouteDetailPanelComponent, segments: SegmentRow[]): void {
    component.allSegments = segments;
    component.ngOnChanges({ allSegments: {} as any });
  }

  function lines(component: RouteDetailPanelComponent): SegmentDisplayLine[] {
    return (component as any).pagedLines as SegmentDisplayLine[];
  }

  describe('pivot + grouping in the view', () => {
    it('renders ONE line per stop pair even when both vehicle types price it', () => {
      const component = makeComponent();
      load(component, [
        makeSegment({ id: 1, vehicleTypeSlug: 'van', fare: 100 }),
        makeSegment({ id: 2, vehicleTypeSlug: 'minibus', vehicleTypeName: 'Minibus', fare: 140 }),
      ]);

      const rowLines = lines(component).filter((line) => line.kind === 'row');
      expect(rowLines.length).toBe(1);
      expect((component as any).totalPairs).toBe(1);
      expect((component as any).vehicleTypeOptions.length).toBe(2);
    });

    it('columnCount is destination + duration + actions + one column per vehicle type', () => {
      const component = makeComponent();
      load(component, [
        makeSegment({ id: 1, vehicleTypeSlug: 'van' }),
        makeSegment({ id: 2, vehicleTypeSlug: 'minibus', vehicleTypeName: 'Minibus' }),
      ]);

      expect((component as any).columnCount).toBe(5);
    });
  });

  describe('display-line pagination', () => {
    it('counts GROUP HEADERS against the page budget, not just stop pairs', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 4));
      (component as any).onPageSizeChange('5');

      // 1 header + 4 rows = 5 lines = exactly one page.
      expect((component as any).displayLines.length).toBe(5);
      expect((component as any).totalPages).toBe(1);
      expect((component as any).shownPairs).toBe(4);
    });

    it('a collapsed group costs ONE line, so collapsing actually shortens the table', () => {
      const component = makeComponent();
      load(component, [...makeGroupOf('alpha', 6), ...makeGroupOf('gamma', 6, 100)]);
      (component as any).onPageSizeChange('5');

      expect((component as any).displayLines.length).toBe(14); // 2 headers + 12 rows

      (component as any).collapseAll();

      expect((component as any).displayLines.length).toBe(2);
      expect((component as any).totalPages).toBe(1);
      expect((component as any).shownPairs).toBe(0);
    });

    it('re-emits the owning group header marked "continued" when a page starts mid-group', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 10));
      (component as any).onPageSizeChange('5');
      (component as any).goToNextPage();

      const pageLines = lines(component);
      expect(pageLines[0].kind).toBe('group');
      expect(pageLines[0].kind === 'group' && pageLines[0].continued)
        .withContext('page 2 opens mid-group, so its header must be flagged as a continuation')
        .toBeTrue();
      expect(pageLines[0].kind === 'group' && pageLines[0].group.originSlug).toBe('alpha');
    });

    it('does not flag a continuation when the page starts on a real header', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 4));
      (component as any).onPageSizeChange('5');

      const pageLines = lines(component);
      expect(pageLines[0].kind === 'group' && pageLines[0].continued).toBeFalse();
    });

    it('page size "all" puts every line on one page', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 30));
      (component as any).onPageSizeChange('all');

      expect((component as any).pageSize).toBeNull();
      expect((component as any).pageSizeValue).toBe('all');
      expect((component as any).totalPages).toBe(1);
      expect(lines(component).length).toBe(31);
      expect((component as any).shownPairs).toBe(30);
    });

    it('defaults to 10 rows per page, not the old hardcoded 5', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 30));

      expect((component as any).pageSize).toBe(10);
      expect(lines(component).length).toBe(10);
    });

    it('clamps currentPage when a state change makes it unreachable', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 30));
      (component as any).onPageSizeChange('5');
      (component as any).currentPage = 7; // last page of 31 lines at size 5

      (component as any).onPageSizeChange('all');

      expect((component as any).currentPage).toBe(1);
      expect((component as any).totalPages).toBe(1);
    });

    it('goToNextPage/goToPreviousPage step within bounds only', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 9)); // 10 lines at size 5 = 2 pages
      (component as any).onPageSizeChange('5');

      (component as any).goToPreviousPage();
      expect((component as any).currentPage).toBe(1);

      (component as any).goToNextPage();
      expect((component as any).currentPage).toBe(2);

      (component as any).goToNextPage();
      expect((component as any).currentPage).toBe(2);
    });
  });

  describe('expand / collapse', () => {
    it('toggleGroup collapses and expands a single origin', () => {
      const component = makeComponent();
      load(component, [...makeGroupOf('alpha', 3), ...makeGroupOf('gamma', 3, 100)]);
      (component as any).onPageSizeChange('all');

      (component as any).toggleGroup('alpha');
      expect((component as any).isGroupCollapsed('alpha')).toBeTrue();
      expect((component as any).isGroupCollapsed('gamma')).toBeFalse();
      expect((component as any).shownPairs).toBe(3);

      (component as any).toggleGroup('alpha');
      expect((component as any).isGroupCollapsed('alpha')).toBeFalse();
      expect((component as any).shownPairs).toBe(6);
    });

    it('the two bulk buttons are disabled exactly when pressing them would do nothing', () => {
      const component = makeComponent();
      load(component, [...makeGroupOf('alpha', 3), ...makeGroupOf('gamma', 3, 100)]);

      // Nothing collapsed yet: only "collapse all" can do anything.
      expect((component as any).canExpandAll).toBeFalse();
      expect((component as any).canCollapseAll).toBeTrue();

      (component as any).toggleGroup('alpha');
      // Partially collapsed: BOTH are live. This is the state a single toggle
      // button cannot express, which is why there are two.
      expect((component as any).canExpandAll).toBeTrue();
      expect((component as any).canCollapseAll).toBeTrue();

      (component as any).collapseAll();
      expect((component as any).canExpandAll).toBeTrue();
      expect((component as any).canCollapseAll).toBeFalse();

      (component as any).expandAll();
      expect((component as any).canExpandAll).toBeFalse();
      expect((component as any).canCollapseAll).toBeTrue();
    });

    it('neither bulk button is live with no groups at all', () => {
      const component = makeComponent();
      load(component, []);

      expect((component as any).canExpandAll).toBeFalse();
      expect((component as any).canCollapseAll).toBeFalse();
    });
  });

  describe('search', () => {
    it('filters by origin or destination, case-insensitively', () => {
      const component = makeComponent();
      load(component, [
        makeSegment({
          id: 1,
          origin: 'Bangkok',
          fromStopSlug: 'bkk',
          destination: 'Chiang Mai',
          toStopSlug: 'cnx',
        }),
        makeSegment({
          id: 2,
          origin: 'Phuket',
          fromStopSlug: 'hkt',
          destination: 'Krabi',
          toStopSlug: 'kbv',
        }),
      ]);

      (component as any).segmentSearchTerm = 'krabi';
      (component as any).onSegmentSearchChange();

      expect((component as any).totalPairs).toBe(1);
      expect((component as any).groups.length).toBe(1);
    });

    it('expands every group while a keyword is live, so a match cannot hide inside a collapsed group', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 3));
      (component as any).onPageSizeChange('all');
      (component as any).collapseAll();
      expect((component as any).shownPairs).toBe(0);

      (component as any).segmentSearchTerm = 'dest-1';
      (component as any).onSegmentSearchChange();

      expect((component as any).isGroupCollapsed('alpha')).toBeFalse();
      expect((component as any).shownPairs).toBe(1);
    });

    it('restores the stored collapse state when the keyword is cleared', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 3));
      (component as any).onPageSizeChange('all');
      (component as any).collapseAll();

      (component as any).segmentSearchTerm = 'dest';
      (component as any).onSegmentSearchChange();
      (component as any).segmentSearchTerm = '';
      (component as any).onSegmentSearchChange();

      expect((component as any).isGroupCollapsed('alpha'))
        .withContext('a search must not silently discard what the user collapsed')
        .toBeTrue();
    });

    it('disables both bulk buttons while searching', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 3));
      (component as any).segmentSearchTerm = 'dest';
      (component as any).onSegmentSearchChange();

      expect((component as any).isSearching).toBeTrue();
      expect((component as any).canExpandAll).toBeFalse();
      expect((component as any).canCollapseAll).toBeFalse();
    });

    it('a group header toggled DURING a search does not silently apply once the keyword clears', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 3));
      (component as any).segmentSearchTerm = 'dest';
      (component as any).onSegmentSearchChange();

      (component as any).toggleGroup('alpha');

      (component as any).segmentSearchTerm = '';
      (component as any).onSegmentSearchChange();
      expect((component as any).isGroupCollapsed('alpha')).toBeFalse();
    });
  });

  describe('fare range formatting', () => {
    it('prints a single value when a group has one distinct fare and a range otherwise', () => {
      const component = makeComponent();

      expect(
        (component as any).formatFareRange({
          vehicleTypeSlug: 'van',
          vehicleTypeName: 'Van',
          min: 120,
          max: 120,
        })
        // OBRS-1592: through the one formatter now — no `.00` on a whole fare,
        // and the unit is part of the string. The stub reports `en`.
      ).toBe('THB 120');
      expect(
        (component as any).formatFareRange({
          vehicleTypeSlug: 'van',
          vehicleTypeName: 'Van',
          min: 120,
          max: 260,
        })
      ).toBe('THB 120 – THB 260');
    });

    it('prints the not-set label rather than 0.00 when a group has no fare for the type', () => {
      const component = makeComponent();

      expect(
        (component as any).formatFareRange({
          vehicleTypeSlug: 'minibus',
          vehicleTypeName: 'Minibus',
          min: null,
          max: null,
        })
      ).toBe('ADMIN.ROUTES.FARE_UNSET');
    });
  });

  describe('trackBy + formatFare delegates', () => {
    it('trackByStopSlug returns the stop slug', () => {
      const component = makeComponent();
      expect((component as any).trackByStopSlug(0, STOP_A)).toBe('stop-a');
    });

    it('trackByDisplayLine returns the line key', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 2));

      const [first] = lines(component);
      expect((component as any).trackByDisplayLine(0, first)).toBe(first.key);
    });

    it('formatFare delegates to the shared mapper (2 decimal places)', () => {
      const component = makeComponent();
      expect((component as any).formatFare(9.5)).toBe('THB 9.50');
    });
  });

  // Mirrors the original page's per-load reset block (see routes.mappers.ts
  // callers in loadRouteStructureBySlug pre-OBRS-213).
  describe('ngOnChanges reset behavior (parity with loadRouteStructureBySlug)', () => {
    it('resets currentPage to 1 and re-derives vehicleTypeOptions when allSegments changes', () => {
      const component = makeComponent();
      (component as any).currentPage = 3;
      load(component, [makeSegment({ id: 1, vehicleTypeSlug: 'van', vehicleTypeName: 'Van' })]);

      expect((component as any).currentPage).toBe(1);
      expect((component as any).vehicleTypeOptions).toEqual([{ slug: 'van', name: 'Van' }]);
    });

    it('clears the collapse state on a settled load (origin slugs are route-scoped)', () => {
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 3));
      (component as any).collapseAll();
      expect((component as any).isGroupCollapsed('alpha')).toBeTrue();

      load(component, makeGroupOf('alpha', 2, 50));

      expect((component as any).isGroupCollapsed('alpha')).toBeFalse();
    });

    it('does NOT reset segmentSearchTerm when allSegments changes (must persist across loads)', () => {
      const component = makeComponent();
      (component as any).segmentSearchTerm = 'bangkok';
      load(component, [makeSegment({ id: 1 })]);

      expect((component as any).segmentSearchTerm).toBe('bangkok');
    });

    it('ignores changes to other inputs (e.g. stops-only changes)', () => {
      const component = makeComponent();
      (component as any).currentPage = 3;

      component.ngOnChanges({ stops: {} as any });

      expect((component as any).currentPage).toBe(3);
    });

    it('while isDetailLoading is true, leaves the collapse state untouched', () => {
      // Parity guard: the parent clears allSegments to a fresh [] synchronously
      // before the fetch settles, which is a distinct reference change and
      // fires ngOnChanges a second time. Only the settled pass may reset.
      const component = makeComponent();
      load(component, makeGroupOf('alpha', 3));
      (component as any).collapseAll();

      component.isDetailLoading = true;
      component.allSegments = [];
      component.ngOnChanges({ allSegments: {} as any });

      expect((component as any).isGroupCollapsed('alpha')).toBeTrue();
      expect((component as any).vehicleTypeOptions).toEqual([]);
    });
  });

  describe('page size options', () => {
    it('offers 5/10/25/50/all with the "all" label translated', () => {
      const component = makeComponent();

      expect(
        (component as any).pageSizeOptions.map((option: { code: string }) => option.code)
      ).toEqual(['5', '10', '25', '50', 'all']);
      expect((component as any).pageSizeOptions[4].label).toBe('ADMIN.COMMON.ALL');
    });

    it('rebuilds the options on a language change (the "all" label is translated client-side)', () => {
      const translateStub = makeTranslateStub();
      const component = new RouteDetailPanelComponent(translateStub);
      const before = (component as any).pageSizeOptions;

      (translateStub.onLangChange as unknown as EventEmitter<unknown>).emit({});

      expect((component as any).pageSizeOptions)
        .withContext('a captured-once label would freeze at the locale active on first load')
        .not.toBe(before);
    });

    it('stops rebuilding after ngOnDestroy', () => {
      const translateStub = makeTranslateStub();
      const component = new RouteDetailPanelComponent(translateStub);
      component.ngOnDestroy();
      const after = (component as any).pageSizeOptions;

      (translateStub.onLangChange as unknown as EventEmitter<unknown>).emit({});

      expect((component as any).pageSizeOptions).toBe(after);
    });
  });
});

// ── Template-level tests: hasRoute gating, pivot columns, editSegment ──────
describe('RouteDetailPanelComponent (template)', () => {
  let fixture: ComponentFixture<RouteDetailPanelComponent>;
  let component: RouteDetailPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [RouteDetailPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RouteDetailPanelComponent);
    component = fixture.componentInstance;
  });

  function render(segments: SegmentRow[]): void {
    component.hasRoute = true;
    component.allSegments = segments;
    component.ngOnChanges({ allSegments: {} as any });
    fixture.detectChanges();
  }

  it('renders nothing when hasRoute is false', () => {
    component.hasRoute = false;
    component.stops = [STOP_A];
    component.allSegments = [makeSegment()];
    fixture.detectChanges();

    const section = fixture.debugElement.query(By.css('section'));
    expect(section)
      .withContext('detail section should not render when hasRoute is false')
      .toBeNull();
  });

  it('renders one group header row plus one row per stop pair', () => {
    render([
      makeSegment({ id: 1, toStopSlug: 'beta', destination: 'Beta' }),
      makeSegment({ id: 2, toStopSlug: 'gamma', destination: 'Gamma' }),
    ]);

    const groupRows = fixture.debugElement.queryAll(By.css('.admin-table tbody tr.group-row'));
    const allRows = fixture.debugElement.queryAll(By.css('.admin-table tbody tr'));
    expect(groupRows.length).toBe(1);
    expect(allRows.length).toBe(3);
  });

  it('renders one fare column per vehicle type, with a type badge on each', () => {
    render([
      makeSegment({ id: 1, vehicleTypeSlug: 'van', vehicleTypeName: 'Van', fare: 100 }),
      makeSegment({ id: 2, vehicleTypeSlug: 'minibus', vehicleTypeName: 'Minibus', fare: 140 }),
    ]);

    const badges = fixture.debugElement.queryAll(By.css('.admin-table thead .th-type'));
    expect(badges.map((badge) => badge.nativeElement.textContent.trim())).toEqual([
      'Van',
      'Minibus',
    ]);

    const headers = fixture.debugElement.queryAll(By.css('.admin-table thead th'));
    expect(headers.length).toBe(5);
  });

  it("shows BOTH vehicle types' fares on the same row", () => {
    render([
      makeSegment({ id: 1, vehicleTypeSlug: 'van', vehicleTypeName: 'Van', fare: 100 }),
      makeSegment({ id: 2, vehicleTypeSlug: 'minibus', vehicleTypeName: 'Minibus', fare: 140 }),
    ]);

    const dataRow = fixture.debugElement.queryAll(
      By.css('.admin-table tbody tr:not(.group-row)')
    )[0];
    const cells = dataRow
      .queryAll(By.css('td'))
      .map((cell) => cell.nativeElement.textContent.trim());
    expect(cells[1]).toBe('THB 100');
    expect(cells[2]).toBe('THB 140');
  });

  it('prints the not-set label, never 0.00, for a vehicle type missing on a pair', () => {
    render([
      makeSegment({
        id: 1,
        vehicleTypeSlug: 'van',
        vehicleTypeName: 'Van',
        toStopSlug: 'beta',
        fare: 100,
      }),
      makeSegment({
        id: 2,
        vehicleTypeSlug: 'minibus',
        vehicleTypeName: 'Minibus',
        toStopSlug: 'gamma',
        destination: 'Gamma',
        fare: 140,
      }),
    ]);

    const emptyCells = fixture.debugElement.queryAll(By.css('.admin-table tbody td.fare-empty'));
    expect(emptyCells.length).toBe(2);
    for (const cell of emptyCells) {
      expect(cell.nativeElement.textContent.trim()).toBe('ADMIN.ROUTES.FARE_UNSET');
      expect(cell.nativeElement.textContent).not.toContain('0.00');
    }
  });

  it('emits editSegment with the segment of the vehicle type whose button was clicked', () => {
    const van = makeSegment({ id: 1, vehicleTypeSlug: 'van', vehicleTypeName: 'Van', fare: 100 });
    const minibus = makeSegment({
      id: 2,
      vehicleTypeSlug: 'minibus',
      vehicleTypeName: 'Minibus',
      fare: 140,
    });
    render([van, minibus]);

    const editSpy = jasmine.createSpy('editSegment');
    component.editSegment.subscribe(editSpy);

    const buttons = fixture.debugElement.queryAll(By.css('.admin-table tbody .edit-fare-btn'));
    expect(buttons.length).toBe(2);

    buttons[1].nativeElement.click();

    expect(editSpy).toHaveBeenCalledWith(minibus);
  });

  it('exposes the collapse state on the group header button via aria-expanded', () => {
    render([makeSegment({ id: 1 })]);

    const groupButton = fixture.debugElement.query(By.css('.group-btn'));
    expect(groupButton.nativeElement.getAttribute('aria-expanded')).toBe('true');

    groupButton.nativeElement.click();
    fixture.detectChanges();

    expect(groupButton.nativeElement.getAttribute('aria-expanded')).toBe('false');
    expect(
      fixture.debugElement.queryAll(By.css('.admin-table tbody tr:not(.group-row)')).length
    ).toBe(0);
  });

  it('renders the empty-state row spanning every column when the route has no segments', () => {
    render([]);

    const emptyRow = fixture.debugElement.query(By.css('.admin-empty-row td'));
    expect(emptyRow).toBeTruthy();
    // No vehicle types are known for an empty route, so the span is the 3 fixed
    // columns — proving the colspan is computed, not a hardcoded 5.
    expect(emptyRow.nativeElement.getAttribute('colspan')).toBe('3');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { RouteDetailPanelComponent } from './route-detail-panel.component';
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

// ── Plain-instance tests: getters, view-state, ngOnChanges logic ───────────
describe('RouteDetailPanelComponent (logic)', () => {
  function makeComponent(): RouteDetailPanelComponent {
    return new RouteDetailPanelComponent();
  }

  describe('segment getters', () => {
    it('segments returns allSegments when no vehicle type is selected', () => {
      const component = makeComponent();
      component.allSegments = [makeSegment({ id: 1, vehicleTypeSlug: 'van' }), makeSegment({ id: 2, vehicleTypeSlug: 'bus' })];

      expect((component as any).segments.length).toBe(2);
    });

    it('segments filters by the selected vehicle type (case/whitespace-insensitive)', () => {
      const component = makeComponent();
      component.allSegments = [makeSegment({ id: 1, vehicleTypeSlug: 'van' }), makeSegment({ id: 2, vehicleTypeSlug: 'bus' })];
      (component as any).selectedVehicleTypeSlug = ' VAN ';

      const result = (component as any).segments as SegmentRow[];
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1);
    });

    it('filteredSegments filters by origin/destination keyword (case-insensitive)', () => {
      const component = makeComponent();
      component.allSegments = [
        makeSegment({ id: 1, origin: 'Bangkok', destination: 'Chiang Mai' }),
        makeSegment({ id: 2, origin: 'Phuket', destination: 'Krabi' }),
      ];
      (component as any).segmentSearchTerm = 'bangkok';

      const result = (component as any).filteredSegments as SegmentRow[];
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1);
    });

    it('pagedSegments/totalSegments/totalPages/showingFrom/showingTo paginate at pageSize=5', () => {
      const component = makeComponent();
      component.allSegments = Array.from({ length: 12 }, (_, i) => makeSegment({ id: i + 1 }));

      expect((component as any).totalSegments).toBe(12);
      expect((component as any).totalPages).toBe(3);
      expect((component as any).pagedSegments.length).toBe(5);
      expect((component as any).showingFrom).toBe(1);
      expect((component as any).showingTo).toBe(5);

      (component as any).currentPage = 3;
      expect((component as any).pagedSegments.length).toBe(2);
      expect((component as any).showingFrom).toBe(11);
      expect((component as any).showingTo).toBe(12);
    });

    it('showingFrom is 0 when there are no segments', () => {
      const component = makeComponent();
      component.allSegments = [];

      expect((component as any).showingFrom).toBe(0);
    });

    it('canPreviousPage/canNextPage reflect currentPage bounds', () => {
      const component = makeComponent();
      component.allSegments = Array.from({ length: 12 }, (_, i) => makeSegment({ id: i + 1 }));

      expect((component as any).canPreviousPage).toBeFalse();
      expect((component as any).canNextPage).toBeTrue();

      (component as any).currentPage = 3;
      expect((component as any).canPreviousPage).toBeTrue();
      expect((component as any).canNextPage).toBeFalse();
    });
  });

  describe('pagination actions', () => {
    it('goToNextPage/goToPreviousPage step within bounds only', () => {
      const component = makeComponent();
      component.allSegments = Array.from({ length: 12 }, (_, i) => makeSegment({ id: i + 1 }));

      (component as any).goToPreviousPage();
      expect((component as any).currentPage).toBe(1);

      (component as any).goToNextPage();
      expect((component as any).currentPage).toBe(2);

      (component as any).currentPage = 3;
      (component as any).goToNextPage();
      expect((component as any).currentPage).toBe(3);
    });

    it('onSegmentSearchChange resets currentPage to 1', () => {
      const component = makeComponent();
      (component as any).currentPage = 3;

      (component as any).onSegmentSearchChange();

      expect((component as any).currentPage).toBe(1);
    });

    it('onVehicleTypeChange matches by slug or name and resets currentPage', () => {
      const component = makeComponent();
      (component as any).vehicleTypeOptions = [{ slug: 'van', name: 'Van' }, { slug: 'bus', name: 'Bus' }];
      (component as any).currentPage = 2;

      (component as any).onVehicleTypeChange('Bus');

      expect((component as any).selectedVehicleTypeSlug).toBe('bus');
      expect((component as any).currentPage).toBe(1);
    });

    it('onVehicleTypeChange falls back to the trimmed raw value when nothing matches', () => {
      const component = makeComponent();
      (component as any).vehicleTypeOptions = [{ slug: 'van', name: 'Van' }];

      (component as any).onVehicleTypeChange('  unknown  ');

      expect((component as any).selectedVehicleTypeSlug).toBe('unknown');
    });
  });

  describe('trackBy + formatFare delegates', () => {
    it('trackByStopSlug returns the stop slug', () => {
      const component = makeComponent();
      expect((component as any).trackByStopSlug(0, STOP_A)).toBe('stop-a');
    });

    it('trackBySegmentId returns the segment id', () => {
      const component = makeComponent();
      expect((component as any).trackBySegmentId(0, makeSegment({ id: 42 }))).toBe(42);
    });

    it('formatFare delegates to the shared mapper (2 decimal places)', () => {
      const component = makeComponent();
      expect((component as any).formatFare(9.5)).toBe('9.50');
    });
  });

  // Mirrors the original page's per-load reset block (see routes.mappers.ts
  // callers in loadRouteStructureBySlug pre-OBRS-213).
  describe('ngOnChanges reset behavior (parity with loadRouteStructureBySlug)', () => {
    it('resets currentPage to 1 and re-derives vehicleTypeOptions when allSegments changes', () => {
      const component = makeComponent();
      (component as any).currentPage = 3;
      component.allSegments = [makeSegment({ id: 1, vehicleTypeSlug: 'van', vehicleTypeName: 'Van' })];

      component.ngOnChanges({ allSegments: {} as any });

      expect((component as any).currentPage).toBe(1);
      expect((component as any).vehicleTypeOptions).toEqual([{ slug: 'van', name: 'Van' }]);
    });

    it('defaults selectedVehicleTypeSlug to the first option when the current selection no longer matches', () => {
      const component = makeComponent();
      (component as any).selectedVehicleTypeSlug = 'bus';
      component.allSegments = [makeSegment({ id: 1, vehicleTypeSlug: 'van', vehicleTypeName: 'Van' })];

      component.ngOnChanges({ allSegments: {} as any });

      expect((component as any).selectedVehicleTypeSlug).toBe('van');
    });

    it('keeps the current selection when it still matches an option in the new set', () => {
      const component = makeComponent();
      (component as any).selectedVehicleTypeSlug = 'bus';
      component.allSegments = [
        makeSegment({ id: 1, vehicleTypeSlug: 'van', vehicleTypeName: 'Van' }),
        makeSegment({ id: 2, vehicleTypeSlug: 'bus', vehicleTypeName: 'Bus' }),
      ];

      component.ngOnChanges({ allSegments: {} as any });

      expect((component as any).selectedVehicleTypeSlug).toBe('bus');
    });

    it('resets selectedVehicleTypeSlug to empty when the new segment set has no vehicle types', () => {
      const component = makeComponent();
      (component as any).selectedVehicleTypeSlug = 'van';
      component.allSegments = [];

      component.ngOnChanges({ allSegments: {} as any });

      expect((component as any).selectedVehicleTypeSlug).toBe('');
    });

    it('does NOT reset segmentSearchTerm when allSegments changes (must persist across loads)', () => {
      const component = makeComponent();
      (component as any).segmentSearchTerm = 'bangkok';
      component.allSegments = [makeSegment({ id: 1 })];

      component.ngOnChanges({ allSegments: {} as any });

      expect((component as any).segmentSearchTerm).toBe('bangkok');
    });

    it('ignores changes to other inputs (e.g. stops-only changes)', () => {
      const component = makeComponent();
      (component as any).currentPage = 3;

      component.ngOnChanges({ stops: {} as any });

      expect((component as any).currentPage).toBe(3);
    });

    it('while isDetailLoading is true, only recomputes vehicleTypeOptions for display and leaves the selection/page untouched', () => {
      // Parity guard: the parent clears allSegments to a fresh [] synchronously
      // before the fetch settles, which is a distinct reference change and
      // fires ngOnChanges a second time. The original page only ran its
      // reset/default logic once, after the load settled — so the transient
      // clear-to-[] pass (isDetailLoading=true) must not touch the selection
      // or page, or a route switch between routes sharing a vehicle type
      // would lose the previously selected filter.
      const component = makeComponent();
      (component as any).selectedVehicleTypeSlug = 'bus';
      (component as any).currentPage = 3;
      component.isDetailLoading = true;
      component.allSegments = [];

      component.ngOnChanges({ allSegments: {} as any });

      expect((component as any).selectedVehicleTypeSlug).toBe('bus');
      expect((component as any).currentPage).toBe(3);
      expect((component as any).vehicleTypeOptions).toEqual([]);
    });
  });
});

// ── Template-level tests: hasRoute gating + editSegment output ─────────────
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

  it('renders nothing when hasRoute is false', () => {
    component.hasRoute = false;
    component.stops = [STOP_A];
    component.allSegments = [makeSegment()];
    fixture.detectChanges();

    const section = fixture.debugElement.query(By.css('section'));
    expect(section).withContext('detail section should not render when hasRoute is false').toBeNull();
  });

  it('renders the stops/segments section when hasRoute is true', () => {
    component.hasRoute = true;
    component.stops = [STOP_A];
    component.allSegments = [makeSegment()];
    component.ngOnChanges({ allSegments: {} as any });
    fixture.detectChanges();

    const section = fixture.debugElement.query(By.css('section'));
    expect(section).withContext('detail section should render when hasRoute is true').toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('.admin-table tbody tr'));
    expect(rows.length).toBe(1);
  });

  it('emits editSegment with the row when the edit button is clicked', () => {
    component.hasRoute = true;
    const segment = makeSegment();
    component.allSegments = [segment];
    component.ngOnChanges({ allSegments: {} as any });
    fixture.detectChanges();

    const editSpy = jasmine.createSpy('editSegment');
    component.editSegment.subscribe(editSpy);

    const editButton = fixture.debugElement.query(By.css('.admin-table tbody .admin-icon-btn'));
    editButton.nativeElement.click();

    expect(editSpy).toHaveBeenCalledWith(segment);
  });
});

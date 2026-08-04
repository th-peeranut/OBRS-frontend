import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import {
  SegmentGroup,
  SegmentGroupFareRange,
  SegmentPivotRow,
  SegmentRow,
  StopPoint,
  VehicleTypeOption,
  formatFare as formatFareValue,
  toSegmentGroups,
  toSegmentPivotRows,
  toVehicleTypeOptions,
} from '../routes.mappers';

/** One rendered line of the segments table. Pagination counts THESE, not stop
 *  pairs — a collapsed group has to shrink the table, and it only does that if
 *  the page budget is spent on what is actually drawn. */
export type SegmentDisplayLine =
  | { kind: 'group'; key: string; group: SegmentGroup; continued: boolean }
  | { kind: 'row'; key: string; row: SegmentPivotRow; zebra: boolean };

/** `null` = show everything on one page. */
const PAGE_SIZE_VALUES: (number | null)[] = [5, 10, 25, 50, null];
const ALL_PAGE_SIZE_VALUE = 'all';
const DEFAULT_PAGE_SIZE = 10;

// Route detail panel (stops timeline + segments table + segment search +
// pagination), extracted from RoutesPageComponent (OBRS-213).
// Owns all segment view-state so it persists across route switches exactly
// like it did as page-level fields (see the always-mounted host note in the
// parent template — this component's content is gated by `hasRoute`, not a
// host-level *ngIf, so the instance itself is never destroyed/recreated).
//
// OBRS-1027 reshaped the table itself. Three things that made it unreadable
// are gone: the origin no longer repeats on every row (it is a group header
// row), the page size is no longer hardcoded to 5, and the vehicle-type
// dropdown is dissolved into one fare column per vehicle type so both prices
// for a stop pair are visible at once instead of one-at-a-time-and-remember.
//
// The derived view (pivot rows → groups → display lines → page) is recomputed
// by `refreshView()` on every input/state change and held in FIELDS,
// deliberately not exposed as getters: getters re-run on every change-detection
// cycle, and these allocate a fresh object per stop pair, which is the shape
// that wedges the renderer (OBRS-919). Every mutator below must call it.
@Component({
    selector: 'app-route-detail-panel',
    templateUrl: './route-detail-panel.component.html',
    styleUrl: './route-detail-panel.component.scss',
    standalone: false
})
export class RouteDetailPanelComponent implements OnChanges, OnDestroy {
  @Input() hasRoute = false;
  @Input() stops: StopPoint[] = [];
  @Input() allSegments: SegmentRow[] = [];
  @Input() isDetailLoading = false;
  @Output() editSegment = new EventEmitter<SegmentRow>();

  protected vehicleTypeOptions: VehicleTypeOption[] = [];
  protected segmentSearchTerm = '';

  /** `null` = "all rows on one page". */
  protected pageSize: number | null = DEFAULT_PAGE_SIZE;
  protected currentPage = 1;

  /** Rebuilt (not just re-derived) on every language change — the "all" option
   *  is translated client-side. Same live-not-captured-once precedent as
   *  `inspection-items-page.component.ts`. Held in a field rather than a getter
   *  because it feeds an `@Input`, and a getter would hand the dropdown a fresh
   *  array identity on every change-detection cycle. */
  protected pageSizeOptions: { code: string; label: string }[] = [];

  /** Origin slugs the user has collapsed. Never cleared by a search — see
   *  `isGroupCollapsed`. */
  private readonly collapsedOrigins = new Set<string>();

  protected groups: SegmentGroup[] = [];
  protected displayLines: SegmentDisplayLine[] = [];
  protected pagedLines: SegmentDisplayLine[] = [];
  protected totalPairs = 0;
  protected shownPairs = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly translate: TranslateService) {
    this.buildPageSizeOptions();
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.buildPageSizeOptions();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Mirrors the per-load reset block from the original page's
  // `loadRouteStructureBySlug` (~lines 451-471): re-derive the vehicle-type
  // options when the segment set changes and reset pagination to page 1, but
  // never touch `segmentSearchTerm` — the original never reset the search term
  // on load, so it must persist.
  //
  // Parity note: the parent clears `allSegments` to a new `[]` synchronously
  // *before* the fetch (to drive the loading state), then reassigns it once
  // the fetch settles — two distinct reference changes, so this fires twice
  // per load. Gating the reset half on `isDetailLoading` being false reproduces
  // the original's single post-fetch run.
  //
  // OBRS-1027: the collapse state is cleared on a settled load too. It is keyed
  // by origin stop slug, and slugs are route-scoped, so carrying it across a
  // route switch could silently collapse a group on the new route that the user
  // never touched.
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['allSegments']) {
      return;
    }

    this.vehicleTypeOptions = toVehicleTypeOptions(this.allSegments);

    if (!this.isDetailLoading) {
      this.collapsedOrigins.clear();
      this.currentPage = 1;
    }

    this.refreshView();
  }

  protected get columnCount(): number {
    // destination + one fare column per vehicle type + duration + actions
    return 3 + this.vehicleTypeOptions.length;
  }

  /** A collapsed group would hide rows that MATCH the keyword — the user would
   *  read "0 results" while the search actually found some. So a live search
   *  expands everything temporarily; the stored collapse state is untouched and
   *  comes back when the keyword is cleared. */
  protected get isSearching(): boolean {
    return this.segmentSearchTerm.trim().length > 0;
  }

  protected get collapsedGroupCount(): number {
    return this.groups.filter((group) => this.isGroupCollapsed(group.originSlug)).length;
  }

  protected get canExpandAll(): boolean {
    return !this.isSearching && this.collapsedGroupCount > 0;
  }

  protected get canCollapseAll(): boolean {
    return (
      !this.isSearching &&
      this.groups.length > 0 &&
      this.collapsedGroupCount < this.groups.length
    );
  }

  protected get totalPages(): number {
    if (this.pageSize === null) {
      return 1;
    }

    return Math.max(1, Math.ceil(this.displayLines.length / this.pageSize));
  }

  protected get canPreviousPage(): boolean {
    return this.currentPage > 1;
  }

  protected get canNextPage(): boolean {
    return this.currentPage < this.totalPages;
  }

  protected get pageSizeValue(): string {
    return this.pageSize === null ? ALL_PAGE_SIZE_VALUE : String(this.pageSize);
  }

  protected isGroupCollapsed(originSlug: string): boolean {
    return !this.isSearching && this.collapsedOrigins.has(originSlug);
  }

  protected toggleGroup(originSlug: string): void {
    // A live search overrides the collapse state, so a toggle here would change
    // nothing on screen and then surprise the user by taking effect the moment
    // the keyword is cleared. The header button is disabled while searching;
    // this is the belt to that braces.
    if (this.isSearching) {
      return;
    }

    if (this.collapsedOrigins.has(originSlug)) {
      this.collapsedOrigins.delete(originSlug);
    } else {
      this.collapsedOrigins.add(originSlug);
    }

    this.refreshView();
  }

  protected expandAll(): void {
    this.collapsedOrigins.clear();
    this.currentPage = 1;
    this.refreshView();
  }

  protected collapseAll(): void {
    this.collapsedOrigins.clear();
    for (const group of this.groups) {
      this.collapsedOrigins.add(group.originSlug);
    }

    this.currentPage = 1;
    this.refreshView();
  }

  protected onSegmentSearchChange(): void {
    this.currentPage = 1;
    this.refreshView();
  }

  protected onPageSizeChange(value: string): void {
    this.pageSize = value === ALL_PAGE_SIZE_VALUE ? null : Number(value);
    this.currentPage = 1;
    this.refreshView();
  }

  protected goToPreviousPage(): void {
    if (!this.canPreviousPage) {
      return;
    }

    this.currentPage -= 1;
    this.refreshView();
  }

  protected goToNextPage(): void {
    if (!this.canNextPage) {
      return;
    }

    this.currentPage += 1;
    this.refreshView();
  }

  protected trackByStopSlug(_index: number, stop: StopPoint): string {
    return stop.slug;
  }

  protected trackByDisplayLine(_index: number, line: SegmentDisplayLine): string {
    return line.key;
  }

  protected formatFare(fare: number): string {
    return formatFareValue(fare);
  }

  /** "120.00" when a group's fares are all equal, "120.00 – 260.00" when they
   *  span, and the not-set label when the group has no fare for this type. */
  protected formatFareRange(range: SegmentGroupFareRange): string {
    if (range.min === null || range.max === null) {
      return this.translate.instant('ADMIN.ROUTES.FARE_UNSET');
    }

    if (range.min === range.max) {
      return formatFareValue(range.min);
    }

    return `${formatFareValue(range.min)} – ${formatFareValue(range.max)}`;
  }

  private buildPageSizeOptions(): void {
    this.pageSizeOptions = PAGE_SIZE_VALUES.map((value) => ({
      code: value === null ? ALL_PAGE_SIZE_VALUE : String(value),
      label: value === null ? this.translate.instant('ADMIN.COMMON.ALL') : String(value),
    }));
  }

  private filterPivotRows(rows: SegmentPivotRow[]): SegmentPivotRow[] {
    const keyword = this.segmentSearchTerm.trim().toLowerCase();
    if (!keyword) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.origin.toLowerCase().includes(keyword) ||
        row.destination.toLowerCase().includes(keyword)
    );
  }

  private refreshView(): void {
    const pivotRows = toSegmentPivotRows(this.allSegments, this.vehicleTypeOptions);
    const visibleRows = this.filterPivotRows(pivotRows);

    this.totalPairs = visibleRows.length;
    this.groups = toSegmentGroups(visibleRows, this.vehicleTypeOptions);

    const lines: SegmentDisplayLine[] = [];
    for (const group of this.groups) {
      lines.push({ kind: 'group', key: `g:${group.originSlug}`, group, continued: false });

      if (this.isGroupCollapsed(group.originSlug)) {
        continue;
      }

      group.rows.forEach((row, index) => {
        lines.push({ kind: 'row', key: `r:${row.key}`, row, zebra: index % 2 === 1 });
      });
    }

    this.displayLines = lines;

    const totalPages = this.totalPages;
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }

    if (this.pageSize === null) {
      this.pagedLines = lines;
    } else {
      const startIndex = (this.currentPage - 1) * this.pageSize;
      const slice = lines.slice(startIndex, startIndex + this.pageSize);

      // A page that begins mid-group would open with rows whose origin is only
      // stated on the previous page. Re-emit that group's header, marked
      // "(continued)", so no row is ever orphaned from its origin.
      const firstLine = slice[0];
      if (firstLine?.kind === 'row') {
        const owningGroup = this.groups.find((group) =>
          group.rows.some((row) => row.key === firstLine.row.key)
        );

        if (owningGroup) {
          slice.unshift({
            kind: 'group',
            key: `g:${owningGroup.originSlug}:continued`,
            group: owningGroup,
            continued: true,
          });
        }
      }

      this.pagedLines = slice;
    }

    this.shownPairs = this.pagedLines.filter((line) => line.kind === 'row').length;
  }
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { MyReportsComponent } from './my-reports.component';
import { MyReportsStore } from './my-reports.store';
import { MyUsabilityReportPage } from '../../shared/interfaces/usability-report.interface';

function buildPage(
  content: MyUsabilityReportPage['content'],
  overrides: Partial<Pick<MyUsabilityReportPage, 'totalPages' | 'number' | 'totalElements'>> = {}
): MyUsabilityReportPage {
  return {
    content,
    totalElements: overrides.totalElements ?? content.length,
    totalPages: overrides.totalPages ?? 1,
    size: 20,
    number: overrides.number ?? 0,
    numberOfElements: content.length,
  };
}

describe('MyReportsComponent', () => {
  let fixture: ComponentFixture<MyReportsComponent>;
  let component: MyReportsComponent;
  let storeSpy: jasmine.SpyObj<MyReportsStore> & {
    data$: BehaviorSubject<MyUsabilityReportPage | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    loadingMore$: BehaviorSubject<boolean>;
    hasValue: boolean;
  };

  beforeEach(async () => {
    storeSpy = jasmine.createSpyObj('MyReportsStore', ['refresh', 'loadMore', 'mutate']) as never;
    storeSpy.data$ = new BehaviorSubject<MyUsabilityReportPage | null>(null);
    storeSpy.refreshing$ = new BehaviorSubject<boolean>(false);
    storeSpy.error$ = new BehaviorSubject<boolean>(false);
    storeSpy.loadingMore$ = new BehaviorSubject<boolean>(false);
    storeSpy.hasValue = false;
    storeSpy.refresh.and.returnValue(Promise.resolve());
    storeSpy.loadMore.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [MyReportsComponent],
      providers: [{ provide: MyReportsStore, useValue: storeSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MyReportsComponent);
    component = fixture.componentInstance;
  });

  it('calls store.refresh() on init', () => {
    fixture.detectChanges();
    expect(storeSpy.refresh).toHaveBeenCalled();
  });

  it('shows the initial-loading skeleton only before the store has any cached value', () => {
    fixture.detectChanges();
    storeSpy.refreshing$.next(true);
    storeSpy.hasValue = false;
    fixture.detectChanges();

    expect(component['isInitialLoading']).toBeTrue();
    const skeletons = fixture.nativeElement.querySelectorAll('.report-card--skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('does not show the skeleton once the store has a cached value, even mid-background-refresh', () => {
    fixture.detectChanges();
    storeSpy.hasValue = true;
    storeSpy.refreshing$.next(true);
    fixture.detectChanges();

    expect(component['isInitialLoading']).toBeFalse();
  });

  it('renders the empty state when the store resolves an empty page', () => {
    fixture.detectChanges();
    storeSpy.data$.next(buildPage([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.state-card--empty')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.report-card:not(.report-card--skeleton)').length).toBe(0);
  });

  it('renders one card per report with category/status/preview', () => {
    fixture.detectChanges();
    storeSpy.data$.next(
      buildPage([
        { id: 1, category: 'bug', status: 'new', descriptionPreview: 'A bug', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' },
      ])
    );
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.report-card');
    expect(card).not.toBeNull();
    expect(card.querySelector('.report-card__preview').textContent).toContain('A bug');
    expect(card.querySelector('.admin-status').classList.contains('is-warning')).toBeTrue();
  });

  it('shows the Load more button only when NOT on the last page (number < totalPages - 1)', () => {
    fixture.detectChanges();
    storeSpy.data$.next(buildPage([{ id: 1, category: 'bug', status: 'new', descriptionPreview: 'x', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' }], { totalPages: 2, number: 0 }));
    fixture.detectChanges();
    expect(component['showLoadMore']).toBeTrue();

    storeSpy.data$.next(buildPage([{ id: 1, category: 'bug', status: 'new', descriptionPreview: 'x', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' }], { totalPages: 2, number: 1 }));
    fixture.detectChanges();
    expect(component['showLoadMore']).toBeFalse();
  });

  it('onLoadMore() calls store.loadMore() and APPENDS (never replaces) via the store, not a paginator', () => {
    fixture.detectChanges();
    component['onLoadMore']();
    expect(storeSpy.loadMore).toHaveBeenCalled();
  });

  it('openDetail()/closeDetail() toggle the selected report driving the modal', () => {
    fixture.detectChanges();
    const report = { id: 1, category: 'bug' as const, status: 'new' as const, descriptionPreview: 'x', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' };

    component['openDetail'](report);
    expect(component['selectedReport']).toBe(report);

    component['closeDetail']();
    expect(component['selectedReport']).toBeNull();
  });

  it('onReportUpdated() patches the single row via store.mutate() (never calls store.refresh() again)', () => {
    fixture.detectChanges();
    storeSpy.refresh.calls.reset();

    component['onReportUpdated']({ id: 1, category: 'suggestion', descriptionPreview: 'updated', imageCount: 2 });

    expect(storeSpy.mutate).toHaveBeenCalled();
    expect(storeSpy.refresh).not.toHaveBeenCalled();
  });

  it('an unhandled fetch failure with no cache shows the error state with a retry button', () => {
    fixture.detectChanges();
    storeSpy.error$.next(true);
    storeSpy.hasValue = false;
    fixture.detectChanges();

    const errorState = fixture.nativeElement.querySelector('.state-card--error');
    expect(errorState).not.toBeNull();
    expect(component['errorMessage']).toBeTruthy();
  });

  it('onRetry() calls store.refresh() again', () => {
    fixture.detectChanges();
    storeSpy.refresh.calls.reset();
    component['onRetry']();
    expect(storeSpy.refresh).toHaveBeenCalled();
  });

  it('cleans up on destroy without throwing', () => {
    fixture.detectChanges();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must reset the cached
  // page state, not leave a previous session's rows visible — same shape as
  // the already-fixed usability-reports-page.component.ts (OBRS-467).
  it('clears the cached page when the store emits null (OBRS-506)', () => {
    fixture.detectChanges();
    storeSpy.data$.next(
      buildPage(
        [{ id: 1, category: 'bug', status: 'new', descriptionPreview: 'x', imageCount: 0, createdAt: '2026-01-01T00:00:00Z' }],
        { totalPages: 2, number: 1, totalElements: 21 }
      )
    );
    fixture.detectChanges();
    expect(component['reports'].length).toBe(1);
    expect(component['totalElements']).toBe(21);
    expect(component['currentPageNumber']).toBe(1);
    expect(component['totalPages']).toBe(2);

    storeSpy.data$.next(null);
    fixture.detectChanges();

    expect(component['reports'])
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
    expect(component['totalElements']).toBe(0);
    expect(component['currentPageNumber']).toBe(0);
    expect(component['totalPages']).toBe(0);
  });
});

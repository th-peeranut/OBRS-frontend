import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { UsabilityReportsPageComponent } from './usability-reports-page.component';
import { UsabilityReportsStore } from './usability-reports.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AdminSharedModule } from '../../admin-shared.module';
import { AdminModalBackdropDirective } from '../../components/admin-modal-backdrop.directive';
import { UsabilityReportPage, UsabilityReportDetail } from '../../../../shared/interfaces/usability-report.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

describe('UsabilityReportsPageComponent', () => {
  let fixture: ComponentFixture<UsabilityReportsPageComponent>;
  let component: UsabilityReportsPageComponent;
  let storeSpy: jasmine.SpyObj<UsabilityReportsStore> & {
    data$: BehaviorSubject<UsabilityReportPage | null>;
    refreshing$: BehaviorSubject<boolean>;
    error$: BehaviorSubject<boolean>;
    hasValue: boolean;
  };
  let adminApiServiceSpy: jasmine.SpyObj<AdminApiService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    const dataSubject = new BehaviorSubject<UsabilityReportPage | null>(null);
    const refreshingSubject = new BehaviorSubject<boolean>(false);
    const errorSubject = new BehaviorSubject<boolean>(false);

    storeSpy = jasmine.createSpyObj('UsabilityReportsStore', ['refresh', 'mutate']) as jasmine.SpyObj<UsabilityReportsStore> & {
      data$: BehaviorSubject<UsabilityReportPage | null>;
      refreshing$: BehaviorSubject<boolean>;
      error$: BehaviorSubject<boolean>;
      hasValue: boolean;
    };
    storeSpy.data$ = dataSubject;
    storeSpy.refreshing$ = refreshingSubject;
    storeSpy.error$ = errorSubject;
    storeSpy.hasValue = false;
    storeSpy.refresh.and.returnValue(Promise.resolve());

    adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', [
      'getUsabilityReportById',
      'updateUsabilityReportStatus',
    ]);

    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [UsabilityReportsPageComponent, AdminModalBackdropDirective],
      providers: [
        { provide: UsabilityReportsStore, useValue: storeSpy },
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsabilityReportsPageComponent);
    component = fixture.componentInstance;
  });

  // (d) ngOnInit subscribes to store.data$ and calls store.refresh()
  //     Does NOT call fetch() or any HTTP method directly
  it('should subscribe to store.data$ and call store.refresh() on init — not direct fetch', () => {
    spyOn(storeSpy.data$, 'pipe').and.callThrough();

    fixture.detectChanges(); // triggers ngOnInit

    // store.refresh() must have been called
    expect(storeSpy.refresh)
      .withContext('store.refresh() must be called on init')
      .toHaveBeenCalledTimes(1);

    // adminApiService should NOT have been called directly from ngOnInit
    expect(adminApiServiceSpy.getUsabilityReportById)
      .withContext('No direct HTTP fetch from ngOnInit')
      .not.toHaveBeenCalled();
  });

  // (e) Status update calls store.mutate with a FUNCTION (not a partial object)
  it('should call store.mutate with a transform FUNCTION when saving status', () => {
    const mockPage: UsabilityReportPage = {
      content: [
        {
          id: 'abc-123',
          category: 'bug',
          status: 'new',
          userId: null,
          descriptionPreview: 'Test',
          imageCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      totalElements: 1,
    };

    // Set store data so hasValue is truthy-equivalent
    storeSpy.data$.next(mockPage);
    storeSpy.hasValue = true;
    fixture.detectChanges();

    // Set up the component's detail state
    component['selectedReportId'] = 'abc-123';
    component['selectedDetailStatus'] = 'resolved';

    const mockDetail: UsabilityReportDetail = {
      id: 'abc-123',
      category: 'bug',
      status: 'new',
      userId: null,
      description: 'Full description',
      descriptionPreview: 'Test',
      routeUrl: '/home',
      userAgent: 'test',
      imageCount: 0,
      images: [],
      createdAt: '2026-01-01T00:00:00Z',
      triageNote: null,
      triagedBy: null,
      triagedAt: null,
      jiraIssueKey: null,
    };

    const detailResponse: ResponseAPI<UsabilityReportDetail> = {
      code: 200,
      message: 'OK',
      data: mockDetail,
    };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of(detailResponse));
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      of({ code: 200, message: 'OK', data: null })
    );

    storeSpy.mutate.and.callFake((transformFn: (current: UsabilityReportPage) => UsabilityReportPage) => {
      // Verify it is called with a FUNCTION, not an object
      expect(typeof transformFn)
        .withContext('mutate must be called with a function, not an object')
        .toBe('function');

      // Verify the function applies the status change correctly
      const result = transformFn(mockPage);
      const updatedReport = result.content.find((r) => r.id === 'abc-123');
      expect(updatedReport?.status)
        .withContext('Transform should update status to resolved')
        .toBe('resolved');
    });

    component.saveStatus();

    expect(storeSpy.mutate)
      .withContext('store.mutate must have been called')
      .toHaveBeenCalledTimes(1);
  });

  // ── OBRS-77 regression specs ──────────────────────────────────────────────

  const mockSummaryPage: UsabilityReportPage = {
    content: [
      {
        id: 'rep-1',
        category: 'bug',
        status: 'new',
        userId: 42,
        descriptionPreview: 'Summary preview text',
        imageCount: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    totalElements: 1,
  };

  const mockFullDetail: UsabilityReportDetail = {
    id: 'rep-1',
    category: 'bug',
    status: 'new',
    userId: 42,
    description: 'Full fetched description',
    descriptionPreview: 'Summary preview text',
    routeUrl: '/booking',
    userAgent: 'Mozilla/5.0',
    imageCount: 1,
    images: [
      {
        id: 'img-1',
        publicUrl: 'https://example.com/img-1.png',
        contentType: 'image/png',
        sizeBytes: 2048,
        position: 1,
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    triageNote: null,
    triagedBy: null,
    triagedAt: null,
    jiraIssueKey: null,
  };

  function primeReportList(): void {
    storeSpy.data$.next(mockSummaryPage);
    storeSpy.hasValue = true;
    fixture.detectChanges();
  }

  it('opens the detail modal synchronously with the summary row, before the detail GET resolves', () => {
    primeReportList();

    // Never resolves during this test — proves the modal doesn't wait on it.
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    component['openDetail']('rep-1');
    fixture.detectChanges();

    const backdrop: HTMLElement = fixture.nativeElement.querySelector('.admin-modal-backdrop');
    expect(backdrop).withContext('modal backdrop must render synchronously').not.toBeNull();

    const modalText: string = fixture.nativeElement.querySelector('.ur-detail-modal').textContent;
    expect(modalText).withContext('summary preview text must show immediately').toContain(
      'Summary preview text'
    );
  });

  it('issues the detail GET once when the same report is opened twice, and refetches after saveStatus() invalidates the cache', () => {
    primeReportList();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: mockFullDetail,
    }));
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      of({ code: 200, message: 'OK', data: null })
    );
    storeSpy.mutate.and.callFake((transformFn: (current: UsabilityReportPage) => UsabilityReportPage) => {
      transformFn(mockSummaryPage);
    });

    component['openDetail']('rep-1');
    fixture.detectChanges();
    expect(adminApiServiceSpy.getUsabilityReportById).toHaveBeenCalledTimes(1);

    component['closeDetail']();
    fixture.detectChanges();

    // Second open of the same id: cache hit, no new GET.
    component['openDetail']('rep-1');
    fixture.detectChanges();
    expect(adminApiServiceSpy.getUsabilityReportById)
      .withContext('cached detail must not trigger a second GET')
      .toHaveBeenCalledTimes(1);

    // Save a status change — this must invalidate the cache entry.
    component['selectedDetailStatus'] = 'resolved';
    component.saveStatus();
    fixture.detectChanges();

    component['closeDetail']();
    fixture.detectChanges();

    // Third open: cache was invalidated by saveStatus(), so this must refetch.
    component['openDetail']('rep-1');
    fixture.detectChanges();
    expect(adminApiServiceSpy.getUsabilityReportById)
      .withContext('cache must be invalidated after saveStatus() so the next open refetches')
      .toHaveBeenCalledTimes(2);
  });

  it('lightbox opens on thumbnail click with the correct image URL, and ESC/backdrop close only the lightbox', () => {
    primeReportList();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: mockFullDetail,
    }));

    component['openDetail']('rep-1');
    fixture.detectChanges();

    const thumb: HTMLImageElement = fixture.nativeElement.querySelector('.ur-image-thumb');
    expect(thumb).withContext('thumbnail must render').not.toBeNull();
    expect(thumb.getAttribute('role')).toBe('button');
    expect(thumb.getAttribute('tabindex')).toBe('0');

    thumb.click();
    fixture.detectChanges();

    expect(component['lightboxImageUrl']).toBe('https://example.com/img-1.png');
    let lightbox: HTMLElement = fixture.nativeElement.querySelector('.ur-lightbox-backdrop');
    expect(lightbox).withContext('lightbox overlay must render').not.toBeNull();

    // ESC closes only the lightbox — the detail modal stays open.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component['lightboxImageUrl']).toBeNull();
    expect(component['selectedReportId'])
      .withContext('detail modal must remain open after lightbox ESC-dismiss')
      .toBe('rep-1');

    // Reopen, then dismiss via backdrop click.
    component['lightboxImageUrl'] = 'https://example.com/img-1.png';
    fixture.detectChanges();
    lightbox = fixture.nativeElement.querySelector('.ur-lightbox-backdrop');
    lightbox.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(component['lightboxImageUrl']).toBeNull();
    expect(component['selectedReportId'])
      .withContext('detail modal must remain open after lightbox backdrop-dismiss')
      .toBe('rep-1');
  });

  it('does not clobber an in-progress status selection when the detail GET resolves (pristine-only patch, §6)', () => {
    primeReportList();

    // Detail GET is controlled so we can change status while it is in flight.
    const detail$ = new Subject<{ code: number; message: string; data: UsabilityReportDetail }>();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(detail$.asObservable());

    component['openDetail']('rep-1');
    fixture.detectChanges();

    // Admin changes status during the optimistic-open window (before detail arrives).
    component['onDetailStatusChange']('resolved');
    expect(component['selectedDetailStatus']).toBe('resolved');

    // Detail resolves carrying the server's (unchanged) 'new' status.
    detail$.next({ code: 200, message: 'OK', data: mockFullDetail });
    detail$.complete();
    fixture.detectChanges();

    expect(component['selectedDetailStatus'])
      .withContext('in-progress status edit must survive the detail GET resolving')
      .toBe('resolved');
  });

  it('renders a single top-right close control wired to closeDetail()', () => {
    primeReportList();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    component['openDetail']('rep-1');
    fixture.detectChanges();

    const closeButtons = fixture.nativeElement.querySelectorAll('.admin-modal-header button');
    expect(closeButtons.length).withContext('exactly one close control in the header').toBe(1);

    // Verify it is actually wired to closeDetail() by observing the effect,
    // rather than reaching past the protected modifier to spy on the method.
    closeButtons[0].click();
    fixture.detectChanges();
    expect(component['selectedReportId'])
      .withContext('clicking the × must close the detail modal')
      .toBeNull();
  });

  // ── OBRS-82 regression specs: the whole row opens the detail (mouse) ───────
  // The row-click is a mouse convenience only; keyboard/AT users use the View
  // button (so the <tr> carries no role/tabindex/keydown — it would orphan the
  // cells and add a redundant tab stop).

  it('opens the detail modal when a non-interactive cell in the row is clicked', () => {
    primeReportList();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    const row: HTMLElement = fixture.nativeElement.querySelector('tr.ur-report-row');
    expect(row).withContext('clickable report row must render').not.toBeNull();
    // Deliberately NOT a button-role row — table semantics stay intact.
    expect(row.getAttribute('role')).withContext('row keeps its implicit row semantics').toBeNull();

    const openSpy = spyOn(component as unknown as { openDetail: (id: string) => void }, 'openDetail').and.callThrough();

    // The Category cell is non-interactive text.
    const categoryCell: HTMLElement = row.querySelectorAll('td')[1] as HTMLElement;
    categoryCell.click();
    fixture.detectChanges();

    expect(openSpy).withContext('clicking a row cell opens the detail').toHaveBeenCalledOnceWith('rep-1');
    expect(component['selectedReportId']).toBe('rep-1');
  });

  it('opens the detail exactly once when the View button is clicked (no double-open from row bubbling)', () => {
    primeReportList();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    const row: HTMLElement = fixture.nativeElement.querySelector('tr.ur-report-row');
    const openSpy = spyOn(component as unknown as { openDetail: (id: string) => void }, 'openDetail').and.callThrough();

    const viewBtn: HTMLButtonElement = row.querySelector('button.admin-btn-small') as HTMLButtonElement;
    viewBtn.click();
    fixture.detectChanges();

    expect(openSpy)
      .withContext('View button opens once; the row handler must bail on button-origin clicks')
      .toHaveBeenCalledOnceWith('rep-1');
  });

  // ── OBRS-86 regression specs: triage workflow ───────────────────────────

  it('sends the triage note in the PUT payload when saving status', () => {
    primeReportList();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: mockFullDetail,
    }));
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      of({ code: 200, message: 'OK', data: null })
    );
    storeSpy.mutate.and.callFake((transformFn: (current: UsabilityReportPage) => UsabilityReportPage) => {
      transformFn(mockSummaryPage);
    });

    component['openDetail']('rep-1');
    fixture.detectChanges();

    component['onTriageNoteChange']('Investigated — reproduced on iOS Safari.');
    component['selectedDetailStatus'] = 'accepted';
    component.saveStatus();

    expect(adminApiServiceSpy.updateUsabilityReportStatus)
      .withContext('the triage note must be sent alongside the status in the PUT payload')
      .toHaveBeenCalledOnceWith('rep-1', 'accepted', 'Investigated — reproduced on iOS Safari.');
  });

  it('renders the accepted status as .admin-status.is-accepted in the table', () => {
    const acceptedPage: UsabilityReportPage = {
      content: [{ ...mockSummaryPage.content[0], status: 'accepted' }],
      totalElements: 1,
    };
    storeSpy.data$.next(acceptedPage);
    storeSpy.hasValue = true;
    fixture.detectChanges();

    const statusEl: HTMLElement = fixture.nativeElement.querySelector('tr.ur-report-row .admin-status');
    expect(statusEl).withContext('status pill must render').not.toBeNull();
    expect(statusEl.classList.contains('is-accepted'))
      .withContext('accepted status must render with the is-accepted class')
      .toBeTrue();
  });

  it('renders the Jira link with the correct href when jiraIssueKey is present, and renders nothing when absent', () => {
    primeReportList();
    const detailWithJira: UsabilityReportDetail = { ...mockFullDetail, jiraIssueKey: 'OBRS-123' };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: detailWithJira,
    }));

    component['openDetail']('rep-1');
    fixture.detectChanges();

    const jiraLink: HTMLAnchorElement = fixture.nativeElement.querySelector('.ur-detail-modal a[target="_blank"]');
    expect(jiraLink).withContext('Jira link must render when jiraIssueKey is present').not.toBeNull();
    expect(jiraLink.getAttribute('href')).toBe(`${environment.jira.browseBaseUrl}OBRS-123`);

    component['closeDetail']();
    fixture.detectChanges();

    // A different report id with no jiraIssueKey — avoids resurfacing the
    // first report's cached (with-Jira) detail.
    const detailNoJira: UsabilityReportDetail = { ...mockFullDetail, id: 'rep-2', jiraIssueKey: null };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: detailNoJira,
    }));
    component['openDetail']('rep-2');
    fixture.detectChanges();

    const noJiraLink = fixture.nativeElement.querySelector('.ur-detail-modal a[target="_blank"]');
    expect(noJiraLink).withContext('Jira link must not render when jiraIssueKey is absent').toBeNull();
  });

  it('does not let a late detail fetch overwrite a triage note the admin already typed, and a cache-hit reopen shows the cached note', () => {
    primeReportList();

    const detail$ = new Subject<{ code: number; message: string; data: UsabilityReportDetail }>();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(detail$.asObservable());

    component['openDetail']('rep-1');
    fixture.detectChanges();

    // Admin types a note during the optimistic-open window (before detail arrives).
    component['onTriageNoteChange']('Draft note from admin');
    expect(component['selectedTriageNote']).toBe('Draft note from admin');

    // Detail resolves carrying a DIFFERENT (server) triage note — must not clobber.
    const serverDetail: UsabilityReportDetail = { ...mockFullDetail, triageNote: 'Server note' };
    detail$.next({ code: 200, message: 'OK', data: serverDetail });
    detail$.complete();
    fixture.detectChanges();

    expect(component['selectedTriageNote'])
      .withContext('an in-progress triage note edit must survive the detail GET resolving')
      .toBe('Draft note from admin');

    // Close and reopen the same report — cache hit must surface the cached
    // (server) note, not the previous session's leftover draft.
    component['closeDetail']();
    fixture.detectChanges();

    component['openDetail']('rep-1');
    fixture.detectChanges();

    expect(component['selectedTriageNote'])
      .withContext('cache-hit reopen must show the cached triage note')
      .toBe('Server note');
  });
});

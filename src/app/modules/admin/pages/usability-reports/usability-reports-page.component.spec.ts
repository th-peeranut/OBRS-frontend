import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { UsabilityReportsPageComponent } from './usability-reports-page.component';
import { UsabilityReportsStore } from './usability-reports.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { UsabilityReportBadgeRefreshService } from '../../../../shared/services/usability-report-badge-refresh.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminSharedModule } from '../../admin-shared.module';
import { AdminModalBackdropDirective } from '../../../../shared/directives/admin-modal-backdrop.directive';
import {
  UsabilityReportPage,
  UsabilityReportDetail,
  UsabilityReportStatus,
} from '../../../../shared/interfaces/usability-report.interface';
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
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    const dataSubject = new BehaviorSubject<UsabilityReportPage | null>(null);
    const refreshingSubject = new BehaviorSubject<boolean>(false);
    const errorSubject = new BehaviorSubject<boolean>(false);

    storeSpy = jasmine.createSpyObj('UsabilityReportsStore', ['refresh', 'mutate', 'setStatus']) as jasmine.SpyObj<UsabilityReportsStore> & {
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
    storeSpy.setStatus.and.returnValue(Promise.resolve());

    adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', [
      'getUsabilityReportById',
      'updateUsabilityReportStatus',
    ]);
    // Default success response so the silent auto-promote-on-open path (fired
    // whenever a 'new'-status report is opened, most fixtures below use one)
    // has something sane to subscribe to; individual tests override this when
    // they need to assert on the call or simulate a failure.
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      of({ code: 200, message: 'OK', data: null })
    );

    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error']);

    // OBRS-370: default to an ADMIN identity so every pre-existing spec below
    // (written before the role gate existed) keeps exercising the full,
    // un-restricted triage view. The owner (screen-only) behavior is covered
    // by its own describe block further down, which overrides getRoles().
    authServiceSpy = jasmine.createSpyObj('AuthService', ['getRoles', 'hasAnyRole']);
    authServiceSpy.getRoles.and.returnValue(['admin']);
    authServiceSpy.hasAnyRole.and.returnValue(true);

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [UsabilityReportsPageComponent, AdminModalBackdropDirective],
      providers: [
        { provide: UsabilityReportsStore, useValue: storeSpy },
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        { provide: AlertService, useValue: alertServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsabilityReportsPageComponent);
    component = fixture.componentInstance;
  });

  // (d) ngOnInit subscribes to store.data$ and calls store.setStatus() with
  //     the role-default status (OBRS-378 replaced the old unconditional
  //     store.refresh() — setStatus() already calls refresh() internally, so
  //     calling both would double-fetch on first load).
  //     Does NOT call fetch() or any HTTP method directly
  it('should subscribe to store.data$ and call store.setStatus() with the role default on init — not direct fetch, not also refresh()', () => {
    spyOn(storeSpy.data$, 'pipe').and.callThrough();

    fixture.detectChanges(); // triggers ngOnInit

    // store.setStatus() must have been called with the admin default (the
    // default authServiceSpy in this outer describe returns ['admin']).
    expect(storeSpy.setStatus)
      .withContext('store.setStatus() must be called on init with the role-default status')
      .toHaveBeenCalledOnceWith('accepted');

    // setStatus() already triggers a refresh internally — calling the bare
    // refresh() too would double-fetch.
    expect(storeSpy.refresh)
      .withContext('ngOnInit must not ALSO call the bare store.refresh() (setStatus already refreshes)')
      .not.toHaveBeenCalled();

    // adminApiService should NOT have been called directly from ngOnInit
    expect(adminApiServiceSpy.getUsabilityReportById)
      .withContext('No direct HTTP fetch from ngOnInit')
      .not.toHaveBeenCalled();
  });

  // ── OBRS-378: role-default status on init ─────────────────────────────────
  it('seeds the owner default status to "new" on init', () => {
    authServiceSpy.getRoles.and.returnValue(['owner']);
    fixture.detectChanges();

    expect(storeSpy.setStatus).toHaveBeenCalledOnceWith('new');
    expect(component['selectedStatusFilter']).toBe('new');
  });

  it('seeds the admin default status to "accepted" on init', () => {
    authServiceSpy.getRoles.and.returnValue(['admin']);
    fixture.detectChanges();

    expect(storeSpy.setStatus).toHaveBeenCalledOnceWith('accepted');
    expect(component['selectedStatusFilter']).toBe('accepted');
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

    // Set up the component's detail state. selectedStatusFilter is set to
    // match the saved status so the row stays in place (updateRowStatus)
    // rather than being removed (leaves-tab) — that removal path is covered
    // by its own dedicated specs further down (OBRS-378).
    component['selectedReportId'] = 'abc-123';
    component['selectedStatusFilter'] = 'resolved';
    component['selectedDetailStatus'] = 'resolved';

    const mockDetail: UsabilityReportDetail = {
      id: 'abc-123',
      category: 'bug',
      status: 'new',
      userId: null,
      reporterEmail: null,
      description: 'Full description',
      descriptionPreview: 'Test',
      routeUrl: '/home',
      userAgent: 'test',
      imageCount: 0,
      images: [],
      createdAt: '2026-01-01T00:00:00Z',
      triageNote: null,
      triagedBy: null,
      triagedByName: null,
      triagedAt: null,
      jiraIssueKey: null,
      reporterNotifiedAt: null,
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
    reporterEmail: null,
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
    triagedByName: null,
    triagedAt: null,
    jiraIssueKey: null,
    reporterNotifiedAt: null,
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

    // openDetail() above also fired the silent auto-promote call ('new' ->
    // 'in_review') on this same spy, so assert on the most recent call
    // (the explicit saveStatus() PUT) rather than a single-call count.
    expect(adminApiServiceSpy.updateUsabilityReportStatus.calls.mostRecent().args)
      .withContext('the triage note must be sent alongside the status in the PUT payload')
      .toEqual(['rep-1', 'accepted', 'Investigated — reproduced on iOS Safari.']);
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

  it('renders the reporter email row when present, and nothing when absent (OBRS-108)', () => {
    primeReportList();
    const emailRow = () => (Array.from(
      fixture.nativeElement.querySelectorAll('.ur-detail-modal .ur-detail-row')
    ) as HTMLElement[]).find((r) => r.textContent?.includes('reporter@example.com'));

    const withEmail: UsabilityReportDetail = { ...mockFullDetail, reporterEmail: 'reporter@example.com' };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: withEmail,
    }));
    component['openDetail']('rep-1');
    fixture.detectChanges();
    expect(emailRow())
      .withContext('reporter email row must render when reporterEmail is present')
      .toBeTruthy();

    component['closeDetail']();
    fixture.detectChanges();

    // A different report id with no reporterEmail — avoids resurfacing the
    // first report's cached (with-email) detail.
    const noEmail: UsabilityReportDetail = { ...mockFullDetail, id: 'rep-2', reporterEmail: null };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: noEmail,
    }));
    component['openDetail']('rep-2');
    fixture.detectChanges();
    expect(emailRow())
      .withContext('reporter email row must not render when reporterEmail is absent')
      .toBeFalsy();
  });

  it('renders the reporter-notified pill when reporterNotifiedAt is present, and nothing when absent (OBRS-115)', () => {
    primeReportList();
    const notifiedPill = () =>
      fixture.nativeElement.querySelector('.ur-detail-modal .ur-notified-pill') as HTMLElement | null;

    const notified: UsabilityReportDetail = {
      ...mockFullDetail,
      reporterEmail: 'reporter@example.com',
      reporterNotifiedAt: '2026-07-08T10:15:00Z',
    };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({ code: 200, message: 'OK', data: notified }));
    component['openDetail']('rep-1');
    fixture.detectChanges();
    expect(notifiedPill())
      .withContext('notified pill must render when reporterNotifiedAt is present')
      .toBeTruthy();
    // The dispatch timestamp is rendered human-readable (Thai default, Bangkok
    // time: 10:15 UTC → 17:15), not the raw backend ISO string (OBRS-172).
    expect(notifiedPill()?.textContent)
      .withContext('notified pill shows the formatted dispatch time')
      .toContain('17:15');
    expect(notifiedPill()?.textContent)
      .withContext('raw backend ISO must not leak into the pill')
      .not.toContain('2026-07-08T10:15:00Z');

    component['closeDetail']();
    fixture.detectChanges();

    // A different report id, never notified — pill must be absent.
    const notNotified: UsabilityReportDetail = { ...mockFullDetail, id: 'rep-3', reporterNotifiedAt: null };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({ code: 200, message: 'OK', data: notNotified }));
    component['openDetail']('rep-3');
    fixture.detectChanges();
    expect(notifiedPill())
      .withContext('notified pill must not render when reporterNotifiedAt is absent')
      .toBeFalsy();
  });

  it('shows triagedByName when present and falls back to the numeric triagedBy id when absent (OBRS-106)', () => {
    primeReportList();
    const triagedRow = () => (Array.from(
      fixture.nativeElement.querySelectorAll('.ur-detail-modal .ur-detail-row')
    ) as HTMLElement[]).find((r) => r.textContent?.includes('TRIAGED_BY'));

    const withName: UsabilityReportDetail = { ...mockFullDetail, triagedBy: 7, triagedByName: 'admin@system.local' };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({ code: 200, message: 'OK', data: withName }));
    component['openDetail']('rep-1');
    fixture.detectChanges();
    expect(triagedRow()?.textContent).withContext('shows the resolved name').toContain('admin@system.local');

    component['closeDetail']();
    fixture.detectChanges();

    const noName: UsabilityReportDetail = { ...mockFullDetail, id: 'rep-2', triagedBy: 777, triagedByName: null };
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({ code: 200, message: 'OK', data: noName }));
    component['openDetail']('rep-2');
    fixture.detectChanges();
    expect(triagedRow()?.textContent).withContext('falls back to the numeric id').toContain('777');
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

  // ── OBRS-174 regression specs: decision-only dropdown + silent auto-promote ──

  function pageWithStatus(status: UsabilityReportStatus): UsabilityReportPage {
    return {
      content: [{ ...mockSummaryPage.content[0], status }],
      totalElements: 1,
    };
  }

  it('builds the admin detail dropdown from accepted/dismissed/resolved/rejected, while the table filter keeps all 6 statuses', () => {
    primeReportList();

    const detailValues = component['detailStatusOptions'].map((o) => o.value);
    expect(detailValues)
      .withContext('detail modal dropdown must be decision-only, including dismissed')
      .toEqual(['accepted', 'dismissed', 'resolved', 'rejected']);

    const filterValues = component['statusFilterOptions'].map((o) => o.value);
    expect(filterValues)
      .withContext('the table filter above the table must still offer all 6 statuses')
      .toEqual(['new', 'in_review', 'accepted', 'dismissed', 'resolved', 'rejected']);
  });

  it('fires the silent auto-promote (new -> in_review) exactly once when opening a "new" report', () => {
    storeSpy.data$.next(pageWithStatus('new'));
    storeSpy.hasValue = true;
    fixture.detectChanges();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    component['openDetail']('rep-1');
    fixture.detectChanges();

    expect(adminApiServiceSpy.updateUsabilityReportStatus)
      .withContext('opening a new report must silently promote it to in_review exactly once')
      .toHaveBeenCalledOnceWith('rep-1', 'in_review', null);
  });

  it('optimistically decrements the "new" badge by 1 on a successful auto-promote (instant, no GET round-trip)', () => {
    const badge = TestBed.inject(UsabilityReportBadgeRefreshService);
    const adjustSpy = spyOn(badge, 'adjustBy');
    const triggerSpy = spyOn(badge, 'trigger');
    storeSpy.data$.next(pageWithStatus('new'));
    storeSpy.hasValue = true;
    fixture.detectChanges();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    component['openDetail']('rep-1'); // default updateUsabilityReportStatus mock resolves success

    expect(adjustSpy)
      .withContext('a successful promote nudges the badge by -1 immediately')
      .toHaveBeenCalledOnceWith('new', -1);
    expect(triggerSpy)
      .withContext('the promote path must not fire a second authoritative GET (that was the lag)')
      .not.toHaveBeenCalled();
  });

  it('reverts the optimistic badge decrement when the auto-promote fails (stale-row 400), leaving a net-zero change', () => {
    const badge = TestBed.inject(UsabilityReportBadgeRefreshService);
    const adjustSpy = spyOn(badge, 'adjustBy');
    storeSpy.data$.next(pageWithStatus('new'));
    storeSpy.hasValue = true;
    fixture.detectChanges();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      throwError(() => ({ status: 400, error: { errorCode: 'report.invalid-transition' } }))
    );

    component['openDetail']('rep-1');

    expect(adjustSpy.calls.allArgs())
      .withContext('optimistic -1 on open, then +1 reverted when the server rejects the promote')
      .toEqual([['new', -1], ['new', 1]]);
    // OBRS-378: a promoted row may have been REMOVED (not just relabeled) by
    // the optimistic applyRowStatus(), so it can't be surgically restored —
    // the revert path must reconcile via a full refresh.
    expect(storeSpy.refresh)
      .withContext('the auto-promote revert must reconcile via a full store.refresh()')
      .toHaveBeenCalled();
  });

  (['in_review', 'accepted', 'dismissed', 'resolved', 'rejected'] as UsabilityReportStatus[]).forEach((status) => {
    it(`does not fire the auto-promote when opening a report already in status "${status}"`, () => {
      storeSpy.data$.next(pageWithStatus(status));
      storeSpy.hasValue = true;
      fixture.detectChanges();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

      component['openDetail']('rep-1');
      fixture.detectChanges();

      expect(adminApiServiceSpy.updateUsabilityReportStatus)
        .withContext(`auto-promote must not fire for a report already in "${status}"`)
        .not.toHaveBeenCalled();
    });
  });

  it('swallows an auto-promote error (e.g. stale-row 400 report.invalid-transition) without a toast, without closing the modal, and without rethrowing', () => {
    storeSpy.data$.next(pageWithStatus('new'));
    storeSpy.hasValue = true;
    fixture.detectChanges();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      throwError(() => ({
        status: 400,
        error: { errorCode: 'report.invalid-transition' },
      }))
    );

    expect(() => {
      component['openDetail']('rep-1');
      fixture.detectChanges();
    })
      .withContext('the promote error must not propagate out of openDetail()')
      .not.toThrow();

    expect(alertServiceSpy.error)
      .withContext('auto-promote failures are silent — no error toast')
      .not.toHaveBeenCalled();
    expect(component['selectedReportId'])
      .withContext('the modal must stay open even when the background promote fails')
      .toBe('rep-1');
  });

  it('leaves the detail status selection empty (Save disabled) when opening a "new" report', () => {
    storeSpy.data$.next(pageWithStatus('new'));
    storeSpy.hasValue = true;
    fixture.detectChanges();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    component['openDetail']('rep-1');
    fixture.detectChanges();

    expect(component['selectedDetailStatus'])
      .withContext('a new report must not pre-seed a decision — Save stays disabled')
      .toBe('');

    const saveBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.ur-status-controls button.admin-btn-primary'
    );
    expect(saveBtn.disabled).withContext('Save must be disabled with no decision selected').toBeTrue();
  });

  it('pre-seeds the detail status selection when opening a report that already carries a terminal decision', () => {
    storeSpy.data$.next(pageWithStatus('resolved'));
    storeSpy.hasValue = true;
    fixture.detectChanges();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

    component['openDetail']('rep-1');
    fixture.detectChanges();

    expect(component['selectedDetailStatus'])
      .withContext('an already-decided report pre-seeds its terminal status')
      .toBe('resolved');
  });

  it('closes the detail modal on a successful status save, while still showing the success toast', () => {
    storeSpy.data$.next(pageWithStatus('resolved'));
    storeSpy.hasValue = true;
    fixture.detectChanges();
    adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
      code: 200,
      message: 'OK',
      data: { ...mockFullDetail, status: 'resolved' },
    }));
    adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
      of({ code: 200, message: 'OK', data: null })
    );

    component['openDetail']('rep-1');
    fixture.detectChanges();
    component['selectedDetailStatus'] = 'rejected';

    component.saveStatus();
    fixture.detectChanges();

    expect(alertServiceSpy.success)
      .withContext('the success toast must still fire on save')
      .toHaveBeenCalled();
    expect(component['selectedReportId'])
      .withContext('a successful save must close the detail modal')
      .toBeNull();
  });

  // ── OBRS-370 regression specs: owner is a SCREEN-ONLY tier ────────────────
  // The backend 403s a non-admin on the terminal decisions (resolved/rejected
  // — terminal, email the reporter) and on the Jira key, so the FE must never
  // surface a control that would trigger that 403.

  describe('role-gated triage controls (OBRS-370)', () => {
    it('an ADMIN sees the full decision dropdown (including resolved/rejected) and the Jira key field', () => {
      authServiceSpy.getRoles.and.returnValue(['admin']);
      primeReportList();

      expect(component['isAdmin']).withContext('admin must be detected as isAdmin').toBeTrue();

      const detailValues = component['detailStatusOptions'].map((o) => o.value);
      expect(detailValues)
        .withContext('admin must still see the full decision-only set, including dismissed and terminal outcomes')
        .toEqual(['accepted', 'dismissed', 'resolved', 'rejected']);

      const detailWithJira: UsabilityReportDetail = { ...mockFullDetail, jiraIssueKey: 'OBRS-123' };
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
        code: 200,
        message: 'OK',
        data: detailWithJira,
      }));
      component['openDetail']('rep-1');
      fixture.detectChanges();

      const jiraLink = fixture.nativeElement.querySelector('.ur-detail-modal a[target="_blank"]');
      expect(jiraLink).withContext('admin must still see the Jira key field').not.toBeNull();
    });

    it('a NON-admin (owner) sees only the non-terminal options (in_review/accepted) and never the Jira key field', () => {
      authServiceSpy.getRoles.and.returnValue(['owner']);
      primeReportList();

      expect(component['isAdmin']).withContext('a pure owner must not be detected as isAdmin').toBeFalse();

      const detailValues = component['detailStatusOptions'].map((o) => o.value);
      expect(detailValues)
        .withContext('owner is screen-only: forward-moving + dismiss, never a terminal outcome')
        .toEqual(['in_review', 'accepted', 'dismissed']);
      expect(detailValues)
        .withContext('owner must never be offered resolved/rejected — the backend 403s those')
        .not.toContain('resolved');
      expect(detailValues).not.toContain('rejected');

      // Even when the report already carries a Jira key (an admin set it
      // earlier), the owner must never see that field.
      const detailWithJira: UsabilityReportDetail = { ...mockFullDetail, jiraIssueKey: 'OBRS-123' };
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
        code: 200,
        message: 'OK',
        data: detailWithJira,
      }));
      component['openDetail']('rep-1');
      fixture.detectChanges();

      const jiraLink = fixture.nativeElement.querySelector('.ur-detail-modal a[target="_blank"]');
      expect(jiraLink).withContext('owner must never see the Jira key field').toBeNull();
    });

    it('does not pre-seed an owner-hidden terminal status when opening an already-resolved report', () => {
      authServiceSpy.getRoles.and.returnValue(['owner']);
      storeSpy.data$.next(pageWithStatus('resolved'));
      storeSpy.hasValue = true;
      fixture.detectChanges();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

      component['openDetail']('rep-1');
      fixture.detectChanges();

      expect(component['selectedDetailStatus'])
        .withContext('owner must not land with a hidden terminal value silently selected (Save disabled)')
        .toBe('');
    });
  });

  // ── OBRS-378: a row leaving the active tab is REMOVED, not just relabeled ──
  // The list is server-filtered (?status=), so a client-side patch that only
  // relabels a row leaves a stale, out-of-tab row visible until the next full
  // refresh. Both applyRowStatus() callers must remove it instead.
  describe('tab-leaving row removal (OBRS-378)', () => {
    function primeOnNewTab(): UsabilityReportPage {
      const page: UsabilityReportPage = {
        content: [
          { ...mockSummaryPage.content[0], status: 'new' },
          { id: 'rep-2', category: 'suggestion', status: 'new', userId: 7, descriptionPreview: 'other', imageCount: 0, createdAt: '2026-01-02T00:00:00Z' },
        ],
        totalElements: 2,
      };
      authServiceSpy.getRoles.and.returnValue(['owner']);
      storeSpy.data$.next(page);
      storeSpy.hasValue = true;
      fixture.detectChanges(); // ngOnInit seeds selectedStatusFilter = 'new'
      return page;
    }

    it('removes the row (not relabels it) when the silent auto-promote moves it out of the "new" tab', () => {
      const page = primeOnNewTab();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

      let mutated: UsabilityReportPage | undefined;
      storeSpy.mutate.and.callFake((transformFn: (current: UsabilityReportPage) => UsabilityReportPage) => {
        mutated = transformFn(page);
      });

      component['openDetail']('rep-1'); // auto-promotes 'new' -> 'in_review'

      expect(mutated?.content.some((r) => r.id === 'rep-1'))
        .withContext('a report promoted out of the active "new" tab must be removed, not relabeled')
        .toBeFalse();
      expect(mutated?.content.some((r) => r.id === 'rep-2'))
        .withContext('the sibling row on the same tab must be untouched')
        .toBeTrue();
      expect(mutated?.totalElements).toBe(1);
    });

    it('removes the row (the headline regression) when saveStatus() dismisses a report while viewing the "new" tab', () => {
      const page = primeOnNewTab();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({
        code: 200,
        message: 'OK',
        data: { ...mockFullDetail, id: 'rep-1', status: 'new' },
      }));
      adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(
        of({ code: 200, message: 'OK', data: null })
      );

      let mutated: UsabilityReportPage | undefined;
      storeSpy.mutate.and.callFake((transformFn: (current: UsabilityReportPage) => UsabilityReportPage) => {
        mutated = transformFn(page);
      });

      component['openDetail']('rep-1');
      fixture.detectChanges();
      component['selectedDetailStatus'] = 'dismissed';
      component.saveStatus();

      expect(mutated?.content.some((r) => r.id === 'rep-1'))
        .withContext('dismissing a report while its tab is "new" must remove the row, not relabel it in place')
        .toBeFalse();
      expect(mutated?.totalElements).toBe(1);
    });

    it('does NOT remove the row when the new status still matches the active tab', () => {
      const page = primeOnNewTab();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(new Observable());

      let mutated: UsabilityReportPage | undefined;
      storeSpy.mutate.and.callFake((transformFn: (current: UsabilityReportPage) => UsabilityReportPage) => {
        mutated = transformFn(page);
      });

      // Force selectedStatusFilter to 'in_review' so the auto-promote target
      // status matches the active tab (no removal expected).
      component['selectedStatusFilter'] = 'in_review';
      component['openDetail']('rep-1');

      const row = mutated?.content.find((r) => r.id === 'rep-1');
      expect(row).withContext('a row that stays within the active tab must be relabeled, not removed').toBeTruthy();
      expect(row?.status).toBe('in_review');
      expect(mutated?.totalElements).toBe(2);
    });
  });

  // ── OBRS-378: dismissed detail-modal 3-way branch ─────────────────────────
  describe('dismissed status detail-modal branch (OBRS-378)', () => {
    const dismissedDetail: UsabilityReportDetail = { ...mockFullDetail, status: 'dismissed' };

    it('admin sees the hint + a single "Pull Back to Review" primary button, no generic dropdown/Save', () => {
      authServiceSpy.getRoles.and.returnValue(['admin']);
      storeSpy.data$.next(pageWithStatus('dismissed'));
      storeSpy.hasValue = true;
      fixture.detectChanges();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({ code: 200, message: 'OK', data: dismissedDetail }));

      component['openDetail']('rep-1');
      fixture.detectChanges();

      const modal: HTMLElement = fixture.nativeElement.querySelector('.ur-detail-modal');
      expect(modal.querySelector('app-admin-dropdown'))
        .withContext('the generic decision dropdown must not render for a dismissed report')
        .toBeNull();

      const primaryButtons = modal.querySelectorAll('.admin-btn-primary');
      expect(primaryButtons.length).withContext('exactly one primary button').toBe(1);
      expect(primaryButtons[0].textContent).toContain('DETAIL.PULL_BACK_TO_REVIEW');
    });

    it('clicking "Pull Back to Review" saves the report as in_review', () => {
      authServiceSpy.getRoles.and.returnValue(['admin']);
      storeSpy.data$.next(pageWithStatus('dismissed'));
      storeSpy.hasValue = true;
      fixture.detectChanges();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({ code: 200, message: 'OK', data: dismissedDetail }));
      adminApiServiceSpy.updateUsabilityReportStatus.and.returnValue(of({ code: 200, message: 'OK', data: null }));

      component['openDetail']('rep-1');
      fixture.detectChanges();

      const modal: HTMLElement = fixture.nativeElement.querySelector('.ur-detail-modal');
      const pullBackBtn: HTMLButtonElement = modal.querySelector('.admin-btn-primary') as HTMLButtonElement;
      pullBackBtn.click();
      fixture.detectChanges();

      expect(adminApiServiceSpy.updateUsabilityReportStatus.calls.mostRecent().args)
        .toEqual(['rep-1', 'in_review', null]);
    });

    it('owner sees only a muted note, no dropdown and no button', () => {
      authServiceSpy.getRoles.and.returnValue(['owner']);
      storeSpy.data$.next(pageWithStatus('dismissed'));
      storeSpy.hasValue = true;
      fixture.detectChanges();
      adminApiServiceSpy.getUsabilityReportById.and.returnValue(of({ code: 200, message: 'OK', data: dismissedDetail }));

      component['openDetail']('rep-1');
      fixture.detectChanges();

      const modal: HTMLElement = fixture.nativeElement.querySelector('.ur-detail-modal');
      expect(modal.querySelector('app-admin-dropdown'))
        .withContext('no dropdown for an owner viewing a dismissed report')
        .toBeNull();
      expect(modal.querySelectorAll('.admin-btn-primary').length)
        .withContext('no primary button for an owner viewing a dismissed report')
        .toBe(0);
      expect(modal.textContent).toContain('DETAIL.DISMISSED_OWNER_NOTE');
    });
  });

  // ── OBRS-378: status filter dropdown drives store.setStatus ───────────────
  describe('status filter (OBRS-378)', () => {
    it('onStatusFilterChange forwards the chosen status to store.setStatus', () => {
      primeReportList();
      component['onStatusFilterChange']('resolved');

      expect(component['selectedStatusFilter']).toBe('resolved');
      expect(storeSpy.setStatus).toHaveBeenCalledWith('resolved');
    });

    it('maps an empty selection back to the role default instead of sending it to the server', () => {
      authServiceSpy.getRoles.and.returnValue(['owner']);
      primeReportList();
      storeSpy.setStatus.calls.reset();

      component['onStatusFilterChange']('');

      expect(component['selectedStatusFilter']).toBe('new');
      expect(storeSpy.setStatus).toHaveBeenCalledWith('new');
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { UsabilityReportsStore } from './usability-reports.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { UsabilityReportPage } from '../../../../shared/interfaces/usability-report.interface';

// OBRS-378: UsabilityReportsStore now parameterizes its fetch by a status tab
// (?status=) and a matching sort (FIFO for accepted/in_review, newest-first
// otherwise — see sortForStatus() in usability-reports-page.mappers.ts), and
// switching tabs must clear the single-slot cache so the previous tab's rows
// never briefly replay as the new tab's.
describe('UsabilityReportsStore', () => {
  let store: UsabilityReportsStore;
  let adminApiServiceSpy: jasmine.SpyObj<AdminApiService>;
  let authStatusSubject: BehaviorSubject<boolean>;

  const emptyPage: UsabilityReportPage = {
    content: [],
    totalElements: 0,
    totalPages: 0,
    size: 20,
    number: 0,
    numberOfElements: 0,
  };

  beforeEach(() => {
    authStatusSubject = new BehaviorSubject<boolean>(true);
    adminApiServiceSpy = jasmine.createSpyObj('AdminApiService', ['getUsabilityReports']);
    adminApiServiceSpy.getUsabilityReports.and.returnValue(
      of({ code: 200, message: 'OK', data: emptyPage })
    );

    TestBed.configureTestingModule({
      providers: [
        UsabilityReportsStore,
        { provide: AdminApiService, useValue: adminApiServiceSpy },
        {
          provide: AuthService,
          useValue: { authStatus$: authStatusSubject.asObservable() },
        },
      ],
    });

    store = TestBed.inject(UsabilityReportsStore);
  });

  it('fetches with no status/sort before setStatus is ever called, page 0 / size 20', async () => {
    await store.refresh();
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
      undefined,
      ['createdAt,desc', 'id,desc'],
      0,
      20
    );
  });

  it('setStatus("new") fetches with status="new" and a newest-first sort', async () => {
    await store.setStatus('new');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
      'new',
      ['createdAt,desc', 'id,desc'],
      0,
      20
    );
  });

  it('setStatus("accepted") fetches with status="accepted" and an oldest-first (FIFO) sort', async () => {
    await store.setStatus('accepted');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
      'accepted',
      ['createdAt,asc', 'id,asc'],
      0,
      20
    );
  });

  it('setStatus("in_review") also uses the oldest-first (FIFO) sort', async () => {
    await store.setStatus('in_review');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
      'in_review',
      ['createdAt,asc', 'id,asc'],
      0,
      20
    );
  });

  it('setStatus("dismissed") uses the newest-first sort (not FIFO)', async () => {
    await store.setStatus('dismissed');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
      'dismissed',
      ['createdAt,desc', 'id,desc'],
      0,
      20
    );
  });

  // OBRS-524: 'all' is a real, explicit filter value one layer up (the
  // component/dropdown), but the backend has no "all" slug — the store is
  // the single place that collapses it back to "omit ?status=" on the wire,
  // confirmed against the live backend (a null/blank status runs an
  // unfiltered findAll(), including 'duplicate'/'dismissed' rows).
  it('setStatus("all") (OBRS-524) omits the status param, so the backend returns every status', async () => {
    await store.setStatus('all');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
      undefined,
      ['createdAt,desc', 'id,desc'],
      0,
      20
    );
  });

  // ── OBRS-403: server-side page ──────────────────────────────────────────
  describe('setPage (OBRS-403)', () => {
    it('fetches page 2 (0-based: 1) with the current status/sort preserved', async () => {
      await store.setStatus('accepted');
      adminApiServiceSpy.getUsabilityReports.calls.reset();

      await store.setPage(1);

      expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
        'accepted',
        ['createdAt,asc', 'id,asc'],
        1,
        20
      );
    });

    it('clears the cached value (no stale-page flash) when the page actually changes', async () => {
      const page: UsabilityReportPage = {
        content: [
          {
            id: 'rep-1',
            category: 'bug',
            status: 'new',
            userId: null,
            descriptionPreview: 'x',
            imageCount: 0,
            createdAt: '2026-01-01T00:00:00Z',
            duplicateOfId: null,
            duplicateCount: 0,
          },
        ],
        totalElements: 21,
        totalPages: 2,
        size: 20,
        number: 0,
        numberOfElements: 1,
      };
      adminApiServiceSpy.getUsabilityReports.and.returnValue(
        of({ code: 200, message: 'OK', data: page })
      );
      await store.setStatus('new');
      expect(store.value).toEqual(page);

      const emissions: (UsabilityReportPage | null)[] = [];
      store.data$.subscribe((v) => emissions.push(v));

      adminApiServiceSpy.getUsabilityReports.and.returnValue(
        of({ code: 200, message: 'OK', data: emptyPage })
      );
      await store.setPage(1);

      expect(emissions[0]).toEqual(page, 'replays the previous value first (BehaviorSubject)');
      expect(emissions).toContain(null as unknown as UsabilityReportPage);
    });

    it('does not clear the cache (no-op) when setPage is called with the same page again', async () => {
      await store.setStatus('new');
      await store.setPage(2);

      let clearedToNull = false;
      store.data$.subscribe((v) => {
        if (v === null) {
          clearedToNull = true;
        }
      });

      await store.setPage(2);
      expect(clearedToNull).withContext('same-page setPage must not clear the cache').toBeFalse();
    });

    it('setStatus (tab switch) resets the page back to 0, not the previously-viewed page', async () => {
      await store.setStatus('accepted');
      await store.setPage(3);
      adminApiServiceSpy.getUsabilityReports.calls.reset();

      // Switching tabs must re-fetch page 0, even though the previous tab was
      // left on page 3 — a stale page number is the OBRS-403 regression this
      // pins.
      await store.setStatus('new');

      expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(
        'new',
        ['createdAt,desc', 'id,desc'],
        0,
        20
      );
    });
  });

  it('clears the cached value when the status actually changes (no stale-tab flash)', async () => {
    const page: UsabilityReportPage = {
      content: [
        {
          id: 'rep-1',
          category: 'bug',
          status: 'new',
          userId: null,
          descriptionPreview: 'x',
          imageCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
          duplicateOfId: null,
          duplicateCount: 0,
        },
      ],
      totalElements: 1,
      totalPages: 1,
      size: 20,
      number: 0,
      numberOfElements: 1,
    };
    adminApiServiceSpy.getUsabilityReports.and.returnValue(
      of({ code: 200, message: 'OK', data: page })
    );
    await store.setStatus('new');
    expect(store.value).toEqual(page);

    // Switching tabs: the cache must be cleared (null) synchronously before
    // the new fetch resolves — asserted by observing the emission sequence.
    const emissions: (UsabilityReportPage | null)[] = [];
    store.data$.subscribe((v) => emissions.push(v));

    adminApiServiceSpy.getUsabilityReports.and.returnValue(
      of({ code: 200, message: 'OK', data: emptyPage })
    );
    await store.setStatus('accepted');

    expect(emissions[0]).toEqual(page, 'replays the previous value first (BehaviorSubject)');
    expect(emissions).toContain(null as unknown as UsabilityReportPage);
  });

  it('does not clear the cache (no-op) when setStatus is called with the same status again', async () => {
    const page: UsabilityReportPage = {
      content: [],
      totalElements: 5,
      totalPages: 1,
      size: 20,
      number: 0,
      numberOfElements: 0,
    };
    adminApiServiceSpy.getUsabilityReports.and.returnValue(
      of({ code: 200, message: 'OK', data: page })
    );
    await store.setStatus('new');

    let clearedToNull = false;
    store.data$.subscribe((v) => {
      if (v === null) {
        clearedToNull = true;
      }
    });

    await store.setStatus('new');
    expect(clearedToNull).withContext('same-status setStatus must not clear the cache').toBeFalse();
  });
});

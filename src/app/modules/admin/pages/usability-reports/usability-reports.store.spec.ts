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

  const emptyPage: UsabilityReportPage = { content: [], totalElements: 0 };

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

  it('fetches with no status/sort before setStatus is ever called', async () => {
    await store.refresh();
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith(undefined, ['createdAt,desc', 'id,desc']);
  });

  it('setStatus("new") fetches with status="new" and a newest-first sort', async () => {
    await store.setStatus('new');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith('new', ['createdAt,desc', 'id,desc']);
  });

  it('setStatus("accepted") fetches with status="accepted" and an oldest-first (FIFO) sort', async () => {
    await store.setStatus('accepted');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith('accepted', ['createdAt,asc', 'id,asc']);
  });

  it('setStatus("in_review") also uses the oldest-first (FIFO) sort', async () => {
    await store.setStatus('in_review');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith('in_review', ['createdAt,asc', 'id,asc']);
  });

  it('setStatus("dismissed") uses the newest-first sort (not FIFO)', async () => {
    await store.setStatus('dismissed');
    expect(adminApiServiceSpy.getUsabilityReports).toHaveBeenCalledWith('dismissed', ['createdAt,desc', 'id,desc']);
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
    const page: UsabilityReportPage = { content: [], totalElements: 5 };
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

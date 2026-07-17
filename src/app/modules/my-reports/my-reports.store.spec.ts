import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { MyReportsStore } from './my-reports.store';
import { UsabilityReportService } from '../../services/usability-report/usability-report.service';
import { AuthService } from '../../auth/auth.service';
import { MyUsabilityReportPage } from '../../shared/interfaces/usability-report.interface';

describe('MyReportsStore', () => {
  let store: MyReportsStore;
  let serviceSpy: jasmine.SpyObj<UsabilityReportService>;
  let authStatusSubject: BehaviorSubject<boolean>;

  const emptyPage: MyUsabilityReportPage = {
    content: [],
    totalElements: 0,
    totalPages: 0,
    size: 20,
    number: 0,
    numberOfElements: 0,
  };

  function pageOf(ids: number[], number: number, totalPages: number, totalElements: number): MyUsabilityReportPage {
    return {
      content: ids.map((id) => ({
        id,
        category: 'bug',
        status: 'new',
        descriptionPreview: `preview ${id}`,
        imageCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
      })),
      totalElements,
      totalPages,
      size: 20,
      number,
      numberOfElements: ids.length,
    };
  }

  beforeEach(() => {
    authStatusSubject = new BehaviorSubject<boolean>(true);
    serviceSpy = jasmine.createSpyObj('UsabilityReportService', ['getMyReports']);
    serviceSpy.getMyReports.and.returnValue(of({ code: 200, message: 'OK', data: emptyPage }));

    TestBed.configureTestingModule({
      providers: [
        MyReportsStore,
        { provide: UsabilityReportService, useValue: serviceSpy },
        { provide: AuthService, useValue: { authStatus$: authStatusSubject.asObservable() } },
      ],
    });

    store = TestBed.inject(MyReportsStore);
  });

  it('fetch() requests page 0, size 20, newest-first sort', async () => {
    await store.refresh();
    expect(serviceSpy.getMyReports).toHaveBeenCalledWith(0, 20, 'createdAt,desc');
  });

  it('loadMore() is a no-op when there is no cached value yet', async () => {
    await store.loadMore();
    expect(serviceSpy.getMyReports).not.toHaveBeenCalled();
  });

  it('loadMore() fetches the NEXT page and APPENDS it after the current content', async () => {
    serviceSpy.getMyReports.and.returnValue(of({ code: 200, message: 'OK', data: pageOf([1, 2], 0, 2, 21) }));
    await store.refresh();
    expect(store.value?.content.map((r) => r.id)).toEqual([1, 2]);

    serviceSpy.getMyReports.and.returnValue(of({ code: 200, message: 'OK', data: pageOf([3], 1, 2, 21) }));
    await store.loadMore();

    expect(serviceSpy.getMyReports).toHaveBeenCalledWith(1, 20, 'createdAt,desc');
    expect(store.value?.content.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(store.value?.number).toBe(1);
  });

  it('loadMore() is a no-op when already on the last page', async () => {
    serviceSpy.getMyReports.and.returnValue(of({ code: 200, message: 'OK', data: pageOf([1], 0, 1, 1) }));
    await store.refresh();
    serviceSpy.getMyReports.calls.reset();

    await store.loadMore();

    expect(serviceSpy.getMyReports).not.toHaveBeenCalled();
  });

  it('loadMore() ignores a concurrent call while one is already in flight', async () => {
    serviceSpy.getMyReports.and.returnValue(of({ code: 200, message: 'OK', data: pageOf([1, 2], 0, 3, 60) }));
    await store.refresh();
    serviceSpy.getMyReports.calls.reset();

    const inFlight$ = new Subject<{ code: number; message: string; data: MyUsabilityReportPage }>();
    serviceSpy.getMyReports.and.returnValue(inFlight$.asObservable());

    // The synchronous portion of an async function runs immediately on call
    // (up to its first `await`), so by the time `secondCall` is issued the
    // first call has already flipped loadingMoreSubject to true.
    const firstCall = store.loadMore();
    const secondCall = store.loadMore();

    inFlight$.next({ code: 200, message: 'OK', data: pageOf([3], 1, 3, 60) });
    inFlight$.complete();
    await Promise.all([firstCall, secondCall]);

    // Only ONE fetch — the second, concurrent loadMore() was a no-op.
    expect(serviceSpy.getMyReports).toHaveBeenCalledTimes(1);
    expect(store.value?.content.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('mutate() (used by the edit-save optimistic patch) does not go through loadMore/refresh at all', async () => {
    serviceSpy.getMyReports.and.returnValue(of({ code: 200, message: 'OK', data: pageOf([1], 0, 1, 1) }));
    await store.refresh();
    serviceSpy.getMyReports.calls.reset();

    store.mutate((current) => ({
      ...current,
      content: current.content.map((r) => ({ ...r, category: 'suggestion' })),
    }));

    expect(serviceSpy.getMyReports).not.toHaveBeenCalled();
    expect(store.value?.content[0].category).toBe('suggestion');
  });
});

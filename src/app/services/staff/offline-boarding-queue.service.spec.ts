import { TestBed } from '@angular/core/testing';
import { IDB_FACTORY, OfflineBoardingQueueService } from './offline-boarding-queue.service';

/** Resolves/rejects on a microtask, so the service's `onsuccess`/`onerror`
 * assignments (which happen synchronously after the call) are already in place. */
function fakeRequest(run: () => unknown): any {
  const request: any = { onsuccess: null, onerror: null, result: undefined };
  void Promise.resolve().then(() => {
    try {
      request.result = run();
      request.onsuccess?.();
    } catch {
      request.onerror?.();
    }
  });
  return request;
}

/** OBRS-142: an in-spec `IDBFactory` — a Map behind the three request shapes
 * the service actually uses. No npm fake-indexeddb (the card forbids adding a
 * dependency), and no production abstraction over IndexedDB either: the only
 * seam is the injected factory. */
function createFakeIndexedDb(opts: { failWrite?: boolean; failOpen?: boolean } = {}): any {
  const data = new Map<string, any>();
  let upgraded = false;
  const db: any = {
    close: jasmine.createSpy('close'),
    createObjectStore: jasmine.createSpy('createObjectStore'),
    transaction: jasmine.createSpy('transaction').and.returnValue({
      objectStore: () => ({
        add: (row: any) =>
          fakeRequest(() => {
            if (opts.failWrite) {
              throw new Error('quota exceeded');
            }
            data.set(row.clientRef, row);
            return row.clientRef;
          }),
        getAll: () => fakeRequest(() => Array.from(data.values())),
        delete: (key: string) =>
          fakeRequest(() => {
            data.delete(key);
            return undefined;
          }),
      }),
    }),
  };

  return {
    data,
    db,
    open: jasmine.createSpy('open').and.callFake(() => {
      const request: any = { onsuccess: null, onerror: null, onupgradeneeded: null, result: db };
      void Promise.resolve().then(() => {
        if (opts.failOpen) {
          request.onerror?.();
          return;
        }
        if (!upgraded) {
          upgraded = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    }),
  };
}

function createService(idbFactory: any): OfflineBoardingQueueService {
  TestBed.configureTestingModule({
    providers: [{ provide: IDB_FACTORY, useValue: idbFactory }],
  });
  return TestBed.inject(OfflineBoardingQueueService);
}

describe('OfflineBoardingQueueService (OBRS-142)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('enqueue() stores the scan under a generated clientRef and keeps capturedAt verbatim', async () => {
    const idb = createFakeIndexedDb();
    const service = createService(idb);

    const stored = await service.enqueue({
      token: 'signed.jwt.token',
      scheduleId: 42,
      capturedAt: '2026-09-10T01:05:00.000Z',
    });

    expect(stored).toBeTrue();
    const rows = await service.list();
    expect(rows.length).toBe(1);
    expect(rows[0].token).toBe('signed.jwt.token');
    expect(rows[0].scheduleId).toBe(42);
    // The scan moment, NOT a sync-time re-stamp — the backend persists this as
    // boarded_at, which is the whole point of the card.
    expect(rows[0].capturedAt).toBe('2026-09-10T01:05:00.000Z');
    expect(rows[0].clientRef).toBeTruthy();
    expect(idb.db.createObjectStore).toHaveBeenCalled();
  });

  it('each enqueue gets its own clientRef (no client-side dedup — the server CAS owns that)', async () => {
    const service = createService(createFakeIndexedDb());

    await service.enqueue({ token: 't', scheduleId: 42, capturedAt: '2026-09-10T01:00:00.000Z' });
    await service.enqueue({ token: 't', scheduleId: 42, capturedAt: '2026-09-10T01:00:01.000Z' });

    const rows = await service.list();
    expect(rows.length).toBe(2);
    expect(rows[0].clientRef).not.toBe(rows[1].clientRef);
  });

  it('list()/count() narrow to one schedule when asked', async () => {
    const service = createService(createFakeIndexedDb());
    await service.enqueue({ token: 'a', scheduleId: 42, capturedAt: '2026-09-10T01:00:00.000Z' });
    await service.enqueue({ token: 'b', scheduleId: 99, capturedAt: '2026-09-10T01:00:00.000Z' });

    expect((await service.list(42)).map((row) => row.token)).toEqual(['a']);
    expect(await service.count(42)).toBe(1);
    expect(await service.count()).toBe(2);
  });

  it('remove() drops exactly the named row', async () => {
    const service = createService(createFakeIndexedDb());
    await service.enqueue({ token: 'a', scheduleId: 42, capturedAt: '2026-09-10T01:00:00.000Z' });
    await service.enqueue({ token: 'b', scheduleId: 42, capturedAt: '2026-09-10T01:00:00.000Z' });
    const rows = await service.list();

    await service.remove(rows[0].clientRef);

    expect((await service.list()).map((row) => row.token)).toEqual(['b']);
  });

  it('degrades to a no-op when IndexedDB is unavailable — never throws', async () => {
    const service = createService(null);

    await expectAsync(
      service.enqueue({ token: 'a', scheduleId: 42, capturedAt: '2026-09-10T01:00:00.000Z' })
    ).toBeResolvedTo(false);
    await expectAsync(service.list()).toBeResolvedTo([]);
    await expectAsync(service.count()).toBeResolvedTo(0);
    await expectAsync(service.remove('missing')).toBeResolved();
  });

  it('reports a refused write as NOT captured, so the caller cannot claim a capture that does not exist', async () => {
    const service = createService(createFakeIndexedDb({ failWrite: true }));

    const stored = await service.enqueue({
      token: 'a',
      scheduleId: 42,
      capturedAt: '2026-09-10T01:00:00.000Z',
    });

    expect(stored).toBeFalse();
    expect(await service.count()).toBe(0);
  });

  it('a refused open degrades the same way as a missing IndexedDB', async () => {
    const service = createService(createFakeIndexedDb({ failOpen: true }));

    await expectAsync(service.list()).toBeResolvedTo([]);
    await expectAsync(
      service.enqueue({ token: 'a', scheduleId: 42, capturedAt: '2026-09-10T01:00:00.000Z' })
    ).toBeResolvedTo(false);
  });
});

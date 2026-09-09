import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { AdminCollectionStore } from './admin-collection-store';

interface Data {
  items: number[];
}

class TestStore extends AdminCollectionStore<Data> {
  fetchImpl: () => Promise<Data> = () => Promise.resolve({ items: [] });
  fetchCalls = 0;

  constructor(authStatus$ = new BehaviorSubject<boolean>(true)) {
    super({ authStatus$ } as any);
  }

  protected fetch(): Promise<Data> {
    this.fetchCalls += 1;
    return this.fetchImpl();
  }
}

/** A promise whose resolution we control, to model an in-flight fetch. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('AdminCollectionStore', () => {
  it('populates the cache on refresh', async () => {
    const store = new TestStore();
    store.fetchImpl = () => Promise.resolve({ items: [1, 2, 3] });

    await store.refresh();

    expect(store.value).toEqual({ items: [1, 2, 3] });
    expect(store.hasValue).toBeTrue();
  });

  // The point of the pattern: a recreated component subscribing on re-entry
  // gets the cached value synchronously (BehaviorSubject replay), no refetch.
  it('replays the cached value synchronously to a new subscriber', async () => {
    const store = new TestStore();
    store.fetchImpl = () => Promise.resolve({ items: [7] });
    await store.refresh();

    let received: Data | null | undefined;
    store.data$.subscribe((value) => (received = value));

    expect(received).toEqual({ items: [7] });
  });

  it('keeps the cached value and flags error when a refresh fails', async () => {
    const store = new TestStore();
    store.fetchImpl = () => Promise.resolve({ items: [1] });
    await store.refresh();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    store.fetchImpl = () => Promise.reject(new Error('network'));
    await store.refresh();

    expect(store.value).toEqual({ items: [1] }); // stale value retained
    expect(errored).toBeTrue();
  });

  it('leaves the cache null and not stuck when the first load fails', async () => {
    const store = new TestStore();
    store.fetchImpl = () => Promise.reject(new Error('down'));

    await store.refresh();

    expect(store.value).toBeNull();
    expect(store.hasValue).toBeFalse();

    // recovers on a later successful refresh
    store.fetchImpl = () => Promise.resolve({ items: [9] });
    await store.refresh();
    expect(store.value).toEqual({ items: [9] });
  });

  // OBRS-467: an axis change (a subclass's setPage/setStatus) clear()s the
  // single-slot cache, then revalidates. If that revalidate FAILS, the just-
  // discarded value must NOT come back — the base leaves value=null +
  // error=true and never resurrects the cleared value as stale SWR data. The
  // keep-stale-on-error contract above is only correct for a SAME-axis
  // revalidate that still HAS a cached value; a cleared cache has none to keep.
  // (This is the store-side half of the fix: a consumer that guards `if(data)`
  // and ignores the null emission is what re-surfaced the discarded rows under
  // the error banner — see usability-reports-page.component.spec.ts.)
  it('does not resurrect a cleared value when the following refresh fails (value stays null, error flagged)', async () => {
    const store = new TestStore();
    store.fetchImpl = () => Promise.resolve({ items: [1, 2] });
    await store.refresh();
    expect(store.value).toEqual({ items: [1, 2] });

    // Axis change: clear() first (data -> null), then revalidate.
    store.clear();
    expect(store.value).toBeNull();

    let errored = false;
    store.error$.subscribe((value) => (errored = value));

    store.fetchImpl = () => Promise.reject(new Error('network'));
    await store.refresh();

    expect(store.value)
      .withContext('a cleared value must not reappear as stale data on a failed reload')
      .toBeNull();
    expect(store.hasValue).toBeFalse();
    expect(errored).toBeTrue();
  });

  it('dedupes a concurrent refresh into a single extra fetch (post-write freshness)', async () => {
    const store = new TestStore();
    const first = deferred<Data>();
    store.fetchImpl = () => first.promise;

    const inFlight = store.refresh(); // starts fetch #1, now in flight
    void store.refresh(); // arrives mid-flight -> requests one rerun
    void store.refresh(); // collapses into the same single rerun

    expect(store.fetchCalls).toBe(1);

    store.fetchImpl = () => Promise.resolve({ items: [42] });
    first.resolve({ items: [1] }); // fetch #1 resolves -> rerun fires fetch #2
    await inFlight;

    expect(store.fetchCalls).toBe(2); // exactly one rerun, not three
    expect(store.value).toEqual({ items: [42] }); // reflects the latest fetch
  });

  // A mutation does `await store.refresh()` then reads the data. Even if a
  // background revalidate was already in flight, the awaited refresh must
  // resolve only once a fetch that started after the call has landed.
  it('a concurrent refresh stays awaitable until post-write data lands', async () => {
    const store = new TestStore();
    const background = deferred<Data>();
    store.fetchImpl = () => background.promise;

    const inFlight = store.refresh(); // background revalidate, in flight

    store.fetchImpl = () => Promise.resolve({ items: [99] }); // the "write"
    const afterWrite = store.refresh(); // arrives mid-flight, must await the rerun

    background.resolve({ items: [1] }); // stale fetch resolves -> rerun fires
    await afterWrite;

    expect(store.value).toEqual({ items: [99] }); // awaiter saw fresh data
    await inFlight;
  });

  it('clears the cache on logout', async () => {
    const authStatus$ = new BehaviorSubject<boolean>(true);
    const store = new TestStore(authStatus$);
    store.fetchImpl = () => Promise.resolve({ items: [1] });
    await store.refresh();
    expect(store.hasValue).toBeTrue();

    authStatus$.next(false);

    expect(store.value).toBeNull();
  });

  describe('mutate', () => {
    it('transforms and re-emits the cached value synchronously to data$', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.resolve({ items: [1, 2, 3] });
      await store.refresh();

      const emitted: Array<Data | null> = [];
      store.data$.subscribe((value) => emitted.push(value));
      // At this point, BehaviorSubject has already replayed the cached value.
      expect(emitted).toEqual([{ items: [1, 2, 3] }]);

      store.mutate((d) => ({ items: d.items.filter((i) => i !== 2) }));

      // mutate must emit synchronously — no await needed.
      expect(emitted).toEqual([{ items: [1, 2, 3] }, { items: [1, 3] }]);
      expect(store.value).toEqual({ items: [1, 3] });
    });

    it('is a no-op when the cache is null — does not emit a transformed value', () => {
      const store = new TestStore();
      // No refresh: cache is null.

      const emitted: Array<Data | null> = [];
      store.data$.subscribe((value) => emitted.push(value));
      expect(emitted).toEqual([null]); // BehaviorSubject initial replay

      store.mutate((d) => ({ items: [...d.items, 99] }));

      // Must not have emitted anything extra after the replay.
      expect(emitted).toEqual([null]);
      expect(store.value).toBeNull();
    });
  });

  // OBRS-1639: the no-op above is right for a T that excludes null, and wrong
  // for the three subclasses whose T is `Something | null` — there the cache
  // being null can mean "the server answered null", and a write that already
  // holds the new value must still be able to put it in. set() is that path.
  describe('set', () => {
    it('emits the new value even when the cache is null', () => {
      const store = new TestStore();

      const emitted: Array<Data | null> = [];
      store.data$.subscribe((value) => emitted.push(value));
      expect(emitted).toEqual([null]); // BehaviorSubject initial replay

      store.set({ items: [99] });

      expect(emitted).toEqual([null, { items: [99] }]);
      expect(store.value).toEqual({ items: [99] });
    });

    it('replaces an existing cached value', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.resolve({ items: [1, 2] });
      await store.refresh();

      store.set({ items: [3] });

      expect(store.value).toEqual({ items: [3] });
    });
  });

  // OBRS-424: lastFetchedAt$ backs the "Unable to refresh — showing data from
  // {{time}}" banner (UX-OBRS-424-fleet-live-map.md §9.5). It must be honest
  // about the STORE's own fetch success/failure, independent of any
  // per-row staleness the payload itself carries.
  describe('lastFetchedAt$', () => {
    it('is null before the first fetch', () => {
      const store = new TestStore();
      let value: Date | null | undefined = undefined;
      store.lastFetchedAt$.subscribe((v) => (value = v));
      expect(value).toBeNull();
    });

    it('emits a new Date on every successful run()', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.resolve({ items: [1] });

      await store.refresh();
      let first: Date | null | undefined;
      // MUST unsubscribe before the second refresh. A left-open subscription
      // on a BehaviorSubject keeps writing into `first`, so the later
      // `first` vs `second` comparison compares the SECOND Date to itself —
      // the assertion then holds no matter what run() does, including if the
      // second fetch never stamped at all.
      const sub = store.lastFetchedAt$.subscribe((v) => (first = v));
      sub.unsubscribe();
      expect(first).not.toBeNull();

      await new Promise((r) => setTimeout(r, 5));
      await store.refresh();
      let second: Date | null | undefined;
      store.lastFetchedAt$.subscribe((v) => (second = v)).unsubscribe();

      expect(second).not.toBeNull();
      // Identity, not just >=: two stamps taken inside the same millisecond
      // are `getTime()`-equal, so only a distinct instance proves the second
      // successful run() actually re-stamped.
      expect(second).not.toBe(first as unknown as Date);
      expect((second as unknown as Date).getTime()).toBeGreaterThanOrEqual((first as unknown as Date).getTime());
    });

    it('does not update on a failed run()', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.resolve({ items: [1] });
      await store.refresh();

      let stamped: Date | null | undefined;
      store.lastFetchedAt$.subscribe((v) => (stamped = v));
      const afterSuccess = stamped;

      store.fetchImpl = () => Promise.reject(new Error('network'));
      await store.refresh();

      let afterFailure: Date | null | undefined;
      store.lastFetchedAt$.subscribe((v) => (afterFailure = v));

      expect(afterFailure).toBe(afterSuccess as Date);
    });

    it('resets to null on clear()', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.resolve({ items: [1] });
      await store.refresh();

      let stamped: Date | null | undefined;
      store.lastFetchedAt$.subscribe((v) => (stamped = v));
      expect(stamped).not.toBeNull();

      store.clear();

      let afterClear: Date | null | undefined;
      store.lastFetchedAt$.subscribe((v) => (afterClear = v));
      expect(afterClear).toBeNull();
    });

    it('resets to null on logout (authStatus$ -> false)', async () => {
      const authStatus$ = new BehaviorSubject<boolean>(true);
      const store = new TestStore(authStatus$);
      store.fetchImpl = () => Promise.resolve({ items: [1] });
      await store.refresh();

      let stamped: Date | null | undefined;
      store.lastFetchedAt$.subscribe((v) => (stamped = v));
      expect(stamped).not.toBeNull();

      authStatus$.next(false);

      let afterLogout: Date | null | undefined;
      store.lastFetchedAt$.subscribe((v) => (afterLogout = v));
      expect(afterLogout).toBeNull();
    });
  });

  // OBRS-727: error$ alone cannot tell "the backend is unreachable" from "you
  // are not allowed to see this", which is why an owner's 403 on
  // GET /api/private/admin/bookings rendered as the generic LOAD_FAILED text.
  describe('errorStatus$', () => {
    function httpError(status: number): HttpErrorResponse {
      return new HttpErrorResponse({ status, statusText: 'x', url: '/api/x' });
    }

    it('is null before any fetch', () => {
      const store = new TestStore();
      let value: number | null | undefined = undefined;
      store.errorStatus$.subscribe((v) => (value = v));
      expect(value).toBeNull();
      expect(store.errorStatus).toBeNull();
    });

    it('carries the HTTP status of a failed fetch', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.reject(httpError(403));

      await store.refresh();

      expect(store.errorStatus).toBe(403);
    });

    it('is null when the failure is not an HttpErrorResponse', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.reject(new Error('boom'));

      await store.refresh();

      let value: number | null | undefined;
      store.errorStatus$.subscribe((v) => (value = v));
      expect(value)
        .withContext('a non-HTTP failure must not be reported as some HTTP status')
        .toBeNull();
    });

    // The ordering contract the component depends on: it branches on
    // `store.errorStatus` from INSIDE its error$ handler, so the status must
    // already be the one belonging to this failure when error$ fires. Written
    // the other way round, a 403 following a 500 would be styled as a 500.
    it('is updated BEFORE error$ emits, so an error$ subscriber reads this failure\'s status', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.reject(httpError(500));
      await store.refresh();

      const seen: Array<number | null> = [];
      store.error$.subscribe((failed) => {
        if (failed) {
          seen.push(store.errorStatus);
        }
      });
      // The replay above already recorded the 500.
      expect(seen).toEqual([500]);

      store.fetchImpl = () => Promise.reject(httpError(403));
      await store.refresh();

      expect(seen)
        .withContext('the second emission must carry 403, not the previous 500')
        .toEqual([500, 403]);
    });

    it('resets to null once a fetch succeeds again', async () => {
      const store = new TestStore();
      store.fetchImpl = () => Promise.reject(httpError(403));
      await store.refresh();
      expect(store.errorStatus).toBe(403);

      store.fetchImpl = () => Promise.resolve({ items: [1] });
      await store.refresh();

      expect(store.errorStatus).toBeNull();
    });

    it('resets to null on clear() / logout', async () => {
      const authStatus$ = new BehaviorSubject<boolean>(true);
      const store = new TestStore(authStatus$);
      store.fetchImpl = () => Promise.reject(httpError(403));
      await store.refresh();
      expect(store.errorStatus).toBe(403);

      authStatus$.next(false);

      expect(store.errorStatus).toBeNull();
    });
  });

  // OBRS-1346: 9 of the 54 subclasses are listed in a component's own
  // `providers: []`, so a new instance is built on every mount and dropped on
  // destroy. These count the subscribers on authStatus$ itself — asserting that
  // ngOnDestroy was *called* would still pass with the unsubscribe deleted.
  describe('teardown', () => {
    it('leaves no subscriber on authStatus$ after destroy', () => {
      const authStatus$ = new BehaviorSubject<boolean>(true);
      expect(authStatus$.observers.length).toBe(0);

      const store = new TestStore(authStatus$);
      expect(authStatus$.observers.length)
        .withContext('the constructor subscribes')
        .toBe(1);

      store.ngOnDestroy();

      expect(authStatus$.observers.length)
        .withContext('destroying the store must return that subscription')
        .toBe(0);
    });

    it('does not accumulate subscribers as a component-scoped store is recreated', () => {
      const authStatus$ = new BehaviorSubject<boolean>(true);

      for (let open = 0; open < 5; open += 1) {
        const store = new TestStore(authStatus$);
        store.ngOnDestroy();
      }

      expect(authStatus$.observers.length)
        .withContext('5 panel opens must not leave 5 live subscriptions')
        .toBe(0);
    });
  });
});

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
});

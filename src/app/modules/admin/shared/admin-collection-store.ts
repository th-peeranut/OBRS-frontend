import { BehaviorSubject, Observable } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';

/**
 * Root-scoped stale-while-revalidate cache for an admin page's data.
 *
 * Admin pages fetch in `ngOnInit` and the app has no `RouteReuseStrategy`, so
 * Angular destroys/recreates the component on every navigation — re-entering a
 * page used to re-fetch everything and make the user wait. A subclass of this
 * store is `providedIn: 'root'`, so it outlives the component: re-entry replays
 * the cached value *synchronously* (no network wait), then `refresh()`
 * revalidates in the background and the component updates when fresh data lands.
 *
 * Generalised from the original `AdminDashboardStore`.
 */
export abstract class AdminCollectionStore<T> {
  private readonly dataSubject = new BehaviorSubject<T | null>(null);
  private readonly refreshingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<boolean>(false);

  /** Cached value, or null before the first successful load. Replays on subscribe. */
  readonly data$: Observable<T | null> = this.dataSubject.asObservable();
  /** True while a background revalidate is in flight. */
  readonly refreshing$: Observable<boolean> = this.refreshingSubject.asObservable();
  /** True when the most recent fetch failed (the cached value, if any, is kept). */
  readonly error$: Observable<boolean> = this.errorSubject.asObservable();

  /** Set when refresh() is called mid-flight, forcing one more fetch afterwards. */
  private rerunRequested = false;
  /** The in-flight refresh cycle, shared by concurrent callers so they await it. */
  private inFlight: Promise<void> | null = null;

  protected constructor(authService: AuthService) {
    // The cache is root-scoped and outlives the session. Drop it on logout (or
    // token expiry) so a different admin can't briefly see the previous
    // session's data before the next background refresh lands.
    authService.authStatus$.subscribe((isAuthenticated) => {
      if (!isAuthenticated) {
        this.clear();
      }
    });
  }

  get value(): T | null {
    return this.dataSubject.value;
  }

  get hasValue(): boolean {
    return this.dataSubject.value !== null;
  }

  /** Forget the cached value (e.g. on logout). */
  clear(): void {
    this.dataSubject.next(null);
    this.errorSubject.next(false);
  }

  /**
   * Apply a transform to the cached value and emit it immediately (optimistic
   * update), so the UI reflects a local mutation without waiting on the
   * background revalidate. No-op when there's no cached value yet.
   */
  mutate(transform: (current: T) => T): void {
    const current = this.dataSubject.value;
    if (current !== null) {
      this.dataSubject.next(transform(current));
    }
  }

  /**
   * Revalidate in the background. The cached value stays visible throughout.
   *
   * Concurrent calls are deduped into a single in-flight cycle (no parallel
   * fetches), but a call that arrives mid-flight requests one more fetch when
   * the current one finishes AND returns the same in-flight promise — so
   * `await refresh()` triggered right after a create/update/delete always
   * resolves once data reflecting the write has landed, even if a background
   * revalidate was already running.
   */
  refresh(): Promise<void> {
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.inFlight;
    }

    this.inFlight = this.run();
    return this.inFlight.finally(() => {
      this.inFlight = null;
    });
  }

  private async run(): Promise<void> {
    this.refreshingSubject.next(true);
    try {
      do {
        this.rerunRequested = false;
        try {
          const data = await this.fetch();
          this.dataSubject.next(data);
          this.errorSubject.next(false);
        } catch {
          // Keep the prior cached value; flag the error so the component can
          // surface its own message (only meaningful when there's no cache).
          this.errorSubject.next(true);
        }
      } while (this.rerunRequested);
    } finally {
      this.refreshingSubject.next(false);
    }
  }

  /** Fetch the page's data. Implemented by each per-page store. */
  protected abstract fetch(): Promise<T>;
}

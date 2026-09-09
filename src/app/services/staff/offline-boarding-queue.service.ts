import { Inject, Injectable, InjectionToken } from '@angular/core';
import { generateIdempotencyKey } from '../../shared/lib/idempotency-key';
import { BoardingScanBatchItem } from '../../shared/interfaces/ticket-boarding.interface';

/**
 * OBRS-142: the browser's `IDBFactory`. Injected rather than read straight off
 * `globalThis` for ONE reason — a spec has to be able to drive this store with
 * an in-spec stub (and to prove the no-IndexedDB degradation by providing
 * `null`). It is not an abstraction over IndexedDB: the service below talks to
 * the raw API, and no npm shim is involved.
 */
export const IDB_FACTORY = new InjectionToken<IDBFactory | null>('OBRS_IDB_FACTORY', {
  providedIn: 'root',
  factory: () => (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? null,
});

const DB_NAME = 'obrs-offline-boarding';
const STORE_NAME = 'pending-scans';
const DB_VERSION = 1;

/**
 * OBRS-142: the on-device queue of boarding scans captured while the staff
 * device had no network, drained by `BoardingListComponent` through
 * `StaffApiService.boardingScanBatch()` (backend OBRS-243) once it reconnects.
 *
 * `capturedAt` is stamped by the caller at the moment of the scan and stored
 * verbatim — the backend persists it as `boarded_at`, so re-stamping at sync
 * time would record the wrong boarding moment (the whole point of the card).
 *
 * Every method degrades to "nothing queued" when IndexedDB is unavailable
 * (private mode, a locked-down device, a runner without it) instead of
 * throwing, so the scan box behaves exactly as it did before this card.
 */
@Injectable({ providedIn: 'root' })
export class OfflineBoardingQueueService {
  constructor(@Inject(IDB_FACTORY) private readonly idbFactory: IDBFactory | null) {}

  /** Stores one captured scan. Returns false when it could NOT be stored — the
   * caller must not then tell the operator the scan was captured. */
  async enqueue(scan: Omit<BoardingScanBatchItem, 'clientRef'>): Promise<boolean> {
    const row: BoardingScanBatchItem = { clientRef: generateIdempotencyKey(), ...scan };
    // `add()` resolves the stored key, so a non-null result means it landed.
    return (await this.request('readwrite', (store) => store.add(row))) !== null;
  }

  /** Pending scans, optionally narrowed to one schedule. */
  async list(scheduleId?: number): Promise<BoardingScanBatchItem[]> {
    const rows = await this.request<BoardingScanBatchItem[]>('readonly', (store) => store.getAll());
    const all = rows ?? [];
    return scheduleId === undefined ? all : all.filter((row) => row.scheduleId === scheduleId);
  }

  async count(scheduleId?: number): Promise<number> {
    return (await this.list(scheduleId)).length;
  }

  async remove(clientRef: string): Promise<void> {
    await this.request('readwrite', (store) => store.delete(clientRef));
  }

  /** Runs one request against the pending-scan store. Resolves `null` on any
   * failure — an unavailable factory, a refused open, or a failed request. */
  private request<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T | null> {
    return this.open().then(
      (db) =>
        new Promise<T | null>((resolve) => {
          if (!db) {
            resolve(null);
            return;
          }
          const done = (value: T | null): void => {
            db.close();
            resolve(value);
          };
          try {
            const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
            request.onsuccess = () => done(request.result);
            request.onerror = () => done(null);
          } catch {
            done(null);
          }
        })
    );
  }

  private open(): Promise<IDBDatabase | null> {
    const factory = this.idbFactory;
    if (!factory) {
      return Promise.resolve(null);
    }

    return new Promise<IDBDatabase | null>((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'clientRef' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }
}

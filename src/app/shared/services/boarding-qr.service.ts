import { Injectable, OnDestroy } from '@angular/core';
import { Subject, catchError, forkJoin, map, of, takeUntil } from 'rxjs';
import QRCode from 'qrcode';
import { TicketService } from '../../services/ticket/ticket.service';

/** Resolved QR state for one ticket — data-URL to render, or an
 * "unavailable" flag when the boarding-token fetch failed for that ticket
 * specifically (OBRS-96). */
export interface BoardingQrState {
  qrDataUrl: string;
  qrUnavailable: boolean;
}

/**
 * OBRS-96 boarding-token QR pipeline — the single implementation shared by
 * `ETicketComponent` (customer e-ticket) and `SellReceiptPageComponent`
 * (staff walk-in receipt), extracted out of both (OBRS-221) so there really
 * is exactly one QR pipeline in the codebase.
 *
 * Deliberately **not** `providedIn: 'root'`. The dedupe/cache state below
 * (`qrStateByTicketId` / `fetchedTicketIds`) must live and die with a single
 * page-view, exactly like the two private fields it replaces used to on each
 * component instance — a root singleton would leak resolved (short-lived!)
 * boarding tokens across unrelated page visits and never release them.
 * Add `providers: [BoardingQrService]` to any `@Component` that uses this so
 * each instantiation gets its own instance; Angular then also calls this
 * service's own `ngOnDestroy()` when that component is destroyed, which is
 * what unsubscribes any in-flight fetch (own internal `destroy$`, not the
 * caller's — the service owns its own lifecycle once component-scoped).
 */
@Injectable()
export class BoardingQrService implements OnDestroy {
  /** Resolved QR data-URL / unavailable-flag per `ticketId`, keyed outside
   * any caller's row array so it survives that array being rebuilt (e.g. a
   * locale switch re-running the caller's mapping function). */
  private readonly qrStateByTicketId = new Map<number, BoardingQrState>();
  /** Guards against re-issuing the boarding-token GET for a ticket that is
   * already fetched or in flight. */
  private readonly fetchedTicketIds = new Set<number>();
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly ticketService: TicketService) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Synchronous lookup of a ticket's already-resolved QR state — used by
   * callers to seed a freshly-rebuilt row (e.g. on a locale switch) so it
   * doesn't flash blank while the dedupe guard skips re-fetching. */
  getState(ticketId: number): BoardingQrState | undefined {
    return this.qrStateByTicketId.get(ticketId);
  }

  /**
   * Fetch one boarding token per pending ticketId (skipping ids already
   * fetched/in-flight — the dedupe guard) and render each as its own QR.
   * `forkJoin` with a per-inner `catchError` means one ticket's failure
   * (e.g. 409 `TICKET_NOT_CONFIRMED` on a cancelled/refunded/rescheduled-away
   * leg) resolves to a "no token" sentinel instead of erroring the whole
   * `forkJoin` — every other ticket's QR still renders.
   *
   * `skipGlobalLoadingAlert` is forwarded to `TicketService.getBoardingToken`
   * verbatim, and only when `true` — the receipt page opts out (own inline
   * spinner) while the e-ticket page keeps its original call shape.
   *
   * No-ops (never calls `onUpdated`) when every id is already fetched — this
   * matches the original per-component method, which simply `return`ed with
   * nothing scheduled.
   *
   * `onUpdated` is invoked as the very last statement of the same async
   * routine that mutates the internal state map (not chained via a
   * Promise/Observable `.then`), so its timing matches the original
   * component-owned implementation exactly: when none of the pending tickets
   * actually has a token to render as a QR, resolution never crosses an
   * `await`, and `onUpdated` fires synchronously within the caller's own
   * call stack (existing specs assert on this). When at least one ticket
   * does have a token, `QRCode.toDataURL` is awaited and `onUpdated` fires
   * once rendering settles, same as before.
   */
  fetchBoardingTokens(
    ticketIds: (number | null)[],
    onUpdated: () => void,
    skipGlobalLoadingAlert = false
  ): void {
    const pendingTicketIds = ticketIds.filter(
      (ticketId): ticketId is number =>
        ticketId !== null && !this.fetchedTicketIds.has(ticketId)
    );

    if (pendingTicketIds.length === 0) {
      return;
    }
    pendingTicketIds.forEach((ticketId) => this.fetchedTicketIds.add(ticketId));

    forkJoin(
      pendingTicketIds.map((ticketId) =>
        // Keep the call shape byte-identical to what each caller used to
        // issue directly: only pass the second arg when opting in, so a
        // spy asserting on call args still sees the same call.
        (skipGlobalLoadingAlert
          ? this.ticketService.getBoardingToken(ticketId, true)
          : this.ticketService.getBoardingToken(ticketId)
        ).pipe(
          map((response) => ({
            ticketId,
            boardingToken: response?.data?.boardingToken?.trim() ?? '',
          })),
          // Isolate this ticket's failure (409 TICKET_NOT_CONFIRMED, 404, a
          // transient network error, ...) so it can't blank the rest of the
          // page — surfaced downstream as an empty boardingToken (placeholder).
          catchError(() => of({ ticketId, boardingToken: '' }))
        )
      )
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe((results) => {
        void this.applyResults(results, onUpdated);
      });
  }

  private async applyResults(
    results: { ticketId: number; boardingToken: string }[],
    onUpdated: () => void
  ): Promise<void> {
    for (const result of results) {
      if (!result.boardingToken) {
        this.qrStateByTicketId.set(result.ticketId, { qrDataUrl: '', qrUnavailable: true });
        continue;
      }

      try {
        const qrDataUrl = await QRCode.toDataURL(result.boardingToken, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        this.qrStateByTicketId.set(result.ticketId, { qrDataUrl, qrUnavailable: false });
      } catch {
        this.qrStateByTicketId.set(result.ticketId, { qrDataUrl: '', qrUnavailable: true });
      }
    }

    onUpdated();
  }
}

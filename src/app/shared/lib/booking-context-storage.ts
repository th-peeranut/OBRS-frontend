import {
  Schedule,
  ScheduleFilter,
  ScheduleFilterPayload,
} from '../interfaces/schedule.interface';
import { clearTtl, readWithTtl, writeWithTtl } from './ttl-storage';

/**
 * OBRS-903: the pre-login booking context — what the customer had already
 * chosen when `AuthGuard` sent them to `/login`, and nothing else.
 *
 * The path this exists for: a first-time booker searches, picks a trip, is
 * bounced to `/login`, registers, then has to leave the browser to click the
 * verification link in their mail app — which opens a NEW TAB. A new tab is a
 * fresh NgRx store, so without this the trip selection is gone and they start
 * over from the search form. (`BookingService.java` throws
 * `EmailNotVerifiedException` until the address is verified, so that detour
 * through the inbox is not optional.)
 *
 * ⛔ **PDPA boundary — this envelope holds trip identifiers only.** The search
 * criteria, the search payload that produced the result list, and the
 * `Schedule` rows the customer picked. It must never carry a passenger or
 * booker name, phone number, e-mail address, identity-card number, or ANY
 * payment detail. Keeping typed-in form values across the login hop is a
 * separate and deliberately gated card (OBRS-904) precisely because those are
 * personal data written to the customer's own machine. Adding a field here that
 * identifies a person is a PDPA decision, not a refactor.
 *
 * Lifetime: the TTL below, refreshed on every write (sliding). Also dropped on
 * an explicit deselect and on logout. It is deliberately NOT dropped when a
 * booking is created — payment can still be retried from the same context, and
 * the entry names no person, so letting the TTL retire it is the safe order.
 */
export const BOOKING_CONTEXT_KEY = 'obrs.booking_context';
const BOOKING_CONTEXT_VERSION = 1;

/**
 * 30 minutes. Long enough to open a mail app, find the verification mail and
 * come back; short enough that a restored selection is still plausibly for sale.
 * It is not a correctness guarantee either way — `revalidateSelection` re-asks
 * the backend before the customer is allowed to build on a restored selection.
 */
export const BOOKING_CONTEXT_TTL_MS = 30 * 60 * 1000;

export interface BookingContext {
  /** UI-shaped search form value, so `/schedule-booking` can repopulate. */
  filter: ScheduleFilter | null;
  /** The exact `POST /api/schedules/search` body that produced the result list
   *  the selection came from — re-validation replays this rather than rebuilding
   *  it from `filter`, which would need the station list to map id → slug. */
  searchPayload: ScheduleFilterPayload | null;
  selection: Schedule[] | null;
}

/**
 * Whether the selection currently in play came out of storage rather than from
 * a choice made in THIS tab. Only a restored selection needs re-validating —
 * one just picked here was matched against a live search seconds ago.
 *
 * MODULE-scoped for the same reason `station.effect.ts`'s session guard is: the
 * effects that read it are registered via `EffectsModule.forFeature` in several
 * lazy modules, so NgRx builds one instance per module injector and an instance
 * field would reset on entering each module.
 */
let selectionRestoredFromStorage = false;

/** Test-only: resets the module-scoped restore flag between specs. */
export function resetBookingContextRestoreFlag(): void {
  selectionRestoredFromStorage = false;
}

export function readBookingContext(): BookingContext | null {
  return readWithTtl<BookingContext>(
    BOOKING_CONTEXT_KEY,
    BOOKING_CONTEXT_TTL_MS,
    BOOKING_CONTEXT_VERSION
  );
}

/**
 * Merges `patch` into the stored context and refreshes its `savedAt`. Reading
 * first means a filter written on the search page and a selection written on
 * the results page end up in one entry that expires as a unit — a filter with
 * no selection, or the reverse, would restore a half-state.
 */
function mergeBookingContext(patch: Partial<BookingContext>): void {
  const current = readBookingContext();
  const next: BookingContext = {
    filter: current?.filter ?? null,
    searchPayload: current?.searchPayload ?? null,
    selection: current?.selection ?? null,
    ...patch,
  };

  if (!next.filter && !next.searchPayload && !next.selection) {
    clearBookingContext();
    return;
  }

  writeWithTtl(BOOKING_CONTEXT_KEY, next, BOOKING_CONTEXT_VERSION);
}

export function rememberBookingFilter(filter: ScheduleFilter | null): void {
  mergeBookingContext({ filter });
}

export function rememberBookingSearchPayload(
  searchPayload: ScheduleFilterPayload | null
): void {
  mergeBookingContext({ searchPayload });
}

/**
 * Records the trips the customer picked. A `null`/empty selection is a
 * deselect: it drops the stored selection (keeping the filter, so the search
 * page still repopulates) and clears the restore flag — the state in play is now
 * this tab's, whatever storage used to hold.
 */
export function rememberBookingSelection(selection: Schedule[] | null): void {
  selectionRestoredFromStorage = false;
  mergeBookingContext({ selection: selection?.length ? selection : null });
}

/**
 * The selection to seed the `scheduleBooking` reducer with. Called from that
 * reducer's `initialState` (the pattern `station.reducer.ts` already uses), so
 * the store of a freshly bootstrapped tab starts out holding what the previous
 * tab had chosen.
 */
export function restoreBookingSelection(): Schedule[] | null {
  const selection = readBookingContext()?.selection ?? null;
  if (selection?.length) {
    selectionRestoredFromStorage = true;
    return selection;
  }
  return null;
}

/** Companion of the above for the search filter. Carries no restore flag —
 *  a filter is re-run against the backend by the search page anyway. */
export function restoreBookingFilter(): ScheduleFilter | null {
  return readBookingContext()?.filter ?? null;
}

export function isBookingSelectionRestored(): boolean {
  return selectionRestoredFromStorage;
}

/**
 * Reads the flag and lowers it, so a restored selection is re-validated ONCE.
 *
 * `ScheduleBookingEffect` is registered by five lazy modules and NgRx builds one
 * instance per module injector, so a plain read would have every loaded instance
 * fire its own search off the same action — and the two pages that dispatch it
 * are entered back to back. Lowering the flag on the first read is what keeps
 * that a single request.
 */
export function consumeBookingSelectionRestoredFlag(): boolean {
  const wasRestored = selectionRestoredFromStorage;
  selectionRestoredFromStorage = false;
  return wasRestored;
}

export function clearBookingContext(): void {
  selectionRestoredFromStorage = false;
  clearTtl(BOOKING_CONTEXT_KEY);
}

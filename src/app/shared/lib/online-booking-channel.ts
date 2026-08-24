import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

/**
 * OBRS-1583 — TEMPORARY, and the whole of it goes when the flag does.
 *
 * While `onlineTicketBooking` is false the funnel is shut for everyone, which
 * includes the people who need to walk it before it reopens. These roles keep
 * walking it. Delete this constant, the second arm of
 * {@link isOnlineTicketBookingOpen} and its parameter once the flag is
 * permanently true — at that point the first arm answers for everybody and this
 * one can only be a source of confusion.
 *
 * `['driver']` alone would be the identical predicate — owner, admin and
 * salesperson all carry `driver` in `ROLE_GRANTS` and `hasAnyRole()` expands a
 * held role downwards — but it reads as "drivers only", which is the opposite
 * of what the owner asked for. Spelled in full on purpose, the same way
 * `requiredRoles: ['admin', 'owner']` is spelled in full in the admin module:
 * those literals "record intent, they do not gate" (OBRS-446, auth.service.ts).
 *
 * ⛔ Do NOT shorten this list in a refactor.
 */
export const ONLINE_TICKET_BOOKING_PREVIEW_ROLES = [
  'owner',
  'admin',
  'salesperson',
  'driver',
];

/**
 * OBRS-1302 — the one place that answers "can the person looking at this page
 * buy a seat right now, and if not, where do we send them instead".
 *
 * WHY A HELPER AND NOT `environment.features.onlineTicketBooking` INLINE
 *
 * THREE readers need the answer — the notice banner, the trip list's
 * call-to-action, and the route guards (through `onlineTicketBookingGuard`,
 * which delegates here; see the OBRS-1583 note below for why that wiring is the
 * whole point) — and AC-5 of that card is that reopening is ONE value change
 * with nothing left behind. Reading the raw field in each file is how that
 * becomes one more file: the extra reader is the one somebody adds later with a
 * subtly different condition (`!== true`, or a cached boolean captured at
 * construction), and it stays wrong long after the flag is flipped back because
 * nothing fails.
 *
 * ⚠️ OBRS-1583 — the route guards are a SEPARATE READ PATH and this comment
 * used to imply otherwise ("read in three unrelated places — the route guards,
 * the notice banner, and the trip list"). `featureEnabledGuard` reads
 * `environment.features[feature]` directly and never called this function, so
 * anyone who changed only this file got a screen that argued with itself: the
 * "choose this trip" button appeared and the banner vanished, and then the
 * click bounced off the guard back to '/'. The three routes now run
 * `onlineTicketBookingGuard`, which delegates here — keep it that way, and if a
 * fourth reader ever appears, route it through this function too.
 *
 * 🔴 THIS IS NOT A SECURITY GATE, and nothing downstream may treat it as one.
 * Two independent reasons: (1) `getRoles()` reads localStorage, which the
 * browser user can edit at will (OBRS-601 says so in auth.service.ts itself);
 * (2) OBRS-1302 closed the funnel on the FRONTEND ONLY — the booking endpoints
 * are still open and will accept whatever reaches them. Someone who edits their
 * own localStorage walks the funnel and the backend takes the booking. That is
 * accepted knowingly: it is no worse than today, and what actually keeps
 * customers out is the UI they arrive at from Google, not an auth check. A real
 * gate is a separate backend card.
 *
 * Read live on every call on purpose — never cache the value in a field
 * initialiser. Specs flip `environment.features.onlineTicketBooking` between
 * arms, and a value captured at construction would make the second arm pass for
 * the wrong reason.
 */
export function isOnlineTicketBookingOpen(auth: AuthService): boolean {
  if (environment.features.onlineTicketBooking === true) {
    return true;
  }
  return auth.hasAnyRole(ONLINE_TICKET_BOOKING_PREVIEW_ROLES);
}

/**
 * Where a customer is sent while online booking is closed.
 *
 * This is the owner's own channel and the one they actually answer — chosen
 * over a phone number on 2026-08-13 because a page keeps the conversation in
 * writing and does not need somebody free to pick up.
 *
 * The footer keeps its own hardcoded copy of this URL alongside Instagram, Line
 * and the rest of the social block; that block is a list of contact links and
 * is not this card's to restructure. If the page ever moves, `grep -r
 * nj.phuyaipu src` finds both.
 */
export const NJ_FACEBOOK_PAGE_URL = 'https://www.facebook.com/nj.phuyaipu';

import { environment } from '../../../environments/environment';

/**
 * OBRS-1302 — the one place that answers "can a customer buy a seat on this
 * site right now, and if not, where do we send them instead".
 *
 * WHY A HELPER AND NOT `environment.features.onlineTicketBooking` INLINE
 *
 * The flag is read in three unrelated places — the route guards, the notice
 * banner, and the trip list's call-to-action — and AC-5 of the card is that
 * reopening is ONE value change with nothing left behind. Reading the raw field
 * in three files is how that becomes four files: the fourth reader is the one
 * somebody adds later with a subtly different condition (`!== true`, or a
 * cached boolean captured at construction), and it stays wrong long after the
 * flag is flipped back because nothing fails.
 *
 * Read live on every call on purpose — never cache the value in a field
 * initialiser. Specs flip `environment.features.onlineTicketBooking` between
 * arms, and a value captured at construction would make the second arm pass for
 * the wrong reason.
 */
export function isOnlineTicketBookingOpen(): boolean {
  return environment.features.onlineTicketBooking === true;
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

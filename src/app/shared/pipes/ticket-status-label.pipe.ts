import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * The ticket statuses a boarding manifest row can carry — the server's
 * `TicketService.BOARDING_LIST_STATUSES`. Every other status of `ETicketStatus` is filtered out of
 * the manifest query, so translating those here would be translating rows that never arrive.
 */
const TICKET_STATUS_CODES = new Set(['confirmed', 'checked_in', 'no_show']);

/**
 * OBRS-1969 — renders a ticket status from its CODE in the language being read, the same
 * FE-takeover as title code (OBRS-1232) and stop label (OBRS-1967).
 *
 * The row already carries both halves: `status.code` and `status.label`, the latter resolved by the
 * server from the `Accept-Language` of the REQUEST. Printing that label is what froze the badge in
 * the fetch-time language while the rest of the table switched.
 *
 * An unknown code falls back to the server's own word rather than to the key or to nothing
 * (AC-3, the same intent as `TitleLabelPipe`'s verbatim branch): a status this build has never
 * heard of still has to be readable, and the server's label is the best word available for it.
 *
 * `pure: false` for the reason the whole card exists: the input — the code — does not change when
 * the reader switches language, so a pure pipe would keep the cached word on screen until the next
 * refetch. The work per call is one Set lookup and one already-loaded translation read.
 */
@Pipe({
  name: 'ticketStatusLabel',
  standalone: true,
  pure: false,
})
export class TicketStatusLabelPipe implements PipeTransform {
  constructor(private readonly translate: TranslateService) {}

  transform(code: string | null | undefined, serverLabel?: string | null): string {
    const trimmed = (code ?? '').trim();
    if (!TICKET_STATUS_CODES.has(trimmed)) {
      return (serverLabel ?? '').trim() || trimmed;
    }
    return this.translate.instant(`COMMON.TICKET_STATUS.${trimmed}`);
  }
}

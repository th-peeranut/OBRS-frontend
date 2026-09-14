import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { BoardingTokenDto } from '../../shared/interfaces/ticket-boarding.interface';

/**
 * Customer-facing, per-ticket endpoints (OBRS-96). Kept separate from
 * `BookingService` (booking-scoped: reschedule/change-seat/change-stop) and
 * `StaffApiService` (staff/operator-scoped) since this is a single-ticket,
 * customer-authenticated concern.
 */
@Injectable({ providedIn: 'root' })
export class TicketService {
  constructor(private readonly http: HttpClient) {}

  /**
   * Fetch the signed, short-lived boarding token used to render this
   * ticket's QR on the e-ticket page. Deliberately does NOT set
   * `SKIP_AUTH_LOGOUT` — a 401 here is the customer's own expired session
   * and should force-logout like any other authenticated customer call
   * (unlike the staff `boarding-scan` POST in `staff-api.service.ts`, which
   * opts out as defense-in-depth against the OBRS-187 force-logout bug).
   *
   * Contract: GET /api/private/tickets/{id}/boarding-token (see
   * docs/handoff.md Contract Requests — the backend implementation lands in
   * parallel on `ao/obrs-96-eticket-qr`, OBRS-backend).
   */
  // OBRS-908 removed this method's loading-alert opt-out parameter. It existed
  // because every `/api/` request raised the blocking overlay, so the staff
  // sell-receipt page — which renders its own inline spinner and fetches a token PER
  // TICKET — had to opt each one out or the dialog popped again over an already
  // rendered receipt. Fetching a QR token is a page loading its own data, so it no
  // longer raises anything and both callers are back to the same call.
  getBoardingToken(ticketId: number): Observable<ResponseAPI<BoardingTokenDto>> {
    return this.http.get<ResponseAPI<BoardingTokenDto>>(
      `${environment.apiUrl}/api/private/tickets/${ticketId}/boarding-token`
    );
  }
}

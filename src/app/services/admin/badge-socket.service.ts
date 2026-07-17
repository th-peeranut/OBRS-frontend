import { Injectable } from '@angular/core';
import { Client, IMessage, StompConfig } from '@stomp/stompjs';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

// OBRS-147: real-time admin "new usability report" count badge over a native
// WebSocket STOMP connection — additive to the existing 60s poll /
// NavigationEnd / countAdjustments$ signals in AdminLayoutComponent
// (watchNewReportCount()), NOT a replacement for them. The badge must keep
// working from those fallbacks if the socket is down.
//
// LOCKED CONTRACT (BE+FE agreed, do not change):
//   - STOMP endpoint: native WebSocket (no SockJS) at `/ws` on the backend
//     HOST ROOT (NOT under `/api`).
//   - Subscribe destination: `/topic/admin/usability-report-count`.
//   - Payload (OBRS-378): `{ "newReportCount": <number>, "acceptedReportCount":
//     <number> }` — backward-compatible on the wire (the pre-OBRS-378 FE only
//     read newReportCount, and the backend still always sends it). The whole
//     message is emitted on counts$ so AdminLayoutComponent can select the
//     field for its own badgeStatus, keeping that role decision in one file.
const ADMIN_REPORT_COUNT_DESTINATION = '/topic/admin/usability-report-count';
const STOMP_RECONNECT_DELAY_MS = 5000;
const STOMP_HEARTBEAT_MS = 10000;

export interface UsabilityReportCountMessage {
  newReportCount: number;
  acceptedReportCount: number;
}

@Injectable({ providedIn: 'root' })
export class BadgeSocketService {
  private readonly countsSubject = new Subject<UsabilityReportCountMessage>();
  readonly counts$: Observable<UsabilityReportCountMessage> = this.countsSubject.asObservable();

  private client: Client | null = null;

  constructor(private readonly authService: AuthService) {}

  connect(): void {
    if (this.client?.active) {
      return;
    }

    this.client = this.createClient({
      brokerURL: this.resolveBrokerUrl(),
      connectHeaders: {
        Authorization: `Bearer ${this.authService.getToken() ?? ''}`,
      },
      reconnectDelay: STOMP_RECONNECT_DELAY_MS,
      heartbeatIncoming: STOMP_HEARTBEAT_MS,
      heartbeatOutgoing: STOMP_HEARTBEAT_MS,
      onConnect: () => {
        this.client?.subscribe(ADMIN_REPORT_COUNT_DESTINATION, (frame: IMessage) => {
          const payload = JSON.parse(frame.body) as UsabilityReportCountMessage;
          this.countsSubject.next(payload);
        });
      },
    });

    this.client.activate();
  }

  disconnect(): void {
    this.client?.deactivate();
    this.client = null;
  }

  // Extracted so specs can substitute a fake STOMP Client (spyOn(service,
  // 'createClient')) instead of opening a real WebSocket connection.
  protected createClient(config: StompConfig): Client {
    return new Client(config);
  }

  // Derives the native-WebSocket STOMP broker URL from the HTTP API base
  // (`environment.apiUrl`). `AdminApiService.baseUrl` appends `/api` to this
  // same value for REST calls; the backend's STOMP endpoint is registered at
  // the servlet ROOT (`/ws`), NOT under `/api` — this strips any trailing
  // `/api` segment (defensive; `environment.apiUrl` doesn't carry one today,
  // see environment.base.ts / environment.sit.ts) and swaps the http(s)
  // scheme for ws(s) so the URL resolves to `<host>/ws`.
  private resolveBrokerUrl(): string {
    const httpBase = environment.apiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    const wsBase = httpBase
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');
    return `${wsBase}/ws`;
  }
}

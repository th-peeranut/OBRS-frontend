import { TestBed } from '@angular/core/testing';
import { Client, StompConfig } from '@stomp/stompjs';
import { BadgeSocketService } from './badge-socket.service';
import { AuthService } from '../../auth/auth.service';

// Mirrors the repo's convention of substituting a hand-rolled fake for a
// third-party client rather than opening a real connection in specs.
interface FakeStompClient {
  active: boolean;
  connectHeaders?: { Authorization: string };
  activate: jasmine.Spy;
  deactivate: jasmine.Spy;
  subscribe: jasmine.Spy;
}

describe('BadgeSocketService', () => {
  let service: BadgeSocketService;
  let authServiceStub: { getToken: jasmine.Spy };
  let capturedConfig: StompConfig;
  let fakeClient: FakeStompClient;

  beforeEach(() => {
    authServiceStub = {
      getToken: jasmine.createSpy('getToken').and.returnValue('test-jwt-token'),
    };

    TestBed.configureTestingModule({
      providers: [
        BadgeSocketService,
        { provide: AuthService, useValue: authServiceStub },
      ],
    });

    service = TestBed.inject(BadgeSocketService);

    fakeClient = {
      active: false,
      activate: jasmine.createSpy('activate'),
      deactivate: jasmine.createSpy('deactivate'),
      subscribe: jasmine.createSpy('subscribe'),
    };

    // `createClient` is a protected extraction point specifically so specs
    // can intercept the STOMP Client construction (see badge-socket.service.ts).
    spyOn<any>(service, 'createClient').and.callFake((config: StompConfig) => {
      capturedConfig = config;
      return fakeClient;
    });
  });

  // OBRS-1425: `connectHeaders` on the config is read once at activate() time and
  // replayed verbatim on every auto-reconnect. The token therefore has to be read
  // in `beforeConnect`, which stompjs calls before EVERY CONNECT.
  it('reads the token on every CONNECT attempt via beforeConnect, not once at activate() time', () => {
    service.connect();

    capturedConfig.beforeConnect?.(fakeClient as unknown as Client);
    expect(authServiceStub.getToken).toHaveBeenCalled();
    expect(fakeClient.connectHeaders).toEqual({ Authorization: 'Bearer test-jwt-token' });

    // A reconnect after the session refreshed must carry the NEW token.
    authServiceStub.getToken.and.returnValue('refreshed-jwt-token');
    capturedConfig.beforeConnect?.(fakeClient as unknown as Client);

    expect(fakeClient.connectHeaders).toEqual({ Authorization: 'Bearer refreshed-jwt-token' });
    expect(capturedConfig.connectHeaders).toBeUndefined();
    expect(fakeClient.activate).toHaveBeenCalled();
  });

  it('resolves the broker URL to the backend host root /ws (native WebSocket, not under /api)', () => {
    service.connect();

    expect(capturedConfig.brokerURL).toMatch(/^wss?:\/\/.+\/ws$/);
    expect(capturedConfig.brokerURL).not.toContain('/api/ws');
  });

  it('subscribes to /topic/admin/usability-report-count on connect and emits the parsed message (both counts) on counts$', () => {
    service.connect();

    // Simulate the STOMP client firing onConnect.
    capturedConfig.onConnect?.({} as never);

    expect(fakeClient.subscribe).toHaveBeenCalledWith(
      '/topic/admin/usability-report-count',
      jasmine.any(Function)
    );

    const frameHandler = fakeClient.subscribe.calls.mostRecent().args[1] as (frame: {
      body: string;
    }) => void;

    let emitted: { newReportCount: number; ownerAcceptedReportCount: number } | undefined;
    service.counts$.subscribe((counts) => (emitted = counts));

    frameHandler({ body: JSON.stringify({ newReportCount: 3, ownerAcceptedReportCount: 9 }) });

    expect(emitted).toEqual({ newReportCount: 3, ownerAcceptedReportCount: 9 });
  });

  it('disconnect() deactivates the client', () => {
    service.connect();
    service.disconnect();

    expect(fakeClient.deactivate).toHaveBeenCalled();
  });

  it('connect() is a no-op when a client is already active', () => {
    service.connect();
    fakeClient.active = true;
    service.connect();

    expect(fakeClient.activate).toHaveBeenCalledTimes(1);
  });

  it('stops instead of retrying when there is no token to send (OBRS-1425)', () => {
    service.connect();
    authServiceStub.getToken.and.returnValue(null);

    capturedConfig.beforeConnect?.(fakeClient as unknown as Client);

    expect(fakeClient.deactivate).toHaveBeenCalled();
    expect(fakeClient.connectHeaders).toBeUndefined();
  });

  it('stops retrying once the server rejects the CONNECT - a STOMP ERROR frame means the credentials are dead, so a retry can never succeed (OBRS-1425)', () => {
    service.connect();

    capturedConfig.onStompError?.({} as never);

    expect(fakeClient.deactivate).toHaveBeenCalledTimes(1);
  });

  it('still reconnects after a transient drop - a socket close with a live token carries no ERROR frame, so nothing deactivates and the 5s reconnectDelay stands (OBRS-1425)', () => {
    service.connect();

    expect(capturedConfig.reconnectDelay).toBe(5000);
    expect(capturedConfig.onWebSocketClose).toBeUndefined();

    // stompjs's own reconnect calls beforeConnect again; a live token must re-arm
    // the header and leave the client active.
    capturedConfig.beforeConnect?.(fakeClient as unknown as Client);

    expect(fakeClient.deactivate).not.toHaveBeenCalled();
    expect(fakeClient.connectHeaders).toEqual({ Authorization: 'Bearer test-jwt-token' });
  });
});

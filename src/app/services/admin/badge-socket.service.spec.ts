import { TestBed } from '@angular/core/testing';
import { StompConfig } from '@stomp/stompjs';
import { BadgeSocketService } from './badge-socket.service';
import { AuthService } from '../../auth/auth.service';

// Mirrors the repo's convention of substituting a hand-rolled fake for a
// third-party client rather than opening a real connection in specs.
interface FakeStompClient {
  active: boolean;
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

  it('connects with the Authorization: Bearer <token> connect header from AuthService.getToken()', () => {
    service.connect();

    expect(authServiceStub.getToken).toHaveBeenCalled();
    expect(capturedConfig.connectHeaders).toEqual({ Authorization: 'Bearer test-jwt-token' });
    expect(fakeClient.activate).toHaveBeenCalled();
  });

  it('resolves the broker URL to the backend host root /ws (native WebSocket, not under /api)', () => {
    service.connect();

    expect(capturedConfig.brokerURL).toMatch(/^wss?:\/\/.+\/ws$/);
    expect(capturedConfig.brokerURL).not.toContain('/api/ws');
  });

  it('subscribes to /topic/admin/usability-report-count on connect and emits the parsed newReportCount on count$', () => {
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

    let emitted: number | undefined;
    service.count$.subscribe((count) => (emitted = count));

    frameHandler({ body: JSON.stringify({ newReportCount: 3 }) });

    expect(emitted).toBe(3);
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
});

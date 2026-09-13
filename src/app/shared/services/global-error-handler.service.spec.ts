import { GlobalErrorHandler } from './global-error-handler.service';

class TestableHandler extends GlobalErrorHandler {
  reloads = 0;
  protected override reload(): void {
    this.reloads += 1;
  }
}

describe('GlobalErrorHandler', () => {
  let handler: TestableHandler;
  let consoleError: jasmine.Spy;

  beforeEach(() => {
    sessionStorage.removeItem(GlobalErrorHandler.RELOAD_FLAG);
    handler = new TestableHandler();
    consoleError = spyOn(console, 'error');
  });

  afterEach(() => {
    sessionStorage.removeItem(GlobalErrorHandler.RELOAD_FLAG);
  });

  it('reloads once on a stale-chunk error and does not log it', () => {
    const error = new Error('Loading chunk 123 failed');
    error.name = 'ChunkLoadError';

    handler.handleError(error);

    expect(handler.reloads).toBe(1);
    expect(consoleError).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(GlobalErrorHandler.RELOAD_FLAG)).toBeTruthy();
  });

  it('does not reload a second time in the same session - logs instead of looping', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: https://x/chunk-ABC.js');

    handler.handleError(error);
    handler.handleError(error);

    expect(handler.reloads).toBe(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('unwraps an unhandled promise rejection before classifying it', () => {
    handler.handleError({ rejection: new Error('Importing a module script failed.') });

    expect(handler.reloads).toBe(1);
  });

  it('logs an ordinary error and never reloads', () => {
    const error = new Error('Cannot read properties of undefined');

    handler.handleError(error);

    expect(handler.reloads).toBe(0);
    expect(consoleError).toHaveBeenCalledWith(error);
    expect(sessionStorage.getItem(GlobalErrorHandler.RELOAD_FLAG)).toBeNull();
  });

  /**
   * OBRS-1853: the flag stored an ISO timestamp that nothing ever read, so a session got one
   * reload for its whole life. The tab this class exists for - a payment page left open for
   * hours - meets a second deploy and got a console line and a dead button. The cooldown keeps
   * the loop protection (a real loop re-fails within seconds) and recovers from a later deploy.
   */
  it('reloads again once the cooldown has passed', () => {
    const error = new Error('ChunkLoadError: Loading chunk 7 failed');

    handler.handleError(error);
    expect(handler.reloads).toBe(1);

    const stale = new Date(Date.now() - GlobalErrorHandler.RELOAD_COOLDOWN_MS - 1000);
    sessionStorage.setItem(GlobalErrorHandler.RELOAD_FLAG, stale.toISOString());

    handler.handleError(error);

    expect(handler.reloads).toBe(2);
  });

  it('refuses a second reload inside the cooldown, however recent the first', () => {
    const error = new Error('ChunkLoadError: Loading chunk 7 failed');
    const recent = new Date(Date.now() - GlobalErrorHandler.RELOAD_COOLDOWN_MS + 60_000);
    sessionStorage.setItem(GlobalErrorHandler.RELOAD_FLAG, recent.toISOString());

    handler.handleError(error);

    expect(handler.reloads).toBe(0);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('treats an unparseable stored value as "just reloaded", then re-stamps it so the tab can recover', () => {
    sessionStorage.setItem(GlobalErrorHandler.RELOAD_FLAG, 'true');

    handler.handleError(new Error('ChunkLoadError: Loading chunk 7 failed'));

    expect(handler.reloads).toBe(0);
    // Left as 'true' it would refuse for the rest of the session, however long the tab lives.
    const stamped = sessionStorage.getItem(GlobalErrorHandler.RELOAD_FLAG);
    expect(Number.isNaN(Date.parse(stamped ?? ''))).toBeFalse();
  });

  it('classifies only chunk-load shaped messages', () => {
    expect(GlobalErrorHandler.isStaleChunkError(new Error('ChunkLoadError: x'))).toBeTrue();
    expect(GlobalErrorHandler.isStaleChunkError('error loading dynamically imported module')).toBeTrue();
    expect(GlobalErrorHandler.isStaleChunkError(new Error('Http failure response'))).toBeFalse();
    expect(GlobalErrorHandler.isStaleChunkError(null)).toBeFalse();
  });
});

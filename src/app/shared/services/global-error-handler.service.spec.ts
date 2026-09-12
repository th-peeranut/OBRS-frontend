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

  it('classifies only chunk-load shaped messages', () => {
    expect(GlobalErrorHandler.isStaleChunkError(new Error('ChunkLoadError: x'))).toBeTrue();
    expect(GlobalErrorHandler.isStaleChunkError('error loading dynamically imported module')).toBeTrue();
    expect(GlobalErrorHandler.isStaleChunkError(new Error('Http failure response'))).toBeFalse();
    expect(GlobalErrorHandler.isStaleChunkError(null)).toBeFalse();
  });
});

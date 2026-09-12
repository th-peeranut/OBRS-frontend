import { stripQueryParamFromAddressBar } from './strip-query-param';

describe('stripQueryParamFromAddressBar (security review 2026-09, FE-2)', () => {
  let originalUrl: string;

  beforeEach(() => {
    originalUrl = window.location.pathname + window.location.search + window.location.hash;
  });

  afterEach(() => {
    window.history.replaceState(window.history.state, '', originalUrl);
  });

  it('removes only the named parameter and keeps the rest of the URL', () => {
    window.history.replaceState({}, '', `${window.location.pathname}?token=secret-1&lang=th#top`);

    stripQueryParamFromAddressBar('token');

    expect(window.location.search).toBe('?lang=th');
    expect(window.location.hash).toBe('#top');
    expect(window.location.href).not.toContain('secret-1');
  });

  it('drops the query string entirely when the token was the only parameter', () => {
    window.history.replaceState({}, '', `${window.location.pathname}?token=secret-2`);

    stripQueryParamFromAddressBar('token');

    expect(window.location.search).toBe('');
  });

  it('is a no-op when the parameter is absent', () => {
    window.history.replaceState({}, '', `${window.location.pathname}?lang=en`);

    stripQueryParamFromAddressBar('token');

    expect(window.location.search).toBe('?lang=en');
  });

  it('replaces the history entry rather than adding one', () => {
    const before = window.history.length;
    window.history.replaceState({}, '', `${window.location.pathname}?token=secret-3`);

    stripQueryParamFromAddressBar('token');

    expect(window.history.length).toBe(before);
  });
});

// OBRS-967: a duplicate `@for ... track` key is NOT a test failure on its own.
// Angular logs NG0955 to console.warn and carries on rendering, so a template that
// hands two items the same key looks perfectly green -- 4,612 specs passed on `dev`
// while 33 of them were quietly printing NG0955 (measured, 2026-08-03).
//
// This helper turns that warning into something a spec can assert on. Install it in
// a `beforeEach` (it uses jasmine's spyOn, so it is undone automatically after each
// spec) and read the captured lines after `fixture.detectChanges()`.
//
// Positive control: `track-key-warnings.spec.ts` proves the capture actually fires by
// rendering a component whose track expression is deliberately duplicated. Without
// that control an "expect(no warnings)" assertion would stay green even if Angular
// changed channels -- an absence proved by an instrument nobody tested is not proof.

/** Starts capturing NG0955 warnings. Returns a reader for what has been captured. */
export function captureDuplicateTrackKeyWarnings(): () => string[] {
  const captured: string[] = [];
  const original = console.warn.bind(console);

  spyOn(console, 'warn').and.callFake((...args: unknown[]) => {
    const text = args.map((arg) => String(arg)).join(' ');
    if (text.includes('NG0955')) {
      captured.push(text);
      return; // swallow: the spec asserts on it, no need to also spam the runner
    }
    original(...args);
  });

  return () => captured;
}

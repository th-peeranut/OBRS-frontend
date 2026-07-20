import { TestBed } from '@angular/core/testing';
import Swal from 'sweetalert2';
import { AlertService } from './alert.service';
import { ThemeService } from './theme.service';

/**
 * Locking spec for OBRS-520 (design-system.md §12 convention).
 *
 * AlertService had no spec at all despite ~16 call sites. The bug this locks:
 * SweetAlert2 defaults to `theme: 'light'` and stamps
 * `data-swal2-theme="light"` on its container no matter what the app theme is,
 * so every confirm/success/error/toast rendered a stark white card on the dark
 * shell — measured on the real dark admin page at rgb(255,255,255) popup /
 * rgb(84,84,84) text against a #1d2226 surface.
 *
 * These assertions are deliberately about the OPTION being passed, not about
 * rendered colour — Karma cannot see colour, which is the whole reason the bug
 * survived so long. The rendered-pixel half of the verification lives in the
 * card's manual test plan and its before/after measurements.
 */
describe('AlertService', () => {
  let service: AlertService;
  let theme: ThemeService;
  let fire: jasmine.Spy;

  beforeEach(() => {
    document.body.classList.remove('is-dark');
    localStorage.removeItem('app_admin_theme');

    TestBed.configureTestingModule({ providers: [AlertService, ThemeService] });
    theme = TestBed.inject(ThemeService);
    service = TestBed.inject(AlertService);

    fire = spyOn(Swal, 'fire').and.returnValue(
      Promise.resolve({ isConfirmed: true }) as unknown as ReturnType<typeof Swal.fire>
    );
  });

  afterEach(() => {
    document.body.classList.remove('is-dark');
    localStorage.removeItem('app_admin_theme');
  });

  /** The `theme` handed to the most recent Swal.fire call. */
  const lastTheme = (): unknown => fire.calls.mostRecent().args[0]?.['theme'];

  describe('light mode (the default)', () => {
    it('passes theme "light" to every popup shape', async () => {
      service.success('ok');
      expect(lastTheme()).toBe('light');

      service.error('bad');
      expect(lastTheme()).toBe('light');

      service.info('fyi');
      expect(lastTheme()).toBe('light');

      service.warning('careful');
      expect(lastTheme()).toBe('light');

      service.permissionDenied('nope');
      expect(lastTheme()).toBe('light');

      await service.confirm({
        title: 't',
        text: 'x',
        confirmButtonText: 'y',
        cancelButtonText: 'n',
      });
      expect(lastTheme()).toBe('light');

      service.showLoading();
      expect(lastTheme()).toBe('light');
    });
  });

  describe('dark mode', () => {
    beforeEach(() => theme.setMode('dark'));

    it('passes theme "dark" to every popup shape', async () => {
      service.success('ok');
      expect(lastTheme()).toBe('dark');

      service.error('bad');
      expect(lastTheme()).toBe('dark');

      service.info('fyi');
      expect(lastTheme()).toBe('dark');

      service.warning('careful');
      expect(lastTheme()).toBe('dark');

      service.permissionDenied('nope');
      expect(lastTheme()).toBe('dark');

      await service.confirm({
        title: 't',
        text: 'x',
        confirmButtonText: 'y',
        cancelButtonText: 'n',
      });
      expect(lastTheme()).toBe('dark');

      service.showLoading();
      expect(lastTheme()).toBe('dark');
    });

    it('keeps permissionDenied its guard-backdrop class while going dark', () => {
      service.permissionDenied('nope');
      const opts = fire.calls.mostRecent().args[0] as Record<string, unknown>;
      expect(opts['theme']).toBe('dark');
      expect(opts['customClass']).toEqual({ container: 'swal-guard-backdrop' });
    });
  });

  describe('reacting to a mid-session toggle', () => {
    it('follows ThemeService rather than snapshotting at construction', () => {
      service.success('first');
      expect(lastTheme()).toBe('light');

      theme.setMode('dark');
      service.success('second');
      expect(lastTheme()).toBe('dark');

      theme.setMode('light');
      service.success('third');
      expect(lastTheme()).toBe('light');
    });

    // 'auto' would follow the OS prefers-color-scheme, which is NOT the app's
    // source of truth — a user may pick a theme that disagrees with their OS.
    it('never passes "auto"', () => {
      theme.setMode('dark');
      service.error('x');
      expect(lastTheme()).not.toBe('auto');
      theme.setMode('light');
      service.error('x');
      expect(lastTheme()).not.toBe('auto');
    });
  });

  describe('toast', () => {
    it('passes the current theme through Swal.mixin', () => {
      const mixin = spyOn(Swal, 'mixin').and.returnValue({
        fire: () => Promise.resolve({}),
      } as unknown as ReturnType<typeof Swal.mixin>);

      theme.setMode('dark');
      service.toast('hello');

      expect(mixin.calls.mostRecent().args[0]?.['theme']).toBe('dark');
    });
  });
});

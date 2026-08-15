import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import Swal from 'sweetalert2';
import { AlertService, LOADING_ESCAPE_AFTER_MS } from './alert.service';
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

  /**
   * OBRS-642. The overlay is fired with allowOutsideClick/allowEscapeKey false and no
   * close button, so any state in which it fails to close is a page the customer can
   * only escape by reloading — measured on prod 2026-08-10 at over a minute.
   *
   * `Swal.fire` is spied for this whole file, so `didOpen` never runs on its own. That
   * is not a limitation here, it is precisely the window under test: `didOpen` is where
   * `Swal.showLoading()` sets the `data-loading` attribute, and sweetalert2 11.26.18
   * schedules `didOpen` with `setTimeout` (sweetalert2.js:4342-4344). The old guard
   * `if (Swal.isLoading())` therefore read false for the first macrotask of the popup's
   * life, dropped the close, and still set `isLoadingVisible = false`.
   */
  describe('loading overlay (OBRS-642)', () => {
    /** A stand-in for the popup element, carrying the marker class or not. */
    const popupWith = (className?: string): HTMLElement => {
      const el = document.createElement('div');
      if (className) el.classList.add(className);
      return el;
    };

    it('closes its own overlay even when hideLoading arrives before didOpen has run', () => {
      const close = spyOn(Swal, 'close');
      spyOn(Swal, 'getPopup').and.returnValue(popupWith('swal-global-loading'));
      // Old code consulted this and got false, which is what dropped the close.
      spyOn(Swal, 'isLoading').and.returnValue(false);

      service.showLoading('กำลังโหลด…');
      service.hideLoading();

      expect(close).toHaveBeenCalled();
    });

    it('does not close a popup it did not open (an error dialog that replaced the spinner)', () => {
      const close = spyOn(Swal, 'close');
      spyOn(Swal, 'getPopup').and.returnValue(popupWith('some-other-dialog'));

      service.showLoading('กำลังโหลด…');
      service.hideLoading();

      expect(close).not.toHaveBeenCalled();
    });

    it('keeps the overlay up while another request is still in flight', () => {
      const close = spyOn(Swal, 'close');
      spyOn(Swal, 'getPopup').and.returnValue(popupWith('swal-global-loading'));

      service.showLoading('a');
      service.showLoading('b');
      service.hideLoading();
      expect(close).not.toHaveBeenCalled();

      service.hideLoading();
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('gives the customer a way out once the overlay has been up for LOADING_ESCAPE_AFTER_MS', fakeAsync(() => {
      const update = spyOn(Swal, 'update');
      spyOn(Swal, 'showLoading');
      spyOn(Swal, 'getPopup').and.returnValue(popupWith('swal-global-loading'));

      service.showLoading('กำลังโหลด…', 'ช้ากว่าปกติ', 'ปิด');
      // Run the didOpen sweetalert2 would have run; that is what arms the timer.
      const didOpen = fire.calls.mostRecent().args[0]?.['didOpen'] as () => void;
      didOpen();

      tick(LOADING_ESCAPE_AFTER_MS - 1);
      expect(update).not.toHaveBeenCalled();

      tick(1);
      const params = update.calls.mostRecent().args[0] as Record<string, unknown>;
      expect(params['showCloseButton']).toBeTrue();
      expect(params['allowEscapeKey']).toBeTrue();
      expect(params['allowOutsideClick']).toBeTrue();
      expect(params['text']).toBe('ช้ากว่าปกติ');
    }));

    it('does not arm the escape hatch past the overlay it belongs to', fakeAsync(() => {
      const update = spyOn(Swal, 'update');
      spyOn(Swal, 'showLoading');
      spyOn(Swal, 'getPopup').and.returnValue(popupWith('swal-global-loading'));
      spyOn(Swal, 'close');

      service.showLoading('กำลังโหลด…', 'ช้ากว่าปกติ');
      (fire.calls.mostRecent().args[0]?.['didOpen'] as () => void)();
      service.hideLoading();

      tick(LOADING_ESCAPE_AFTER_MS + 100);
      expect(update).not.toHaveBeenCalled();
    }));

    it('resets its counter when the customer dismisses the overlay themselves', () => {
      spyOn(Swal, 'getPopup').and.returnValue(popupWith('swal-global-loading'));
      const close = spyOn(Swal, 'close');

      // Request A opens the overlay and never returns; the customer closes it.
      service.showLoading('a');
      (fire.calls.mostRecent().args[0]?.['didClose'] as () => void)();

      // Request B must get an overlay of its own that can still reach zero. Without
      // the reset, A's outstanding +1 would keep B's count at 1 forever.
      service.showLoading('b');
      service.hideLoading();

      expect(close).toHaveBeenCalledTimes(1);
    });

    /**
     * OBRS-1336. `Swal.close()` starts an animation and sweetalert2 runs `didClose`
     * when it ENDS, so between the two there is a window in which this service has
     * already reset itself (hideLoading does it synchronously) and a request that
     * starts inside it opens a second overlay. The late `didClose` then belonged to
     * a popup that is gone, and resetting on it cleared the LIVE overlay's state:
     * `isLoadingVisible` false with an overlay on screen means every subsequent
     * `hideLoading()` returns at its own guard and nothing ever closes it again.
     *
     * Found by the E2E gate lane, not by inspection — OBRS-1336 made
     * `continueAsOneWay()` re-run the search on the way out, which narrowed the gap
     * between one response and the next request from ~2.4s to ~380ms and turned a
     * rare window into a 1-in-3 red. The 8s escape hatch above is what keeps this
     * survivable for a customer; it does nothing for a page that must stay usable.
     */
    it('does not let a closing overlay clear the state of the one that replaced it', () => {
      spyOn(Swal, 'getPopup').and.returnValue(popupWith('swal-global-loading'));
      const close = spyOn(Swal, 'close');

      service.showLoading('a');
      const didCloseA = fire.calls.mostRecent().args[0]?.['didClose'] as () => void;
      service.hideLoading();
      expect(close).toHaveBeenCalledTimes(1);

      // B starts while A's close is still animating.
      service.showLoading('b');
      // ...and only now does A's animation finish.
      didCloseA();

      service.hideLoading();
      expect(close).toHaveBeenCalledTimes(2);
    });
  });
});

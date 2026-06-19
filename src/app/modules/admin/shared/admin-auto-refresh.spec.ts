import { fakeAsync, tick } from '@angular/core/testing';
import { pollWhileVisible } from './admin-auto-refresh';

describe('pollWhileVisible', () => {
  let hidden = false;

  beforeEach(() => {
    hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
  });

  it('calls refresh on each interval while the tab is visible', fakeAsync(() => {
    const refresh = jasmine.createSpy('refresh');
    const sub = pollWhileVisible(refresh, 1000);

    tick(3000);

    expect(refresh).toHaveBeenCalledTimes(3);
    sub.unsubscribe();
  }));

  it('skips ticks while the tab is hidden and resumes when visible', fakeAsync(() => {
    const refresh = jasmine.createSpy('refresh');
    const sub = pollWhileVisible(refresh, 1000);

    hidden = true;
    tick(2000);
    expect(refresh).not.toHaveBeenCalled();

    hidden = false;
    tick(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
  }));

  it('stops polling after unsubscribe', fakeAsync(() => {
    const refresh = jasmine.createSpy('refresh');
    const sub = pollWhileVisible(refresh, 1000);

    tick(1000);
    sub.unsubscribe();
    tick(5000);

    expect(refresh).toHaveBeenCalledTimes(1);
  }));
});

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { environment } from '../../../environments/environment';
import { onlineTicketBookingGuard } from './online-ticket-booking.guard';

/**
 * OBRS-1302 arms (flag on/off) + OBRS-1583 arms (who may preview while it is
 * off), on the guard that OBRS-1583 split out of `featureEnabledGuard`. The
 * flag arms carry more weight here than for the two scope-cut flags: this one
 * closes a path that WORKS in production and charges live money, so "flag on
 * restores it exactly" is what the owner is relying on to reopen without a code
 * change.
 *
 * Roles are set through `localStorage` and read by the REAL AuthService rather
 * than stubbed. `hasAnyRole` expands a held role through ROLE_GRANTS, and that
 * expansion is the whole reason the preview list is spelled the way it is — a
 * stub returning a canned boolean would assert nothing about it.
 */
describe('onlineTicketBookingGuard', () => {
  let originalOnlineTicketBooking: boolean;

  beforeEach(async () => {
    originalOnlineTicketBooking = environment.features.onlineTicketBooking;
    localStorage.removeItem('auth_roles');

    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    environment.features.onlineTicketBooking = originalOnlineTicketBooking;
    localStorage.removeItem('auth_roles');
  });

  function runGuard(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() =>
      onlineTicketBookingGuard({} as never, {} as never)
    ) as boolean | UrlTree;
  }

  function expectRedirectedHome(result: boolean | UrlTree): void {
    expect(result).not.toBe(true);
    const router = TestBed.inject(Router);
    expect((result as UrlTree).toString()).toBe(router.parseUrl('/').toString());
  }

  function signInAs(roles: string[]): void {
    localStorage.setItem('auth_roles', JSON.stringify(roles));
  }

  describe('flag OFF', () => {
    beforeEach(() => {
      environment.features.onlineTicketBooking = false;
    });

    it('redirects a signed-out visitor home — getRoles() returns [] and [] must not open the gate', () => {
      expectRedirectedHome(runGuard());
    });

    it('redirects a customer home', () => {
      signInAs(['customer']);

      expectRedirectedHome(runGuard());
    });

    it('redirects a role nobody recognises home — an edited localStorage entry only matches itself', () => {
      signInAs(['__proto__']);

      expectRedirectedHome(runGuard());
    });

    // driver is asserted apart from salesperson because ROLE_GRANTS expands one
    // way only: salesperson carries driver, driver never carries salesperson.
    // A preview list written `['salesperson']` passes the salesperson case and
    // drops every driver.
    ['owner', 'admin', 'salesperson', 'driver'].forEach((role) => {
      it(`lets ${role} through`, () => {
        signInAs([role]);

        expect(runGuard()).withContext(role).toBe(true);
      });
    });
  });

  describe('flag ON — reopening must not exclude anyone the role check would have', () => {
    beforeEach(() => {
      environment.features.onlineTicketBooking = true;
    });

    it('lets a signed-out visitor through', () => {
      expect(runGuard()).toBe(true);
    });

    it('lets a customer through', () => {
      signInAs(['customer']);

      expect(runGuard()).toBe(true);
    });

    it('lets a driver through', () => {
      signInAs(['driver']);

      expect(runGuard()).toBe(true);
    });
  });
});

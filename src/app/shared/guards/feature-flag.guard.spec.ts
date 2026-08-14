import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { FeatureFlag, featureEnabledGuard } from './feature-flag.guard';
import { environment } from '../../../environments/environment';

/**
 * OBRS-622 go-live scope cut — proves the reversibility both ways for each
 * gated feature: flag off redirects home, flag on lets the route through.
 * A spec covering only the OFF state would not prove re-enabling works
 * (explicitly called out on the card), so every case below is run twice.
 */
describe('featureEnabledGuard', () => {
  let originalOnlineParcelBooking: boolean;
  let originalFleetMap: boolean;
  let originalOnlineTicketBooking: boolean;

  beforeEach(async () => {
    originalOnlineParcelBooking = environment.features.onlineParcelBooking;
    originalFleetMap = environment.features.fleetMap;
    originalOnlineTicketBooking = environment.features.onlineTicketBooking;

    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
    }).compileComponents();
  });

  afterEach(() => {
    environment.features.onlineParcelBooking = originalOnlineParcelBooking;
    environment.features.fleetMap = originalFleetMap;
    environment.features.onlineTicketBooking = originalOnlineTicketBooking;
  });

  function runGuard(feature: FeatureFlag): boolean | UrlTree {
    return TestBed.runInInjectionContext(() =>
      featureEnabledGuard(feature)(
        {} as never,
        {} as never,
      ),
    ) as boolean | UrlTree;
  }

  describe('onlineParcelBooking', () => {
    it('redirects to home when the flag is false', () => {
      environment.features.onlineParcelBooking = false;

      const result = runGuard('onlineParcelBooking');

      expect(result).not.toBe(true);
      const router = TestBed.inject(Router);
      expect((result as UrlTree).toString()).toBe(router.parseUrl('/').toString());
    });

    it('allows activation when the flag is true', () => {
      environment.features.onlineParcelBooking = true;

      expect(runGuard('onlineParcelBooking')).toBe(true);
    });
  });

  describe('fleetMap', () => {
    it('redirects to home when the flag is false', () => {
      environment.features.fleetMap = false;

      const result = runGuard('fleetMap');

      expect(result).not.toBe(true);
      const router = TestBed.inject(Router);
      expect((result as UrlTree).toString()).toBe(router.parseUrl('/').toString());
    });

    it('allows activation when the flag is true', () => {
      environment.features.fleetMap = true;

      expect(runGuard('fleetMap')).toBe(true);
    });
  });

  // OBRS-1302. Same two arms as above, and they carry more weight here than for
  // the two scope-cut flags: this one closes a path that WORKS in production and
  // charges live money, so "flag on restores it exactly" is the thing the owner
  // is relying on to reopen without a code change.
  describe('onlineTicketBooking', () => {
    it('redirects to home when the flag is false', () => {
      environment.features.onlineTicketBooking = false;

      const result = runGuard('onlineTicketBooking');

      expect(result).not.toBe(true);
      const router = TestBed.inject(Router);
      expect((result as UrlTree).toString()).toBe(router.parseUrl('/').toString());
    });

    it('allows activation when the flag is true', () => {
      environment.features.onlineTicketBooking = true;

      expect(runGuard('onlineTicketBooking')).toBe(true);
    });
  });
});

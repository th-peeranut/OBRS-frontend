import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { AnalyticsConsentService } from '../../../services/analytics/analytics-consent.service';
import { AnalyticsConsentBannerComponent } from './analytics-consent-banner.component';

describe('AnalyticsConsentBannerComponent', () => {
  let fixture: ComponentFixture<AnalyticsConsentBannerComponent>;
  let consent: AnalyticsConsentService;

  function banner(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.consent-banner');
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.consent-banner__btn'));
  }

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentBannerComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
    }).compileComponents();

    consent = TestBed.inject(AnalyticsConsentService);
    fixture = TestBed.createComponent(AnalyticsConsentBannerComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('is on screen while the question is unanswered', () => {
    expect(banner()).not.toBeNull();
  });

  it('is not rendered at all for a visitor who already accepted', () => {
    consent.grant();
    fixture.detectChanges();

    expect(banner()).toBeNull();
  });

  it('is not rendered at all for a visitor who already declined — it must not nag', () => {
    consent.deny();
    fixture.detectChanges();

    expect(banner()).toBeNull();
  });

  it('records the accept', () => {
    const accept = fixture.nativeElement.querySelector(
      '.consent-banner__btn--accept'
    ) as HTMLButtonElement;

    accept.click();
    fixture.detectChanges();

    expect(consent.decision).toBe('granted');
    expect(banner()).toBeNull();
  });

  it('records the decline', () => {
    const decline = buttons().find(
      (b) => !b.classList.contains('consent-banner__btn--accept')
    );

    decline?.click();
    fixture.detectChanges();

    expect(consent.decision).toBe('denied');
    expect(banner()).toBeNull();
  });

  describe('the ask must not be a dark pattern', () => {
    it('offers exactly two buttons — no hidden "manage preferences" detour', () => {
      expect(buttons().length).toBe(2);
    });

    it('puts Decline first in the DOM, and therefore first in the tab order', () => {
      // The cheaper answer for us must not also be the easier one to reach.
      expect(buttons()[0].classList).not.toContain('consent-banner__btn--accept');
      expect(buttons()[1].classList).toContain('consent-banner__btn--accept');
    });

    it('gives both buttons the same class-driven geometry', () => {
      // Both carry the shared `.consent-banner__btn` class; only the accept
      // button adds a modifier, and the modifier changes fill, not size.
      for (const button of buttons()) {
        expect(button.classList).toContain('consent-banner__btn');
      }
    });

    it('does not block the page — it is a region, not a modal dialog', () => {
      const el = banner();

      expect(el?.getAttribute('role')).toBe('region');
      expect(el?.getAttribute('aria-modal')).toBeNull();
    });
  });
});

/**
 * OBRS-887 — the bar does not ask on staff or admin pages.
 *
 * This is not the layout fix (OBRS-878 solved the covered button). It is that
 * there is nothing there worth asking for: a salesperson cannot consent to a
 * recording of a screen showing a *customer's* name and phone number, and an
 * ask whose answer changes nothing is worse than no ask.
 *
 * Runs against its own Router double rather than RouterTestingModule, because
 * what is under test is what the bar does at a specific point in a navigation.
 */
describe('AnalyticsConsentBannerComponent — route scope', () => {
  let fixture: ComponentFixture<AnalyticsConsentBannerComponent>;
  let routerEvents: Subject<NavigationEnd>;
  let routeSnapshotRoot: unknown;

  function banner(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.consent-banner');
  }

  function chain(path: string, data: Record<string, unknown> = {}): unknown {
    const leaf = { routeConfig: { path }, data, firstChild: null, children: [] };
    return { routeConfig: null, data: {}, firstChild: leaf, children: [leaf] };
  }

  function navigate(url: string): void {
    routerEvents.next(new NavigationEnd(1, url, url));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    routerEvents = new Subject<NavigationEnd>();
    routeSnapshotRoot = chain('');

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentBannerComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
      providers: [
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            get routerState() {
              return { snapshot: { root: routeSnapshotRoot } };
            },
            createUrlTree: () => ({}),
            serializeUrl: () => '',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsConsentBannerComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('shows before any route has resolved — scope `unknown` is not a reason to hide', () => {
    // The privacy property belongs to the tag loader, which treats `unknown` as
    // "load nothing". Blinking the bar out here would buy none of it.
    expect(banner()).not.toBeNull();
  });

  it('is not rendered on a staff page', () => {
    routeSnapshotRoot = chain('staff', { requiredRoles: ['driver', 'salesperson'] });

    navigate('/staff/sell');

    expect(banner()).toBeNull();
  });

  it('is not rendered on an admin page', () => {
    routeSnapshotRoot = chain('admin', { requiredRoles: ['admin'] });

    navigate('/admin/settings');

    expect(banner()).toBeNull();
  });

  it('still asks on a customer page that carries no customerArea marker', () => {
    // /login and /register are customer pages with no `customerArea` in their
    // route data. A gate written as an allowlist would have silenced the bar
    // — and the whole sign-up funnel — on exactly these.
    routeSnapshotRoot = chain('login');

    navigate('/login');

    expect(banner()).not.toBeNull();
  });

  it('comes back when the staff member returns to a customer page', () => {
    routeSnapshotRoot = chain('staff', { requiredRoles: ['salesperson'] });
    navigate('/staff/sell');
    expect(banner()).toBeNull();

    routeSnapshotRoot = chain('my-bookings');
    navigate('/my-bookings');

    expect(banner()).not.toBeNull();
  });

  /**
   * OBRS-874 — the bar stands down where the full control lives.
   *
   * Not a privacy rule: /privacy-policy is measurable and the tags load there.
   * It is that withdrawing returns the answer to `unset`, so without this the
   * bar would appear the instant a visitor pressed "withdraw", on the page they
   * pressed it — which reads as the site ignoring them.
   */
  describe('the page that owns the consent control', () => {
    it('is not asked on by the bar', () => {
      routeSnapshotRoot = chain('privacy-policy');

      navigate('/privacy-policy');

      expect(banner()).toBeNull();
    });

    it('is still recognised with a query string or fragment on it', () => {
      // The policy page links to its own sections; a whole-URL comparison would
      // put the bar back on exactly those deep links.
      routeSnapshotRoot = chain('privacy-policy');

      navigate('/privacy-policy?lang=th#rights');

      expect(banner()).toBeNull();
    });

    it('does not silence the bar on a route that merely starts the same way', () => {
      routeSnapshotRoot = chain('privacy-policy-archive');

      navigate('/privacy-policy-archive');

      expect(banner()).not.toBeNull();
    });

    it('gives the bar back as soon as the visitor leaves', () => {
      routeSnapshotRoot = chain('privacy-policy');
      navigate('/privacy-policy');
      expect(banner()).toBeNull();

      routeSnapshotRoot = chain('login');
      navigate('/login');

      expect(banner()).not.toBeNull();
    });
  });
});

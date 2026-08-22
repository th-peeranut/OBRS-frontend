import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  AnalyticsConsentService,
} from '../../../services/analytics/analytics-consent.service';
import { AnalyticsConsentBannerComponent } from './analytics-consent-banner.component';

/**
 * OBRS-1179 — the bar only asks where something can be measured, and the Karma
 * build (`environment.ts`) ships the blank IDs every checkout has. Without this
 * every case in this file would be asserting the empty-build arm by accident,
 * and the ask itself — which is what most of them are about — would go untested.
 *
 * Only GA4 is filled: AC-2 says either ID is enough, so the whole file doubles
 * as the "Clarity blank, bar still owed" case. `environment.analytics` is a
 * shared mutable object, so it is put back after every case.
 */
const originalAnalytics = { ...environment.analytics };

function setMeasurementIds(ga4: string, clarity: string): void {
  environment.analytics.ga4MeasurementId = ga4;
  environment.analytics.clarityProjectId = clarity;
}

beforeEach(() => setMeasurementIds('G-OBRS1179TEST', ''));

afterEach(() =>
  setMeasurementIds(
    originalAnalytics.ga4MeasurementId,
    originalAnalytics.clarityProjectId
  )
);

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

  /**
   * OBRS-1372 — the bar is `position: fixed`, so the page has to be told to end
   * further down. Measured here rather than asserted from the stylesheet: the
   * defect was that the number did not exist at all, and a constant would be
   * wrong in three of the four locales.
   *
   * The E2E half (`e2e/tests/obrs-1372-consent-banner-reachability.spec.ts`) is
   * the one that proves a real control becomes reachable; these three prove the
   * mechanism that gets it there, including the edges an E2E sweep cannot see.
   */
  describe('the room the bar occupies', () => {
    /** ResizeObserver delivers before paint, so a frame or two — polled, not assumed. */
    async function paddingSettlesAt(px: () => number): Promise<number> {
      for (let i = 0; i < 30; i += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const now = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
        if (now === px()) return now;
      }
      return parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    }

    it('reserves exactly what the bar covers, taken from the bar itself', async () => {
      const height = banner()!.offsetHeight;

      expect(height).toBeGreaterThan(0);
      expect(await paddingSettlesAt(() => height)).toBe(height);
    });

    it('follows the bar when it changes height — a wrap, a rotation, a longer language', async () => {
      const el = banner()!;
      const before = await paddingSettlesAt(() => el.offsetHeight);

      el.style.minHeight = `${before + 120}px`;

      expect(await paddingSettlesAt(() => el.offsetHeight)).toBe(before + 120);
    });

    /**
     * OBRS-1524 — the same follow, watched for the error it fired on the way.
     *
     * Measured 2026-08-22: the write inside the callback is what makes the page
     * long enough to scroll, the scrollbar takes 15px off the viewport, and the
     * bar is `left: 0; right: 0` — so the callback resized the very element whose
     * observation was being broadcast. The spec answers that by dropping the
     * notification and reporting `ResizeObserver loop completed with undelivered
     * notifications` at `window`, which Karma charges to whichever spec is
     * running. Jasmine shuffles the spec order on every run (measured here:
     * `random: true`, `seed: null` — nothing pins it), so which spec is running
     * when it fires is a fresh draw: that is how it arrived as a red `Unit Tests`
     * job on `dev` that belonged to no card, green on one attempt and red on a
     * rerun of the same job on the same sha.
     *
     * The spacer puts the page exactly at that threshold on purpose. Without it
     * the Karma page is far too short and this passes without proving anything —
     * measured 2026-08-22, it walks red 3 times out of 3 with the defer removed.
     */
    it('does not resize the document from inside its own observer callback', async () => {
      const el = banner()!;
      const before = await paddingSettlesAt(() => el.offsetHeight);

      // Exactly as tall as the viewport, room for the bar included, so the next
      // pixels it asks for are the ones that turn the scrollbar on.
      const page = document.documentElement;
      const spacer = document.createElement('div');
      const filled = document.body.getBoundingClientRect().height;
      spacer.style.height = `${Math.max(0, page.clientHeight - filled)}px`;
      document.body.appendChild(spacer);

      const loops: string[] = [];
      const onError = (event: ErrorEvent) => {
        if (/ResizeObserver loop/.test(event.message)) loops.push(event.message);
      };
      window.addEventListener('error', onError);

      try {
        expect(page.scrollHeight).toBe(page.clientHeight);
        const roomy = page.clientWidth;

        el.style.minHeight = `${before + 120}px`;
        await paddingSettlesAt(() => el.offsetHeight);

        // Asserted, not assumed: the loop needs a scrollbar that takes width off
        // the viewport. On a runner that draws overlay scrollbars there is no
        // width to take, nothing below can arise, and this guard would pass
        // without guarding — so it says so instead of going quietly green.
        expect(page.clientWidth).toBeLessThan(roomy);
        expect(loops).toEqual([]);
      } finally {
        window.removeEventListener('error', onError);
        spacer.remove();
      }
    });

    it('gives the room back the moment the question is answered', async () => {
      await paddingSettlesAt(() => banner()!.offsetHeight);

      consent.deny();
      fixture.detectChanges();

      // Removed, not zeroed: a page with no bar is a page this component never
      // touched.
      expect(document.body.style.paddingBottom).toBe('');
    });
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

/**
 * OBRS-1179 — the arm that did not exist: a build that measures nothing.
 *
 * BOTH arms, deliberately (AC-4). A single "it does not render" case passes just
 * as well on a component that never renders at all, which is the vacuous green
 * this repo has paid for before; the cases above are the other arm, and they run
 * with an ID set for exactly that reason.
 */
describe('AnalyticsConsentBannerComponent — with nothing to measure', () => {
  let fixture: ComponentFixture<AnalyticsConsentBannerComponent>;

  function banner(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.consent-banner');
  }

  /** Built after the IDs are set — the component reads them as it renders. */
  async function render(): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [AnalyticsConsentBannerComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsConsentBannerComponent);
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('does not ask when neither ID is configured — there is nothing to consent to', async () => {
    setMeasurementIds('', '');

    await render();

    expect(banner()).toBeNull();
  });

  it('does not ask for whitespace either — a blank-looking ID builds no tag URL', async () => {
    // Same `?.trim()` the loader applies, so the two halves cannot disagree
    // about what counts as configured.
    setMeasurementIds('   ', '	');

    await render();

    expect(banner()).toBeNull();
  });

  it('still asks when only Clarity is configured — AC-2, either ID is enough', async () => {
    setMeasurementIds('', 'obrs1179clarity');

    await render();

    expect(banner()).not.toBeNull();
  });

  it('still asks when only GA4 is configured', async () => {
    setMeasurementIds('G-OBRS1179TEST', '');

    await render();

    expect(banner()).not.toBeNull();
  });

  /**
   * AC-3. Hiding the ask is not the same as forgetting the answer. A visitor who
   * declined before the IDs were removed has not withdrawn that refusal, and the
   * day an ID is configured the bar must not reappear to re-ask them.
   */
  it('leaves a stored answer alone when it stops rendering', async () => {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, 'denied');
    setMeasurementIds('', '');

    await render();

    expect(banner()).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('denied');
  });
});

/**
 * OBRS-932 — the period-over-period delta on the two analytics KPI tiles, measured.
 *
 * Why a spec and not just the token gate: `scripts/check-admin-theme-tokens.mjs`
 * caught these four rules statically (a chip-half token used as a standalone
 * `color:`), and that is what turned `dev` red. But the gate can only see the
 * SPELLING of a declaration — it cannot see what the ancestors actually paint, so
 * it can neither prove the bug's severity nor prove the fix worked. That answer
 * only exists at runtime, which is what `src/app/testing/contrast.ts` exists for
 * (OBRS-721/726/747). Measured here in ChromeHeadless with the real cascade:
 *
 * Read back from the browser on both runs — none of these are computed from the
 * declared token values, which is the mistake OBRS-747 published three wrong
 * ratios with:
 *
 *   DARK, before (var(--admin-*-text), the chip halves) -> after (var(--admin-*-fg)):
 *     .bt-delta.is-up   #154c85 on #1d2226 = 1.84:1  ->  #a8c8ff = 9.45:1
 *     .bt-delta.is-down #93000a on #1d2226 = 1.71:1  ->  #ffb4ab = 9.45:1
 *     .ra-delta.is-up   #154c85 on #1d2226 = 1.84:1  ->  #a8c8ff = 9.45:1
 *     .ra-delta.is-down #93000a on #1d2226 = 1.71:1  ->  #ffb4ab = 9.45:1
 *
 *   LIGHT, before and after, byte-identical: #154c85 on #ffffff = 8.73:1 (is-up)
 *   and #93000a on #ffffff = 9.35:1 (is-down), because the light values of the
 *   two token families are declared identical on purpose (see the
 *   --admin-danger-fg comment in admin-theme.scss).
 *
 * Note the card filed this as "1.3-1.7:1" from the gate's own message; the two
 * rules here actually measure 1.71 and 1.84 - still far below the 4.5 floor, but
 * the range in the gate text is the family's, not these four sites'.
 *
 * The light assertions below are the interesting half: they pin the fix to
 * "dark-only", so a future palette edit that moves --admin-*-fg away from its
 * chip-half twin in LIGHT fails here rather than shipping a silent restyle of
 * two pages.
 */
import { BehaviorSubject } from 'rxjs';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
// OBRS-944 — this must stay the same module `admin.module.ts` declares, not
// merely one that exports something date-shaped. Both page templates render
// <p-datePicker>, which PrimeNG 19 moved out of CalendarModule; importing the
// wrong one still compiles the spec and then fails at NG0303 on the real
// template, taking the measurement down with it. If a future PrimeNG renames
// this again, read admin.module.ts and follow it — do NOT reach for
// NO_ERRORS_SCHEMA, which would silence the binding and leave these tests
// measuring a template that never rendered.
import { DatePickerModule } from 'primeng/datepicker';

import { BookingTrendPageComponent } from './booking-trend/booking-trend-page.component';
import { BookingTrendStore } from './booking-trend/booking-trend.store';
import { RevenueAnalyticsPageComponent } from './revenue-analytics/revenue-analytics-page.component';
import { RevenueAnalyticsStore } from './revenue-analytics/revenue-analytics.store';
import { AdminSharedModule } from '../admin-shared.module';
import {
  AA_NORMAL_TEXT,
  contrast,
  effectiveBg,
  fgOf,
  mountInChain,
  resolveTokenColour,
  toHex,
} from '../../../testing/contrast';

/** The real wrapper chain around a routed admin page — admin-layout.component.html. */
const PAGE_CHAIN = ['admin-shell theme-admin', 'admin-main', 'admin-content'];

/** A store stub shaped like the SWR stores both pages consume. */
function storeStub(data: unknown) {
  return {
    data$: new BehaviorSubject<unknown>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    range: { from: '2026-07-01', to: '2026-07-03' },
    lastErrorCode: null as string | null,
    hasValue: true,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

function bookingTrend(changePct: number) {
  return {
    range: { from: '2026-07-01', to: '2026-07-03', timezone: 'Asia/Bangkok' },
    series: [{ date: '2026-07-01', bookingCount: 4, ticketsSold: 5, movingAvg7: 4, barPct: 50 }],
    previousPeriod: {
      range: { from: '2026-06-28', to: '2026-06-30', timezone: 'Asia/Bangkok' },
      totalBookings: 6,
      changePct,
    },
    byDayOfWeek: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dow: d, bookingCount: 0, sharePct: 0 })),
    peak: { date: '2026-07-01', bookingCount: 4 },
  };
}

function revenueAnalytics(netChangePct: number) {
  return {
    range: { from: '2026-07-01', to: '2026-07-03', timezone: 'Asia/Bangkok' },
    totals: { net: '300.00', paid: '400.00', refunded: '100.00', currency: 'THB' },
    previousPeriod: {
      range: { from: '2026-06-28', to: '2026-06-30', timezone: 'Asia/Bangkok' },
      totals: { net: '200.00', paid: '200.00', refunded: '0.00', currency: 'THB' },
      netChangePct,
    },
    dailyTrend: [
      { date: '2026-07-01', net: '100.00', paid: '100.00', refunded: '0.00', currency: 'THB', netBarPct: 50 },
    ],
  };
}

/**
 * One measurable site: a page, the delta direction it renders, and the token
 * family that direction is supposed to be drawn from.
 *
 * `chipHalf` is the token the four rules used BEFORE this card and must no
 * longer resolve to in dark mode; `surfaceRole` is the themed replacement.
 */
interface Site {
  readonly label: string;
  readonly selector: string;
  readonly chipHalf: string;
  readonly surfaceRole: string;
  /** Build the page fresh and mount it in the chain. Fixtures are NOT shared: */
  mount(dark: boolean): Promise<{ host: HTMLElement; teardown: () => void }>;
}

describe('analytics delta chips — contrast on the painted admin surface (OBRS-932)', () => {
  /**
   * Every mount builds its own TestBed. Creating the four fixtures up front in a
   * `beforeAll` does NOT work: `resetTestingModule()` destroys the fixtures made
   * before it, so `detectChanges()` on the earlier ones is a no-op and the whole
   * spec measures nothing. That failure is why `mount()` throws instead of
   * returning null when the chip is absent.
   */
  async function mountPage<T>(
    component: Type<T>,
    store: unknown,
    provide: unknown,
    selector: string,
    dark: boolean
  ): Promise<{ host: HTMLElement; teardown: () => void }> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [component],
      imports: [CommonModule, FormsModule, DatePickerModule, AdminSharedModule, TranslateModule.forRoot()],
      providers: [{ provide, useValue: store }],
    }).compileComponents();
    const fixture: ComponentFixture<T> = TestBed.createComponent(component);
    const teardown = mountInChain(fixture.nativeElement, PAGE_CHAIN, dark);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(selector) as HTMLElement | null;
    if (!host) {
      teardown();
      throw new Error(
        `${selector} rendered nothing to measure — the delta chip is gated on ` +
          `changePct !== null, so a store-shape change makes this whole spec vacuous.`
      );
    }
    return { host, teardown };
  }

  const SITES: Site[] = [
    {
      label: 'booking-trend .bt-delta.is-up',
      selector: '.bt-delta.is-up',
      chipHalf: '--admin-success-text',
      surfaceRole: '--admin-success-fg',
      mount: (dark) =>
        mountPage(
          BookingTrendPageComponent,
          storeStub(bookingTrend(100)),
          BookingTrendStore,
          '.bt-delta.is-up',
          dark
        ),
    },
    {
      label: 'booking-trend .bt-delta.is-down',
      selector: '.bt-delta.is-down',
      chipHalf: '--admin-danger-text',
      surfaceRole: '--admin-danger-fg',
      mount: (dark) =>
        mountPage(
          BookingTrendPageComponent,
          storeStub(bookingTrend(-25)),
          BookingTrendStore,
          '.bt-delta.is-down',
          dark
        ),
    },
    {
      label: 'revenue-analytics .ra-delta.is-up',
      selector: '.ra-delta.is-up',
      chipHalf: '--admin-success-text',
      surfaceRole: '--admin-success-fg',
      mount: (dark) =>
        mountPage(
          RevenueAnalyticsPageComponent,
          storeStub(revenueAnalytics(50)),
          RevenueAnalyticsStore,
          '.ra-delta.is-up',
          dark
        ),
    },
    {
      label: 'revenue-analytics .ra-delta.is-down',
      selector: '.ra-delta.is-down',
      chipHalf: '--admin-danger-text',
      surfaceRole: '--admin-danger-fg',
      mount: (dark) =>
        mountPage(
          RevenueAnalyticsPageComponent,
          storeStub(revenueAnalytics(-30)),
          RevenueAnalyticsStore,
          '.ra-delta.is-down',
          dark
        ),
    },
  ];

  // The card's population, asserted rather than assumed: the gate reported four
  // problems in two files, so four sites is the whole of it. If a page grows a
  // third delta tile this number is the thing that notices.
  it('measures all four rules the token gate reported, and no fewer', () => {
    expect(SITES.length).toBe(4);
    expect(new Set(SITES.map((s) => s.selector)).size).toBe(4);
  });

  for (const dark of [true, false]) {
    const mode = dark ? 'dark' : 'light';

    it(`${mode}: every delta chip clears AA on the surface actually painted`, async () => {
      const rows: string[] = [];
      const failures: string[] = [];
      for (const site of SITES) {
        const { host, teardown: t } = await site.mount(dark);
        const fg = fgOf(host);
        const bg = effectiveBg(host);
        const ratio = contrast(fg, bg);
        rows.push(`${site.label}: ${toHex(fg)} on ${toHex(bg)} = ${ratio.toFixed(2)}:1`);
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(`${site.label} ${toHex(fg)} on ${toHex(bg)} = ${ratio.toFixed(2)}:1 (floor ${AA_NORMAL_TEXT})`);
        }
        t();
      }
      // Printed on every run, pass or fail: a spec that stores only its failures
      // cannot tell you the passing number, and quoting a number you did not read
      // back from the browser is how OBRS-747 published three wrong ratios.
      console.log(`[OBRS-932] ${mode} measured:\n  ${rows.join('\n  ')}`);
      expect(failures).withContext(`${mode}: below-AA delta chips`).toEqual([]);
    });
  }

  it('dark: the chips use the themed surface role, NOT the chip half they shipped with', async () => {
    for (const site of SITES) {
      const { host, teardown: t } = await site.mount(true);
      const shell = document.querySelector('.admin-shell') as HTMLElement;
      const expected = toHex(resolveTokenColour(shell, site.surfaceRole));
      const chipHalf = toHex(resolveTokenColour(shell, site.chipHalf));
      const actual = toHex(fgOf(host));
      t();

      expect(actual)
        .withContext(`${site.label} must resolve to ${site.surfaceRole} (${expected}) in dark mode`)
        .toBe(expected);
      expect(actual)
        .withContext(
          `${site.label} must NOT be ${site.chipHalf} (${chipHalf}) — that is the dark half of a ` +
            `pastel chip pair and measures 1.7–1.8:1 standing alone on --admin-surface-card`
        )
        .not.toBe(chipHalf);
    }
  });

  it('light: the chips render the SAME colour the chip half gave — this fix is dark-only', async () => {
    for (const site of SITES) {
      const { host, teardown: t } = await site.mount(false);
      const shell = document.querySelector('.admin-shell') as HTMLElement;
      const chipHalf = toHex(resolveTokenColour(shell, site.chipHalf));
      const surfaceRole = toHex(resolveTokenColour(shell, site.surfaceRole));
      const actual = toHex(fgOf(host));
      t();

      // Not "the token is spelled *-fg" — the pixel. admin-theme.scss declares the
      // light values of the two families identical on purpose so a role swap costs
      // light mode nothing; this is the assertion that keeps that promise true.
      expect(surfaceRole)
        .withContext(`${site.surfaceRole} and ${site.chipHalf} must stay identical in LIGHT mode`)
        .toBe(chipHalf);
      expect(actual)
        .withContext(`${site.label} light rendering must be byte-identical to what it was before OBRS-932`)
        .toBe(chipHalf);
    }
  });
});

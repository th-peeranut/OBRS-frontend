/**
 * OBRS-573 — the staff sidebar renders its links grouped under section headers.
 *
 * Why a separate spec file rather than more cases in staff-layout.component.spec.ts:
 * that spec's AuthService stub answers `hasAnyRole` with a single fixed boolean for
 * every question, so it can only produce "sees nothing" or "sees everything". This
 * card is entirely about what a PARTICULAR role sees, so the harness here answers
 * per-role, the way nav-reachability.spec.ts does.
 *
 * The load-bearing assertion is {@link headersAlwaysHaveItems}: driver and
 * salesperson see different item sets, so a section can legitimately end up empty
 * for one of them, and a bare header over nothing reads as a broken menu. Asserting
 * only "the expected headers appear" would not catch that — an empty header still
 * appears. So the DOM is walked in order and every header is required to be
 * followed by at least one link before the next header.
 */
import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { BehaviorSubject, of } from 'rxjs';

import { StaffLayoutComponent } from './staff-layout.component';
import { LangSwitcherComponent } from '../../shared/components/lang-switcher/lang-switcher.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { ThemeService, ThemeMode } from '../../shared/services/theme.service';
import { LanguageService } from '../../shared/services/language.service';
import { createLanguageServiceStub } from '../../testing/test-stubs';
import { NotificationInboxService } from '../../shared/services/notification-inbox.service';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-notification-bell', template: '',
    standalone: false
})
class NotificationBellStubComponent {}

const SALES = 'STAFF.NAV.SECTION.SALES';
const OPERATIONS = 'STAFF.NAV.SECTION.OPERATIONS';
const PARCELS = 'STAFF.NAV.SECTION.PARCELS';

/**
 * Render the staff shell for a user holding exactly `roles` and hand back the
 * sidebar's DOM. No translations are loaded, so `| translate` emits the key
 * itself — which is what these specs assert on, keeping them independent of the
 * wording in the i18n files.
 */
async function renderNav(layout: Type<unknown>, roles: readonly string[]): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    declarations: [layout, LangSwitcherComponent, NotificationBellStubComponent],
    imports: [RouterTestingModule, TranslateModule.forRoot()],
    providers: [
      {
        provide: AuthService,
        useValue: {
          getUsername: () => 'nav@obrs.test',
          getRoles: () => [...roles],
          hasAnyRole: (required: string[]) => required.some((r) => roles.includes(r)),
          logout: () => {},
          // OBRS-1721 — see the note in admin-layout.component.spec.ts.
          getPreviewRole: () => null,
          getPreviewableRoles: () => [],
          previewRole$: of<string | null>(null),
        },
      },
      { provide: AlertService, useValue: { success: () => {} } },
      { provide: PrimeNG, useValue: { setTranslation: () => {} } },
      { provide: LanguageService, useValue: createLanguageServiceStub() },
      {
        provide: ThemeService,
        useValue: {
          getStoredMode: () => 'light',
          setMode: () => {},
          toggle: () => {},
          mode$: new BehaviorSubject<ThemeMode>('light').asObservable(),
        },
      },
      { provide: NotificationInboxService, useValue: { startPolling: () => {}, stopPolling: () => {} } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(layout);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('.admin-nav') as HTMLElement;
}

/** Section headers, in the order they render. */
function headerKeys(nav: HTMLElement): string[] {
  return Array.from(nav.querySelectorAll('.admin-nav-section-title')).map((el) =>
    (el.textContent ?? '').trim(),
  );
}

/**
 * Walk the nav in DOM order and report any header with no link beneath it before
 * the next header (or the end of the list).
 */
function headersAlwaysHaveItems(nav: HTMLElement): string[] {
  const empty: string[] = [];
  let openHeader: string | null = null;
  let itemsUnderIt = 0;

  const closeHeader = (): void => {
    if (openHeader !== null && itemsUnderIt === 0) empty.push(openHeader);
  };

  for (const el of Array.from(nav.querySelectorAll('.admin-nav-section-title, .admin-nav-link'))) {
    if (el.classList.contains('admin-nav-section-title')) {
      closeHeader();
      openHeader = (el.textContent ?? '').trim();
      itemsUnderIt = 0;
    } else {
      itemsUnderIt += 1;
    }
  }
  closeHeader();

  return empty;
}

describe('OBRS-573 — staff sidebar sections', () => {
  it('groups a salesperson\'s links under all three headers, in order', async () => {
    const nav = await renderNav(StaffLayoutComponent, ['salesperson', 'driver']);
    expect(headerKeys(nav)).toEqual([SALES, OPERATIONS, PARCELS]);
  });

  it('drops the sales header entirely for a driver, who has no items in it', async () => {
    // A driver holds none of sell/schedules/fleet-map. The header for that group
    // must disappear with them — not render as a label over empty space.
    const nav = await renderNav(StaffLayoutComponent, ['driver']);
    expect(headerKeys(nav)).toEqual([OPERATIONS, PARCELS]);
  });

  it('never renders a header with no links under it, for any role', async () => {
    for (const roles of [['salesperson', 'driver'], ['driver'], ['salesperson']]) {
      const nav = await renderNav(StaffLayoutComponent, roles);
      expect(headersAlwaysHaveItems(nav))
        .withContext(`empty section header(s) rendered for [${roles.join(', ')}]`)
        .toEqual([]);
    }
  });

  it('keeps every page one click away — grouping adds headers, never a control to expand', async () => {
    // The alternative design (one "Parcels" menu that opens a submenu) would have
    // cost every driver an extra click on work they do several times a trip. The
    // headers must therefore stay inert text: no <button>, no collapsible <details>.
    const nav = await renderNav(StaffLayoutComponent, ['salesperson', 'driver']);

    const links = Array.from(nav.querySelectorAll('.admin-nav-link'));
    expect(links.length).withContext('nav should still render its links').toBeGreaterThan(5);
    expect(links.every((a) => !!a.getAttribute('href')))
      .withContext('every nav entry is a direct link, not a disclosure control')
      .toBeTrue();

    expect(nav.querySelectorAll('button, details, summary').length)
      .withContext('a section header must not be clickable — that is the extra click we refused')
      .toBe(0);
  });
});

describe('OBRS-622 — fleet-map nav item gated behind environment.features.fleetMap', () => {
  let originalFleetMap: boolean;

  beforeEach(() => {
    originalFleetMap = environment.features.fleetMap;
  });

  afterEach(() => {
    environment.features.fleetMap = originalFleetMap;
  });

  it('does not offer a fleet-map nav link to a salesperson when the flag is false', async () => {
    environment.features.fleetMap = false;

    const nav = await renderNav(StaffLayoutComponent, ['salesperson']);
    const links = Array.from(nav.querySelectorAll('.admin-nav-link'));

    expect(links.some((a) => (a.getAttribute('href') ?? '').includes('fleet-map')))
      .withContext('fleet-map must be absent from the DOM while the flag is off, not just hidden')
      .toBeFalse();
    // The go-live scope cut removes ONE item from 'operations' (sell/schedules
    // stay in 'sales'); the sales header itself must still have items under it.
    expect(headersAlwaysHaveItems(nav)).toEqual([]);
  });

  it('offers the fleet-map nav link to a salesperson when the flag is true', async () => {
    environment.features.fleetMap = true;

    const nav = await renderNav(StaffLayoutComponent, ['salesperson']);
    const links = Array.from(nav.querySelectorAll('.admin-nav-link'));

    expect(links.some((a) => (a.getAttribute('href') ?? '').includes('fleet-map')))
      .withContext('fleet-map should render once the flag is re-enabled')
      .toBeTrue();
    expect(headersAlwaysHaveItems(nav)).toEqual([]);
  });

  it('never offers the fleet-map link to a driver, regardless of the flag', async () => {
    // fleet-map is salesperson-only by route data.requiredRoles — the flag
    // narrows visibility further, it never widens who the route admits.
    for (const flag of [false, true]) {
      environment.features.fleetMap = flag;
      const nav = await renderNav(StaffLayoutComponent, ['driver']);
      const links = Array.from(nav.querySelectorAll('.admin-nav-link'));
      expect(links.some((a) => (a.getAttribute('href') ?? '').includes('fleet-map')))
        .withContext(`driver must not see fleet-map (flag=${flag})`)
        .toBeFalse();
    }
  });
});

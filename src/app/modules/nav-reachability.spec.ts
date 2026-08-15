/**
 * OBRS-543 — every staff and admin page must be reachable from the UI.
 *
 * The bug this locks down: `staff/parcels/consign` and `staff/parcels/deliveries`
 * shipped complete and guarded under OBRS-305, but neither ever got a nav entry,
 * so the only way in was to type the URL. A feature nobody can navigate to is a
 * feature that was not shipped, and nothing noticed for months — a route list and
 * a nav array are two independent lists that no test had ever compared.
 *
 * These specs compare them. They read the REAL exported route arrays
 * (`staffRoutes` / `adminRoutes`) and the REAL `buildNavItems()` output of each
 * layout, never a hand-mirrored copy, so adding a route without a nav entry fails
 * here rather than in production.
 *
 * <p><b>Reachability is transitive, and that is the point.</b> A `:param` detail
 * page legitimately has no nav entry — you arrive from its list page. So rather
 * than exempting those wholesale, {@link STAFF_LINKED_FROM} names the page that
 * links to each one, and the assertion requires THAT page to be reachable. Before
 * this card `parcels/:id/waybill` was linked only from `parcels/consign`, which
 * was itself orphaned — a blanket "has a parent path" exemption would have called
 * it reachable and been wrong. Naming the specific linker is what makes the
 * exemption honest, and it is why fixing two nav entries restored four pages.
 *
 * <p><b>Limit, stated plainly:</b> the LINKED_FROM tables are hand-maintained,
 * because nothing in the code declares "page A links to page B" in a form a test
 * can read. A new detail page must be listed there or the sweep fails closed —
 * the safe direction, but it does mean this guards the route list; it does not
 * discover in-app links by itself.
 */
import { Route } from '@angular/router';
import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { BehaviorSubject, Subject, of } from 'rxjs';

import { staffRoutes } from './staff/staff.module';
import { StaffLayoutComponent } from './staff/staff-layout.component';
import { adminRoutes } from './admin/admin.module';
import { appRoutes } from '../app-routing.module';
import { AdminLayoutComponent } from './admin/admin-layout.component';
import { LangSwitcherComponent } from '../shared/components/lang-switcher/lang-switcher.component';
import { AuthService } from '../auth/auth.service';
import { AlertService } from '../shared/services/alert.service';
import { ThemeService, ThemeMode } from '../shared/services/theme.service';
import { LanguageService } from '../shared/services/language.service';
import { createLanguageServiceStub } from '../testing/test-stubs';
import { NotificationInboxService } from '../shared/services/notification-inbox.service';
import { AdminApiService } from '../services/admin/admin-api.service';
import { BadgeSocketService } from '../services/admin/badge-socket.service';

@Component({
    selector: 'app-notification-bell', template: '',
    standalone: false
})
class NotificationBellStubComponent {}

/** Roles that can enter each shell, per app-routing.module.ts. */
const STAFF_ROLES = ['salesperson', 'driver'];
const ADMIN_ROLES = ['admin', 'owner'];

/**
 * Pages with no nav entry BY DESIGN, each mapped to the page that links to it.
 * The value must itself be reachable — see the transitivity note in the header.
 * Add an entry only after checking the linking template/component.
 */
const STAFF_LINKED_FROM: Record<string, string> = {
  // sell-page.component.ts — router.navigate after a completed walk-in sale
  'sell/receipt/:bookingId': 'sell',
  // boarding-entry-page — schedule picker drills into the list
  'boarding/:scheduleId': 'boarding',
  // parcel-intake-result-panel, rendered inside parcel-consign-page
  'parcels/:id/waybill': 'parcels/consign',
  // OBRS-574: parcel-schedule-entry-page drills into the tabbed page that
  // holds BOTH parcel jobs. Replaces the two entries this table used to carry
  // ('parcels/deliveries/:scheduleId' and 'parcels/verify/:scheduleId', each
  // linked from its own picker) — those paths are now redirects, and
  // leafRoutes() already excludes componentless routes, so they need no entry.
  'parcels/schedule/:scheduleId': 'parcels/schedule',
};

/** Admin has no detail-page routes today; kept for symmetry and future ones. */
const ADMIN_LINKED_FROM: Record<string, string> = {};

/**
 * Leaf pages of a shell's route tree. Redirects (the bare-path default and the
 * legacy alias paths) carry no component and are not pages.
 */
function leafRoutes(routes: Route[]): Route[] {
  const shell = routes.find((r) => r.path === '');
  return (shell?.children ?? []).filter((r) => r.path !== '' && !!r.component);
}

/**
 * The roles a page actually admits. Most admin children carry no guard of their
 * own and are protected solely by the `/admin` shell entry in app-routing —
 * reading only the child's own `data` would report them as admitting nobody, so
 * fall back to the shell's `requiredRoles`, which is what AuthGuard enforced.
 */
function requiredRolesOf(routes: Route[], shellPath: string, path: string): string[] {
  const own = leafRoutes(routes).find((r) => r.path === path)?.data?.['requiredRoles'] as
    | string[]
    | undefined;
  if (own) return own;
  return (appRoutes.find((r) => r.path === shellPath)?.data?.['requiredRoles'] as
    | string[]
    | undefined) ?? [];
}

/**
 * A REAL AuthService whose only stub is the role list a JWT would have supplied.
 * Everything the access check depends on — ROLE_GRANTS expansion, normalisation,
 * the empty-requiredRoles behaviour — stays the production implementation.
 */
function realAuthServiceFor(roles: string[]): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HttpClientTestingModule, RouterTestingModule] });
  const auth = TestBed.inject(AuthService);
  spyOn(auth, 'getRoles').and.returnValue(roles);
  return auth;
}

/**
 * Build a layout for a user holding exactly `roles`, returning both the nav model
 * (`paths`) and what the template actually rendered (`hrefs`). Both are needed:
 * see the href spec below for why agreement between two model-side lists proves
 * nothing about the link a user clicks.
 */
async function navEntriesFor(
  layout: Type<unknown>,
  roles: readonly string[],
): Promise<{ paths: string[]; hrefs: string[] }> {
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
      // admin-only dependencies; harmless for the staff layout
      { provide: AdminApiService, useValue: { getUsabilityReportCountByStatus: () => of(0) } },
      {
        provide: BadgeSocketService,
        useValue: { counts$: new Subject<unknown>(), connect: () => {}, disconnect: () => {} },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(layout);
  fixture.detectChanges();
  const items = (fixture.componentInstance as { navItems: { path: string }[] }).navItems;
  const hrefs: string[] = Array.from(
    fixture.nativeElement.querySelectorAll('.admin-nav .admin-nav-link'),
  ).map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? '');

  return { paths: items.map((i) => i.path), hrefs };
}

/** Convenience for the specs that only care about the model side. */
async function navPathsOnly(layout: Type<unknown>, roles: readonly string[]): Promise<string[]> {
  return (await navEntriesFor(layout, roles)).paths;
}

/**
 * One sweep, applied to both shells. `minRoutes`/`minNav` are floors that keep a
 * refactor from making the sweep vacuously green: if the exported route array is
 * renamed away or the AuthService stub stops satisfying the layout's role checks,
 * both sets collapse to empty and "no orphans" would be reported over nothing.
 */
function describeShell(
  label: string,
  layout: Type<unknown>,
  routes: Route[],
  shellPath: string,
  roles: string[],
  linkedFrom: Record<string, string>,
  floors: { minRoutes: number; minNav: number },
  featureFlaggedUnreachable: string[] = [],
): void {
  describe(`OBRS-543 — ${label} nav reachability`, () => {
    it('every routed page is reachable — via the nav, or via a page that is', async () => {
      const inNav = new Set(await navPathsOnly(layout, roles));

      const unreachable = leafRoutes(routes)
        .map((r) => r.path!)
        .filter((path) => {
          if (inNav.has(path)) return false;
          // OBRS-622: a route intentionally hidden behind a feature flag that
          // currently reads false is not an orphan — see the constant's doc
          // comment above.
          if (featureFlaggedUnreachable.includes(path)) return false;
          const linker = linkedFrom[path];
          // Not in the nav and not declared as linked from anywhere => orphan.
          // Declared, but its linker is itself unreachable => transitively orphaned.
          return !linker || !inNav.has(linker);
        });

      expect(unreachable)
        .withContext(
          `these ${label} pages can only be opened by typing the URL — give each one a ` +
            'nav entry in the layout\'s buildNavItems(), or add it to the LINKED_FROM ' +
            'table naming the reachable page that links to it',
        )
        .toEqual([]);
    });

    it('renders each nav item as a link to that page, with the path intact', async () => {
      // Found the hard way on this card: the staff template bound
      // [routerLink]="['/staff', item.path]", and an array element is ONE path
      // segment — so 'parcels/consign' rendered as /staff/parcels%2Fconsign,
      // which matches no route. OBRS-416's 'parcels/verify' entry had shipped
      // that way and looked completely correct in the sidebar.
      //
      // Every other spec in this file compares the nav model against the route
      // model. Both said 'parcels/verify'. Both were right. The DOM was wrong.
      // That is the whole reason this one reads the rendered href instead.
      const { paths, hrefs } = await navEntriesFor(layout, roles);

      expect(hrefs.length)
        .withContext('one anchor per nav item')
        .toBe(paths.length);

      // Matched as a set, not pairwise by index: the admin shell renders its
      // items grouped into sections, so DOM order deliberately differs from
      // buildNavItems() order. Only presence of an intact path matters here.
      const broken = paths.filter((path) => !hrefs.some((href) => href.includes(path)));

      expect(broken)
        .withContext(
          'a nav href must contain its route path verbatim — a percent-encoded ' +
            'separator (%2F) means the whole path became a single segment and the ' +
            'link goes nowhere',
        )
        .toEqual([]);
    });

    it('the sweep is not vacuously green — it sees the real route list and the real nav', async () => {
      expect(leafRoutes(routes).length).toBeGreaterThan(floors.minRoutes);
      expect((await navPathsOnly(layout, roles)).length).toBeGreaterThan(floors.minNav);
    });

    it('never shows a nav link the user would be bounced off by the route guard', async () => {
      // The other half of the gap: a link that 403s is worse than no link,
      // because the user concludes the system is broken rather than off-limits.
      //
      // Admission is asked of the REAL AuthService, never re-implemented here.
      // Its ROLE_GRANTS table is a hierarchy, not a name match — owner is
      // granted admin, salesperson is granted driver — so a spec that compared
      // role strings directly would flag every one of those as a violation and
      // then have to be "fixed" by copying the policy in, at which point it
      // would stop tracking the policy it exists to check.
      const violations: string[] = [];

      for (const role of roles) {
        const navPaths = await navPathsOnly(layout, [role]);
        const auth = realAuthServiceFor([role]);

        for (const path of navPaths) {
          const allowed = requiredRolesOf(routes, shellPath, path);
          if (!auth.hasAnyRole(allowed)) {
            violations.push(`${role} sees '${path}' but the guard admits [${allowed.join(', ')}]`);
          }
        }
      }

      expect(violations).toEqual([]);
    });

    it('the access check is real — an unrelated role is refused these same pages', async () => {
      // Guards the test above against passing because hasAnyRole always says
      // yes (a broken getRoles spy, an empty requiredRoles resolving to a
      // permissive default). 'customer' holds no portal grant, so every page
      // this shell lists must refuse it.
      const auth = realAuthServiceFor(['customer']);
      const admitted = (await navPathsOnly(layout, roles)).filter((path) =>
        auth.hasAnyRole(requiredRolesOf(routes, shellPath, path)),
      );

      expect(admitted)
        .withContext(`a plain customer must not satisfy any ${label} page guard`)
        .toEqual([]);
    });
  });
}

describeShell(
  'staff',
  StaffLayoutComponent,
  staffRoutes,
  'staff',
  STAFF_ROLES,
  STAFF_LINKED_FROM,
  { minRoutes: 8, minNav: 5 },
);

describeShell('admin', AdminLayoutComponent, adminRoutes, 'admin', ADMIN_ROLES, ADMIN_LINKED_FROM, {
  minRoutes: 15,
  minNav: 15,
});

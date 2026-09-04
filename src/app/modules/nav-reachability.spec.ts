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
const ADMIN_LINKED_FROM: Record<string, string> = {
  // OBRS-1576: expenses-page.component.html — the `รับซองบิล` button beside `เพิ่มค่าใช้จ่าย`.
  // Deliberately NOT a nav entry: it is one of two ways to record the same thing, and a second
  // top-level "expenses" item in the sidebar would read as a second cost book.
  'expenses/batch': 'expenses',
};

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
 * OBRS-1498: the second, narrower key a page can carry — the roles it requires
 * the user to HOLD, with no ROLE_GRANTS expansion (see AuthGuard). Only pages
 * whose backend doors 403 an owner declare it, and it never falls back to the
 * shell: absent means the area check above is the whole gate. Without this the
 * sweep below would read /admin/lookups as admitting an owner and stop noticing
 * if its nav entry ever came back.
 */
function requiredHeldRolesOf(routes: Route[], path: string): string[] {
  return (leafRoutes(routes).find((r) => r.path === path)?.data?.['requiredHeldRoles'] as
    | string[]
    | undefined) ?? [];
}

/**
 * A REAL AuthService whose only stub is the role list a JWT would have supplied.
 * Everything the access check depends on — ROLE_GRANTS expansion, normalisation,
 * the empty-requiredRoles behaviour — stays the production implementation.
 */
function realAuthServiceFor(roles: string[], previewRole: string | null = null): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HttpClientTestingModule, RouterTestingModule] });
  const auth = TestBed.inject(AuthService);
  // OBRS-1721: the spy moved from getRoles() to getHeldRoles(), one layer down.
  // With no preview the two are the same function, so every caller above is
  // unchanged — but stubbing getRoles() would have stubbed OUT the preview
  // override itself, i.e. the thing under test.
  spyOn(auth, 'getHeldRoles').and.returnValue(roles);
  if (previewRole) {
    auth.startRolePreview(previewRole);
  }
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
  // OBRS-1721: optional, null-default — when supplied it REPLACES the role stub
  // below with a real AuthService, so the preview override, ROLE_GRANTS
  // expansion and hasHeldRole are all production code. Omitted, every existing
  // caller behaves exactly as before.
  authOverride: AuthService | null = null,
): Promise<{ paths: string[]; hrefs: string[] }> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    declarations: [layout, LangSwitcherComponent, NotificationBellStubComponent],
    imports: [RouterTestingModule, TranslateModule.forRoot()],
    providers: [
      {
        provide: AuthService,
        useValue: authOverride ?? {
          getUsername: () => 'nav@obrs.test',
          getRoles: () => [...roles],
          hasAnyRole: (required: string[]) => required.some((r) => roles.includes(r)),
          // OBRS-1498: the held-role question, with no ROLE_GRANTS expansion —
          // here that is the same shape as the stub above, but it is what
          // AdminLayoutComponent asks before listing lookups/roles.
          hasHeldRole: (required: string[]) => required.some((r) => roles.includes(r)),
          logout: () => {},
          // OBRS-1721: never previewing on this path — the preview cases below
          // pass a real AuthService through authOverride instead.
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
          // OBRS-1498: the guard's second door. A page can pass the area check
          // above and still bounce this role.
          const held = requiredHeldRolesOf(routes, path);
          if (!auth.hasHeldRole(held)) {
            violations.push(`${role} sees '${path}' but the guard requires HELD [${held.join(', ')}]`);
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

/**
 * OBRS-1721 — "ดูในมุมมองของ…", the read-only role preview.
 *
 * The defect this locks down is the reason the card exists: `ROLE_GRANTS.owner`
 * includes 'driver', and StaffLayoutComponent asks `hasAnyRole(['salesperson'])`
 * and `hasAnyRole(['driver'])` SEPARATELY — so an owner passes both and sees the
 * UNION of the two staff menus, a menu no real staff member has ever had. Nobody
 * could check what a salesperson actually sees, because nobody could be one.
 *
 * These specs run the real AuthService (only `getHeldRoles()` is stubbed, in
 * place of the JWT), so what they exercise is the production override at the
 * `getRoles()` choke point, not a model of it.
 */
describe('OBRS-1721 — view-as role preview', () => {
  // The promise the feature makes, asserted directly: the nav a previewer gets
  // is BYTE-FOR-BYTE the nav a real holder of that role gets. Stated this way it
  // is independent of which items happen to be in each menu, so it keeps meaning
  // the same thing as the menus change.
  it('previewing as salesperson reproduces a real salesperson’s staff nav exactly', async () => {
    const previewing = realAuthServiceFor(['owner'], 'salesperson');
    const real = realAuthServiceFor(['salesperson']);

    expect((await navEntriesFor(StaffLayoutComponent, [], previewing)).paths).toEqual(
      (await navEntriesFor(StaffLayoutComponent, [], real)).paths,
    );
  });

  it('previewing as driver drops every salesperson-only item, and matches a real driver', async () => {
    const previewing = realAuthServiceFor(['owner'], 'driver');
    const paths = (await navEntriesFor(StaffLayoutComponent, [], previewing)).paths;

    // Real narrowing, not just equality with another computed list: these five
    // sit inside `if (isSalesperson)` in staff-layout's buildNavItems().
    expect(paths).not.toContain('sell');
    expect(paths).not.toContain('schedules');
    expect(paths).not.toContain('cancel-booking');
    expect(paths).not.toContain('fleet-map');
    expect(paths).not.toContain('parcels/consign');
    // Narrowed, not emptied — an empty nav would satisfy every line above while
    // proving nothing about what a driver sees.
    expect(paths).toContain('driver');
    expect(paths).toContain('inspection');

    const real = realAuthServiceFor(['driver']);
    expect(paths).toEqual((await navEntriesFor(StaffLayoutComponent, [], real)).paths);
  });

  it('...and the un-previewed owner sees the salesperson items the driver preview dropped', async () => {
    // The positive control for the spec above: without it, "not.toContain('sell')"
    // cannot distinguish "the preview dropped it" from "it was never there".
    const auth = realAuthServiceFor(['owner']);
    const paths = (await navEntriesFor(StaffLayoutComponent, [], auth)).paths;

    expect(paths).toContain('sell');
    expect(paths).toContain('fleet-map');
  });

  /**
   * FINDING, recorded rather than patched around (OBRS-1721 AC-2).
   *
   * The card's AC-8 asked for `driver` + `inspection` to disappear when an owner
   * previews as SALESPERSON, on the premise that an owner sees a salesperson +
   * driver union "no real staff member ever sees". That premise does not hold:
   * `ROLE_GRANTS.salesperson` is `['salesperson','driver']`, so a real
   * salesperson passes `hasAnyRole(['driver'])` too — and `staff.module.ts`
   * gives both routes `requiredRoles: ['driver']`, which the same expansion
   * admits. A salesperson sees those two items TODAY, in production.
   *
   * So the preview is right and the expectation was wrong: reproducing a
   * salesperson faithfully MUST include them. The only way to drop them would be
   * to special-case the staff layout (which AC-2 forbids) or to narrow
   * `ROLE_GRANTS.salesperson` (a product decision about who may drive, well
   * outside this card). This spec pins the fact so the next reader meets it as
   * data rather than re-deriving it.
   */
  it('FINDING: ROLE_GRANTS.salesperson grants driver, so a real salesperson already sees the driver items', async () => {
    const real = realAuthServiceFor(['salesperson']);
    const paths = (await navEntriesFor(StaffLayoutComponent, [], real)).paths;

    expect(paths).toContain('driver');
    expect(paths).toContain('inspection');
    expect(real.hasAnyRole(['driver'])).toBeTrue();
  });

  it('an admin previewing as owner loses the two admin-only entries (ADR-0040)', async () => {
    // hasHeldRole() is the gate on these two, and it reads getRoles() — so the
    // single override covers it. Without that, the admin→owner preview would
    // change nothing at all, these two being the whole difference.
    const auth = realAuthServiceFor(['admin'], 'owner');
    const paths = (await navEntriesFor(AdminLayoutComponent, [], auth)).paths;

    expect(paths).not.toContain('lookups');
    expect(paths).not.toContain('roles');
    expect(paths).toContain('users');
  });

  it('...and the same admin sees both without a preview', async () => {
    const auth = realAuthServiceFor(['admin']);
    const paths = (await navEntriesFor(AdminLayoutComponent, [], auth)).paths;

    expect(paths).toContain('lookups');
    expect(paths).toContain('roles');
  });

  it('offers only roles BELOW the held one, and never customer', () => {
    // 'customer' is excluded on purpose: auth.guard.ts's customerArea branch
    // runs no role check, so previewing as customer would change nothing while
    // implying it had (ADR-0042).
    expect(realAuthServiceFor(['admin']).getPreviewableRoles()).toEqual([
      'owner',
      'salesperson',
      'driver',
    ]);
    expect(realAuthServiceFor(['owner']).getPreviewableRoles()).toEqual([
      'salesperson',
      'driver',
    ]);
  });

  it('offers nothing to a salesperson or a driver — which is what hides the menu', () => {
    // hasHeldRole, not hasAnyRole: a salesperson holds no admin/owner role, and
    // the empty list is what both shell templates gate the submenu on.
    expect(realAuthServiceFor(['salesperson']).getPreviewableRoles()).toEqual([]);
    expect(realAuthServiceFor(['driver']).getPreviewableRoles()).toEqual([]);
  });

  it('refuses a role the holder may not preview', () => {
    const auth = realAuthServiceFor(['owner']);
    auth.startRolePreview('admin');
    expect(auth.getPreviewRole()).toBeNull();
    auth.startRolePreview('customer');
    expect(auth.getPreviewRole()).toBeNull();
  });

  it('exiting restores the real roles, and the real roles are never lost while previewing', () => {
    const auth = realAuthServiceFor(['owner'], 'driver');
    expect(auth.getRoles()).toEqual(['driver']);
    expect(auth.getHeldRoles()).toEqual(['owner']);

    auth.exitRolePreview();
    expect(auth.getRoles()).toEqual(['owner']);
  });
});

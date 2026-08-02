import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Route } from '@angular/router';

import { AuthService } from '../../../../auth/auth.service';
import { CanDeactivateGuard } from '../../../../shared/guards/can-deactivate.guard';
import { AuthGuard } from '../../../../auth/auth.guard';
import { adminRoutes } from '../../admin.module';
import { SystemSettingsPageComponent } from './system-settings-page.component';
import { SYSTEM_SETTINGS_ROLES, SYSTEM_SETTINGS_TABS } from './system-settings-tabs';

/**
 * OBRS-702 — the four standalone `/admin/*-config` pages became tabs of one
 * `/admin/settings` page. What these specs are for, in order of what would hurt
 * most if it broke:
 *
 * 1. **Access must change in NEITHER direction.** Merging four guards into one
 *    is the obvious way to hand someone a screen they never had, or take one
 *    away. The declared roles are pinned against a frozen copy of what actually
 *    shipped, and admission is asked of the REAL `AuthService` — never a stub
 *    that re-implements it.
 *
 *    That last part is not a style preference, it is the correction this card
 *    needed. An earlier version of this file stubbed `hasAnyRole` by hand and
 *    got the grant direction backwards, so it "proved" a plain owner sees two
 *    tabs. `ROLE_GRANTS` (auth.service.ts:60-62) grants BOTH ways at the top —
 *    `owner: [..., 'admin', ...]` and `admin: [..., 'owner', ...]` — so
 *    `['admin']` and `['admin','owner']` are one predicate, an owner sees all
 *    four, and an owner saw all four sidebar entries before this card too. The
 *    stub agreed with the spec and both were wrong; a live capture disagreed.
 *    nav-reachability.spec.ts's header warns about exactly this.
 * 2. **A tab must not be routed-but-unrendered, or rendered-but-unguarded.**
 *    Both lists are generated from SYSTEM_SETTINGS_TABS, and these specs read
 *    the REAL `adminRoutes` to prove the generation happened — the same
 *    "compare two independently-built lists" shape as nav-reachability.spec.ts,
 *    which is also why the tab pages need no entry of their own there.
 * 3. **The old URLs still land somewhere.** They are quoted in code comments
 *    across both portals and may be bookmarked.
 */

/** The settings shell route, read from the real admin route table. */
function settingsRoute(): Route {
  const shell = adminRoutes.find((r) => r.path === '')!;
  return shell.children!.find((r) => r.path === 'settings')!;
}

/** Its tab children — the empty-path redirect is not a tab. */
function tabRoutes(): Route[] {
  return settingsRoute().children!.filter((r) => r.path !== '');
}

/** Every direct child of the admin shell, tabs excluded. */
function adminChildren(): Route[] {
  return adminRoutes.find((r) => r.path === '')!.children!;
}

/**
 * The `requiredRoles` each page carried as a standalone route BEFORE this card,
 * copied by hand from admin.module.ts at OBRS-576. Deliberately a frozen literal
 * and not derived from anything: derived from SYSTEM_SETTINGS_TABS it would pass
 * no matter what those roles were changed to, which is the entire failure this
 * table exists to catch.
 */
const ROLES_BEFORE_OBRS_702: Record<string, readonly string[]> = {
  'booking-policy': ['admin', 'owner'],
  reminders: ['admin'],
  'jump-seat': ['admin'],
  history: ['admin', 'owner'],
  // OBRS-960: two NEW tabs, never a standalone route — "before" is simply
  // their own requiredRoles at creation, same frozen-literal discipline as
  // the four above (derived from SYSTEM_SETTINGS_TABS would pass no matter
  // what the roles were changed to).
  'parcel-share': ['owner'],
  'driver-cash-rates': ['owner'],
};

describe('OBRS-702 SystemSettingsPageComponent — tab strip', () => {
  /**
   * A REAL AuthService whose only stub is the role list a JWT would have
   * supplied — ROLE_GRANTS expansion, normalisation and the empty-requiredRoles
   * behaviour all stay the production implementation. Copied deliberately from
   * nav-reachability.spec.ts's `realAuthServiceFor`; see this file's header for
   * what a hand-written substitute cost.
   *
   * The spy must be installed BEFORE createComponent — the component reads the
   * roles in its constructor.
   */
  async function renderFor(roles: string[]): Promise<ComponentFixture<SystemSettingsPageComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [SystemSettingsPageComponent],
      imports: [HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()],
    }).compileComponents();

    spyOn(TestBed.inject(AuthService), 'getRoles').and.returnValue(roles);

    const fixture = TestBed.createComponent(SystemSettingsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** The real policy, asked directly — what the route guard would decide. */
  function admits(roles: string[], requiredRoles: readonly string[]): boolean {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule, RouterTestingModule] });
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'getRoles').and.returnValue(roles);
    return auth.hasAnyRole([...requiredRoles]);
  }

  function renderedTabPaths(fixture: ComponentFixture<SystemSettingsPageComponent>): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid^="system-settings-tab-"]')
    ).map((el) => (el as HTMLElement).getAttribute('data-testid')!.replace('system-settings-tab-', ''));
  }

  it('shows an admin every tab', async () => {
    expect(renderedTabPaths(await renderFor(['admin']))).toEqual(
      SYSTEM_SETTINGS_TABS.map((t) => t.path)
    );
  });

  it('shows a plain owner every tab too — ROLE_GRANTS makes them one audience', async () => {
    // NOT a weaker version of the spec above. It is the fact that corrects this
    // card's original premise: `['admin']` is not admin-only on this frontend,
    // so an owner reached all four standalone pages before OBRS-702 and must
    // still reach all four tabs after it. The DOM says so; the assertion below
    // says WHY, so this does not read as an accident.
    expect(renderedTabPaths(await renderFor(['owner']))).toEqual(
      SYSTEM_SETTINGS_TABS.map((t) => t.path)
    );
    expect(admits(['owner'], ['admin']))
      .withContext('ROLE_GRANTS no longer grants admin to owner — re-derive the tab audiences')
      .toBeTrue();
  });

  it('never shows a tab the route guard would bounce, and never hides one it admits', async () => {
    // Crosses two independently-built lists through the real policy: the strip
    // filters on the TAB TABLE's roles, this reads the ROUTE's own `data`.
    for (const roles of [['admin'], ['owner'], ['admin', 'owner']]) {
      const shown = new Set(renderedTabPaths(await renderFor(roles)));
      for (const route of tabRoutes()) {
        const allowed = route.data?.['requiredRoles'] as string[];
        expect(shown.has(route.path!))
          .withContext(`[${roles}] tab '${route.path}' guarded by [${allowed}]`)
          .toBe(admits(roles, allowed));
      }
    }
  });

  it('the access check is real — a customer and a salesperson are shown nothing', async () => {
    // Guards the specs above against passing because hasAnyRole always says
    // yes. Neither role holds a portal grant, so the strip must be empty even
    // though they could never have reached the shell route in the first place.
    expect(renderedTabPaths(await renderFor(['customer']))).toEqual([]);
    expect(renderedTabPaths(await renderFor(['salesperson']))).toEqual([]);
  });

  it('renders each visible tab as a link to its own child route', async () => {
    // nav-reachability.spec.ts found the hard way that a routerLink can render
    // a percent-encoded path that matches no route, while every model-side list
    // still agrees. So read the href.
    const fixture = await renderFor(['admin']);
    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid^="system-settings-tab-"]')
    ).map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? '');

    for (const tab of SYSTEM_SETTINGS_TABS) {
      expect(hrefs.some((href) => href.endsWith(`/${tab.path}`)))
        .withContext(`no intact href for tab '${tab.path}' — got ${hrefs.join(', ')}`)
        .toBeTrue();
    }
  });

  it('renders an outlet for the active tab', async () => {
    const fixture = await renderFor(['admin']);
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});

describe('OBRS-702 /admin/settings routing', () => {
  it('routes exactly the tabs it renders — no orphan, no unrendered route', () => {
    expect(tabRoutes().map((r) => r.path)).toEqual(SYSTEM_SETTINGS_TABS.map((t) => t.path));
  });

  it('gives each tab the SAME component the standalone page used', () => {
    for (const tab of SYSTEM_SETTINGS_TABS) {
      const route = tabRoutes().find((r) => r.path === tab.path)!;
      expect(route.component).toBe(tab.component);
    }
  });

  it('keeps every tab on the exact roles its standalone route declared', () => {
    // A pin on the DECLARED value, which is what a future owner-scoping change
    // will read. It is not by itself proof about who gets in today — ROLE_GRANTS
    // decides that, and the tab-strip specs above ask it directly.
    for (const tab of SYSTEM_SETTINGS_TABS) {
      const route = tabRoutes().find((r) => r.path === tab.path)!;
      expect(route.data?.['requiredRoles'])
        .withContext(`route guard for tab '${tab.path}'`)
        .toEqual(ROLES_BEFORE_OBRS_702[tab.path]);
      expect([...tab.requiredRoles])
        .withContext(`rendered tab '${tab.path}'`)
        .toEqual(ROLES_BEFORE_OBRS_702[tab.path]);
    }
  });

  it('guards every tab route, and the shell, with AuthGuard', () => {
    expect(settingsRoute().canActivate).toEqual([AuthGuard]);
    for (const route of tabRoutes()) {
      expect(route.canActivate).withContext(`tab '${route.path}'`).toEqual([AuthGuard]);
    }
  });

  it('admits the union of its tabs to the shell — and nothing more', () => {
    // Narrower than the union would lock a plain owner out of the two tabs they
    // always had; wider would admit a role no tab would then show anything to.
    const union = Array.from(
      new Set(Object.values(ROLES_BEFORE_OBRS_702).flatMap((r) => [...r]))
    ).sort();
    expect([...SYSTEM_SETTINGS_ROLES].sort()).toEqual(union);
    expect([...(settingsRoute().data?.['requiredRoles'] as string[])].sort()).toEqual(union);
  });

  it('opens a tab EVERY admitted visitor may see when no tab is named', () => {
    // /admin/settings redirects its empty path to the first tab. If that tab
    // were ever admin-only, a plain owner would be bounced off the page the
    // moment they clicked its single sidebar entry.
    const empty = settingsRoute().children!.find((r) => r.path === '')!;
    expect(empty.redirectTo).toBe(SYSTEM_SETTINGS_TABS[0].path);
    expect(empty.pathMatch).toBe('full');

    const first = SYSTEM_SETTINGS_TABS[0].requiredRoles;
    for (const role of SYSTEM_SETTINGS_ROLES) {
      expect(first.includes(role))
        .withContext(`'${role}' may enter /admin/settings but not its default tab`)
        .toBeTrue();
    }
  });

  it('keeps every old standalone URL working, pointed at its tab', () => {
    for (const tab of SYSTEM_SETTINGS_TABS) {
      const legacy = adminChildren().find((r) => r.path === tab.legacyPath);
      expect(legacy).withContext(`no redirect left for /admin/${tab.legacyPath}`).toBeTruthy();
      expect(legacy!.redirectTo).toBe(`settings/${tab.path}`);
      expect(legacy!.pathMatch).toBe('full');
    }
  });

  it('leaves no standalone config page behind', () => {
    // The four legacy paths must be redirects only — a leftover `component`
    // would keep the old page reachable and the consolidation half-done.
    for (const tab of SYSTEM_SETTINGS_TABS) {
      expect(adminChildren().find((r) => r.path === tab.legacyPath)!.component)
        .withContext(`/admin/${tab.legacyPath} still renders a component`)
        .toBeUndefined();
    }
  });

  it('prompts before dropping an unsaved edit on any tab', () => {
    // Attached to all four, including the read-only history: CanDeactivateGuard
    // returns true for a component that implements no canDeactivate(), so the
    // uniform wiring costs nothing and cannot be forgotten on a tab that later
    // grows a form.
    for (const route of tabRoutes()) {
      expect(route.canDeactivate).withContext(`tab '${route.path}'`).toEqual([CanDeactivateGuard]);
    }
  });
});

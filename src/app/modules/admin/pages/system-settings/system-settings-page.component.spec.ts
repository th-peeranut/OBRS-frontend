import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
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
 * 1. **Access must not widen.** The four pages did NOT share an audience:
 *    reminders and jump-seat were `['admin']`, booking-policy and history were
 *    `['admin','owner']`, and under ROLE_GRANTS (OBRS-446) a plain owner
 *    satisfies the second but not the first. Merging four guards into one is
 *    the obvious way to hand an owner two screens they never had — so the roles
 *    are pinned against a frozen copy of what actually shipped, not against the
 *    current source (which would just agree with itself).
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
const ROLES_BEFORE_OBRS_702: Record<string, string[]> = {
  'booking-policy': ['admin', 'owner'],
  reminders: ['admin'],
  'jump-seat': ['admin'],
  history: ['admin', 'owner'],
};

describe('OBRS-702 SystemSettingsPageComponent — tab strip', () => {
  async function renderFor(roles: string[]): Promise<ComponentFixture<SystemSettingsPageComponent>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [SystemSettingsPageComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: AuthService,
          useValue: {
            // The real ROLE_GRANTS superset, reduced to what this component
            // asks: a held role satisfies a requirement it appears in, and
            // 'admin' additionally satisfies 'owner' (OBRS-446).
            hasAnyRole: (required: string[]) =>
              required.some((r) => roles.includes(r) || (r === 'owner' && roles.includes('admin'))),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SystemSettingsPageComponent);
    fixture.detectChanges();
    return fixture;
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

  it('shows a plain owner ONLY the two tabs they could already open', async () => {
    // The whole point of the card's "access must not widen" AC, asserted on
    // what the DOM renders rather than on the model: an owner never had
    // reminder-config or jump-seat-config, and must not gain them by the four
    // pages moving under one roof.
    expect(renderedTabPaths(await renderFor(['owner']))).toEqual(['booking-policy', 'history']);
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

  it('did not widen access — every tab keeps the roles its standalone route carried', () => {
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
      new Set(Object.values(ROLES_BEFORE_OBRS_702).flat())
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

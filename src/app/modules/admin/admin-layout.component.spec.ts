import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { NotificationInboxService } from '../../shared/services/notification-inbox.service';

// OBRS-317: the real bell pulls in NotificationInboxService (+ its own HTTP
// dependency chain) — stub the selector so these layout-chrome specs stay
// scoped to the layout itself, same approach as every other cross-cutting
// child mounted here.
@Component({ selector: 'app-notification-bell', template: '' })
class NotificationBellStubComponent {}

// localStorage shim — keeps spec storage isolated
function clearSidebarStorage(): void {
  try { localStorage.removeItem('obrs-sidebar-collapsed'); } catch { /* ignore */ }
}

import { AdminLayoutComponent } from './admin-layout.component';
import { LangSwitcherComponent } from '../../shared/components/lang-switcher/lang-switcher.component';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { ThemeService, ThemeMode } from '../../shared/services/theme.service';
import { LanguageService } from '../../shared/services/language.service';
import { createLanguageServiceStub } from '../../testing/test-stubs';
import { AdminApiService } from '../../services/admin/admin-api.service';
import { UsabilityReportBadgeRefreshService } from '../../shared/services/usability-report-badge-refresh.service';
import { BadgeSocketService } from '../../services/admin/badge-socket.service';

// OBRS-147: fake WebSocket badge push — a plain Subject the test drives
// directly, so specs don't need a real STOMP connection (mirrored per test
// group, same pattern as `createWithCountSource` for AdminApiService below).
// OBRS-378: the message now carries both counts (counts$, renamed from count$).
// OBRS-527: acceptedReportCount RENAMED to ownerAcceptedReportCount (wire
// rename, not add — see badge-socket.service.ts's LOCKED CONTRACT comment).
function createBadgeSocketServiceStub(): {
  counts$: Subject<{ newReportCount: number; ownerAcceptedReportCount: number }>;
  connect: jasmine.Spy;
  disconnect: jasmine.Spy;
} {
  return {
    counts$: new Subject<{ newReportCount: number; ownerAcceptedReportCount: number }>(),
    connect: jasmine.createSpy('connect'),
    disconnect: jasmine.createSpy('disconnect'),
  };
}

describe('AdminLayoutComponent', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;

  // OBRS-378: getRoles() drives badgeStatus (raw-role: owner -> 'new', admin
  // -> 'owner_accepted', OBRS-527). Defaults to 'owner' here so the
  // pre-existing badge specs below (written before the role-split existed)
  // keep exercising the 'new'-watching badge unchanged; the admin-specific
  // behavior is covered by its own describe block further down.
  const authStub = {
    getUsername: () => 'admin@obrs.test',
    logout: jasmine.createSpy('logout'),
    hasAnyRole: (_roles: string[]) => false,
    getRoles: () => ['owner'],
  };

  const themeMode$ = new BehaviorSubject<ThemeMode>('light');
  const themeServiceStub: Partial<ThemeService> = {
    getStoredMode: () => 'light',
    setMode: jasmine.createSpy('setMode'),
    toggle: jasmine.createSpy('toggle'),
    mode$: themeMode$.asObservable(),
  };

  let badgeSocketServiceStub: ReturnType<typeof createBadgeSocketServiceStub>;

  beforeEach(async () => {
    clearSidebarStorage();
    badgeSocketServiceStub = createBadgeSocketServiceStub();
    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent, LangSwitcherComponent, NotificationBellStubComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        {
          provide: AdminApiService,
          useValue: { getUsabilityReportCountByStatus: () => of(0) },
        },
        { provide: BadgeSocketService, useValue: badgeSocketServiceStub },
        {
          provide: NotificationInboxService,
          useValue: { startPolling: () => {}, stopPolling: jasmine.createSpy('stopPolling') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
  });

  afterEach(() => { clearSidebarStorage(); });

  // ── OBRS-147: WebSocket badge lifecycle ─────────────────────────────────────
  it('connects the badge socket on init', () => {
    expect(badgeSocketServiceStub.connect).toHaveBeenCalled();
  });

  it('disconnects the badge socket on destroy', () => {
    fixture.destroy();
    expect(badgeSocketServiceStub.disconnect).toHaveBeenCalled();
  });

  // ── OBRS-586: sidebar active-state ──────────────────────────────────────────
  it('matches the active nav link by exact PATH while ignoring query params / matrix params / fragment', () => {
    // The old `{ exact: true }` boolean expanded to `queryParams: 'exact'`, so
    // the highlight vanished the moment the URL carried a query string. `paths:
    // 'exact'` still prevents sibling top-level routes from cross-highlighting.
    expect(fixture.componentInstance['navLinkActiveMatch']).toEqual({
      paths: 'exact',
      queryParams: 'ignored',
      matrixParams: 'ignored',
      fragment: 'ignored',
    });
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the brand as a link back to the public home page', () => {
    // Regression for #15: the admin shell had no UI path to /home.
    const brandLink = fixture.debugElement.query(By.css('.admin-brand-link'));
    expect(brandLink).withContext('brand link should exist').toBeTruthy();
    expect(brandLink.nativeElement.getAttribute('href')).toBe('/');
  });

  it('renders the brand home link as the logo image', () => {
    // Regression for #17: the brand home link should use the logo, not text.
    const logo = fixture.debugElement.query(By.css('.admin-brand-link img.admin-brand-logo'));
    expect(logo).withContext('brand logo image should exist').toBeTruthy();
    expect(logo.nativeElement.getAttribute('src')).toBe('images/logo.svg');
  });

  it('renders the theme-admin variant class on the shell root', () => {
    const shell = fixture.debugElement.query(By.css('.admin-shell.theme-admin'));
    expect(shell).withContext('admin shell should carry theme-admin class').toBeTruthy();
  });

  it('renders the dark mode toggle button', () => {
    const toggleBtn = fixture.debugElement.query(By.css('button[aria-pressed]'));
    expect(toggleBtn).withContext('dark mode toggle button should exist').toBeTruthy();
  });

  // ── Always-reserved-column toggle behaviour ─────────────────────────────────

  it('sidebar starts EXPANDED by default (is-sidebar-pinned on shell, no localStorage entry)', () => {
    // Default for new users: expanded 280px reserved column.
    const shell = fixture.debugElement.query(By.css('.admin-shell'));
    expect(shell.nativeElement.classList.contains('is-sidebar-pinned'))
      .withContext('shell should carry is-sidebar-pinned by default (expanded is the default)')
      .toBeTrue();
  });

  it('aside never carries is-expanded class (overlay model removed)', () => {
    // The hover-overlay .is-expanded class must not appear in the always-reserved model.
    const aside = fixture.debugElement.query(By.css('.admin-sidebar'));
    expect(aside.nativeElement.classList.contains('is-expanded'))
      .withContext('is-expanded must not be bound in the always-reserved-column model')
      .toBeFalse();
  });

  it('shell loses is-sidebar-pinned after togglePin collapses the sidebar', () => {
    // Default is expanded → one togglePin call collapses.
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin();
    fixture.detectChanges();
    const shell = fixture.debugElement.query(By.css('.admin-shell'));
    expect(shell.nativeElement.classList.contains('is-sidebar-pinned'))
      .withContext('shell should lose is-sidebar-pinned when collapsed')
      .toBeFalse();
  });

  it('renders the toggle button inside .admin-sidebar-panel', () => {
    const pinBtn = fixture.debugElement.query(By.css('.admin-sidebar-panel .admin-sidebar-pin'));
    expect(pinBtn).withContext('toggle button should exist inside .admin-sidebar-panel').toBeTruthy();
  });

  it('the .admin-collapse-toggle button is absent (replaced by sidebar-pin toggle)', () => {
    const collapseBtn = fixture.debugElement.query(By.css('.admin-collapse-toggle'));
    expect(collapseBtn).withContext('old collapse toggle must not exist').toBeNull();
  });

  // OBRS-176: admin is now a cross-portal superset (see AuthService
  // ROLE_GRANTS), so the profile menu's Staff Area shortcut must render for
  // an admin identity, not just for owner/salesperson/driver.
  it('shows the Staff Area link in the profile menu for an admin identity', () => {
    const original = authStub.hasAnyRole;
    authStub.hasAnyRole = (_roles: string[]) => true; // admin now satisfies salesperson/driver
    try {
      const f = TestBed.createComponent(AdminLayoutComponent);
      f.detectChanges();

      const comp = f.componentInstance as AdminLayoutComponent & { toggleProfileMenu: () => void };
      comp.toggleProfileMenu();
      f.detectChanges();

      const staffAreaLink = f.debugElement.query(By.css('.admin-profile-menu a[href="/staff"]'));
      expect(staffAreaLink)
        .withContext('admin should see the Staff Area link in the profile menu')
        .toBeTruthy();
    } finally {
      authStub.hasAnyRole = original;
    }
  });

  it('togglePin collapses the sidebar and writes "1" to localStorage (default is expanded "0")', () => {
    // On init (no storage entry), readPinPreference canonicalises to "0" (expanded).
    // One togglePin flips to collapsed → writes "1".
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin(); // expand → collapse
    fixture.detectChanges();
    expect(localStorage.getItem('obrs-sidebar-collapsed'))
      .withContext('localStorage should be "1" when collapsed')
      .toBe('1');
  });

  it('togglePin restores expanded state and writes "0" to localStorage', () => {
    const comp = fixture.componentInstance as AdminLayoutComponent & { togglePin: () => void };
    comp.togglePin(); // collapse
    comp.togglePin(); // re-expand
    fixture.detectChanges();
    expect(localStorage.getItem('obrs-sidebar-collapsed'))
      .withContext('localStorage should be "0" when expanded')
      .toBe('0');
  });

  // OBRS-196: Settlements nav entry is gated to owner/admin (hasAnyRole(['owner'])
  // — ROLE_GRANTS['admin'] includes 'owner', so admin is admitted too). Asserted
  // against the component's navItems field (rendered via *ngFor) rather than a
  // resolved `href`, since RouterTestingModule doesn't resolve a relative
  // routerLink to a predictable href outside a real route context.
  it('hides the Settlements nav item when hasAnyRole(["owner"]) is false', () => {
    const comp = fixture.componentInstance as unknown as { navItems: Array<{ path: string }> };
    expect(comp.navItems.some((item) => item.path === 'settlements'))
      .withContext('settlements nav item should be hidden for a non-owner/admin identity')
      .toBeFalse();
  });

  it('shows the Settlements nav item for an owner/admin identity', () => {
    const original = authStub.hasAnyRole;
    authStub.hasAnyRole = (_roles: string[]) => true;
    try {
      const f = TestBed.createComponent(AdminLayoutComponent);
      f.detectChanges();

      const comp = f.componentInstance as unknown as { navItems: Array<{ path: string; labelKey: string }> };
      expect(comp.navItems.some((item) => item.path === 'settlements'))
        .withContext('settlements nav item should be present for owner/admin')
        .toBeTrue();
      expect(comp.navItems.find((item) => item.path === 'settlements')?.labelKey).toBe(
        'ADMIN.PAGES.SETTLEMENTS'
      );
    } finally {
      authStub.hasAnyRole = original;
    }
  });

  // ── OBRS-290: sidebar menu search ───────────────────────────────────────────
  type SearchComp = {
    navItems: Array<{ path: string; section: string }>;
    filteredNavItems: Array<{ path: string }>;
    filteredNavSections: Array<{ key: string; titleKey: string; items: Array<{ path: string }> }>;
    navSearchQuery: string;
    applyNavSearch(q: string): void;
    clearNavSearch(): void;
  };

  function seedNavTranslations(): void {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ADMIN: {
        PAGES: {
          DASHBOARD: 'Dashboard',
          PROMOTIONS: 'Promotions',
          LOOKUP_SETTINGS: 'Lookups',
        },
        // description (subtitle) source the search also matches on
        LOOKUP: { SUBTITLE: 'Manage reference data such as provinces and statuses' },
        DASHBOARD_SUB: {},
      },
    });
    translate.use('en');
  }

  it('filters nav items by translated menu label', () => {
    seedNavTranslations();
    const comp = fixture.componentInstance as unknown as SearchComp;
    comp.applyNavSearch('promotion');
    expect(comp.filteredNavItems.length).toBe(1);
    expect(comp.filteredNavItems[0].path).toBe('promotions');
  });

  it('matches on the menu DESCRIPTION, not just the label (OBRS-290 core case)', () => {
    seedNavTranslations();
    const comp = fixture.componentInstance as unknown as SearchComp;
    // "provinces" appears only in the Lookups DESCRIPTION, never in any label
    comp.applyNavSearch('provinces');
    expect(comp.filteredNavItems.some((i) => i.path === 'lookups'))
      .withContext('a menu should be findable by what its description says it does')
      .toBeTrue();
    expect(comp.filteredNavItems.every((i) => i.path === 'lookups')).toBeTrue();
  });

  it('restores the full list when the query is cleared', () => {
    const comp = fixture.componentInstance as unknown as SearchComp;
    const full = comp.navItems.length;
    comp.applyNavSearch('dashboard');
    expect(comp.filteredNavItems.length).toBeLessThan(full);
    comp.clearNavSearch();
    expect(comp.filteredNavItems.length).toBe(full);
    expect(comp.navSearchQuery).toBe('');
  });

  it('yields an empty filtered list (and no-results hint) when nothing matches', () => {
    const comp = fixture.componentInstance as unknown as SearchComp;
    comp.applyNavSearch('zzz-no-such-menu-zzz');
    fixture.detectChanges();
    expect(comp.filteredNavItems.length).toBe(0);
    expect(fixture.debugElement.query(By.css('.admin-nav-empty')))
      .withContext('a no-results hint should render for a non-matching query')
      .toBeTruthy();
  });

  it('renders only the matching nav links in the DOM after a search', () => {
    seedNavTranslations();
    const comp = fixture.componentInstance as unknown as SearchComp;
    comp.applyNavSearch('promotion');
    fixture.detectChanges();
    const links = fixture.debugElement.queryAll(By.css('.admin-nav-link:not(.admin-nav-btn)'));
    expect(links.length).toBe(1);
  });

  it('clears the search (restores the full list) when a nav result is clicked', () => {
    seedNavTranslations();
    const comp = fixture.componentInstance as unknown as SearchComp;
    const full = comp.navItems.length;
    comp.applyNavSearch('promotion');
    fixture.detectChanges();
    const link = fixture.debugElement.query(By.css('.admin-nav-link:not(.admin-nav-btn)'));
    link.triggerEventHandler('click', null); // fires onNavLinkClick() + clearNavSearch()
    expect(comp.navSearchQuery).toBe('');
    expect(comp.filteredNavItems.length).toBe(full);
  });

  // ── OBRS-289: nav grouping into sections ────────────────────────────────────
  it('groups nav items into ordered sections and renders a header per section', () => {
    const comp = fixture.componentInstance as unknown as SearchComp;
    // sections appear in SECTION_ORDER and each carries only its own items
    const keys = comp.filteredNavSections.map((s) => s.key);
    expect(keys).toEqual(['overview', 'master', 'operations', 'reports']); // no 'system' for non-admin stub
    expect(comp.filteredNavSections.every((s) => s.items.every((i) => i.path)))
      .toBeTrue();
    // every rendered item belongs to its section's key
    const master = comp.filteredNavSections.find((s) => s.key === 'master');
    expect(master?.items.some((i) => i.path === 'users')).toBeTrue();

    fixture.detectChanges();
    const headers = fixture.debugElement.queryAll(By.css('.admin-nav-section-title'));
    expect(headers.length).toBe(comp.filteredNavSections.length);
  });

  it('drops a section whose items are all filtered out by the search', () => {
    seedNavTranslations();
    const comp = fixture.componentInstance as unknown as SearchComp;
    comp.applyNavSearch('promotion'); // only 'promotions' (operations section) matches
    expect(comp.filteredNavSections.map((s) => s.key)).toEqual(['operations']);
    expect(comp.filteredNavSections[0].items.length).toBe(1);
  });
});

// ── Usability Reports nav badge ───────────────────────────────────────────────
// Separate top-level describe (not nested) so its own beforeEach — which needs
// to run entirely inside fakeAsync to deterministically flush the component's
// timer(0, 60_000) initial fetch — does not also inherit/duplicate the outer
// describe's non-fakeAsync beforeEach above.
describe('AdminLayoutComponent — usability report badge', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;
  let badgeSocketServiceStub: ReturnType<typeof createBadgeSocketServiceStub>;

  // OBRS-378: getRoles() drives badgeStatus. Defaults to 'owner' (badgeStatus
  // = 'new') so every pre-existing test below (written before the role-split
  // existed) keeps exercising the same badge behavior; the admin variant
  // (badgeStatus = 'owner_accepted', OBRS-527) is covered by its own describe
  // block below, which reassigns getRoles before creating the component (same
  // mutation pattern as the outer describe's hasAnyRole override).
  const authStub = {
    getUsername: () => 'admin@obrs.test',
    logout: jasmine.createSpy('logout'),
    hasAnyRole: (_roles: string[]) => false,
    getRoles: () => ['owner'],
  };

  const themeMode$ = new BehaviorSubject<ThemeMode>('light');
  const themeServiceStub: Partial<ThemeService> = {
    getStoredMode: () => 'light',
    setMode: jasmine.createSpy('setMode'),
    toggle: jasmine.createSpy('toggle'),
    mode$: themeMode$.asObservable(),
  };

  beforeEach(async () => {
    clearSidebarStorage();
    badgeSocketServiceStub = createBadgeSocketServiceStub();
    authStub.getRoles = () => ['owner'];
    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent, LangSwitcherComponent, NotificationBellStubComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        // Placeholder — each test overrides this with its own count source
        // via TestBed.overrideProvider before creating the component, so the
        // resulting timer(0, ...) subscription is registered inside that
        // test's own fakeAsync zone and can be flushed deterministically.
        { provide: AdminApiService, useValue: { getUsabilityReportCountByStatus: () => of(0) } },
        { provide: BadgeSocketService, useValue: badgeSocketServiceStub },
        {
          provide: NotificationInboxService,
          useValue: { startPolling: () => {}, stopPolling: jasmine.createSpy('stopPolling') },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => { clearSidebarStorage(); });

  function createWithCountSource(
    source: () => Observable<number>
  ): ComponentFixture<AdminLayoutComponent> {
    TestBed.overrideProvider(AdminApiService, {
      useValue: {
        getUsabilityReportCountByStatus: jasmine
          .createSpy('getUsabilityReportCountByStatus')
          .and.callFake(source),
      },
    });
    const f = TestBed.createComponent(AdminLayoutComponent);
    f.detectChanges();
    return f;
  }

  // OBRS-527 regression: badgeStatus must be driven by the RAW getRoles()
  // check, never hasAnyRole — an owner satisfies hasAnyRole(['admin']) too
  // under this FE's ROLE_GRANTS superset semantics (see AuthService), which
  // would wrongly flip a pure owner's badge (and its whole 'owner_accepted'
  // queue) to the admin variant. getRoles() returning ['owner'] must give
  // 'new' regardless of what hasAnyRole(['admin']) answers.
  it('fetches status="new" for getRoles()=["owner"] even when hasAnyRole(["admin"]) is true (no hasAnyRole superset)', fakeAsync(() => {
    const originalHasAnyRole = authStub.hasAnyRole;
    authStub.hasAnyRole = (_roles: string[]) => true; // simulate the ROLE_GRANTS superset an owner satisfies
    try {
      const countSpy = jasmine.createSpy('getUsabilityReportCountByStatus').and.returnValue(of(2));
      TestBed.overrideProvider(AdminApiService, {
        useValue: { getUsabilityReportCountByStatus: countSpy },
      });
      fixture = TestBed.createComponent(AdminLayoutComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
      discardPeriodicTasks();

      expect(countSpy).toHaveBeenCalledWith('new');
    } finally {
      authStub.hasAnyRole = originalHasAnyRole;
    }
  }));

  it('hides the badge when the fetched count is 0', fakeAsync(() => {
    fixture = createWithCountSource(() => of(0));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge).withContext('badge should not render when count is 0').toBeNull();
  }));

  it('shows the badge with the fetched numeric count when > 0', fakeAsync(() => {
    fixture = createWithCountSource(() => of(5));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge).withContext('badge should render when count > 0').toBeTruthy();
    expect(badge.nativeElement.textContent.trim()).toBe('5');
  }));

  it('applies an optimistic countAdjustments delta immediately (no refetch) and clamps at 0', fakeAsync(() => {
    fixture = createWithCountSource(() => of(3));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();
    const badgeService = TestBed.inject(UsabilityReportBadgeRefreshService);

    badgeService.adjustBy('new', -1); // auto-promote on open: instant -1
    fixture.detectChanges();
    let badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim())
      .withContext('optimistic delta must apply without a GET round-trip')
      .toBe('2');

    badgeService.adjustBy('new', -5); // never goes negative
    fixture.detectChanges();
    badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge).withContext('count clamps at 0 → badge hidden').toBeNull();
  }));

  // ── OBRS-378: delta-gating — a badge must ignore an adjustBy for a status
  // it isn't displaying (the fix for a real bug: an admin's badge showing
  // 'owner_accepted' (OBRS-527) must not react to a 'new'-tab adjustBy
  // elsewhere on the page).
  it('ignores a countAdjustments delta tagged for a different status than badgeStatus', fakeAsync(() => {
    fixture = createWithCountSource(() => of(3));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();
    const badgeService = TestBed.inject(UsabilityReportBadgeRefreshService);

    // This layout's badgeStatus is 'new' (owner stub) — an 'owner_accepted'
    // delta must be ignored.
    badgeService.adjustBy('owner_accepted', -1);
    fixture.detectChanges();
    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim())
      .withContext('a delta for a non-displayed status must not move this badge')
      .toBe('3');
  }));

  it('caps the displayed badge text at "99+" when the count exceeds 99', fakeAsync(() => {
    fixture = createWithCountSource(() => of(150));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('99+');
  }));

  it('keeps the last known count (does not throw / reset to 0) when a later poll fails', fakeAsync(() => {
    let callCount = 0;
    fixture = createWithCountSource(() => {
      callCount++;
      return callCount === 1 ? of(3) : throwError(() => new Error('network error'));
    });

    tick(); // initial fetch (dueTime 0) succeeds -> count = 3
    fixture.detectChanges();
    let badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('3');

    expect(() => {
      tick(60_000); // next periodic tick fails; must be swallowed, not thrown
    }).not.toThrow();
    fixture.detectChanges();
    discardPeriodicTasks();

    badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge).withContext('previous count should be retained after a failed poll').toBeTruthy();
    expect(badge.nativeElement.textContent.trim())
      .withContext('failed poll must not reset the badge to 0')
      .toBe('3');
  }));

  // ── OBRS-147: real-time WebSocket push (additive 4th signal) ────────────────

  it('updates badgeCount from newReportCount when badgeSocketService.counts$ emits (real-time push, badgeStatus="new")', fakeAsync(() => {
    fixture = createWithCountSource(() => of(0));
    tick();
    fixture.detectChanges();

    badgeSocketServiceStub.counts$.next({ newReportCount: 7, ownerAcceptedReportCount: 40 });
    fixture.detectChanges();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge)
      .withContext('a pushed WS frame should update the badge without waiting for a poll tick')
      .toBeTruthy();
    expect(badge.nativeElement.textContent.trim())
      .withContext('an owner (badgeStatus="new") reads newReportCount from the message, not ownerAcceptedReportCount')
      .toBe('7');

    discardPeriodicTasks();
  }));

  it('the 60s poll / NavigationEnd / refreshRequested$ fallback still updates the badge when the socket stays silent', fakeAsync(() => {
    // No badgeSocketServiceStub.count$.next(...) call anywhere in this test —
    // the socket is silent for its entire duration; the poll must still work
    // on its own, proving the WS push is additive, not a replacement.
    fixture = createWithCountSource(() => of(4));
    tick();
    fixture.detectChanges();

    let badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim())
      .withContext('initial poll tick should populate the badge with the socket silent')
      .toBe('4');

    discardPeriodicTasks();
  }));

  it('countAdjustments$ optimistic adjustBy still applies with the socket wired in', fakeAsync(() => {
    fixture = createWithCountSource(() => of(3));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();
    const badgeRefreshService = TestBed.inject(UsabilityReportBadgeRefreshService);

    badgeRefreshService.adjustBy('new', -1);
    fixture.detectChanges();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim())
      .withContext('optimistic adjustBy must still apply now that the WS signal is also wired in')
      .toBe('2');
  }));
});

// ── OBRS-378/OBRS-527: admin badgeStatus = 'owner_accepted' ────────────────────
// Separate top-level describe (same fakeAsync-friendly beforeEach shape as the
// 'owner' badge describe above) covering the admin variant of the role-split:
// the raw-role admin identity watches 'owner_accepted' (owner-vetted, awaiting
// platform adoption), not 'new'. Renamed from 'accepted' by OBRS-527 — the
// admin badge no longer watches 'accepted' at all (nobody's badge now).
describe('AdminLayoutComponent — usability report badge (admin badgeStatus)', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;
  let badgeSocketServiceStub: ReturnType<typeof createBadgeSocketServiceStub>;

  const authStub = {
    getUsername: () => 'admin@obrs.test',
    logout: jasmine.createSpy('logout'),
    hasAnyRole: (_roles: string[]) => true,
    getRoles: () => ['admin'],
  };

  const themeMode$ = new BehaviorSubject<ThemeMode>('light');
  const themeServiceStub: Partial<ThemeService> = {
    getStoredMode: () => 'light',
    setMode: jasmine.createSpy('setMode'),
    toggle: jasmine.createSpy('toggle'),
    mode$: themeMode$.asObservable(),
  };

  beforeEach(async () => {
    clearSidebarStorage();
    badgeSocketServiceStub = createBadgeSocketServiceStub();
    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent, LangSwitcherComponent, NotificationBellStubComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNGConfig, useValue: { setTranslation: () => {} } },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        { provide: AdminApiService, useValue: { getUsabilityReportCountByStatus: () => of(0) } },
        { provide: BadgeSocketService, useValue: badgeSocketServiceStub },
        {
          provide: NotificationInboxService,
          useValue: { startPolling: () => {}, stopPolling: jasmine.createSpy('stopPolling') },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => { clearSidebarStorage(); });

  function createWithCountSource(
    source: () => Observable<number>
  ): ComponentFixture<AdminLayoutComponent> {
    TestBed.overrideProvider(AdminApiService, {
      useValue: {
        getUsabilityReportCountByStatus: jasmine
          .createSpy('getUsabilityReportCountByStatus')
          .and.callFake(source),
      },
    });
    const f = TestBed.createComponent(AdminLayoutComponent);
    f.detectChanges();
    return f;
  }

  it('fetches the count with status="owner_accepted" (not "new"/"accepted") for an admin identity', fakeAsync(() => {
    const countSpy = jasmine.createSpy('getUsabilityReportCountByStatus').and.returnValue(of(9));
    TestBed.overrideProvider(AdminApiService, {
      useValue: { getUsabilityReportCountByStatus: countSpy },
    });
    fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    expect(countSpy).toHaveBeenCalledWith('owner_accepted');
    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('9');
  }));

  it('reads ownerAcceptedReportCount (not newReportCount) from a socket push', fakeAsync(() => {
    fixture = createWithCountSource(() => of(0));
    tick();
    fixture.detectChanges();

    badgeSocketServiceStub.counts$.next({ newReportCount: 40, ownerAcceptedReportCount: 6 });
    fixture.detectChanges();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim())
      .withContext('admin (badgeStatus="owner_accepted") must read ownerAcceptedReportCount, not newReportCount')
      .toBe('6');

    discardPeriodicTasks();
  }));

  // OBRS-527: a version-skewed backend (dev not yet redeployed) could still
  // emit the pre-rename shape with no ownerAcceptedReportCount key at all —
  // `?? 0` must render a real 0, not NaN/undefined, from that emission.
  it('reads badgeCount as 0 (not NaN) from a socket push missing ownerAcceptedReportCount', fakeAsync(() => {
    fixture = createWithCountSource(() => of(3));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    badgeSocketServiceStub.counts$.next({ newReportCount: 40 } as unknown as {
      newReportCount: number;
      ownerAcceptedReportCount: number;
    });
    fixture.detectChanges();

    const comp = fixture.componentInstance as unknown as { badgeCount: number };
    expect(comp.badgeCount).withContext('missing key must fall back to 0, never NaN/undefined').toBe(0);
    expect(Number.isNaN(comp.badgeCount)).toBeFalse();
  }));

  it('applies an adjustBy("owner_accepted", …) delta but ignores an adjustBy("new", …) delta', fakeAsync(() => {
    fixture = createWithCountSource(() => of(5));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();
    const badgeService = TestBed.inject(UsabilityReportBadgeRefreshService);

    // A 'new'-tab adjustment must not move the admin's 'owner_accepted' badge
    // — this is the exact regression the delta-gating fix targets.
    badgeService.adjustBy('new', -1);
    fixture.detectChanges();
    let badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim())
      .withContext('an adjustBy for "new" must not move an admin badge showing "owner_accepted"')
      .toBe('5');

    badgeService.adjustBy('owner_accepted', -2);
    fixture.detectChanges();
    badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.textContent.trim())
      .withContext('an adjustBy matching badgeStatus must still apply')
      .toBe('3');
  }));

  it('shows the accepted-badge aria-label (ACCEPTED_BADGE_ARIA) rather than the new-badge one', fakeAsync(() => {
    fixture = createWithCountSource(() => of(4));
    tick();
    fixture.detectChanges();
    discardPeriodicTasks();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ADMIN: {
        USABILITY_REPORTS: {
          ACCEPTED_BADGE_ARIA: '{{count}} usability reports awaiting action',
          NEW_BADGE_ARIA: '{{count}} new usability reports',
        },
      },
    });
    translate.use('en');
    fixture.detectChanges();

    const badge = fixture.debugElement.query(By.css('.admin-nav-badge'));
    expect(badge.nativeElement.getAttribute('aria-label'))
      .withContext('admin badgeStatus="owner_accepted" must use ACCEPTED_BADGE_ARIA, not NEW_BADGE_ARIA')
      .toBe('4 usability reports awaiting action');
  }));
});

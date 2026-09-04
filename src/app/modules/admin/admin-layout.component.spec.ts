import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { NotificationInboxService } from '../../shared/services/notification-inbox.service';

// OBRS-317: the real bell pulls in NotificationInboxService (+ its own HTTP
// dependency chain) — stub the selector so these layout-chrome specs stay
// scoped to the layout itself, same approach as every other cross-cutting
// child mounted here.
@Component({
    selector: 'app-notification-bell', template: '',
    standalone: false
})
class NotificationBellStubComponent {}

// localStorage shim — keeps spec storage isolated
function clearSidebarStorage(): void {
  try { localStorage.removeItem('obrs-sidebar-collapsed'); } catch { /* ignore */ }
}

import { HttpClientTestingModule } from '@angular/common/http/testing';
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
import { SYSTEM_SETTINGS_TABS } from './pages/system-settings/system-settings-tabs';
import { environment } from '../../../environments/environment';

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
    // OBRS-1498: gates the lookups/roles nav entries. A blunt fixture switch
    // like hasAnyRole above, NOT a model of getRoles() below: the search and
    // section specs here were written against a sidebar that HAS those two
    // entries and match on 'lookups' by name. The gate itself is measured by
    // flipping this, in the OBRS-1498 specs further down.
    hasHeldRole: (_roles: string[]) => true,
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
        { provide: PrimeNG, useValue: { setTranslation: () => {} } },
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
  it('matches the active nav link by PATH (honouring matchSubtree) while ignoring query params / matrix params / fragment', () => {
    // The old `{ exact: !item.matchSubtree }` boolean expanded to
    // `queryParams: 'exact'`, so the highlight vanished the moment the URL carried
    // a query string. This keeps the per-item subtree/exact PATH choice but ignores
    // query/matrix/fragment.
    const leaf = fixture.componentInstance['navLinkActiveMatch']({ matchSubtree: false } as never);
    expect(leaf).toEqual({ paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' });

    const parent = fixture.componentInstance['navLinkActiveMatch']({ matchSubtree: true } as never);
    expect(parent).toEqual({ paths: 'subset', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' });
  });

  // ── OBRS-939: identity, not shape ───────────────────────────────────────────
  // The test above passes just as happily against the version that built a fresh
  // object per call — `toEqual` compares structure, and structure was never
  // wrong. What was wrong is that RouterLinkActive reads this as an @Input and
  // compares it by IDENTITY: a new object every change-detection cycle made its
  // ngOnChanges fire every cycle, its update() schedule a microtask every cycle,
  // and zone.js re-run ApplicationRef.tick() forever — the admin shell stopped
  // answering clicks and page.evaluate entirely, a few seconds after every load.
  //
  // This is a unit-level tripwire, not the proof: a single detectChanges() call
  // can never reach a loop that needs a real zone driving ticks, which is why no
  // Karma case caught the original defect and why the real gate is
  // e2e/tests/obrs-939-admin-shell-responsive.spec.ts. Keep both — this one
  // fails in milliseconds and names the cause.
  it('returns the SAME routerLinkActiveOptions instance across calls (OBRS-939)', () => {
    const match = fixture.componentInstance['navLinkActiveMatch'] as (item: never) => unknown;
    const leafA = match.call(fixture.componentInstance, { matchSubtree: false } as never);
    const leafB = match.call(fixture.componentInstance, { matchSubtree: false } as never);
    const parentA = match.call(fixture.componentInstance, { matchSubtree: true } as never);
    const parentB = match.call(fixture.componentInstance, { matchSubtree: true } as never);

    expect(leafA)
      .withContext('a fresh object per call re-triggers RouterLinkActive.ngOnChanges every cycle')
      .toBe(leafB as never);
    expect(parentA).toBe(parentB as never);
    // The two shapes must still be different objects, or matchSubtree would be dead.
    expect(leafA).not.toBe(parentA as never);
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

  // OBRS-1498 AC-3 — the nav half of hiding /admin/lookups and /admin/roles
  // from an owner. Both directions, because a gate that hides the entry from
  // everyone is as wrong as one that hides it from nobody: the route guard
  // bounces an owner (admin-only-pages-route-guard.spec.ts) and an entry that
  // outlived the guard would be a link straight into that bounce.
  it('shows the lookups and roles nav items for a held admin', () => {
    const comp = fixture.componentInstance as unknown as { navItems: Array<{ path: string }> };
    const paths = comp.navItems.map((item) => item.path);
    expect(paths).toContain('lookups');
    expect(paths).toContain('roles');
  });

  it('hides the lookups and roles nav items when hasHeldRole(["admin"]) is false', () => {
    const original = authStub.hasHeldRole;
    authStub.hasHeldRole = (_roles: string[]) => false;
    try {
      const f = TestBed.createComponent(AdminLayoutComponent);
      f.detectChanges();

      const comp = f.componentInstance as unknown as { navItems: Array<{ path: string }> };
      const paths = comp.navItems.map((item) => item.path);
      expect(paths)
        .withContext('every write on /admin/lookups is hasRole(ADMIN) — an owner would only find 403s')
        .not.toContain('lookups');
      expect(paths).not.toContain('roles');
      // Not vacuous: the rest of the master section is untouched.
      expect(paths).toContain('users');
      expect(paths).toContain('routes');
    } finally {
      authStub.hasHeldRole = original;
    }
  });

  // ── OBRS-290: sidebar menu search ───────────────────────────────────────────
  type HighlightSegment = { text: string; match: boolean };
  type SearchComp = {
    navItems: Array<{
      path: string;
      section: string;
      labelKey: string;
      descriptionKey?: string;
      labelSegments?: HighlightSegment[];
      descriptionSegments?: HighlightSegment[];
    }>;
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
        // description (subtitle) sources the search also matches on
        LOOKUP: { SUBTITLE: 'Manage reference data such as provinces and statuses' },
        // OBRS-900: seeded explicitly (rather than left to ngx-translate's
        // missing-key fallback of returning the raw key string) — the raw key
        // 'ADMIN.PROMOTIONS.SUBTITLE' itself starts with "Promo" (from
        // "PROMOTIONS"), which would spuriously "match" a query of "Promo"
        // against the DESCRIPTION and defeat the label-only-match test below.
        PROMOTIONS: { SUBTITLE: 'Manage discount codes and marketing campaigns' },
        DASHBOARD_SUB: {},
      },
    });
    translate.use('en');
  }

  // OBRS-794: how many nav entries the sidebar actually RENDERS. The template
  // iterates filteredNavSections, never filteredNavItems, so this — not
  // filteredNavItems.length — is the number a user can see.
  function countSectionItems(comp: SearchComp): number {
    return comp.filteredNavSections.reduce((sum, section) => sum + section.items.length, 0);
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

  // OBRS-794: assert the restore on filteredNavSections — the field the
  // template renders. The original version of this test checked only
  // filteredNavItems, which the template never reads, so it stayed green for
  // the whole life of the bug: applyNavSearch('') set filteredNavItems and
  // returned BEFORE rebuilding the sections, leaving the sidebar frozen on the
  // last non-empty query's result.
  it('restores the full RENDERED tree when the query is cleared', () => {
    const comp = fixture.componentInstance as unknown as SearchComp;
    const fullSectionKeys = comp.filteredNavSections.map((s) => s.key);
    const fullItemCount = countSectionItems(comp);

    comp.applyNavSearch('dashboard');
    expect(countSectionItems(comp))
      .withContext('the search must actually narrow the rendered tree first')
      .toBeLessThan(fullItemCount);

    comp.clearNavSearch();
    expect(comp.navSearchQuery).toBe('');
    expect(comp.filteredNavItems.length).toBe(comp.navItems.length);
    expect(comp.filteredNavSections.map((s) => s.key))
      .withContext('every section header must come back, not just the matched one')
      .toEqual(fullSectionKeys);
    expect(countSectionItems(comp)).toBe(fullItemCount);
  });

  // OBRS-794: the reported repro — type, then delete character by character,
  // never touching the clear button. The last non-empty query is a single
  // character, and that is the state the sidebar used to freeze on.
  it('restores the full RENDERED tree when the query is deleted one character at a time', () => {
    seedNavTranslations();
    const comp = fixture.componentInstance as unknown as SearchComp;
    const fullSectionKeys = comp.filteredNavSections.map((s) => s.key);
    const fullItemCount = countSectionItems(comp);

    for (const q of ['prom', 'pro', 'pr', 'p', '']) {
      comp.applyNavSearch(q);
    }
    fixture.detectChanges();

    expect(comp.filteredNavSections.map((s) => s.key)).toEqual(fullSectionKeys);
    // and the DOM agrees — assert what is rendered, not just the model
    expect(fixture.debugElement.queryAll(By.css('.admin-nav-link:not(.admin-nav-btn)')).length)
      .toBe(fullItemCount);
    expect(fixture.debugElement.queryAll(By.css('.admin-nav-section-title')).length)
      .toBe(fullSectionKeys.length);
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

  // OBRS-794: same rendered-not-modelled rule as the clear case above — before
  // the fix the sidebar stayed frozen on the search result after navigating to
  // it, for the rest of the session.
  it('clears the search (restores the full RENDERED tree) when a nav result is clicked', () => {
    seedNavTranslations();
    const comp = fixture.componentInstance as unknown as SearchComp;
    const fullSectionKeys = comp.filteredNavSections.map((s) => s.key);
    const fullItemCount = countSectionItems(comp);
    comp.applyNavSearch('promotion');
    fixture.detectChanges();
    const link = fixture.debugElement.query(By.css('.admin-nav-link:not(.admin-nav-btn)'));
    // OBRS-917: a real MouseEvent, not `null`. triggerEventHandler runs EVERY
    // click listener on the element, and one of them is routerLink's. Angular 20
    // dereferences the event inside that listener, so `null` now throws
    // "Cannot read properties of null (reading 'button')" from
    // router_module.mjs before this component's own handler is reached. Passing
    // null was always a fiction about what a click is; v19 simply did not charge
    // for it. Project-wide census: this was the only `triggerEventHandler(..., null)`.
    link.triggerEventHandler('click', new MouseEvent('click')); // fires onNavLinkClick() + clearNavSearch()
    fixture.detectChanges();
    expect(comp.navSearchQuery).toBe('');
    expect(comp.filteredNavSections.map((s) => s.key)).toEqual(fullSectionKeys);
    expect(fixture.debugElement.queryAll(By.css('.admin-nav-link:not(.admin-nav-btn)')).length)
      .toBe(fullItemCount);
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

  // ── OBRS-900: matched-description line + highlighted query substring ───────
  describe('OBRS-900: search-result description + highlight', () => {
    function itemFor(comp: SearchComp, path: string) {
      const item = comp.navItems.find((i) => i.path === path);
      if (!item) throw new Error(`fixture bug: no nav item with path "${path}"`);
      return item;
    }

    it('highlights the matching substring in the LABEL when the query matches only the label', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      comp.applyNavSearch('Promo');
      const promotions = itemFor(comp, 'promotions');

      expect(promotions.labelSegments).toEqual([
        { text: 'Promo', match: true },
        { text: 'tions', match: false },
      ]);
      // Its description never contains "Promo" — no highlighted segment there.
      expect(promotions.descriptionSegments?.some((s) => s.match)).toBeFalsy();
    });

    it('shows the matched DESCRIPTION (with its own highlight) when the query matches only the description (OBRS-900 core case)', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      // "provinces" appears only inside Lookups' description (seedNavTranslations above).
      comp.applyNavSearch('provinces');
      fixture.detectChanges();

      const lookups = itemFor(comp, 'lookups');
      expect(lookups.descriptionSegments)
        .withContext('the description must be split so the match can be highlighted')
        .toEqual([
          { text: 'Manage reference data such as ', match: false },
          { text: 'provinces', match: true },
          { text: ' and statuses', match: false },
        ]);
      // Its own label ("Lookups") never contains "provinces" — no highlight there.
      expect(lookups.labelSegments?.some((s) => s.match)).toBeFalsy();

      // And it actually rendered — this is the exact regression from the card:
      // a correct match with the evidence of why nowhere visible.
      const descriptionEl = fixture.debugElement.query(By.css('.admin-nav-link-description'));
      expect(descriptionEl).withContext('the matched item must render its description line').toBeTruthy();
      expect(descriptionEl.nativeElement.textContent).toContain('provinces');
      const highlighted = descriptionEl.query(By.css('.admin-nav-search-highlight'));
      expect(highlighted.nativeElement.textContent.trim()).toBe('provinces');
    });

    // ── OBRS-900 follow-up: a live-app check found the description rendering
    // as one unbroken `nowrap` line that ran off the sidebar, taking the
    // highlighted match with it — off-screen, not just off-colour. The specs
    // above asserted `textContent`/existence, which the DOM satisfied even
    // while the match was physically invisible; that is exactly the "coverage
    // ≠ rendered" trap CORE.md warns about. These two pin the GEOMETRY.
    it('the description does not inherit `.admin-nav-link`\'s nowrap — must WRAP, not run off (OBRS-900 follow-up)', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      comp.applyNavSearch('provinces');
      fixture.detectChanges();

      const descriptionEl = fixture.debugElement.query(By.css('.admin-nav-link-description'))
        .nativeElement as HTMLElement;
      const cs = getComputedStyle(descriptionEl);
      // `.admin-nav-link` sets `white-space: nowrap` on ITSELF (min-width:1101px
      // block, so the label can animate to width:0 on the collapsed rail) —
      // that value INHERITS to every descendant, including this new
      // description line, unless the descendant sets its own. This is a
      // property assertion (not layout-dependent), so it holds regardless of
      // Karma's own browser viewport width.
      expect(cs.whiteSpace)
        .withContext(
          '.admin-nav-link-description must set its OWN white-space (normal), overriding what it ' +
            'would otherwise inherit from .admin-nav-link\'s nowrap — that inheritance is the exact ' +
            'mechanism that ran the description (and the highlighted match inside it) off the sidebar'
        )
        .not.toBe('nowrap');
      expect(cs.overflowWrap === 'anywhere' || cs.overflowWrap === 'break-word' || cs.wordBreak === 'break-word')
        .withContext(
          'a long unbroken run (Thai/CJK text often carries no space to break on) must still be ' +
            'forced to wrap onto a new line rather than widening the box'
        )
        .toBeTrue();
    });

    it('the highlighted match renders INSIDE the nav link — measures containment, not just presence (OBRS-900 follow-up)', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      comp.applyNavSearch('provinces');
      fixture.detectChanges();

      const linkEl = fixture.debugElement.query(By.css('.admin-nav-link:not(.admin-nav-btn)'))
        .nativeElement as HTMLElement;
      // getBoundingClientRect()/scrollWidth are meaningless on a detached
      // fixture — attach the REAL rendered tree to the document (same
      // requirement as the mountInChain helper in testing/contrast.ts) so the
      // browser actually lays it out, then constrain to the real pinned
      // sidebar link's width (admin-theme.scss) so this assertion doesn't
      // depend on Karma's own window happening to clear the
      // min-width:1101px breakpoint that normally sets it.
      document.body.appendChild(fixture.nativeElement);
      const originalWidth = linkEl.style.width;
      linkEl.style.width = '247px';
      // Karma has no network access to the Material Symbols webfont, so the
      // icon glyph falls back to rendering its ligature TEXT ("route") in a
      // system font — much wider than the real ~20px icon — which starves
      // .admin-nav-link-text of its production-realistic share of the row
      // and makes this a font-loading artifact, not a layout assertion. Pin
      // the icon to its real rendered size so the flex distribution matches
      // production regardless of whether the icon font loaded.
      const iconEl = linkEl.querySelector('.material-symbols-outlined') as HTMLElement | null;
      const originalIconWidth = iconEl?.style.width ?? '';
      const originalIconFlex = iconEl?.style.flex ?? '';
      if (iconEl) {
        iconEl.style.flex = '0 0 auto';
        iconEl.style.width = '20px';
      }
      try {
        fixture.detectChanges();
        const descriptionEl = linkEl.querySelector('.admin-nav-link-description') as HTMLElement;
        expect(descriptionEl).withContext('the matched item must render a description line').toBeTruthy();
        expect(descriptionEl.scrollWidth)
          .withContext(
            `description must WRAP inside its own box, not overflow it ` +
              `(scrollWidth=${descriptionEl.scrollWidth} clientWidth=${descriptionEl.clientWidth})`
          )
          .toBeLessThanOrEqual(descriptionEl.clientWidth + 1);

        const highlightEl = descriptionEl.querySelector('.admin-nav-search-highlight') as HTMLElement;
        expect(highlightEl).withContext('the match must be highlighted').toBeTruthy();
        const linkRect = linkEl.getBoundingClientRect();
        const highlightRect = highlightEl.getBoundingClientRect();
        expect(highlightRect.left >= linkRect.left - 1)
          .withContext(`highlight must not start before the nav link (link.left=${linkRect.left}, highlight.left=${highlightRect.left})`)
          .toBeTrue();
        expect(highlightRect.right <= linkRect.right + 1)
          .withContext(`highlight must not run past the nav link's right edge (link.right=${linkRect.right}, highlight.right=${highlightRect.right})`)
          .toBeTrue();
      } finally {
        linkEl.style.width = originalWidth;
        if (iconEl) {
          iconEl.style.width = originalIconWidth;
          iconEl.style.flex = originalIconFlex;
        }
        fixture.nativeElement.remove();
      }
    });

    it('is case-insensitive: a differently-cased query still highlights the substring in its ORIGINAL casing', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      comp.applyNavSearch('PROMO');
      const promotions = itemFor(comp, 'promotions');

      expect(comp.filteredNavItems.some((i) => i.path === 'promotions'))
        .withContext('the filter itself must stay case-insensitive')
        .toBeTrue();
      expect(promotions.labelSegments).toEqual([
        { text: 'Promo', match: true }, // original casing preserved, not "PROMO"
        { text: 'tions', match: false },
      ]);
    });

    it('produces no highlighted segment for an item the query does not match at all', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      comp.applyNavSearch('zzz-no-such-menu-zzz');
      const dashboard = itemFor(comp, 'dashboard');

      // Segments are still computed (every item, not just matches — see
      // applyNavSearch), but none of them are highlighted.
      expect(dashboard.labelSegments).toEqual([{ text: 'Dashboard', match: false }]);
    });

    it('an empty query produces NO description line and NO segments — label-only, unchanged from today (AC1)', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      comp.applyNavSearch('provinces'); // narrow first, so clearing is a real transition
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.admin-nav-link-description')))
        .withContext('sanity: the description line must exist while narrowed')
        .toBeTruthy();

      comp.applyNavSearch('');
      fixture.detectChanges();

      const lookups = itemFor(comp, 'lookups');
      expect(lookups.labelSegments).toBeUndefined();
      expect(lookups.descriptionSegments).toBeUndefined();
      expect(fixture.debugElement.query(By.css('.admin-nav-link-description')))
        .withContext('no description line renders anywhere once the query is empty')
        .toBeNull();
      expect(fixture.debugElement.query(By.css('.admin-nav-search-highlight')))
        .withContext('no highlight spans render anywhere once the query is empty')
        .toBeNull();
      // The plain label text is still there, byte-identical to the no-search
      // state — located by its route path (the full list is rendered again,
      // so ".admin-nav-link-label" alone would just find the FIRST item).
      const lookupsLink = fixture.debugElement
        .queryAll(By.css('.admin-nav-link'))
        .find((a) => (a.nativeElement.getAttribute('href') ?? '').includes('lookups'));
      expect(lookupsLink).withContext('the Lookups link must be back in the full list').toBeTruthy();
      const label = lookupsLink!.query(By.css('.admin-nav-link-label'));
      expect(label.nativeElement.textContent.trim()).toBe('Lookups');
    });

    it('clearing the query also clears every item\'s highlight segments (extends the OBRS-794 restore path)', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      comp.applyNavSearch('promotion');
      expect(itemFor(comp, 'promotions').labelSegments)
        .withContext('sanity: segments exist while a query is active')
        .toBeDefined();

      comp.clearNavSearch();

      expect(comp.navItems.every((i) => i.labelSegments === undefined && i.descriptionSegments === undefined))
        .withContext('OBRS-794 pattern: a field derived by applyNavSearch must be reset on every path that empties the query')
        .toBeTrue();
    });

    // AC 3 pin: a regex-metacharacter-shaped query and an HTML-injection-shaped
    // query must not throw, must not be compiled into a regex, and must never
    // reach the DOM as markup (segments are rendered via text interpolation,
    // never [innerHTML] — see nav-search-highlight.ts).
    it('handles a regex-alternation-shaped query ("a)|(b") without throwing and without spurious matches', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      expect(() => comp.applyNavSearch('a)|(b')).not.toThrow();
      fixture.detectChanges();

      expect(comp.filteredNavItems.length)
        .withContext('none of the seeded labels/descriptions literally contain "a)|(b"')
        .toBe(0);
      expect(fixture.debugElement.query(By.css('.admin-nav-empty'))).toBeTruthy();
    });

    it('handles an HTML-injection-shaped query ("<img src=x onerror=alert(1)>") without throwing and without inserting markup', () => {
      seedNavTranslations();
      const comp = fixture.componentInstance as unknown as SearchComp;
      const xssQuery = '<img src=x onerror=alert(1)>';
      expect(() => comp.applyNavSearch(xssQuery)).not.toThrow();
      fixture.detectChanges();

      expect(comp.filteredNavItems.length).toBe(0);
      // The proof that matters: no <img> element was ever created from it.
      expect(fixture.nativeElement.querySelector('img[src="x"]')).toBeNull();
      expect(fixture.debugElement.query(By.css('.admin-nav-empty'))).toBeTruthy();
    });
  });

  // ── OBRS-1431: the /admin/settings tabs are searchable ──────────────────────
  // OBRS-702 collapsed four searchable sidebar entries into the single
  // 'settings' one; nothing put the tab names back into the search corpus, so
  // typing a tab's own name returned nothing at all. These specs read
  // SYSTEM_SETTINGS_TABS itself rather than a copied list of tab names — the
  // card's "no second list" requirement is only actually held if the test that
  // guards it does not keep one either.
  describe('OBRS-1431: /admin/settings tabs in the menu search corpus', () => {
    type TabSearchComp = SearchComp & {
      navSearchCorpus: Array<{ path: string; labelKey: string; descriptionKey?: string }>;
    };

    // OBRS-1719 flipped the last tabs that used to be a real ['owner']-only
    // literal to ['admin','owner'], so there is no longer a real tab in
    // SYSTEM_SETTINGS_TABS this describe block can pick to prove "own roles,
    // not the union" by CONTENT. The role spec below proves it by CALL SHAPE
    // instead (see the AC3 test).

    /**
     * Builds the layout with a caller-supplied role predicate. The predicate is
     * a STUB on purpose: the real AuthService.ROLE_GRANTS is symmetric between
     * admin and owner (auth.service.ts:60-62), so against the real service
     * every tab admits every admin identity and a role spec could not fail. The
     * stub is what lets this assert which side the code reads while that
     * symmetry lasts.
     */
    function buildWith(hasAnyRole: (roles: string[]) => boolean): TabSearchComp {
      const original = authStub.hasAnyRole;
      authStub.hasAnyRole = hasAnyRole;
      try {
        const f = TestBed.createComponent(AdminLayoutComponent);
        f.detectChanges();
        return f.componentInstance as unknown as TabSearchComp;
      } finally {
        authStub.hasAnyRole = original;
      }
    }

    function seedTabTranslations(): void {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en', {
        ADMIN: {
          PAGES: { JUMP_SEAT_CONFIG: 'Jump seats' },
          JUMP_SEAT_CONFIG: { SUBTITLE: 'Fold-down seats sold beyond the fixed layout' },
        },
      });
      translate.use('en');
    }

    it('finds a settings tab by its own label and points at /admin/settings/<path> (AC1)', () => {
      const comp = buildWith(() => true);
      seedTabTranslations();
      comp.applyNavSearch('jump seat');

      expect(comp.filteredNavItems.map((i) => i.path))
        .withContext('typing a tab name must return that tab, and only it')
        .toEqual(['settings/jump-seat']);
    });

    it('finds a settings tab by its SUBTITLE, same as a normal menu description (AC2)', () => {
      const comp = buildWith(() => true);
      seedTabTranslations();
      // "fold-down" appears only in the tab's subtitle, in no label anywhere
      comp.applyNavSearch('fold-down');

      expect(comp.filteredNavItems.map((i) => i.path)).toEqual(['settings/jump-seat']);
    });

    it('highlights the matched substring on a tab result too (AC4 / OBRS-900)', () => {
      const comp = buildWith(() => true);
      seedTabTranslations();
      comp.applyNavSearch('seat');

      const tab = comp.navSearchCorpus.find((i) => i.path === 'settings/jump-seat') as unknown as {
        labelSegments?: HighlightSegment[];
      };
      expect(tab.labelSegments?.filter((seg) => seg.match).map((seg) => seg.text))
        .withContext('the query substring must be highlighted in a tab result as in any other')
        .toEqual(['seat']);
    });

    it('calls hasAnyRole once per settings tab, in tab order, each with that tab\'s OWN requiredRoles (AC3)', () => {
      // Every SYSTEM_SETTINGS_TABS entry now carries the identical ['admin',
      // 'owner'] literal (OBRS-1719 closed the last real owner-only case), so
      // a synthetic predicate can no longer discriminate tabs by CONTENT —
      // admin-layout.component.ts:356 also gates the shell's own "settings"
      // link with a role array that is now content-identical
      // ([...SYSTEM_SETTINGS_ROLES]). What is still checkable, and is the
      // actual mechanism this AC pins, is CALL SHAPE: buildSettingsTabItems()
      // (:389-391) calls hasAnyRole once PER TAB, in array order, each with
      // that tab's own (spread) requiredRoles — never once with the
      // aggregate union. Those calls are exactly the trailing
      // SYSTEM_SETTINGS_TABS.length calls, because buildNavItems() (which
      // owns every earlier hasAnyRole call, including the shell's own union
      // check) runs to completion before buildSettingsTabItems() is invoked
      // (admin-layout.component.ts:447-448) — true regardless of how many
      // calls buildNavItems happens to make.
      const hasAnyRoleSpy = jasmine.createSpy('hasAnyRole').and.returnValue(true);
      const comp = buildWith(hasAnyRoleSpy);

      const tabCount = SYSTEM_SETTINGS_TABS.length;
      const tabCallArgs = hasAnyRoleSpy.calls.allArgs().slice(-tabCount).map((args) => args[0]);
      expect(tabCallArgs)
        .withContext('one call per tab, in tab order, each with that tab\'s own requiredRoles')
        .toEqual(SYSTEM_SETTINGS_TABS.map((tab) => [...tab.requiredRoles]));

      const corpusPaths = comp.navSearchCorpus.map((i) => i.path);
      for (const tab of SYSTEM_SETTINGS_TABS) {
        expect(corpusPaths)
          .withContext(`tab ${tab.path} admitted by its own call must be searchable`)
          .toContain(`settings/${tab.path}`);
      }
    });

    it('derives every tab from SYSTEM_SETTINGS_TABS — a ninth tab needs no edit here', () => {
      const comp = buildWith(() => true);
      const corpusPaths = comp.navSearchCorpus.map((i) => i.path);

      expect(SYSTEM_SETTINGS_TABS.map((tab) => `settings/${tab.path}`).filter((p) => !corpusPaths.includes(p)))
        .withContext('every tab in the single source must be in the search corpus')
        .toEqual([]);
      // and each carries the tab's own i18n keys, not hand-written copies
      const jumpSeat = comp.navSearchCorpus.find((i) => i.path === 'settings/jump-seat');
      expect(jumpSeat?.labelKey).toBe('ADMIN.PAGES.JUMP_SEAT_CONFIG');
      expect(jumpSeat?.descriptionKey).toBe('ADMIN.JUMP_SEAT_CONFIG.SUBTITLE');
    });

    it('adds NOTHING to the sidebar itself — the tabs are search-only (AC4)', () => {
      const comp = buildWith(() => true);

      expect(comp.navItems.filter((i) => i.path.startsWith('settings/')))
        .withContext('OBRS-702 collapsed these into one entry; searching them must not undo that')
        .toEqual([]);
      expect(comp.filteredNavItems.length)
        .withContext('the resting sidebar renders navItems, unchanged')
        .toBe(comp.navItems.length);
      expect(countSectionItems(comp)).toBe(comp.navItems.length);
    });

    it('restores the sidebar-only list after a tab result is cleared', () => {
      const comp = buildWith(() => true);
      seedTabTranslations();
      const fullItemCount = countSectionItems(comp);

      comp.applyNavSearch('jump seat');
      expect(countSectionItems(comp)).toBe(1);

      comp.clearNavSearch();
      expect(countSectionItems(comp))
        .withContext('clearing must fall back to navItems, never to the wider corpus')
        .toBe(fullItemCount);
    });
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
    // OBRS-1498: same blunt fixture switch as the outer describe's.
    hasHeldRole: (_roles: string[]) => true,
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
        { provide: PrimeNG, useValue: { setTranslation: () => {} } },
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
    hasHeldRole: (_roles: string[]) => true,
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
        { provide: PrimeNG, useValue: { setTranslation: () => {} } },
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

// ── OBRS-1071: personal ("ตัวฉัน") menu links in the profile menu ──────────────
// Admin-shell counterpart of the StaffLayoutComponent describe of the same
// name. Separate top-level describe (own TestBed module per test) since My
// Parcels' visibility is driven by environment.features.onlineParcelBooking,
// a field-initialiser read at component-construction time — it must be set
// BEFORE TestBed.createComponent, same requirement as the staff-shell specs.
describe('AdminLayoutComponent — personal menu (OBRS-1071)', () => {
  let originalOnlineParcelBooking: boolean;

  // ⚠️ hasAnyRole() === false is a state the REAL AuthService cannot produce for
  // anyone standing on this shell: ROLE_GRANTS expands both 'admin' and 'owner'
  // to include salesperson/driver (auth.service.ts:84-90), and /admin admits
  // only those two roles (app-routing.module.ts:12-14) — so isStaffUser is TRUE
  // for every real identity here, exactly as admin-layout.component.ts:337 says.
  // This stub therefore pins the `@if (isStaffUser)` WIRING (delete the guard
  // and the count goes 0 → 1), NOT a reachable role. The production rule is
  // asserted separately, against the real grant expansion, in the last spec of
  // this describe.
  const authStub = {
    getUsername: () => 'admin@obrs.test',
    hasAnyRole: (_roles: string[]) => false,
    hasHeldRole: (_roles: string[]) => true,
    getRoles: () => ['admin'],
    logout: jasmine.createSpy('logout'),
  };

  const themeMode$ = new BehaviorSubject<ThemeMode>('light');
  const themeServiceStub: Partial<ThemeService> = {
    getStoredMode: () => 'light',
    setMode: jasmine.createSpy('setMode'),
    toggle: jasmine.createSpy('toggle'),
    mode$: themeMode$.asObservable(),
  };

  beforeEach(() => {
    clearSidebarStorage();
    originalOnlineParcelBooking = environment.features.onlineParcelBooking;
  });

  afterEach(() => {
    environment.features.onlineParcelBooking = originalOnlineParcelBooking;
    clearSidebarStorage();
  });

  async function createAdminLayout(): Promise<ComponentFixture<AdminLayoutComponent>> {
    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent, LangSwitcherComponent, NotificationBellStubComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNG, useValue: { setTranslation: () => {} } },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        { provide: AdminApiService, useValue: { getUsabilityReportCountByStatus: () => of(0) } },
        { provide: BadgeSocketService, useValue: createBadgeSocketServiceStub() },
        {
          provide: NotificationInboxService,
          useValue: { startPolling: () => {}, stopPolling: jasmine.createSpy('stopPolling') },
        },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(AdminLayoutComponent);
    f.detectChanges();
    return f;
  }

  function openProfileMenu(f: ComponentFixture<AdminLayoutComponent>): void {
    const comp = f.componentInstance as AdminLayoutComponent & { toggleProfileMenu: () => void };
    comp.toggleProfileMenu();
    f.detectChanges();
  }

  it('shows /account, /my-bookings and /my-reports to an admin — asserting real rendered hrefs (AC2)', async () => {
    environment.features.onlineParcelBooking = false;
    const f = await createAdminLayout();
    openProfileMenu(f);

    (['/account', '/my-bookings', '/my-reports'] as const).forEach((path) => {
      const link = f.debugElement.query(By.css(`.admin-profile-menu a[href="${path}"]`));
      expect(link).withContext(`admin should see a personal-menu link to ${path}`).toBeTruthy();
    });
  });

  it('renders 0 My Parcels links when environment.features.onlineParcelBooking is false (AC3)', async () => {
    environment.features.onlineParcelBooking = false;
    const f = await createAdminLayout();
    openProfileMenu(f);

    const parcelLinks = f.debugElement.queryAll(By.css('.admin-profile-menu a[href="/my-parcels"]'));
    expect(parcelLinks.length)
      .withContext('My Parcels must be absent from the personal menu while the flag is off')
      .toBe(0);
  });

  it('renders exactly 1 My Parcels link when environment.features.onlineParcelBooking is true (AC3)', async () => {
    environment.features.onlineParcelBooking = true;
    const f = await createAdminLayout();
    openProfileMenu(f);

    const parcelLinks = f.debugElement.queryAll(By.css('.admin-profile-menu a[href="/my-parcels"]'));
    expect(parcelLinks.length)
      .withContext('My Parcels must render exactly once in the personal menu once the flag is on')
      .toBe(1);
  });

  it('keeps the Staff Area shortcut behind @if (isStaffUser) — 0 links when that predicate is false (AC5 admin-shell counterpart)', async () => {
    environment.features.onlineParcelBooking = false;
    const f = await createAdminLayout();
    openProfileMenu(f);

    const staffLinks = f.debugElement.queryAll(By.css('.admin-profile-menu a[href="/staff"]'));
    expect(staffLinks.length)
      .withContext('with isStaffUser false the Staff Area shortcut must not render — deleting the @if turns this 0 into 1')
      .toBe(0);

    // Sanity: the personal items ARE present in this same open menu, so the
    // 0 above genuinely means "gated by the predicate" and not "menu never opened".
    const accountLink = f.debugElement.query(By.css('.admin-profile-menu a[href="/account"]'));
    expect(accountLink).withContext('sanity: personal items must still render for this admin').toBeTruthy();
  });

  // The same rule from the other side, and the one that has real instances:
  // an admin reaching this shell DOES hold the salesperson/driver grant, so the
  // shortcut must still be there after the personal items were added above it.
  // Uses the REAL AuthService with only the JWT's role list spied — the same
  // construction nav-reachability.spec.ts uses — so ROLE_GRANTS expansion is the
  // production implementation and not a stub of the thing under test.
  it('an admin built from the REAL ROLE_GRANTS still sees exactly 1 Staff Area link alongside the new personal items (AC5)', async () => {
    environment.features.onlineParcelBooking = false;
    await TestBed.configureTestingModule({
      declarations: [AdminLayoutComponent, LangSwitcherComponent, NotificationBellStubComponent],
      imports: [HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        { provide: AlertService, useValue: { success: () => {} } },
        { provide: PrimeNG, useValue: { setTranslation: () => {} } },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
        { provide: AdminApiService, useValue: { getUsabilityReportCountByStatus: () => of(0) } },
        { provide: BadgeSocketService, useValue: createBadgeSocketServiceStub() },
        {
          provide: NotificationInboxService,
          useValue: { startPolling: () => {}, stopPolling: jasmine.createSpy('stopPolling') },
        },
      ],
    }).compileComponents();
    spyOn(TestBed.inject(AuthService), 'getRoles').and.returnValue(['admin']);

    const f = TestBed.createComponent(AdminLayoutComponent);
    f.detectChanges();
    openProfileMenu(f);

    expect(f.debugElement.queryAll(By.css('.admin-profile-menu a[href="/staff"]')).length)
      .withContext('a real admin holds the salesperson/driver grant, so Staff Area must survive the personal items')
      .toBe(1);
    (['/account', '/my-bookings', '/my-reports'] as const).forEach((path) => {
      expect(f.debugElement.queryAll(By.css(`.admin-profile-menu a[href="${path}"]`)).length)
        .withContext(`${path} must render exactly once for a real admin identity`)
        .toBe(1);
    });
  });
});

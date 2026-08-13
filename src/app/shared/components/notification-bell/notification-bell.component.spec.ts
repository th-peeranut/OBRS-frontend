import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PopoverModule } from 'primeng/popover';
import { BehaviorSubject } from 'rxjs';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationInboxService } from '../../services/notification-inbox.service';
import { NotificationItem } from '../../interfaces/notification.interface';
import { ThemeMode, ThemeService } from '../../services/theme.service';

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let component: NotificationBellComponent;
  let unreadCount$: BehaviorSubject<number>;
  let themeMode$: BehaviorSubject<ThemeMode>;
  let inboxServiceSpy: jasmine.SpyObj<NotificationInboxService>;
  let router: Router;

  beforeEach(async () => {
    unreadCount$ = new BehaviorSubject<number>(0);
    themeMode$ = new BehaviorSubject<ThemeMode>('light');
    inboxServiceSpy = jasmine.createSpyObj('NotificationInboxService', [
      'startPolling',
      'refreshOnOpen',
      'markOne',
      'markAllRead',
    ]);
    Object.assign(inboxServiceSpy, {
      unreadCount$: unreadCount$.asObservable(),
      items$: new BehaviorSubject<NotificationItem[]>([]).asObservable(),
      totalElements$: new BehaviorSubject<number>(0).asObservable(),
      loading$: new BehaviorSubject<boolean>(false).asObservable(),
      error$: new BehaviorSubject<boolean>(false).asObservable(),
    });

    await TestBed.configureTestingModule({
      declarations: [NotificationBellComponent],
      imports: [TranslateModule.forRoot(), PopoverModule, RouterTestingModule],
      providers: [
        { provide: NotificationInboxService, useValue: inboxServiceSpy },
        { provide: ThemeService, useValue: { mode$: themeMode$.asObservable() } },
      ],
      // The inbox panel's own template/child tree isn't relevant to these
      // bell-scoped assertions (badge/aria-label/lifecycle) — schema-suppress
      // its unknown element rather than pulling in its full dependency chain.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { NOTIFICATIONS: { BELL_ARIA: 'Notifications, {{count}} unread' } });
    translate.use('en');

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(NotificationBellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts polling on init', () => {
    expect(inboxServiceSpy.startPolling).toHaveBeenCalled();
  });

  it('hides the badge when unreadCount is 0', () => {
    unreadCount$.next(0);
    fixture.detectChanges();
    const badge = fixture.debugElement.query(By.css('.notification-bell-badge'));
    expect(badge).withContext('badge should not render when count is 0').toBeNull();
  });

  it('shows the badge with the numeric count when unreadCount > 0', () => {
    unreadCount$.next(4);
    fixture.detectChanges();
    const badge = fixture.debugElement.query(By.css('.notification-bell-badge'));
    expect(badge).withContext('badge should render when count > 0').toBeTruthy();
    expect(badge.nativeElement.textContent.trim()).toBe('4');
  });

  it('caps the badge text at "99+" beyond 99', () => {
    unreadCount$.next(150);
    fixture.detectChanges();
    const badge = fixture.debugElement.query(By.css('.notification-bell-badge'));
    expect(badge.nativeElement.textContent.trim()).toBe('99+');
  });

  it('sets an aria-label on the trigger button carrying the unread count', () => {
    unreadCount$.next(2);
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('.notification-bell-trigger'));
    expect(button.nativeElement.getAttribute('aria-label')).toContain('2');
  });

  it('carries aria-haspopup on the trigger button', () => {
    const button = fixture.debugElement.query(By.css('.notification-bell-trigger'));
    expect(button.nativeElement.getAttribute('aria-haspopup')).toBe('true');
  });

  it('calls refreshOnOpen() when the overlay panel shows', () => {
    component['onPanelShow']();
    expect(inboxServiceSpy.refreshOnOpen).toHaveBeenCalled();
  });

  it('delegates markOne/markAllRead/retry to the inbox service', () => {
    component['onMarkOne'](7);
    expect(inboxServiceSpy.markOne).toHaveBeenCalledWith(7);

    component['onMarkAllRead']();
    expect(inboxServiceSpy.markAllRead).toHaveBeenCalled();

    component['onRetry']();
    expect(inboxServiceSpy.refreshOnOpen).toHaveBeenCalledTimes(1);
  });

  // OBRS-1308: the inbox panel's new `navigate` output, currently only fired
  // for a NOTIF_MSG_OVERRIDE_PENDING row.
  describe('onNavigate (OBRS-1308)', () => {
    it('closes the popover and navigates to the review detail route', () => {
      const navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);
      const hideSpy = jasmine.createSpy('hide');
      component.overlayPanel = { hide: hideSpy } as unknown as typeof component.overlayPanel;

      component['onNavigate']({ type: 'NOTIF_MSG_OVERRIDE_PENDING', id: 42 });

      expect(hideSpy).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith([
        '/admin/settings/notification-messages/reviews',
        42,
      ]);
    });
  });

  // ── Scrutinize fix: appendTo="body" detaches the panel from .admin-shell,
  // so it must carry its own theme-variant + dark-mode classes for the
  // --admin-*/--accent-* tokens (admin-theme.scss's .notification-inbox-overlay
  // rules) to resolve at its actual (body-level) DOM location. ──
  describe('overlayStyleClass (body-appended panel theming)', () => {
    it('defaults to the admin accent variant in light mode', () => {
      expect(component.shellVariant).toBe('admin');
      expect(component['overlayStyleClass']).toBe('notification-inbox-overlay theme-admin');
    });

    it('carries theme-staff when shellVariant is staff', () => {
      component.shellVariant = 'staff';
      expect(component['overlayStyleClass']).toBe('notification-inbox-overlay theme-staff');
    });

    it('appends is-dark when ThemeService reports dark mode', () => {
      themeMode$.next('dark');
      expect(component['overlayStyleClass']).toBe('notification-inbox-overlay theme-admin is-dark');
    });

    it('drops is-dark again when ThemeService reports light mode', () => {
      themeMode$.next('dark');
      themeMode$.next('light');
      expect(component['overlayStyleClass']).toBe('notification-inbox-overlay theme-admin');
    });

    it('binds styleClass onto the child p-popover instance', () => {
      themeMode$.next('dark');
      component.shellVariant = 'staff';
      fixture.detectChanges();
      expect(component.overlayPanel?.styleClass).toBe('notification-inbox-overlay theme-staff is-dark');
    });
  });
});

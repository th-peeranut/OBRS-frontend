import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { BehaviorSubject } from 'rxjs';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationInboxService } from '../../services/notification-inbox.service';
import { NotificationItem } from '../../interfaces/notification.interface';

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let component: NotificationBellComponent;
  let unreadCount$: BehaviorSubject<number>;
  let inboxServiceSpy: jasmine.SpyObj<NotificationInboxService>;

  beforeEach(async () => {
    unreadCount$ = new BehaviorSubject<number>(0);
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
      imports: [TranslateModule.forRoot(), OverlayPanelModule],
      providers: [{ provide: NotificationInboxService, useValue: inboxServiceSpy }],
      // The inbox panel's own template/child tree isn't relevant to these
      // bell-scoped assertions (badge/aria-label/lifecycle) — schema-suppress
      // its unknown element rather than pulling in its full dependency chain.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { NOTIFICATIONS: { BELL_ARIA: 'Notifications, {{count}} unread' } });
    translate.use('en');

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
});

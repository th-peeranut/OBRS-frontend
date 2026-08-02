import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationInboxPanelComponent } from './notification-inbox-panel.component';
import { NotificationItem } from '../../interfaces/notification.interface';
// OBRS-907: the panel's first-load spinner now renders through the shared
// component — declared here so it actually renders (not stripped down to an
// opaque, childless custom element by CUSTOM_ELEMENTS_SCHEMA below), which is
// what the existing `.admin-loading-spinner` assertions require.
import { LoadingStateComponent } from '../loading-state/loading-state.component';

function makeItem(id: number): NotificationItem {
  return {
    id,
    message: `Message ${id}`,
    notificationType: 'BOOKING_CONFIRMED',
    channel: 'IN_APP',
    status: 'SENT',
    bookingScheduleId: null,
    targetDate: null,
    sentAt: '2026-07-14T08:00:00+07:00',
    readAt: null,
    read: false,
  };
}

describe('NotificationInboxPanelComponent', () => {
  let fixture: ComponentFixture<NotificationInboxPanelComponent>;
  let component: NotificationInboxPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationInboxPanelComponent, LoadingStateComponent],
      imports: [TranslateModule.forRoot()],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationInboxPanelComponent);
    component = fixture.componentInstance;
  });

  it('shows the first-load spinner only when loading is true AND there are no cached items', () => {
    component.loading = true;
    component.items = [];
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.notification-inbox-state .admin-loading-spinner'))).toBeTruthy();
  });

  // OBRS-907 scrutinize follow-up: the migration from inline markup to
  // <app-loading-state> silently grew this icon 28px -> 34px, because
  // `.notification-inbox-state .material-symbols-outlined { font-size: 28px }`
  // stopped reaching it once it moved into a CHILD component's template --
  // Angular emulated encapsulation puts the panel's own content attribute on
  // the rule's LAST compound too, so the rule no longer matches an element that
  // now belongs to a different component. The global `.admin-loading-spinner
  // { font-size: 34px }` (unencapsulated) won instead. 4334 unit tests stayed
  // green through that because none of them read getComputedStyle -- only a
  // pixel measurement, not a class-presence check, can catch this class of
  // regression. Karma's `styles` array already loads src/styles.scss (OBRS-721
  // lesson), so this sees the REAL cascade.
  it('OBRS-907: pins the spinner icon at its computed 28px size (not the global 34px .admin-loading-spinner default)', () => {
    component.loading = true;
    component.items = [];
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    try {
      const icon = fixture.debugElement.query(By.css('.notification-inbox-state .admin-loading-spinner'));
      expect(icon).not.toBeNull();
      expect(getComputedStyle(icon.nativeElement).fontSize).toBe('28px');
    } finally {
      fixture.nativeElement.remove();
    }
  });

  it('does NOT show the spinner on a background refresh when items are already cached (stale-while-revalidate)', () => {
    component.loading = true;
    component.items = [makeItem(1)];
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.notification-inbox-state .admin-loading-spinner'))).toBeNull();
    expect(fixture.debugElement.queryAll(By.css('app-notification-inbox-row')).length).toBe(1);
  });

  it('shows the error block only when error is true AND there are no cached items, with a retry button', () => {
    component.error = true;
    component.items = [];
    fixture.detectChanges();

    const errorBlock = fixture.debugElement.query(By.css('.notification-inbox-state'));
    expect(errorBlock).toBeTruthy();
    const retryBtn = fixture.debugElement.query(By.css('.notification-inbox-state button'));
    expect(retryBtn).toBeTruthy();

    retryBtn.nativeElement.click();
    expect(fixture.componentInstance.retry).toBeTruthy();
  });

  it('emits retry when the retry button is clicked', () => {
    component.error = true;
    component.items = [];
    fixture.detectChanges();
    spyOn(component.retry, 'emit');

    fixture.debugElement.query(By.css('.notification-inbox-state button')).nativeElement.click();

    expect(component.retry.emit).toHaveBeenCalled();
  });

  it('shows the empty state when there is no error, not loading, and no items', () => {
    component.loading = false;
    component.error = false;
    component.items = [];
    fixture.detectChanges();

    const state = fixture.debugElement.query(By.css('.notification-inbox-state'));
    expect(state).toBeTruthy();
    expect(state.nativeElement.textContent).toContain('NOTIFICATIONS.EMPTY_TITLE');
  });

  it('renders one row per item when items are present', () => {
    component.items = [makeItem(1), makeItem(2), makeItem(3)];
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('app-notification-inbox-row')).length).toBe(3);
  });

  it('shows the "showing latest" footer only when total exceeds the fetched items length', () => {
    component.items = [makeItem(1), makeItem(2)];
    component.total = 2;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.notification-inbox-footer'))).toBeNull();

    component.total = 5;
    fixture.detectChanges();
    const footer = fixture.debugElement.query(By.css('.notification-inbox-footer'));
    expect(footer).toBeTruthy();
  });

  it('disables "Mark all read" when unreadCount is 0, enabled otherwise', () => {
    component.unreadCount = 0;
    fixture.detectChanges();
    let btn: HTMLButtonElement = fixture.debugElement.query(By.css('.notification-inbox-mark-all')).nativeElement;
    expect(btn.disabled).toBeTrue();

    component.unreadCount = 3;
    fixture.detectChanges();
    btn = fixture.debugElement.query(By.css('.notification-inbox-mark-all')).nativeElement;
    expect(btn.disabled).toBeFalse();
  });

  it('emits markAllRead when the mark-all button is clicked', () => {
    component.unreadCount = 3;
    fixture.detectChanges();
    spyOn(component.markAllRead, 'emit');

    fixture.debugElement.query(By.css('.notification-inbox-mark-all')).nativeElement.click();

    expect(component.markAllRead.emit).toHaveBeenCalled();
  });

  it('emits markOne with the row id when a row requests open', () => {
    spyOn(component.markOne, 'emit');
    component['onRowOpen'](9);
    expect(component.markOne.emit).toHaveBeenCalledWith(9);
  });
});

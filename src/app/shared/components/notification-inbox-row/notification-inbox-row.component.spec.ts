import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NotificationInboxRowComponent } from './notification-inbox-row.component';
import { NotificationItem } from '../../interfaces/notification.interface';

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 1,
    message: 'Your booking is confirmed',
    notificationType: 'BOOKING_CONFIRMED',
    channel: 'IN_APP',
    status: 'SENT',
    bookingScheduleId: null,
    targetDate: null,
    sentAt: '2026-07-14T08:00:00+07:00',
    readAt: null,
    read: false,
    ...overrides,
  };
}

describe('NotificationInboxRowComponent', () => {
  let fixture: ComponentFixture<NotificationInboxRowComponent>;
  let component: NotificationInboxRowComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationInboxRowComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationInboxRowComponent);
    component = fixture.componentInstance;
    TestBed.inject(TranslateService).use('en');
  });

  it('renders as a native, keyboard-focusable button', () => {
    component.item = makeItem();
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.notification-row'));
    expect(button).toBeTruthy();
  });

  it('applies the is-unread modifier and shows a leading dot for an unread item', () => {
    component.item = makeItem({ read: false });
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.notification-row'));
    expect(button.nativeElement.classList.contains('is-unread')).toBeTrue();
    expect(fixture.debugElement.query(By.css('.notification-row-dot'))).toBeTruthy();
  });

  it('does NOT apply is-unread and hides the dot for a read item', () => {
    component.item = makeItem({ read: true, readAt: '2026-07-14T09:00:00+07:00' });
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.notification-row'));
    expect(button.nativeElement.classList.contains('is-unread')).toBeFalse();
    expect(fixture.debugElement.query(By.css('.notification-row-dot'))).toBeNull();
  });

  it('renders the message and a formatted absolute timestamp', () => {
    component.item = makeItem({ message: 'Payment received' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Payment received');
    expect(fixture.nativeElement.textContent).toContain('2026');
  });

  it('combines message + read-state + timestamp into the row aria-label', () => {
    component.item = makeItem({ message: 'Payment received', read: false });
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.notification-row'));
    const ariaLabel = button.nativeElement.getAttribute('aria-label');
    expect(ariaLabel).toContain('Payment received');
    expect(ariaLabel).toContain('NOTIFICATIONS.ROW_UNREAD_SUFFIX');
  });

  it('emits open with the item id on click (does not navigate)', () => {
    component.item = makeItem({ id: 77 });
    fixture.detectChanges();
    spyOn(component.open, 'emit');

    fixture.debugElement.query(By.css('button.notification-row')).nativeElement.click();

    expect(component.open.emit).toHaveBeenCalledWith(77);
  });
});

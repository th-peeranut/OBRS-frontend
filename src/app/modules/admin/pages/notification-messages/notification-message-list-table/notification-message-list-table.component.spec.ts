import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationMessageListTableComponent } from './notification-message-list-table.component';
import { OverridableMessageKeyDto } from '../../../../../shared/interfaces/notification-message-override.interface';

function localeStatus(status: string) {
  return { baseline: 'b', liveBody: 'l', status, rejectReason: null, placeholderIndices: [], creditEstimate: null };
}

const KEY: OverridableMessageKeyDto = {
  messageCode: 'notification.sms.payment.confirmed',
  notificationType: 'PAYMENT_CONFIRMED',
  channels: ['SMS'],
  sampleArgs: [],
  locales: {
    th: localeStatus('PENDING') as any,
    en: localeStatus('APPROVED') as any,
    zh: localeStatus('NONE') as any,
  },
};

describe('NotificationMessageListTableComponent', () => {
  let fixture: ComponentFixture<NotificationMessageListTableComponent>;
  let component: NotificationMessageListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageListTableComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessageListTableComponent);
    component = fixture.componentInstance;
  });

  it('renders one row per key with a status chip per locale', () => {
    component.keys = [KEY];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    const statuses = fixture.nativeElement.querySelectorAll('.admin-status');
    expect(statuses.length).toBe(3);
  });

  it('emits editKey with the code and locale when an edit icon is clicked', () => {
    component.keys = [KEY];
    fixture.detectChanges();
    const editSpy = jasmine.createSpy('editKey');
    component.editKey.subscribe(editSpy);

    fixture.nativeElement
      .querySelector(`[data-testid="notification-message-edit-${KEY.messageCode}-th"]`)
      .click();

    expect(editSpy).toHaveBeenCalledWith({ code: KEY.messageCode, locale: 'th' });
  });

  it('shows the empty row when there are no keys and no error', () => {
    component.keys = [];
    component.error = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-empty-row')).toBeTruthy();
  });

  it('shows skeleton rows while loading, not the empty row', () => {
    component.keys = [];
    component.loading = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.admin-skeleton-row').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.admin-empty-row')).toBeNull();
  });
});

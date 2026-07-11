import { NotificationPreferenceRowComponent } from './notification-preference-row.component';
import { NotificationPreferenceRow } from '../../../../shared/interfaces/notification-preference.interface';

describe('NotificationPreferenceRowComponent', () => {
  function create(row: NotificationPreferenceRow): NotificationPreferenceRowComponent {
    const component = new NotificationPreferenceRowComponent();
    component.row = row;
    return component;
  }

  const baseRow: NotificationPreferenceRow = {
    type: 'PAYMENT_CONFIRMED',
    critical: true,
    emailSupported: true,
    smsSupported: true,
    emailEnabled: true,
    smsEnabled: false,
  };

  it('should create', () => {
    const component = create(baseRow);
    expect(component).toBeTruthy();
  });

  it('emits a rowChange for the email channel on toggle', () => {
    const component = create(baseRow);
    const spy = jasmine.createSpy('rowChange');
    component.rowChange.subscribe(spy);

    component.onEmailChange({ originalEvent: new Event('change'), checked: false });

    expect(spy).toHaveBeenCalledWith({ type: 'PAYMENT_CONFIRMED', channel: 'email', enabled: false });
  });

  it('emits a rowChange for the sms channel on toggle', () => {
    const component = create(baseRow);
    const spy = jasmine.createSpy('rowChange');
    component.rowChange.subscribe(spy);

    component.onSmsChange({ originalEvent: new Event('change'), checked: true });

    expect(spy).toHaveBeenCalledWith({ type: 'PAYMENT_CONFIRMED', channel: 'sms', enabled: true });
  });
});

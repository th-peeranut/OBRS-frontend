import { NotificationPreferenceMatrixComponent } from './notification-preference-matrix.component';
import { NotificationPreferenceRow } from '../../../../shared/interfaces/notification-preference.interface';

describe('NotificationPreferenceMatrixComponent', () => {
  it('should create', () => {
    const component = new NotificationPreferenceMatrixComponent();
    expect(component).toBeTruthy();
  });

  it('trackByType returns the row type for stable *ngFor tracking', () => {
    const component = new NotificationPreferenceMatrixComponent();
    const row: NotificationPreferenceRow = {
      type: 'PAYMENT_CONFIRMED',
      critical: true,
      emailSupported: true,
      smsSupported: true,
      emailEnabled: true,
      smsEnabled: false,
    };

    expect(component.trackByType(0, row)).toBe('PAYMENT_CONFIRMED');
  });

  it('re-emits a child rowChange unchanged', () => {
    const component = new NotificationPreferenceMatrixComponent();
    const spy = jasmine.createSpy('rowChange');
    component.rowChange.subscribe(spy);

    component.rowChange.emit({ type: 'PAYMENT_CONFIRMED', channel: 'email', enabled: false });

    expect(spy).toHaveBeenCalledWith({ type: 'PAYMENT_CONFIRMED', channel: 'email', enabled: false });
  });
});

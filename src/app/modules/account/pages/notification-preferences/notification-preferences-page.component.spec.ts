import { of, throwError } from 'rxjs';
import { NotificationPreferencesPageComponent } from './notification-preferences-page.component';
import { NotificationPreferenceRow } from '../../../../shared/interfaces/notification-preference.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

describe('NotificationPreferencesPageComponent', () => {
  function row(overrides: Partial<NotificationPreferenceRow> = {}): NotificationPreferenceRow {
    return {
      type: 'PAYMENT_CONFIRMED',
      critical: true,
      emailSupported: true,
      smsSupported: true,
      emailEnabled: true,
      smsEnabled: false,
      ...overrides,
    };
  }

  function create(preferences: NotificationPreferenceRow[]): {
    component: NotificationPreferencesPageComponent;
    serviceStub: {
      getPreferences: jasmine.Spy;
      updatePreferences: jasmine.Spy;
    };
    alertServiceStub: {
      success: jasmine.Spy;
      error: jasmine.Spy;
      toast: jasmine.Spy;
      confirm: jasmine.Spy;
    };
  } {
    const serviceStub = {
      getPreferences: jasmine
        .createSpy('getPreferences')
        .and.returnValue(of({ code: 200, message: 'OK', data: { preferences } })),
      updatePreferences: jasmine
        .createSpy('updatePreferences')
        .and.returnValue(of({ code: 200, message: 'OK', data: { preferences } })),
    };
    const alertServiceStub = {
      success: jasmine.createSpy('success'),
      error: jasmine.createSpy('error'),
      toast: jasmine.createSpy('toast'),
      confirm: jasmine.createSpy('confirm').and.resolveTo(true),
    };

    const component = new NotificationPreferencesPageComponent(
      serviceStub as never,
      alertServiceStub as never,
      createTranslateStub()
    );

    return { component, serviceStub, alertServiceStub };
  }

  it('should create', () => {
    const { component } = create([row()]);
    expect(component).toBeTruthy();
  });

  it('seeds rows and pristineRows from exactly what the server returns (no forced defaults)', () => {
    const seeded = [row({ emailEnabled: false, smsEnabled: true })];
    const { component } = create(seeded);

    component.ngOnInit();

    expect(component.rows).toEqual(seeded);
    expect(component.isDirty).toBe(false);
  });

  describe('dirty tracking', () => {
    it('editing a non-critical row enables Save', () => {
      const { component } = create([
        row({ type: 'BOOKING_RESCHEDULED', critical: false, emailEnabled: true, smsEnabled: true }),
      ]);
      component.ngOnInit();

      component.onRowChange({ type: 'BOOKING_RESCHEDULED', channel: 'email', enabled: false });

      expect(component.isDirty).toBe(true);
      expect(component.rows[0].emailEnabled).toBe(false);
    });

    it('saving disables Save (isDirty resets)', () => {
      const { component } = create([
        row({ type: 'BOOKING_RESCHEDULED', critical: false, emailEnabled: true, smsEnabled: true }),
      ]);
      component.ngOnInit();
      component.onRowChange({ type: 'BOOKING_RESCHEDULED', channel: 'email', enabled: false });
      expect(component.isDirty).toBe(true);

      component.save();

      expect(component.isDirty).toBe(false);
    });
  });

  describe('the >=1-channel rule (critical rows)', () => {
    it('vetoes turning off the last enabled channel on a critical row: rows unchanged + warning shown', () => {
      const { component, alertServiceStub } = create([
        row({ type: 'PAYMENT_CONFIRMED', critical: true, emailEnabled: true, smsEnabled: false }),
      ]);
      component.ngOnInit();

      component.onRowChange({ type: 'PAYMENT_CONFIRMED', channel: 'email', enabled: false });

      expect(component.rows[0].emailEnabled).toBe(true);
      expect(component.isDirty).toBe(false);
      expect(component.criticalWarningType).toBe('PAYMENT_CONFIRMED');
      expect(alertServiceStub.toast).toHaveBeenCalledWith(
        'NOTIFICATION_PREFS.ERROR.CRITICAL_LAST_CHANNEL',
        'warning'
      );
    });

    it('allows a non-critical (optional) type to go both-off with no veto', () => {
      const { component, alertServiceStub } = create([
        row({ type: 'BOOKING_RESCHEDULED', critical: false, emailEnabled: true, smsEnabled: false }),
      ]);
      component.ngOnInit();

      component.onRowChange({ type: 'BOOKING_RESCHEDULED', channel: 'email', enabled: false });

      expect(component.rows[0].emailEnabled).toBe(false);
      expect(component.rows[0].smsEnabled).toBe(false);
      expect(component.criticalWarningType).toBeNull();
      expect(alertServiceStub.toast).not.toHaveBeenCalled();
    });

    it('allows turning the last channel off on a critical row when the OTHER channel is being turned on in the same edit (not both off)', () => {
      const { component } = create([
        row({ type: 'PAYMENT_CONFIRMED', critical: true, emailEnabled: true, smsEnabled: true }),
      ]);
      component.ngOnInit();

      component.onRowChange({ type: 'PAYMENT_CONFIRMED', channel: 'email', enabled: false });

      expect(component.rows[0].emailEnabled).toBe(false);
      expect(component.rows[0].smsEnabled).toBe(true);
      expect(component.criticalWarningType).toBeNull();
    });
  });

  describe('save() server-400 handling', () => {
    it('maps NOTIFICATION_PREFERENCE_CRITICAL_CHANNEL_REQUIRED via errorCode (not string matching) and keeps unsaved edits', () => {
      const { component, serviceStub, alertServiceStub } = create([
        row({ type: 'BOOKING_RESCHEDULED', critical: false, emailEnabled: true, smsEnabled: true }),
      ]);
      component.ngOnInit();
      component.onRowChange({ type: 'BOOKING_RESCHEDULED', channel: 'email', enabled: false });
      serviceStub.updatePreferences.and.returnValue(
        throwError(() => ({
          error: { errorCode: 'NOTIFICATION_PREFERENCE_CRITICAL_CHANNEL_REQUIRED' },
        }))
      );

      component.save();

      expect(alertServiceStub.error).toHaveBeenCalledWith(
        'NOTIFICATION_PREFS.ERROR.CRITICAL_LAST_CHANNEL'
      );
      expect(component.rows[0].emailEnabled).toBe(false);
      expect(component.isDirty).toBe(true);
    });

    it('falls back to a generic error for an unmapped errorCode', () => {
      const { component, serviceStub, alertServiceStub } = create([
        row({ type: 'BOOKING_RESCHEDULED', critical: false, emailEnabled: true, smsEnabled: true }),
      ]);
      component.ngOnInit();
      component.onRowChange({ type: 'BOOKING_RESCHEDULED', channel: 'email', enabled: false });
      serviceStub.updatePreferences.and.returnValue(
        throwError(() => ({ error: { errorCode: 'SOMETHING_ELSE' } }))
      );

      component.save();

      expect(alertServiceStub.error).toHaveBeenCalledWith('NOTIFICATION_PREFS.ERROR.GENERIC');
    });
  });

  describe('load failure', () => {
    it('shows the load-failed state and an alert on GET failure', () => {
      const { component, serviceStub, alertServiceStub } = create([]);
      serviceStub.getPreferences.and.returnValue(throwError(() => new Error('network')));

      component.ngOnInit();

      expect(component.loadFailed).toBe(true);
      expect(alertServiceStub.error).toHaveBeenCalledWith('NOTIFICATION_PREFS.ERROR.LOAD_FAILED');
    });

    it('onRetry() re-triggers the GET', () => {
      const { component, serviceStub } = create([row()]);
      component.ngOnInit();
      serviceStub.getPreferences.calls.reset();

      component.onRetry();

      expect(serviceStub.getPreferences).toHaveBeenCalled();
    });
  });
});

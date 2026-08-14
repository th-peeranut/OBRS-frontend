import { HttpErrorResponse } from '@angular/common/http';
import { convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { NotificationMessageEditPageComponent } from './notification-message-edit-page.component';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeRouteStub(messageCode: string, locale: string) {
  return { paramMap: of(convertToParamMap({ messageCode, locale })) };
}

function makeRouterStub() {
  return { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
}

function makeAlertStub() {
  return {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
}

function makeStoreStub(cachedKeys: any[] | null = null) {
  return {
    value: cachedKeys,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
  };
}

const KEY = {
  messageCode: 'notification.sms.payment.confirmed',
  notificationType: 'PAYMENT_CONFIRMED',
  channels: ['SMS'],
  sampleArgs: ['{0}=BK-00123'],
  locales: {
    th: {
      baseline: 'baseline th',
      liveBody: 'live th',
      status: 'NONE',
      rejectReason: null,
      placeholderIndices: [0],
      creditEstimate: { credits: 2, baselineCredits: 2, encoding: 'GSM7' },
    },
    en: { baseline: 'baseline en', liveBody: 'live en', status: 'NONE', rejectReason: null, placeholderIndices: [0], creditEstimate: null },
    zh: { baseline: 'baseline zh', liveBody: 'live zh', status: 'NONE', rejectReason: null, placeholderIndices: [0], creditEstimate: null },
  },
};

function makeComponent(adminApi: Record<string, unknown>, store = makeStoreStub()) {
  const route = makeRouteStub('notification.sms.payment.confirmed', 'th');
  const router = makeRouterStub();
  const alert = makeAlertStub();
  const component = new NotificationMessageEditPageComponent(
    route as any,
    router as any,
    adminApi as any,
    store as any,
    alert as any,
    createTranslateStub()
  );
  return { component, route, router, adminApi, store, alert };
}

describe('NotificationMessageEditPageComponent', () => {
  it('opens optimistically from the cached store list before the GET resolves', () => {
    const getByCode = new Subject<any>();
    const { component } = makeComponent(
      { getNotificationMessageByCode: jasmine.createSpy().and.returnValue(getByCode) },
      makeStoreStub([KEY])
    );

    component.ngOnInit();

    expect(component['key']).toEqual(KEY as any);
    expect(component['detail']?.liveBody).toBe('live th');
  });

  it('patches in the authoritative detail once the GET resolves', () => {
    const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
    const { component } = makeComponent({ getNotificationMessageByCode: getByCode });

    component.ngOnInit();

    expect(getByCode).toHaveBeenCalledWith('notification.sms.payment.confirmed');
    expect(component['detail']?.liveBody).toBe('live th');
    expect(component['creditEstimate']).toEqual(KEY.locales.th.creditEstimate as any);
  });

  it('flags loadFailed only when there was nothing cached to show', () => {
    const getByCode = jasmine.createSpy().and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const { component } = makeComponent({ getNotificationMessageByCode: getByCode });

    component.ngOnInit();

    expect(component['loadFailed']).toBeTrue();
  });

  it('does NOT flag loadFailed when a cached seed is already on screen', () => {
    const getByCode = jasmine.createSpy().and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const { component } = makeComponent({ getNotificationMessageByCode: getByCode }, makeStoreStub([KEY]));

    component.ngOnInit();

    expect(component['loadFailed']).toBeFalse();
  });

  describe('SMS credit preview (AC12)', () => {
    it('shows the credit panel only when the key channels include SMS', () => {
      const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
      const { component } = makeComponent({ getNotificationMessageByCode: getByCode });
      component.ngOnInit();
      expect(component['showCreditPanel']).toBeTrue();

      component['key'] = { ...KEY, channels: ['EMAIL'] } as any;
      expect(component['showCreditPanel']).toBeFalse();
    });

    it('calls the preview endpoint and updates creditEstimate on a bodyChange event', () => {
      const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
      const preview = jasmine
        .createSpy('previewNotificationMessageCredit')
        .and.returnValue(of({ code: 200, message: 'OK', data: { credits: 5, baselineCredits: 2, encoding: 'UCS2' } }));
      const { component } = makeComponent({
        getNotificationMessageByCode: getByCode,
        previewNotificationMessageCredit: preview,
      });
      component.ngOnInit();

      component['onBodyChange']('ข้อความใหม่');

      expect(preview).toHaveBeenCalledWith('notification.sms.payment.confirmed', 'th', 'ข้อความใหม่');
      expect(component['creditEstimate']).toEqual({ credits: 5, baselineCredits: 2, encoding: 'UCS2' } as any);
    });

    it('does not call the preview endpoint for a non-SMS key', () => {
      const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: { ...KEY, channels: ['EMAIL'] } }));
      const preview = jasmine.createSpy('previewNotificationMessageCredit');
      const { component } = makeComponent({
        getNotificationMessageByCode: getByCode,
        previewNotificationMessageCredit: preview,
      });
      component.ngOnInit();

      component['onBodyChange']('some text');

      expect(preview).not.toHaveBeenCalled();
    });

    it('keeps the last known estimate when a preview call fails (display-only, non-blocking)', () => {
      const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
      const preview = jasmine.createSpy('previewNotificationMessageCredit').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500 }))
      );
      const { component } = makeComponent({
        getNotificationMessageByCode: getByCode,
        previewNotificationMessageCredit: preview,
      });
      component.ngOnInit();
      const before = component['creditEstimate'];

      component['onBodyChange']('some text');

      expect(component['creditEstimate']).toBe(before);
    });
  });

  describe('onSave', () => {
    it('201: shows the success toast, flips status to PENDING, does not clear the body, refreshes the list store', async () => {
      const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
      const submit = jasmine.createSpy('submitNotificationMessage').and.returnValue(
        of({ code: 201, message: 'OK', data: { id: 9, messageCode: KEY.messageCode, locale: 'th', status: 'PENDING', proposedAt: 'now' } })
      );
      const { component, alert, store } = makeComponent({
        getNotificationMessageByCode: getByCode,
        submitNotificationMessage: submit,
      });
      component.ngOnInit();

      await component['onSave']('new proposed text');

      expect(submit).toHaveBeenCalledWith({
        messageCode: 'notification.sms.payment.confirmed',
        locale: 'th',
        body: 'new proposed text',
      });
      expect(alert.success).toHaveBeenCalled();
      expect(component['detail']?.status).toBe('PENDING');
      expect(component['submitting']).toBeFalse();
      expect(store.refresh).toHaveBeenCalled();
    });

    it('400 PLACEHOLDER_MISMATCH: sets validationError, does NOT call AlertService.error', async () => {
      const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
      const submit = jasmine.createSpy('submitNotificationMessage').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { data: { reason: 'PLACEHOLDER_MISMATCH', missingIndices: [1], extraIndices: [], formatError: null } },
            })
        )
      );
      const { component, alert } = makeComponent({
        getNotificationMessageByCode: getByCode,
        submitNotificationMessage: submit,
      });
      component.ngOnInit();

      await component['onSave']('bad body');

      expect(component['validationError']).toEqual({
        reason: 'PLACEHOLDER_MISMATCH',
        missingIndices: [1],
        extraIndices: [],
        formatError: null,
      } as any);
      expect(alert.error).not.toHaveBeenCalled();
    });

    it('an unrecognized failure falls through to AlertService.error(SAVE_FAILED)', async () => {
      const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
      const submit = jasmine.createSpy('submitNotificationMessage').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500 }))
      );
      const { component, alert } = makeComponent({
        getNotificationMessageByCode: getByCode,
        submitNotificationMessage: submit,
      });
      component.ngOnInit();

      await component['onSave']('body');

      expect(component['validationError']).toBeNull();
      expect(alert.error).toHaveBeenCalled();
    });
  });

  it('cancel navigates back to the list', () => {
    const getByCode = jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: KEY }));
    const { component, router } = makeComponent({ getNotificationMessageByCode: getByCode });
    component.ngOnInit();

    component['onCancel']();

    expect(router.navigate).toHaveBeenCalledWith(['/admin/settings/notification-messages']);
  });
});

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

  // OBRS-1550 — a rise has to be acknowledged before it is submitted. The
  // estimate is a whole-segment count, so `> 0` is the whole threshold.
  describe('credit-rise confirm dialog', () => {
    function makeSavableComponent(creditEstimate: unknown) {
      const key = { ...KEY, locales: { ...KEY.locales, th: { ...KEY.locales.th, creditEstimate } } };
      const submit = jasmine
        .createSpy('submitNotificationMessage')
        .and.returnValue(of({ code: 200, message: 'OK', data: null }));
      const { component } = makeComponent({
        getNotificationMessageByCode: jasmine
          .createSpy()
          .and.returnValue(of({ code: 200, message: 'OK', data: key })),
        previewNotificationMessageCredit: jasmine.createSpy().and.returnValue(new Subject<any>()),
        submitNotificationMessage: submit,
      });
      component.ngOnInit();
      return { component, submit };
    }

    it('holds the submit back and opens the dialog when the cost went up', () => {
      const { component, submit } = makeSavableComponent({ credits: 3, baselineCredits: 2, encoding: 'GSM7' });

      component['onSaveRequested']('longer text');

      expect(component['creditRise']).toBeTrue();
      expect(component['creditRiseBody']).toBe('longer text');
      expect(submit).not.toHaveBeenCalled();
    });

    // The figures are snapshotted at click time: a preview landing while the
    // dialog is open must not move the numbers under a "cost went up" title.
    it('freezes the figures shown in the dialog at the moment Save was clicked', () => {
      const { component } = makeSavableComponent({ credits: 3, baselineCredits: 2, encoding: 'GSM7' });

      component['onSaveRequested']('longer text');
      component['creditEstimate'] = { credits: 1, baselineCredits: 2, encoding: 'GSM7' } as any;

      expect(component['creditRiseFrom']).toBe(2);
      expect(component['creditRiseTo']).toBe(3);
    });

    it('a one-credit rise is enough — there is no sub-credit rise to wave through', () => {
      const { component, submit } = makeSavableComponent({ credits: 2, baselineCredits: 1, encoding: 'UCS2' });

      component['onSaveRequested']('one segment longer');

      expect(component['creditRiseBody']).toBe('one segment longer');
      expect(submit).not.toHaveBeenCalled();
    });

    it('submits the held-back body on confirm', async () => {
      const { component, submit } = makeSavableComponent({ credits: 3, baselineCredits: 2, encoding: 'GSM7' });
      component['onSaveRequested']('longer text');

      component['onCreditRiseConfirm']();
      await Promise.resolve();

      expect(submit).toHaveBeenCalledWith({
        messageCode: 'notification.sms.payment.confirmed',
        locale: 'th',
        body: 'longer text',
      });
      expect(component['creditRiseBody']).toBeNull();
    });

    it('cancel submits nothing and closes the dialog (the typed text is never touched)', () => {
      const { component, submit } = makeSavableComponent({ credits: 3, baselineCredits: 2, encoding: 'GSM7' });
      component['onSaveRequested']('longer text');

      component['onCreditRiseCancel']();

      expect(submit).not.toHaveBeenCalled();
      expect(component['creditRiseBody']).toBeNull();
    });

    it('a FALL saves straight through with no dialog', async () => {
      const { component, submit } = makeSavableComponent({ credits: 1, baselineCredits: 3, encoding: 'GSM7' });

      component['onSaveRequested']('shorter text');
      await Promise.resolve();

      expect(component['creditRise']).toBeFalse();
      expect(component['creditRiseBody']).toBeNull();
      expect(submit).toHaveBeenCalled();
    });

    it('NO CHANGE saves straight through with no dialog', async () => {
      const { component, submit } = makeSavableComponent({ credits: 2, baselineCredits: 2, encoding: 'GSM7' });

      component['onSaveRequested']('same cost text');
      await Promise.resolve();

      expect(component['creditRise']).toBeFalse();
      expect(submit).toHaveBeenCalled();
    });

    it('a non-SMS key never opens the dialog even if an estimate somehow arrived', async () => {
      const key = {
        ...KEY,
        channels: ['EMAIL'],
        locales: { ...KEY.locales, th: { ...KEY.locales.th, creditEstimate: { credits: 3, baselineCredits: 2, encoding: 'GSM7' } } },
      };
      const submit = jasmine
        .createSpy('submitNotificationMessage')
        .and.returnValue(of({ code: 200, message: 'OK', data: null }));
      const { component } = makeComponent({
        getNotificationMessageByCode: jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: key })),
        submitNotificationMessage: submit,
      });
      component.ngOnInit();

      component['onSaveRequested']('body');
      await Promise.resolve();

      expect(component['creditRise']).toBeFalse();
      expect(submit).toHaveBeenCalled();
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

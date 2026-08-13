import { HttpErrorResponse } from '@angular/common/http';
import { convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NotificationMessageReviewDetailPageComponent } from './notification-message-review-detail-page.component';
import { createTranslateStub } from '../../../../testing/test-stubs';

/** Deliberately NOT stubbing `hasAnyRole` — see the queue-page spec's header
 * for why this is the correct thing to leave un-stubbed on this exact test. */
function makeAuthStub(roles: string[]) {
  return {
    getRoles: jasmine.createSpy('getRoles').and.returnValue(roles),
    hasAnyRole: jasmine.createSpy('hasAnyRole (must never be called by this component)'),
  };
}

function makeRouteStub(id: string) {
  return { paramMap: of(convertToParamMap({ id })) };
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

function makeQueueStoreStub() {
  return { refresh: jasmine.createSpy('refresh').and.resolveTo(undefined) };
}

const DETAIL = {
  id: 42,
  messageCode: 'notification.sms.payment.confirmed',
  locale: 'th',
  status: 'PENDING',
  oldBody: 'old text',
  newBody: 'new text {0}',
  placeholderIndices: [0],
  proposedBy: 'owner1',
  proposedAt: '2026-08-13T00:00:00Z',
  creditEstimate: { credits: 3, baselineCredits: 2, encoding: 'GSM7' },
};

function makeComponent(
  roles: string[],
  adminApi: Record<string, unknown>,
  id = '42'
) {
  const auth = makeAuthStub(roles);
  const route = makeRouteStub(id);
  const router = makeRouterStub();
  const alert = makeAlertStub();
  const queueStore = makeQueueStoreStub();
  const component = new NotificationMessageReviewDetailPageComponent(
    auth as any,
    route as any,
    router as any,
    adminApi as any,
    queueStore as any,
    alert as any,
    createTranslateStub()
  );
  return { component, auth, route, router, alert, queueStore };
}

/**
 * OBRS-1308 AC5 — the MORE important half of the frontend gate: this is the
 * bell's direct click-through target (`reviews/:id`), so a leaked/guessed
 * URL reaches this component before any other. Verified in the worktree
 * (Scrutinize): `getRoles()` is the raw, un-expanded read; the gate must be
 * the first line of `ngOnInit`, before the one-off `GET .../reviews/{id}`.
 */
describe('NotificationMessageReviewDetailPageComponent (AC5)', () => {
  it('denies a plain owner deep-linking reviews/:id — access-denied, ZERO GET request, getRoles asked (never hasAnyRole)', () => {
    const getDetail = jasmine.createSpy('getNotificationMessageReviewById');
    const { component, auth } = makeComponent(['owner'], {
      getNotificationMessageReviewById: getDetail,
    });

    component.ngOnInit();

    expect(component['accessDenied']).toBeTrue();
    expect(auth.getRoles).toHaveBeenCalled();
    expect(auth.hasAnyRole).not.toHaveBeenCalled();
    expect(getDetail).not.toHaveBeenCalled();
    expect(component['detail']).toBeNull();
  });

  it('denies a customer session the same way', () => {
    const getDetail = jasmine.createSpy('getNotificationMessageReviewById');
    const { component } = makeComponent(['customer'], {
      getNotificationMessageReviewById: getDetail,
    });
    component.ngOnInit();
    expect(component['accessDenied']).toBeTrue();
    expect(getDetail).not.toHaveBeenCalled();
  });

  it('admits an admin session and fetches the detail', () => {
    const getDetail = jasmine
      .createSpy('getNotificationMessageReviewById')
      .and.returnValue(of({ code: 200, message: 'OK', data: DETAIL }));
    const { component } = makeComponent(['admin'], {
      getNotificationMessageReviewById: getDetail,
    });

    component.ngOnInit();

    expect(component['accessDenied']).toBeFalse();
    expect(getDetail).toHaveBeenCalledWith(42);
    expect(component['detail']).toEqual(DETAIL as any);
  });

  it('shows the approve/reject actions only while PENDING', () => {
    const getDetail = jasmine
      .createSpy('getNotificationMessageReviewById')
      .and.returnValue(of({ code: 200, message: 'OK', data: DETAIL }));
    const { component } = makeComponent(['admin'], {
      getNotificationMessageReviewById: getDetail,
    });
    component.ngOnInit();
    expect(component['showActions']).toBeTrue();

    component['detail'] = { ...DETAIL, status: 'APPROVED' } as any;
    expect(component['showActions']).toBeFalse();
  });
});

describe('NotificationMessageReviewDetailPageComponent — approve/reject (admin session)', () => {
  it('approve: 200 shows the success toast and flips local status to APPROVED', async () => {
    const approve = jasmine.createSpy('approveNotificationMessageReview').and.returnValue(of({ code: 200, message: 'OK' }));
    const getDetail = jasmine.createSpy('getNotificationMessageReviewById').and.returnValue(of({ code: 200, message: 'OK', data: DETAIL }));
    const { component, alert } = makeComponent(['admin'], {
      getNotificationMessageReviewById: getDetail,
      approveNotificationMessageReview: approve,
    });
    component.ngOnInit();

    await component['onApprove']();

    expect(approve).toHaveBeenCalledWith(42);
    expect(alert.success).toHaveBeenCalled();
    expect(component['detail']?.status).toBe('APPROVED');
  });

  it('approve: 409 shows ALREADY_HANDLED and reloads the detail read-only', async () => {
    const approve = jasmine.createSpy('approveNotificationMessageReview').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409 }))
    );
    const getDetail = jasmine.createSpy('getNotificationMessageReviewById').and.returnValue(of({ code: 200, message: 'OK', data: DETAIL }));
    const { component, alert } = makeComponent(['admin'], {
      getNotificationMessageReviewById: getDetail,
      approveNotificationMessageReview: approve,
    });
    component.ngOnInit();

    await component['onApprove']();

    expect(component['alreadyHandled']).toBeTrue();
    expect(alert.error).toHaveBeenCalled();
    // Reload fires again after the 409.
    expect(getDetail).toHaveBeenCalledTimes(2);
  });

  it('reject: confirm(reason) posts the reason, closes the dialog, shows the success toast', async () => {
    const reject = jasmine.createSpy('rejectNotificationMessageReview').and.returnValue(of({ code: 200, message: 'OK' }));
    const getDetail = jasmine.createSpy('getNotificationMessageReviewById').and.returnValue(of({ code: 200, message: 'OK', data: DETAIL }));
    const { component, alert } = makeComponent(['admin'], {
      getNotificationMessageReviewById: getDetail,
      rejectNotificationMessageReview: reject,
    });
    component.ngOnInit();
    component['onOpenRejectDialog']();
    expect(component['rejectDialogVisible']).toBeTrue();

    await component['onConfirmReject']('too aggressive wording');

    expect(reject).toHaveBeenCalledWith(42, 'too aggressive wording');
    expect(component['rejectDialogVisible']).toBeFalse();
    expect(alert.success).toHaveBeenCalled();
    expect(component['detail']?.status).toBe('REJECTED');
  });

  it('back navigation refreshes the review queue store and returns to the queue', () => {
    const getDetail = jasmine.createSpy('getNotificationMessageReviewById').and.returnValue(of({ code: 200, message: 'OK', data: DETAIL }));
    const { component, router, queueStore } = makeComponent(['admin'], {
      getNotificationMessageReviewById: getDetail,
    });
    component.ngOnInit();

    component['onBack']();

    expect(queueStore.refresh).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/admin/settings/notification-messages/reviews']);
  });
});

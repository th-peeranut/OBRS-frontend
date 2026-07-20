import { BehaviorSubject, of, throwError } from 'rxjs';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { ParcelVerifyListPageComponent } from './parcel-verify-list-page.component';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';
import { ParcelVerifyFormValue } from '../../components/parcel-verify-dialog/parcel-verify-dialog.component';
import { createTranslateStub } from '../../../../testing/test-stubs';
import enI18n from '../../../../../../public/i18n/en.json';
import thI18n from '../../../../../../public/i18n/th.json';
import zhI18n from '../../../../../../public/i18n/zh.json';

function makeRouteStub(scheduleId: string): ActivatedRoute {
  return { snapshot: { paramMap: convertToParamMap({ scheduleId }) } } as unknown as ActivatedRoute;
}

function makeRow(overrides: Partial<ParcelDeliveryListItemDto> = {}): ParcelDeliveryListItemDto {
  return {
    parcelId: 1,
    trackingNumber: 'PCL-1',
    senderName: 'Somchai',
    senderPhone: '0812345678',
    recipientName: 'Somsri',
    recipientPhone: '0898765432',
    pickupStop: { name: 'Bangkok' },
    dropoffStop: { name: 'Chiang Mai' },
    weightKg: 5,
    deliveryStatus: 'created',
    bookingStatus: 'confirmed',
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    amount: 350,
    ...overrides,
  };
}

function makeFormValue(overrides: Partial<ParcelVerifyFormValue> = {}): ParcelVerifyFormValue {
  return {
    actualWeightKg: 5,
    actualLengthCm: 30,
    actualWidthCm: 20,
    actualHeightCm: 15,
    ...overrides,
  };
}

function makeStoreStub(rows: unknown[] = []): any {
  return {
    data$: new BehaviorSubject<unknown[]>(rows),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    setScheduleId: jasmine.createSpy('setScheduleId'),
    refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()),
    mutate: jasmine.createSpy('mutate').and.callFake(function (this: any, fn: (rows: unknown[]) => unknown[]) {
      this.data$.next(fn(this.data$.value));
    }),
  };
}

function makeAlertStub(confirmResolvesTo = true): any {
  return {
    toast: jasmine.createSpy('toast'),
    confirm: jasmine.createSpy('confirm').and.returnValue(Promise.resolve(confirmResolvesTo)),
  };
}

function makeComponent(
  store: any,
  staffApi: any = {},
  alertService: any = makeAlertStub(),
  scheduleId = '42'
): ParcelVerifyListPageComponent {
  const component = new ParcelVerifyListPageComponent(
    makeRouteStub(scheduleId),
    staffApi,
    alertService,
    createTranslateStub(),
    store
  );
  component.ngOnInit();
  return component;
}

describe('ParcelVerifyListPageComponent', () => {
  it('should be created', () => {
    const component = makeComponent(makeStoreStub());
    expect(component).toBeTruthy();
  });

  it('sets the schedule id on the store and refreshes on init', () => {
    const store = makeStoreStub();
    const component = makeComponent(store);
    expect(store.setScheduleId).toHaveBeenCalledWith(42);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('openVerifyDialog()/closeVerifyDialog() toggle the dialog state', () => {
    const component = makeComponent(makeStoreStub());
    component['openVerifyDialog'](makeRow({ parcelId: 7 }));
    expect(component['dialogParcel']?.parcelId).toBe(7);

    component['closeVerifyDialog']();
    expect(component['dialogParcel']).toBeNull();
  });

  it('refuses to open the dialog for a booking-not-confirmed row', () => {
    const component = makeComponent(makeStoreStub());
    component['openVerifyDialog'](makeRow({ bookingStatus: 'expired' }));
    expect(component['dialogParcel']).toBeNull();
  });

  describe('confirmAccept()', () => {
    it('calls verifyParcel with outcome=accept, removes the row silently on success (no toast)', () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub();
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          of({ code: 200, message: 'OK', data: { parcelId: 7, deliveryStatus: 'accepted', refundAmount: null, refundStatus: null } })
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      component['confirmAccept'](makeFormValue());

      expect(staffApi.verifyParcel).toHaveBeenCalledWith(
        7,
        jasmine.objectContaining({ outcome: 'accept', actualWeightKg: 5 })
      );
      expect(component['dialogParcel']).toBeNull();
      expect(component['rows'].find((r) => r.parcelId === 7)).toBeUndefined();
      expect(alertService.toast).not.toHaveBeenCalled();
    });

    it('does nothing when no parcel is open in the dialog', () => {
      const staffApi = { verifyParcel: jasmine.createSpy() } as any;
      const component = makeComponent(makeStoreStub(), staffApi);
      component['confirmAccept'](makeFormValue());
      expect(staffApi.verifyParcel).not.toHaveBeenCalled();
    });
  });

  describe('onConfirmReject()', () => {
    it('shows AlertService.confirm() stating the refund amount BEFORE calling verifyParcel', async () => {
      const store = makeStoreStub([makeRow({ parcelId: 7, amount: 350 })]);
      const alertService = makeAlertStub(true);
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          of({ code: 200, message: 'OK', data: { parcelId: 7, deliveryStatus: 'rejected', refundAmount: 350, refundStatus: 'refunded' } })
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7, amount: 350 }));

      await component['onConfirmReject'](makeFormValue({ rejectReason: 'Damaged' }));

      expect(alertService.confirm).toHaveBeenCalled();
      expect(staffApi.verifyParcel).toHaveBeenCalledWith(
        7,
        jasmine.objectContaining({ outcome: 'reject', rejectReason: 'Damaged' })
      );
    });

    it('does NOT call verifyParcel when the staff member cancels the confirm alert', async () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub(false);
      const staffApi = { verifyParcel: jasmine.createSpy() } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      await component['onConfirmReject'](makeFormValue({ rejectReason: 'Damaged' }));

      expect(staffApi.verifyParcel).not.toHaveBeenCalled();
      // dialog stays open, values preserved
      expect(component['dialogParcel']?.parcelId).toBe(7);
    });

    it('shows a REFUNDED toast (success icon) when refundStatus is a real gateway refund', async () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub(true);
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          of({ code: 200, message: 'OK', data: { parcelId: 7, deliveryStatus: 'rejected', refundAmount: 350, refundStatus: 'refunded' } })
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      await component['onConfirmReject'](makeFormValue({ rejectReason: 'Damaged' }));

      expect(alertService.toast).toHaveBeenCalledWith(
        'STAFF.PARCEL_VERIFY.SUCCESS.REJECTED_REFUNDED',
        'success'
      );
    });

    it('shows a DIFFERENT, non-misleading toast (warning icon) when refundStatus is manual_refund_required', async () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub(true);
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          of({
            code: 200,
            message: 'OK',
            data: { parcelId: 7, deliveryStatus: 'rejected', refundAmount: 350, refundStatus: 'manual_refund_required' },
          })
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      await component['onConfirmReject'](makeFormValue({ rejectReason: 'Cash payment, no charge id' }));

      expect(alertService.toast).toHaveBeenCalledWith(
        'STAFF.PARCEL_VERIFY.SUCCESS.REJECTED_MANUAL_REFUND',
        'warning'
      );
    });
  });

  describe('error handling', () => {
    it('reads PARCEL_NOT_CREATED_STATE (409) as INFORMATION, not a user failure — info icon, dialog closes, list refreshes', () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub();
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          throwError(() => ({ error: { errorCode: 'PARCEL_NOT_CREATED_STATE' } }))
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      component['confirmAccept'](makeFormValue());

      expect(alertService.toast).toHaveBeenCalledWith(
        'STAFF.PARCEL_VERIFY.ERROR.ALREADY_VERIFIED',
        'info'
      );
      expect(component['dialogParcel']).toBeNull();
      expect(store.refresh).toHaveBeenCalledTimes(2); // once on init, once on error re-sync
    });

    it('maps PARCEL_BOOKING_NOT_CONFIRMED (409, race) to its own error-icon toast', () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub();
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          throwError(() => ({ error: { errorCode: 'PARCEL_BOOKING_NOT_CONFIRMED' } }))
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      component['confirmAccept'](makeFormValue());

      expect(alertService.toast).toHaveBeenCalledWith(
        'STAFF.PARCEL_VERIFY.ERROR.BOOKING_NOT_CONFIRMED',
        'error'
      );
    });

    it('maps a 404 (PARCEL_ERROR_ID_NOT_FOUND) to the NOT_FOUND error-icon toast', () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub();
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          throwError(() => ({ error: { errorCode: 'PARCEL_ERROR_ID_NOT_FOUND' } }))
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      component['confirmAccept'](makeFormValue());

      expect(alertService.toast).toHaveBeenCalledWith('STAFF.PARCEL_VERIFY.ERROR.NOT_FOUND', 'error');
    });

    it('falls back to WRONG_STATE (error icon) for an unmapped errorCode', () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub();
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          throwError(() => ({ error: { errorCode: 'PARCEL_VERIFY_NOT_CONSIGNED' } }))
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      component['confirmAccept'](makeFormValue());

      expect(alertService.toast).toHaveBeenCalledWith('STAFF.PARCEL_VERIFY.ERROR.WRONG_STATE', 'error');
    });

    it('a 400 PARCEL_VERIFY_REJECT_REASON_REQUIRED renders inline and keeps the dialog OPEN (no toast, no refresh)', () => {
      const store = makeStoreStub([makeRow({ parcelId: 7 })]);
      const alertService = makeAlertStub();
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          throwError(() => ({ error: { errorCode: 'PARCEL_VERIFY_REJECT_REASON_REQUIRED' } }))
        ),
      } as any;
      const component = makeComponent(store, staffApi, alertService);
      component['openVerifyDialog'](makeRow({ parcelId: 7 }));

      component['confirmAccept'](makeFormValue());

      expect(component['verifyErrorKey']).toBe('STAFF.PARCEL_VERIFY.ERROR.VALIDATION');
      expect(component['dialogParcel']?.parcelId).toBe(7); // stays open so staff can retry
      expect(alertService.toast).not.toHaveBeenCalled();
      expect(store.refresh).toHaveBeenCalledTimes(1); // only the initial load, no re-sync
    });
  });

  it('paymentFlagFor()/isRowBlocked() reuse the shared OBRS-396 lib verbatim', () => {
    const component = makeComponent(makeStoreStub());
    const blockedRow = makeRow({ bookingStatus: 'pending' });
    const okRow = makeRow({ bookingStatus: 'confirmed' });

    expect(component['paymentFlagFor'](blockedRow)?.i18nKey).toBe('STAFF.PARCEL_DELIVERY.PAYMENT.PENDING');
    expect(component['isRowBlocked'](blockedRow)).toBeTrue();
    expect(component['paymentFlagFor'](okRow)).toBeNull();
    expect(component['isRowBlocked'](okRow)).toBeFalse();
  });

  it('declaredDimensionsLabel() renders a dash when any dimension is missing', () => {
    const component = makeComponent(makeStoreStub());
    expect(component['declaredDimensionsLabel'](makeRow({ lengthCm: null }))).toBe('-');
    expect(component['declaredDimensionsLabel'](makeRow({ lengthCm: 30, widthCm: 20, heightCm: 15 }))).toBe('30×20×15 cm');
  });

  // OBRS-548. The reject-confirm copy used to name {{recipient}}, which was wrong twice
  // over: the SENDER pays for a consigned parcel (so the refund never reaches the
  // recipient), and `recipientName` is nullable in the schema, so ngx-translate rendered
  // the literal string "{{recipient}}" onto the staff member's screen. These assert the
  // rendered EFFECT against the three real locale files, not just the call shape — a
  // stub that echoes the key back would happily pass a string still full of placeholders.
  describe('reject-confirm copy (OBRS-548)', () => {
    const BODIES: ReadonlyArray<readonly [string, string]> = [
      ['en', enI18n.STAFF.PARCEL_VERIFY.REJECT_CONFIRM.BODY],
      ['th', thI18n.STAFF.PARCEL_VERIFY.REJECT_CONFIRM.BODY],
      ['zh', zhI18n.STAFF.PARCEL_VERIFY.REJECT_CONFIRM.BODY],
    ];

    /** ngx-translate's default interpolation, reduced to what this key needs. */
    function interpolate(template: string, params: Record<string, unknown>): string {
      return template.replace(/{{\s*([^{}\s]+)\s*}}/g, (whole, name) =>
        params[name] == null ? whole : String(params[name])
      );
    }

    /** Runs a real reject with a null-recipient row and returns the BODY params sent. */
    async function captureBodyParams(): Promise<Record<string, unknown>> {
      const row = makeRow({ parcelId: 7, amount: 350, recipientName: null });
      const translate = createTranslateStub();
      translate.instant = jasmine.createSpy('instant').and.callFake((key: string) => key);
      const staffApi = {
        verifyParcel: jasmine.createSpy().and.returnValue(
          of({ code: 200, message: 'OK', data: { parcelId: 7, deliveryStatus: 'rejected', refundAmount: 350, refundStatus: 'refunded' } })
        ),
      } as any;
      const component = new ParcelVerifyListPageComponent(
        makeRouteStub('42'),
        staffApi,
        makeAlertStub(true),
        translate,
        makeStoreStub([row])
      );
      component.ngOnInit();
      component['openVerifyDialog'](row);
      await component['onConfirmReject'](makeFormValue({ rejectReason: 'Damaged' }));

      const call = translate.instant.calls
        .allArgs()
        .find(([key]: [string]) => key === 'STAFF.PARCEL_VERIFY.REJECT_CONFIRM.BODY');
      expect(call).withContext('BODY was never translated').toBeDefined();
      return call[1] as Record<string, unknown>;
    }

    it('never asks for a person name — the refund goes to the payment channel', async () => {
      const params = await captureBodyParams();

      expect(params['recipient']).toBeUndefined();
      for (const [lang, body] of BODIES) {
        expect(body).withContext(`${lang} still names {{recipient}}`).not.toContain('{{recipient}}');
      }
    });

    it('leaves no raw {{token}} on screen in any locale when recipientName is null', async () => {
      const params = await captureBodyParams();

      for (const [lang, body] of BODIES) {
        const rendered = interpolate(body, params);
        expect(rendered)
          .withContext(`${lang} rendered an un-interpolated token: ${rendered}`)
          .not.toMatch(/{{.*}}/);
      }
    });
  });

  it('cleans up on destroy without throwing', () => {
    const component = makeComponent(makeStoreStub());
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

import { BehaviorSubject, of, throwError } from 'rxjs';
import { convertToParamMap, ActivatedRoute } from '@angular/router';
import { ParcelDeliveryListPageComponent } from './parcel-delivery-list-page.component';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

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
    deliveryStatus: 'accepted',
    // Mirror what a post-OBRS-359 backend actually sends for an everyday row:
    // a paid booking. The unpaid row is built explicitly, and the field being
    // absent (an older backend) is its own test — never the silent default.
    bookingStatus: 'confirmed',
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

function makeAlertStub(): any {
  return { toast: jasmine.createSpy('toast') };
}

describe('ParcelDeliveryListPageComponent', () => {
  it('should be created', () => {
    const staffApi = {} as any;
    const store = makeStoreStub();
    const component = new ParcelDeliveryListPageComponent(
      makeRouteStub('42'),
      staffApi,
      makeAlertStub(),
      createTranslateStub(),
      store
    );
    expect(component).toBeTruthy();
  });

  it('sets the schedule id on the store and refreshes on init', () => {
    const store = makeStoreStub();
    const component = new ParcelDeliveryListPageComponent(
      makeRouteStub('42'),
      {} as any,
      makeAlertStub(),
      createTranslateStub(),
      store
    );
    component.ngOnInit();
    expect(store.setScheduleId).toHaveBeenCalledWith(42);
    expect(store.refresh).toHaveBeenCalled();
  });

  it('onLoad() disables the row, then applies the SERVER deliveryStatus on success (not an optimistic guess)', () => {
    const store = makeStoreStub([makeRow({ deliveryStatus: 'accepted' })]);
    const staffApi = {
      loadParcel: jasmine.createSpy().and.returnValue(of({ code: 200, message: 'OK', data: { deliveryStatus: 'in_transit' } })),
    } as any;
    const component = new ParcelDeliveryListPageComponent(makeRouteStub('42'), staffApi, makeAlertStub(), createTranslateStub(), store);
    component.ngOnInit();

    component['onLoad'](makeRow({ deliveryStatus: 'accepted' }));

    expect(staffApi.loadParcel).toHaveBeenCalledWith(1);
    expect(component['isRowBusy'](1)).toBeFalse(); // synchronous `of()` resolves immediately
    expect(component['rows'][0].deliveryStatus).toBe('in_transit');
  });

  it('on a wrong-state 409, shows a toast and re-syncs via store.refresh() (not an optimistic flip)', () => {
    const store = makeStoreStub([makeRow({ deliveryStatus: 'accepted' })]);
    const alertService = makeAlertStub();
    const staffApi = {
      loadParcel: jasmine.createSpy().and.returnValue(
        throwError(() => ({ error: { errorCode: 'PARCEL_WRONG_STATE' } }))
      ),
    } as any;
    const component = new ParcelDeliveryListPageComponent(makeRouteStub('42'), staffApi, alertService, createTranslateStub(), store);
    component.ngOnInit();

    component['onLoad'](makeRow());

    expect(alertService.toast).toHaveBeenCalled();
    expect(store.refresh).toHaveBeenCalledTimes(2); // once on init, once on error re-sync
    expect(component['isRowBusy'](1)).toBeFalse();
  });

  it('openCollectDialog()/closeCollectDialog() toggle the dialog state', () => {
    const store = makeStoreStub();
    const component = new ParcelDeliveryListPageComponent(makeRouteStub('42'), {} as any, makeAlertStub(), createTranslateStub(), store);

    component['openCollectDialog'](makeRow({ parcelId: 7 }));
    expect(component['collectDialogParcelId']).toBe(7);

    component['closeCollectDialog']();
    expect(component['collectDialogParcelId']).toBeNull();
  });

  it('confirmCollect() calls collectParcel and closes the dialog on success', () => {
    const store = makeStoreStub([makeRow({ parcelId: 7, deliveryStatus: 'arrived_notified' })]);
    const staffApi = {
      collectParcel: jasmine.createSpy().and.returnValue(
        of({ code: 200, message: 'OK', data: { deliveryStatus: 'collected', collectedAt: '2026-07-14T09:00:00Z', collectedBy: 5 } })
      ),
    } as any;
    const component = new ParcelDeliveryListPageComponent(makeRouteStub('42'), staffApi, makeAlertStub(), createTranslateStub(), store);
    component.ngOnInit();
    component['openCollectDialog'](makeRow({ parcelId: 7 }));

    component['confirmCollect']('ABC123');

    expect(staffApi.collectParcel).toHaveBeenCalledWith(7, { collectionCode: 'ABC123' });
    expect(component['collectDialogParcelId']).toBeNull();
    expect(component['rows'][0].deliveryStatus).toBe('collected');
  });

  it('confirmCollect() surfaces a mapped inline error and keeps the dialog open on 409', () => {
    const store = makeStoreStub([makeRow({ parcelId: 7, deliveryStatus: 'arrived_notified' })]);
    const staffApi = {
      collectParcel: jasmine.createSpy().and.returnValue(
        throwError(() => ({ error: { errorCode: 'PARCEL_COLLECT_CODE_MISMATCH' } }))
      ),
    } as any;
    const component = new ParcelDeliveryListPageComponent(makeRouteStub('42'), staffApi, makeAlertStub(), createTranslateStub(), store);
    component.ngOnInit();
    component['openCollectDialog'](makeRow({ parcelId: 7 }));

    component['confirmCollect']('WRONG');

    expect(component['collectErrorKey']).toBe('STAFF.PARCEL_DELIVERY.ERROR.CODE_MISMATCH');
    expect(component['collectDialogParcelId']).toBe(7); // stays open so staff can retry
  });

  describe('OBRS-396 — unpaid rows are flagged and blocked, never hidden', () => {
    function makeComponent(rows: ParcelDeliveryListItemDto[], staffApi: any = {}) {
      const store = makeStoreStub(rows);
      const component = new ParcelDeliveryListPageComponent(
        makeRouteStub('42'),
        staffApi,
        makeAlertStub(),
        createTranslateStub(),
        store
      );
      component.ngOnInit();
      return component;
    }

    it('keeps the unpaid row in the list (product decision: staff hold the box, the row must not vanish)', () => {
      const component = makeComponent([
        makeRow({ parcelId: 1, bookingStatus: 'pending' }),
        makeRow({ parcelId: 2, bookingStatus: 'confirmed' }),
      ]);
      expect(component['rows'].length).toBe(2);
    });

    it('flags a pending row and blocks its actions', () => {
      const component = makeComponent([makeRow({ bookingStatus: 'pending' })]);
      const row = component['rows'][0];
      expect(component['paymentFlagFor'](row)?.i18nKey).toBe('STAFF.PARCEL_DELIVERY.PAYMENT.PENDING');
      expect(component['isRowBlocked'](row)).toBeTrue();
    });

    it('flags an expired row and blocks its actions', () => {
      const component = makeComponent([makeRow({ bookingStatus: 'expired' })]);
      const row = component['rows'][0];
      expect(component['paymentFlagFor'](row)?.i18nKey).toBe('STAFF.PARCEL_DELIVERY.PAYMENT.EXPIRED');
      expect(component['isRowBlocked'](row)).toBeTrue();
    });

    it('leaves a paid row completely untouched — no badge, not blocked (no regression)', () => {
      const component = makeComponent([makeRow({ bookingStatus: 'confirmed' })]);
      const row = component['rows'][0];
      expect(component['paymentFlagFor'](row)).toBeNull();
      expect(component['isRowBlocked'](row)).toBeFalse();
    });

    it('stays usable when the backend omits bookingStatus (pre-OBRS-359 backend must not brick the page)', () => {
      const component = makeComponent([makeRow({ bookingStatus: undefined })]);
      const row = component['rows'][0];
      expect(component['paymentFlagFor'](row)).toBeNull();
      expect(component['isRowBlocked'](row)).toBeFalse();
    });

    it('refuses to open the collect dialog for an unpaid row, even if the disabled button is bypassed', () => {
      const component = makeComponent([makeRow({ parcelId: 7, deliveryStatus: 'arrived_notified', bookingStatus: 'expired' })]);
      component['openCollectDialog'](component['rows'][0]);
      expect(component['collectDialogParcelId']).toBeNull();
    });

    it('maps the 409 PARCEL_BOOKING_NOT_CONFIRMED race to its own message, not the generic wrong-state one', () => {
      const alertService = makeAlertStub();
      const store = makeStoreStub([makeRow()]);
      const staffApi = {
        loadParcel: jasmine.createSpy().and.returnValue(
          throwError(() => ({ error: { errorCode: 'PARCEL_BOOKING_NOT_CONFIRMED' } }))
        ),
      } as any;
      const component = new ParcelDeliveryListPageComponent(
        makeRouteStub('42'),
        staffApi,
        alertService,
        createTranslateStub(),
        store
      );
      component.ngOnInit();

      // A row that was paid when the page loaded, but expired while it sat open.
      component['onLoad'](makeRow());

      expect(alertService.toast).toHaveBeenCalledWith(
        'STAFF.PARCEL_DELIVERY.ERROR.BOOKING_NOT_CONFIRMED',
        'error'
      );
      expect(store.refresh).toHaveBeenCalledTimes(2); // re-sync so the badge appears
    });
  });

  // OBRS-1345: leave-at-stop. The photo IS the transition, so the tests worth
  // having are the ones that prove the row never claims a drop-off the server
  // did not record, and that the driver is always told when it did not.
  describe('leave at stop (OBRS-1345)', () => {
    function fileChangeEvent(file: File | null): Event {
      const input = { files: file ? [file] : [], value: 'C:\\fakepath\\drop.jpg' } as unknown as HTMLInputElement;
      return { target: input } as unknown as Event;
    }

    const photo = new File(['x'], 'drop.jpg', { type: 'image/jpeg' });

    function componentWith(rows: ParcelDeliveryListItemDto[], staffApi: any) {
      const component = new ParcelDeliveryListPageComponent(
        makeRouteStub('42'), staffApi, makeAlertStub(), createTranslateStub(), makeStoreStub(rows)
      );
      component.ngOnInit();
      return component;
    }

    it('sends the chosen photo and writes back the SERVER status, time and url', () => {
      const row = makeRow({ parcelId: 7, deliveryStatus: 'arrived_notified' });
      const store = makeStoreStub([row]);
      const staffApi = {
        leaveParcelAtStop: jasmine.createSpy().and.returnValue(
          of({
            data: {
              deliveryStatus: 'left_at_stop',
              leftAtStopAt: '2026-08-14T10:00:00Z',
              leftAtStopBy: 3,
              photoUrl: 'https://sb.example/p.jpg',
            },
          })
        ),
      } as any;
      const component = new ParcelDeliveryListPageComponent(
        makeRouteStub('42'), staffApi, makeAlertStub(), createTranslateStub(), store
      );
      component.ngOnInit();

      component['onLeaveAtStopPhotoChosen'](row, fileChangeEvent(photo));

      expect(staffApi.leaveParcelAtStop).toHaveBeenCalledWith(7, photo);
      const updated = (store.data$.value as ParcelDeliveryListItemDto[])[0];
      expect(updated.deliveryStatus).toBe('left_at_stop');
      // The claim window starts at the SERVER's stamp (OBRS-629 Q8) - the page
      // must never substitute a locally computed time here.
      expect(updated.leftAtStopAt).toBe('2026-08-14T10:00:00Z');
      expect(updated.leftAtStopPhotoUrl).toBe('https://sb.example/p.jpg');
    });

    it('a failed upload leaves the row untouched and TELLS the driver - it must never look delivered', () => {
      const row = makeRow({ parcelId: 7, deliveryStatus: 'arrived_notified' });
      const store = makeStoreStub([row]);
      const alertService = makeAlertStub();
      const staffApi = {
        leaveParcelAtStop: jasmine.createSpy().and.returnValue(
          throwError(() => ({ error: { errorCode: 'PARCEL_PHOTO_TOO_LARGE' } }))
        ),
      } as any;
      const component = new ParcelDeliveryListPageComponent(
        makeRouteStub('42'), staffApi, alertService, createTranslateStub(), store
      );
      component.ngOnInit();

      component['onLeaveAtStopPhotoChosen'](row, fileChangeEvent(photo));

      expect(alertService.toast).toHaveBeenCalledWith('STAFF.PARCEL_DELIVERY.ERROR.PHOTO_TOO_LARGE', 'error');
      expect((store.data$.value as ParcelDeliveryListItemDto[])[0].deliveryStatus).toBe('arrived_notified');
      expect(component['isRowBusy'](7)).toBeFalse();
    });

    it('a dismissed camera (no file) calls nothing', () => {
      const row = makeRow({ parcelId: 7, deliveryStatus: 'arrived_notified' });
      const staffApi = { leaveParcelAtStop: jasmine.createSpy() } as any;
      const component = componentWith([row], staffApi);

      component['onLeaveAtStopPhotoChosen'](row, fileChangeEvent(null));

      expect(staffApi.leaveParcelAtStop).not.toHaveBeenCalled();
    });

    it('clears the input value so retaking the SAME filename after a failure still fires', () => {
      const row = makeRow({ parcelId: 7, deliveryStatus: 'arrived_notified' });
      const staffApi = {
        leaveParcelAtStop: jasmine.createSpy().and.returnValue(of({ data: { deliveryStatus: 'left_at_stop' } })),
      } as any;
      const component = componentWith([row], staffApi);
      const event = fileChangeEvent(photo);

      component['onLeaveAtStopPhotoChosen'](row, event);

      expect((event.target as HTMLInputElement).value).toBe('');
    });
  });

  it('cleans up on destroy without throwing', () => {
    const store = makeStoreStub();
    const component = new ParcelDeliveryListPageComponent(makeRouteStub('42'), {} as any, makeAlertStub(), createTranslateStub(), store);
    component.ngOnInit();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

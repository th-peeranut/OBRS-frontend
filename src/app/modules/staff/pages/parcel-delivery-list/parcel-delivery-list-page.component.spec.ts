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

  it('cleans up on destroy without throwing', () => {
    const store = makeStoreStub();
    const component = new ParcelDeliveryListPageComponent(makeRouteStub('42'), {} as any, makeAlertStub(), createTranslateStub(), store);
    component.ngOnInit();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

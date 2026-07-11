import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { BoardingListComponent } from './boarding-list.component';
import { BoardingListItemDto, StaffApiService } from '../../../services/staff/staff-api.service';
import { AlertService } from '../../services/alert.service';
import { AuthService } from '../../../auth/auth.service';
import { BoardingListStore } from './boarding-list.store';
import { createTranslateStub } from '../../../testing/test-stubs';

function createAlertServiceStub(confirmResult = true): any {
  return {
    success: jasmine.createSpy('success').and.returnValue(Promise.resolve()),
    error: jasmine.createSpy('error').and.returnValue(Promise.resolve()),
    confirm: jasmine.createSpy('confirm').and.returnValue(Promise.resolve(confirmResult)),
  };
}

function createAuthServiceStub(opts: { canUnboard?: boolean; username?: string | null } = {}): any {
  const { canUnboard = true, username = 'operator1' } = opts;
  return {
    hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(canUnboard),
    getUsername: () => username,
  };
}

function createStoreStub(initialItems: BoardingListItemDto[] = []): any {
  const dataSubject = new BehaviorSubject<BoardingListItemDto[] | null>(initialItems);
  return {
    data$: dataSubject.asObservable(),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    hasValue: true,
    get value() {
      return dataSubject.value;
    },
    setScheduleId: jasmine.createSpy('setScheduleId'),
    refresh: () => Promise.resolve(),
    mutate: (transform: (items: BoardingListItemDto[]) => BoardingListItemDto[]) => {
      const current = dataSubject.value ?? [];
      dataSubject.next(transform(current));
    },
  };
}

function buildItem(overrides: Partial<BoardingListItemDto> = {}): BoardingListItemDto {
  return {
    ticketId: 7,
    ticketNumber: 'T-ABC123',
    seatNumber: '3',
    passengerName: 'Mr. Abc Def',
    fromStop: 'Nong chak',
    toStop: 'Bts mo chit',
    status: { code: 'confirmed', label: 'Confirmed' },
    ...overrides,
  };
}

// OBRS-100: minimal stub — printManifest()/loadTripHeader() tests construct
// their own ViewContainerRef/TemplateRef doubles where they matter; every
// other existing test never calls printManifest(), so an empty stub is fine.
function createViewContainerRefStub(): any {
  return {};
}

// OBRS-266: bare `new BoardingListComponent(...)` (unlike the TestBed suites)
// never runs inside Angular's zone, so a pass-through `run()` is enough —
// tests assert on component state directly, not on a real CD tick.
function createNgZoneStub(): any {
  return { run: (fn: () => unknown) => fn() };
}

function createComponent(
  staffApiServiceStub: any,
  storeStub: any = createStoreStub([buildItem()]),
  alertServiceStub: any = createAlertServiceStub(),
  authServiceStub: any = createAuthServiceStub(),
  viewContainerRefStub: any = createViewContainerRefStub(),
  ngZoneStub: any = createNgZoneStub()
): BoardingListComponent {
  const component = new BoardingListComponent(
    staffApiServiceStub,
    alertServiceStub,
    createTranslateStub(),
    authServiceStub,
    storeStub,
    viewContainerRefStub,
    ngZoneStub
  );
  component.scheduleId = 42;
  component.ngOnChanges({ scheduleId: {} as any });
  component.ngOnInit();
  return component;
}

describe('BoardingListComponent — single-owner re-bind (OBRS-130)', () => {
  it('ngOnChanges on scheduleId calls store.setScheduleId() and refreshes', () => {
    const store = createStoreStub([]);
    createComponent({ boardingScan: jasmine.createSpy() }, store);

    expect(store.setScheduleId).toHaveBeenCalledWith(42);
  });
});

describe('BoardingListComponent — manual boarding-scan box (OBRS-96)', () => {
  it('does nothing for an empty/whitespace-only token', async () => {
    const staffApiServiceStub = { boardingScan: jasmine.createSpy('boardingScan') };
    const component = createComponent(staffApiServiceStub);

    (component as any).scanToken = '   ';
    await component['validateScan']();

    expect(staffApiServiceStub.boardingScan).not.toHaveBeenCalled();
  });

  it('sends { token, scheduleId } from the input (not user input) on validate', async () => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            ticketId: 7,
            ticketNumber: 'T-ABC123',
            passengerName: 'Mr. Abc Def',
            seatNumber: '3',
            boardedAt: '2026-07-10T08:00:00Z',
          },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub);

    (component as any).scanToken = 'signed.jwt.token';
    await component['validateScan']();

    expect(staffApiServiceStub.boardingScan).toHaveBeenCalledWith({
      token: 'signed.jwt.token',
      scheduleId: 42,
    });
  });

  it('success: stores the scan result, clears the input, and reflects boardedAt (status-neutral, no fake status) in the list', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, status: { code: 'confirmed', label: 'Confirmed' } })]);
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            ticketId: 7,
            ticketNumber: 'T-ABC123',
            passengerName: 'Mr. Abc Def',
            seatNumber: '3',
            boardedAt: '2026-07-10T08:00:00Z',
          },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub, store);

    (component as any).scanToken = 'signed.jwt.token';
    await component['validateScan']();

    expect((component as any).scanResult).toEqual({
      ticketId: 7,
      ticketNumber: 'T-ABC123',
      passengerName: 'Mr. Abc Def',
      seatNumber: '3',
      boardedAt: '2026-07-10T08:00:00Z',
    });
    expect((component as any).scanToken).toBe('');
    expect((component as any).scanError).toBeNull();

    const boardedItem = component['items'].find((item) => item.ticketId === 7);
    // Status-neutral: the ticket lifecycle status is untouched by boarding.
    expect(boardedItem?.status.code).toBe('confirmed');
    expect(boardedItem?.boardedAt).toBe('2026-07-10T08:00:00Z');
    expect(component['isBoarded'](boardedItem!)).toBeTrue();
  });

  it('failure: maps errorCode to a distinguishable severity/icon/message and leaves scanResult untouched', async () => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { errorCode: 'ALREADY_BOARDED' },
            })
        )
      ),
    };
    const component = createComponent(staffApiServiceStub);

    (component as any).scanToken = 'already-boarded-token';
    await component['validateScan']();

    expect((component as any).scanResult).toBeNull();
    expect((component as any).scanError).toEqual({
      messageKey: 'STAFF.BOARDING.SCAN.ERROR.ALREADY_BOARDED',
      severity: 'warning',
      icon: 'how_to_reg',
    });
  });

  it('falls back to the GENERIC error when the backend omits an errorCode', async () => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(throwError(() => new Error('network down'))),
    };
    const component = createComponent(staffApiServiceStub);

    (component as any).scanToken = 'some-token';
    await component['validateScan']();

    expect((component as any).scanError?.messageKey).toBe('STAFF.BOARDING.SCAN.ERROR.GENERIC');
    expect((component as any).scanError?.severity).toBe('danger');
  });

  it('dismissScanResult() clears both the success result and the error', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy('boardingScan') });
    (component as any).scanResult = { ticketId: 1, ticketNumber: 'T-1', passengerName: 'x', seatNumber: '1', boardedAt: '' };
    (component as any).scanError = { messageKey: 'x', severity: 'danger', icon: 'error' };

    component['dismissScanResult']();

    expect((component as any).scanResult).toBeNull();
    expect((component as any).scanError).toBeNull();
  });
});

describe('BoardingListComponent — isBoarded() (OBRS-130 boarded-state migration)', () => {
  it('is true iff boardedAt is non-null, regardless of ticket status', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });

    expect(component['isBoarded'](buildItem({ boardedAt: '2026-07-10T08:00:00Z', status: { code: 'confirmed', label: 'Confirmed' } }))).toBeTrue();
    expect(component['isBoarded'](buildItem({ boardedAt: undefined, status: { code: 'checked_in', label: 'Checked in' } }))).toBeFalse();
  });
});

describe('BoardingListComponent — board() action (OBRS-130)', () => {
  it('optimistically stamps boardedAt + the current operator name, then calls staffApiService.board()', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7 })]);
    const staffApiServiceStub = { board: jasmine.createSpy('board').and.returnValue(of({ code: 200, message: 'OK', data: null })) };
    const component = createComponent(staffApiServiceStub, store, createAlertServiceStub(), createAuthServiceStub({ username: 'jane.doe' }));

    const boardPromise = component['board'](store.value[0]);
    // Optimistic update happens synchronously before the await resolves.
    expect(component['items'][0].boardedByName).toBe('jane.doe');
    expect(component['items'][0].boardedAt).toBeTruthy();

    await boardPromise;

    expect(staffApiServiceStub.board).toHaveBeenCalledWith(7);
  });

  it('reverts boardedAt/boardedByName on failure and never seeds a fake status', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, boardedAt: undefined, boardedByName: undefined })]);
    const staffApiServiceStub = {
      board: jasmine.createSpy('board').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: 'ALREADY_BOARDED' } }))
      ),
    };
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(staffApiServiceStub, store, alertServiceStub);

    await component['board'](store.value[0]);

    expect(component['items'][0].boardedAt).toBeUndefined();
    expect(component['items'][0].boardedByName).toBeUndefined();
    expect(component['items'][0].status.code).toBe('confirmed');
  });

  it('is a no-op when already boarded or already in flight', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, boardedAt: '2026-07-10T08:00:00Z' })]);
    const staffApiServiceStub = { board: jasmine.createSpy('board') };
    const component = createComponent(staffApiServiceStub, store);

    await component['board'](store.value[0]);

    expect(staffApiServiceStub.board).not.toHaveBeenCalled();
  });
});

describe('BoardingListComponent — unboard() action (OBRS-130)', () => {
  it('is hidden for a driver (canUnboard=false) — template gates on it, but the method also refuses to act', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, boardedAt: '2026-07-10T08:00:00Z' })]);
    const staffApiServiceStub = { unboard: jasmine.createSpy('unboard') };
    const component = createComponent(staffApiServiceStub, store, createAlertServiceStub(), createAuthServiceStub({ canUnboard: false }));

    expect(component['canUnboard']).toBeFalse();

    await component['unboard'](store.value[0]);

    expect(staffApiServiceStub.unboard).not.toHaveBeenCalled();
  });

  it('requires AlertService.confirm() before firing, and is a no-op on cancel', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, boardedAt: '2026-07-10T08:00:00Z' })]);
    const staffApiServiceStub = { unboard: jasmine.createSpy('unboard') };
    const alertServiceStub = createAlertServiceStub(false);
    const component = createComponent(staffApiServiceStub, store, alertServiceStub);

    await component['unboard'](store.value[0]);

    expect(alertServiceStub.confirm).toHaveBeenCalled();
    expect(staffApiServiceStub.unboard).not.toHaveBeenCalled();
    // Not reverted because nothing was mutated — boardedAt untouched.
    expect(component['items'][0].boardedAt).toBe('2026-07-10T08:00:00Z');
  });

  it('on confirm: optimistically clears boardedAt/boardedByName, then calls staffApiService.unboard()', async () => {
    const store = createStoreStub([
      buildItem({ ticketId: 7, boardedAt: '2026-07-10T08:00:00Z', boardedByName: 'jane.doe' }),
    ]);
    const staffApiServiceStub = { unboard: jasmine.createSpy('unboard').and.returnValue(of({ code: 200, message: 'OK', data: null })) };
    const component = createComponent(staffApiServiceStub, store);

    const unboardPromise = component['unboard'](store.value[0]);
    await Promise.resolve(); // let the confirm() microtask settle before asserting the optimistic clear
    await unboardPromise;

    expect(staffApiServiceStub.unboard).toHaveBeenCalledWith(7);
    expect(component['items'][0].boardedAt).toBeUndefined();
    expect(component['items'][0].boardedByName).toBeUndefined();
  });

  it('reverts boardedAt/boardedByName on failure', async () => {
    const store = createStoreStub([
      buildItem({ ticketId: 7, boardedAt: '2026-07-10T08:00:00Z', boardedByName: 'jane.doe' }),
    ]);
    const staffApiServiceStub = {
      unboard: jasmine.createSpy('unboard').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: 'NOT_BOARDED' } }))
      ),
    };
    const component = createComponent(staffApiServiceStub, store);

    await component['unboard'](store.value[0]);

    expect(component['items'][0].boardedAt).toBe('2026-07-10T08:00:00Z');
    expect(component['items'][0].boardedByName).toBe('jane.doe');
  });
});

describe('BoardingListComponent — boardedCount getter (OBRS-100 print header)', () => {
  it('counts only items with a non-null boardedAt, out of items already held (not part of tripHeader)', () => {
    const store = createStoreStub([
      buildItem({ ticketId: 1, boardedAt: '2026-07-10T08:00:00Z' }),
      buildItem({ ticketId: 2, boardedAt: undefined }),
      buildItem({ ticketId: 3, boardedAt: '2026-07-10T09:00:00Z' }),
    ]);
    const component = createComponent({ getScheduleById: jasmine.createSpy() }, store);

    expect(component['boardedCount']).toBe(2);
    expect(component['items'].length).toBe(3);
  });
});

describe('BoardingListComponent — trip header self-fetch (OBRS-100)', () => {
  it('loadTripHeader() maps route/vehicle/driver/departure from StaffApiService.getScheduleById(), not AdminApiService', async () => {
    const staffApiServiceStub = {
      getScheduleById: jasmine.createSpy('getScheduleById').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: {
            id: 42,
            departureDateTime: '2026-07-10T08:00:00Z',
            route: { id: 1, slug: 'bkk-cnx', code: 'BKK-CNX' },
            vehicle: { id: 2, numberPlate: '1กก-1234' },
            driver: { id: 3, fullName: 'Somchai Driver' },
          },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub);

    await component['loadTripHeader'](42);

    expect(staffApiServiceStub.getScheduleById).toHaveBeenCalledWith(42);
    expect(component['tripHeader']).toEqual({
      routeLabel: 'BKK-CNX',
      departureDateTime: '10 Jul 2026 15:00',
      vehicleLabel: '1กก-1234',
      driverName: 'Somchai Driver',
      statusCode: 'unknown',
    });
  });

  it('falls back to "-" per field when the schedule detail omits route/vehicle/driver', async () => {
    const staffApiServiceStub = {
      getScheduleById: jasmine.createSpy('getScheduleById').and.returnValue(
        of({ code: 200, message: 'OK', data: { id: 42 } })
      ),
    };
    const component = createComponent(staffApiServiceStub);

    await component['loadTripHeader'](42);

    expect(component['tripHeader']).toEqual({
      routeLabel: '-',
      departureDateTime: '-',
      vehicleLabel: '-',
      driverName: '-',
      statusCode: 'unknown',
    });
  });

  it('OBRS-256: statusCode is parsed via parseAdminStatus(schedule.status) — reused, not a second parser', async () => {
    const staffApiServiceStub = {
      getScheduleById: jasmine.createSpy('getScheduleById').and.returnValue(
        of({ code: 200, message: 'OK', data: { id: 42, status: 'DEPARTED' } })
      ),
    };
    const component = createComponent(staffApiServiceStub);

    await component['loadTripHeader'](42);

    expect(component['tripHeader']?.statusCode).toBe('departed');
  });

  it('degrades to null (template falls back to "-") on failure — e.g. a driver 403’d off a foreign schedule — without blocking export/print', async () => {
    const staffApiServiceStub = {
      getScheduleById: jasmine.createSpy('getScheduleById').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { errorCode: 'ACCESS_DENIED' } }))
      ),
    };
    const component = createComponent(staffApiServiceStub);

    await component['loadTripHeader'](42);

    expect(component['tripHeader']).toBeNull();
  });

  it('stale-guards: a slower response for an earlier scheduleId must not clobber the header for the current one', async () => {
    const staleSubject = new Subject<any>();
    const staffApiServiceStub = {
      getScheduleById: jasmine.createSpy('getScheduleById').and.callFake((id: number) =>
        id === 42
          ? staleSubject.asObservable()
          : of({ code: 200, message: 'OK', data: { id, route: { slug: 'r99' } } })
      ),
    };
    const component = createComponent(staffApiServiceStub);

    const staleCall = component['loadTripHeader'](42);
    await component['loadTripHeader'](99); // supersedes — headerRequestScheduleId is now 99
    expect(component['tripHeader']?.routeLabel).toBe('r99');

    // The slow response for the superseded scheduleId (42) arrives late.
    staleSubject.next({ code: 200, message: 'OK', data: { id: 42, route: { slug: 'r42' } } });
    staleSubject.complete();
    await staleCall;

    expect(component['tripHeader']?.routeLabel).toBe('r99');
  });
});

describe('BoardingListComponent — OBRS-256 schedule status pill/action getters', () => {
  function withTripHeader(component: BoardingListComponent, statusCode: string): void {
    (component as any).tripHeader = {
      routeLabel: 'BKK-CNX',
      departureDateTime: '10 Jul 2026 15:00',
      vehicleLabel: '1กก-1234',
      driverName: 'Somchai Driver',
      statusCode,
    };
  }

  it('pill class/icon/label per status (scheduled/departed/arrived/unknown)', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });

    withTripHeader(component, 'scheduled');
    expect(component['scheduleStatusPillClass']).toBe('is-neutral');
    expect(component['scheduleStatusPillIcon']).toBe('schedule');
    expect(component['scheduleStatusPillLabelKey']).toBe('STAFF.SCHEDULE_STATUS.PILL.SCHEDULED');

    withTripHeader(component, 'departed');
    expect(component['scheduleStatusPillClass']).toBe('is-info');
    expect(component['scheduleStatusPillIcon']).toBe('directions_bus');
    expect(component['scheduleStatusPillLabelKey']).toBe('STAFF.SCHEDULE_STATUS.PILL.DEPARTED');

    withTripHeader(component, 'arrived');
    expect(component['scheduleStatusPillClass']).toBe('is-success');
    expect(component['scheduleStatusPillIcon']).toBe('check_circle');
    expect(component['scheduleStatusPillLabelKey']).toBe('STAFF.SCHEDULE_STATUS.PILL.ARRIVED');

    withTripHeader(component, 'unknown');
    expect(component['scheduleStatusPillClass']).toBe('is-neutral');
    expect(component['scheduleStatusPillIcon']).toBe('help');
    expect(component['scheduleStatusPillLabelKey']).toBe('STAFF.SCHEDULE_STATUS.PILL.UNKNOWN');
  });

  it('scheduleStatusAction: scheduled -> mark departed (no confirm), departed -> mark arrived (confirm required), arrived/unknown/null tripHeader -> null', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });

    withTripHeader(component, 'scheduled');
    expect(component['scheduleStatusAction']).toEqual({
      code: 'departed',
      labelKey: 'STAFF.SCHEDULE_STATUS.ACTION.MARK_DEPARTED',
      icon: 'departure_board',
      requiresConfirm: false,
    });

    withTripHeader(component, 'departed');
    expect(component['scheduleStatusAction']).toEqual({
      code: 'arrived',
      labelKey: 'STAFF.SCHEDULE_STATUS.ACTION.MARK_ARRIVED',
      icon: 'flag',
      requiresConfirm: true,
    });

    withTripHeader(component, 'arrived');
    expect(component['scheduleStatusAction']).toBeNull();

    withTripHeader(component, 'unknown');
    expect(component['scheduleStatusAction']).toBeNull();

    (component as any).tripHeader = null;
    expect(component['scheduleStatusAction']).toBeNull();
  });

  it('canControlScheduleStatus is hidden for a driver — identical role gate to canUnboard', () => {
    const driverComponent = createComponent(
      { boardingScan: jasmine.createSpy() },
      undefined,
      undefined,
      createAuthServiceStub({ canUnboard: false })
    );
    expect(driverComponent['canControlScheduleStatus']).toBeFalse();

    const salespersonComponent = createComponent(
      { boardingScan: jasmine.createSpy() },
      undefined,
      undefined,
      createAuthServiceStub({ canUnboard: true })
    );
    expect(salespersonComponent['canControlScheduleStatus']).toBeTrue();
  });
});

describe('BoardingListComponent — OBRS-256 onScheduleStatusAction()', () => {
  function withTripHeader(component: BoardingListComponent, statusCode: string): void {
    (component as any).tripHeader = {
      routeLabel: 'BKK-CNX',
      departureDateTime: '10 Jul 2026 15:00',
      vehicleLabel: '1กก-1234',
      driverName: 'Somchai Driver',
      statusCode,
    };
  }

  it('mark-departed happy path: PATCH called with correct args, tripHeader.statusCode updates on success, no confirm needed', async () => {
    const staffApiServiceStub = {
      updateScheduleStatus: jasmine
        .createSpy('updateScheduleStatus')
        .and.returnValue(of({ code: 200, message: 'OK', data: { scheduleId: 42, status: 'departed' } })),
    };
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(staffApiServiceStub, undefined, alertServiceStub);
    withTripHeader(component, 'scheduled');

    await component['onScheduleStatusAction']();

    expect(alertServiceStub.confirm).not.toHaveBeenCalled();
    expect(staffApiServiceStub.updateScheduleStatus).toHaveBeenCalledWith(42, 'departed');
    expect(component['tripHeader']?.statusCode).toBe('departed');
    expect(alertServiceStub.success).toHaveBeenCalled();
    expect(component['isUpdatingScheduleStatus']).toBeFalse();
  });

  it('mark-arrived requires AlertService.confirm(); cancel bails without calling the API', async () => {
    const staffApiServiceStub = { updateScheduleStatus: jasmine.createSpy('updateScheduleStatus') };
    const alertServiceStub = createAlertServiceStub(false);
    const component = createComponent(staffApiServiceStub, undefined, alertServiceStub);
    withTripHeader(component, 'departed');

    await component['onScheduleStatusAction']();

    expect(alertServiceStub.confirm).toHaveBeenCalled();
    expect(staffApiServiceStub.updateScheduleStatus).not.toHaveBeenCalled();
  });

  it('mark-arrived on confirm: calls the API and updates tripHeader.statusCode', async () => {
    const staffApiServiceStub = {
      updateScheduleStatus: jasmine
        .createSpy('updateScheduleStatus')
        .and.returnValue(of({ code: 200, message: 'OK', data: { scheduleId: 42, status: 'arrived' } })),
    };
    const alertServiceStub = createAlertServiceStub(true);
    const component = createComponent(staffApiServiceStub, undefined, alertServiceStub);
    withTripHeader(component, 'departed');

    await component['onScheduleStatusAction']();

    expect(alertServiceStub.confirm).toHaveBeenCalled();
    expect(staffApiServiceStub.updateScheduleStatus).toHaveBeenCalledWith(42, 'arrived');
    expect(component['tripHeader']?.statusCode).toBe('arrived');
  });

  it('is a no-op when there is no action for the current status, or already in flight', async () => {
    const staffApiServiceStub = { updateScheduleStatus: jasmine.createSpy('updateScheduleStatus') };
    const component = createComponent(staffApiServiceStub);
    withTripHeader(component, 'arrived'); // no forward action from 'arrived'

    await component['onScheduleStatusAction']();

    expect(staffApiServiceStub.updateScheduleStatus).not.toHaveBeenCalled();

    withTripHeader(component, 'scheduled');
    (component as any).isUpdatingScheduleStatus = true;

    await component['onScheduleStatusAction']();

    expect(staffApiServiceStub.updateScheduleStatus).not.toHaveBeenCalled();
  });

  it('error path: maps mapScheduleStatusErrorCode(extractScheduleStatusErrorCode()) and calls loadTripHeader() again to reconcile', async () => {
    const staffApiServiceStub = {
      updateScheduleStatus: jasmine
        .createSpy('updateScheduleStatus')
        .and.returnValue(
          throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: 'SCHEDULE_TRANSITION_ILLEGAL' } }))
        ),
      getScheduleById: jasmine
        .createSpy('getScheduleById')
        .and.returnValue(of({ code: 200, message: 'OK', data: { id: 42, status: 'scheduled' } })),
    };
    const alertServiceStub = createAlertServiceStub();
    const component = createComponent(staffApiServiceStub, undefined, alertServiceStub);
    withTripHeader(component, 'scheduled');

    await component['onScheduleStatusAction']();
    // loadTripHeader() is fired with `void` (fire-and-forget) on the error path —
    // flush its microtasks before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(alertServiceStub.error).toHaveBeenCalledWith('STAFF.SCHEDULE_STATUS.ERROR.SCHEDULE_TRANSITION_ILLEGAL');
    expect(staffApiServiceStub.getScheduleById).toHaveBeenCalledWith(42);
    expect(component['isUpdatingScheduleStatus']).toBeFalse();
  });
});

describe('BoardingListComponent — OBRS-256 count-lock freeze (isScheduleArrived)', () => {
  function withTripHeader(component: BoardingListComponent, statusCode: string): void {
    (component as any).tripHeader = {
      routeLabel: 'BKK-CNX',
      departureDateTime: '10 Jul 2026 15:00',
      vehicleLabel: '1กก-1234',
      driverName: 'Somchai Driver',
      statusCode,
    };
  }

  it('isScheduleArrived is true only for statusCode === "arrived" (strict equality, never a fallback)', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });

    withTripHeader(component, 'arrived');
    expect(component['isScheduleArrived']).toBeTrue();

    withTripHeader(component, 'departed');
    expect(component['isScheduleArrived']).toBeFalse();

    (component as any).tripHeader = null;
    expect(component['isScheduleArrived']).toBeFalse();
  });

  it('board() early-returns with no HTTP call when the schedule is arrived', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, boardedAt: undefined })]);
    const staffApiServiceStub = { board: jasmine.createSpy('board') };
    const component = createComponent(staffApiServiceStub, store);
    withTripHeader(component, 'arrived');

    await component['board'](store.value[0]);

    expect(staffApiServiceStub.board).not.toHaveBeenCalled();
  });

  it('unboard() early-returns with no HTTP call when the schedule is arrived', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, boardedAt: '2026-07-10T08:00:00Z' })]);
    const staffApiServiceStub = { unboard: jasmine.createSpy('unboard') };
    const component = createComponent(staffApiServiceStub, store);
    withTripHeader(component, 'arrived');

    await component['unboard'](store.value[0]);

    expect(staffApiServiceStub.unboard).not.toHaveBeenCalled();
  });

  it('validateScan() early-returns with no HTTP call when the schedule is arrived', async () => {
    const staffApiServiceStub = { boardingScan: jasmine.createSpy('boardingScan') };
    const component = createComponent(staffApiServiceStub);
    withTripHeader(component, 'arrived');
    (component as any).scanToken = 'signed.jwt.token';

    await component['validateScan']();

    expect(staffApiServiceStub.boardingScan).not.toHaveBeenCalled();
  });
});

// OBRS-266: camera QR scanner. `@zxing/browser`'s BrowserMultiFormatReader is
// a plain (non-Angular) class field on the component (`private readonly
// codeReader = new BrowserMultiFormatReader()`), so it's mocked the same way
// the rest of this file mocks collaborators — `spyOn()` the actual instance
// method rather than swapping a DI token. `videoElement` (the `#scanVideo`
// ViewChild) is set directly on bare-instantiated components, same pattern
// already used for `tripHeader` above (no TestBed render needed for these).
describe('BoardingListComponent — OBRS-266 camera QR scanner', () => {
  function withTripHeader(component: BoardingListComponent, statusCode: string): void {
    (component as any).tripHeader = {
      routeLabel: 'BKK-CNX',
      departureDateTime: '10 Jul 2026 15:00',
      vehicleLabel: '1กก-1234',
      driverName: 'Somchai Driver',
      statusCode,
    };
  }

  function withVideoElement(component: BoardingListComponent): void {
    (component as any).videoElement = { nativeElement: document.createElement('video') };
  }

  // OBRS-266: `codeReader` is lazily created inside `startCameraScan()` via a
  // dynamic `import('@zxing/browser')` (bundle-size fix — see the .ts
  // comment), so it's `null` until the first real camera session. Presetting
  // it here (rather than `spyOn()`-ing an eagerly-constructed instance) skips
  // that dynamic import entirely in tests — same seam already used for
  // `tripHeader`/`videoElement` above.
  function stubDecode(
    component: BoardingListComponent,
    resolveWith: any = { stop: jasmine.createSpy('stop') }
  ): { spy: jasmine.Spy; getCallback: () => (result: { getText(): string } | undefined) => void } {
    let capturedCallback: (result: { getText(): string } | undefined) => void = () => undefined;
    const spy = jasmine.createSpy('decodeFromVideoDevice').and.callFake(
      (_deviceId: unknown, _video: unknown, cb: any) => {
        capturedCallback = cb;
        return Promise.resolve(resolveWith);
      }
    );
    (component as any).codeReader = { decodeFromVideoDevice: spy };
    return { spy, getCallback: () => capturedCallback };
  }

  it('setScanMode("camera") is a no-op when the schedule is arrived — the camera never starts (codeReader never even loads)', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    withTripHeader(component, 'arrived');

    component['setScanMode']('camera');

    expect(component['scanMode']).toBe('text');
    expect((component as any).codeReader).toBeNull();
  });

  it('setScanMode("camera") requests the camera against #scanVideo and resolves to active, storing the controls', fakeAsync(() => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    withVideoElement(component);
    const { spy } = stubDecode(component);

    component['setScanMode']('camera');
    tick();

    expect(component['scanMode']).toBe('camera');
    expect(component['cameraStatus']).toBe('active');
    expect(spy).toHaveBeenCalledWith(undefined, (component as any).videoElement.nativeElement, jasmine.any(Function));
  }));

  it('the decode callback calls submitToken() -> boardingScan({ token, scheduleId }), same path as the manual button', fakeAsync(() => {
    const store = createStoreStub([buildItem({ ticketId: 7 })]);
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { ticketId: 7, ticketNumber: 'T-ABC123', passengerName: 'Mr. Abc Def', seatNumber: '3', boardedAt: '2026-07-10T08:00:00Z' },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub, store);
    withVideoElement(component);
    const { getCallback } = stubDecode(component);

    component['setScanMode']('camera');
    tick();
    getCallback()({ getText: () => 'signed.jwt.token' });
    tick();

    expect(staffApiServiceStub.boardingScan).toHaveBeenCalledWith({ token: 'signed.jwt.token', scheduleId: 42 });
    expect(component['scanResult']).toBeTruthy();

    // Camera mode schedules a 4s auto-dismiss on success (see the dedicated
    // auto-dismiss tests below) — flush it so fakeAsync doesn't flag a
    // leftover timer at the end of this test.
    tick(4000);
  }));

  it('submitToken() re-checks isScheduleArrived — a decode landing after the schedule locks does not call boardingScan', fakeAsync(() => {
    const staffApiServiceStub = { boardingScan: jasmine.createSpy('boardingScan') };
    const component = createComponent(staffApiServiceStub);
    withVideoElement(component);
    const { getCallback } = stubDecode(component);

    component['setScanMode']('camera');
    tick();

    // The schedule locks WHILE the camera session is live — after decode
    // starts, before this particular frame's callback lands.
    withTripHeader(component, 'arrived');

    getCallback()({ getText: () => 'signed.jwt.token' });
    tick();

    expect(staffApiServiceStub.boardingScan).not.toHaveBeenCalled();
  }));

  it('debounces a re-decode of the same token within 3s — only one boardingScan call', fakeAsync(() => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { ticketId: 7, ticketNumber: 'T-ABC123', passengerName: 'x', seatNumber: '1', boardedAt: '2026-07-10T08:00:00Z' },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub);
    withVideoElement(component);
    const { getCallback } = stubDecode(component);

    component['setScanMode']('camera');
    tick();

    getCallback()({ getText: () => 'dup-token' });
    tick();
    getCallback()({ getText: () => 'dup-token' });
    tick();

    expect(staffApiServiceStub.boardingScan).toHaveBeenCalledTimes(1);
    tick(4000); // flush the camera-mode auto-dismiss timer
  }));

  it('a DIFFERENT token decoded within the debounce window still calls boardingScan again', fakeAsync(() => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { ticketId: 7, ticketNumber: 'T-ABC123', passengerName: 'x', seatNumber: '1', boardedAt: '2026-07-10T08:00:00Z' },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub);
    withVideoElement(component);
    const { getCallback } = stubDecode(component);

    component['setScanMode']('camera');
    tick();

    getCallback()({ getText: () => 'token-a' });
    tick();
    getCallback()({ getText: () => 'token-b' });
    tick();

    expect(staffApiServiceStub.boardingScan).toHaveBeenCalledTimes(2);
    tick(4000); // flush the camera-mode auto-dismiss timer (cleared+rescheduled by the 2nd call)
  }));

  it('camera-mode success banner auto-dismisses after 4s', fakeAsync(() => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { ticketId: 7, ticketNumber: 'T-ABC123', passengerName: 'x', seatNumber: '1', boardedAt: '2026-07-10T08:00:00Z' },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub);
    (component as any).scanMode = 'camera';

    component['submitToken']('signed.jwt.token');
    tick();
    expect(component['scanResult']).toBeTruthy();

    tick(4000);
    expect(component['scanResult']).toBeNull();
  }));

  it('text-mode success banner does NOT auto-dismiss', fakeAsync(() => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { ticketId: 7, ticketNumber: 'T-ABC123', passengerName: 'x', seatNumber: '1', boardedAt: '2026-07-10T08:00:00Z' },
        })
      ),
    };
    const component = createComponent(staffApiServiceStub); // scanMode defaults to 'text'

    component['submitToken']('signed.jwt.token');
    tick();
    tick(10000);

    expect(component['scanResult']).toBeTruthy();
  }));

  it('scanError is sticky — never auto-dismissed on a timer, in either mode', fakeAsync(() => {
    const staffApiServiceStub = {
      boardingScan: jasmine.createSpy('boardingScan').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: 'WRONG_SCHEDULE_TICKET' } }))
      ),
    };
    const component = createComponent(staffApiServiceStub);
    (component as any).scanMode = 'camera';

    component['submitToken']('signed.jwt.token');
    tick();
    tick(10000);

    expect(component['scanError']).toBeTruthy();
  }));

  it('cameraStatus maps getUserMedia rejection reasons: NotAllowedError -> denied, NotFoundError -> no-camera, other -> error', fakeAsync(() => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    withVideoElement(component);
    const decodeSpy = jasmine.createSpy('decodeFromVideoDevice');
    (component as any).codeReader = { decodeFromVideoDevice: decodeSpy };

    decodeSpy.and.returnValue(Promise.reject({ name: 'NotAllowedError' }));
    component['setScanMode']('camera');
    tick();
    expect(component['cameraStatus']).toBe('denied');

    component['setScanMode']('text');
    decodeSpy.and.returnValue(Promise.reject({ name: 'NotFoundError' }));
    component['setScanMode']('camera');
    tick();
    expect(component['cameraStatus']).toBe('no-camera');

    component['setScanMode']('text');
    decodeSpy.and.returnValue(Promise.reject(new Error('boom')));
    component['setScanMode']('camera');
    tick();
    expect(component['cameraStatus']).toBe('error');
  }));

  it('cameraStatus is "unsupported" when the platform has no navigator.mediaDevices.getUserMedia', fakeAsync(() => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    withVideoElement(component);
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });

    try {
      component['setScanMode']('camera');
      tick();
      expect(component['cameraStatus']).toBe('unsupported');
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
    }
  }));

  it('retryCamera() re-attempts startCameraScan()', fakeAsync(() => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    withVideoElement(component);
    const decodeSpy = jasmine.createSpy('decodeFromVideoDevice');
    (component as any).codeReader = { decodeFromVideoDevice: decodeSpy };
    decodeSpy.and.returnValue(Promise.reject({ name: 'NotAllowedError' }));

    component['setScanMode']('camera');
    tick();
    expect(component['cameraStatus']).toBe('denied');

    decodeSpy.and.returnValue(Promise.resolve({ stop: jasmine.createSpy('stop') }));
    component['retryCamera']();
    tick();

    expect(component['cameraStatus']).toBe('active');
  }));
});

describe('BoardingListComponent — OBRS-266 stopCameraStream() teardown contract', () => {
  function primeActiveCameraSession(component: BoardingListComponent, stopSpy: jasmine.Spy): void {
    (component as any).scannerControls = { stop: stopSpy };
    (component as any).cameraStatus = 'active';
    (component as any).scanMode = 'camera';
  }

  it('is idempotent — safe to call with no active stream, never throws (mirrors disposePrintPortal()\'s guard style)', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });

    expect(() => component['stopCameraStream']()).not.toThrow();
    expect(component['cameraStatus']).toBe('idle');
    // Calling it again with still nothing active must also be a no-op.
    expect(() => component['stopCameraStream']()).not.toThrow();
  });

  it('ngOnChanges (scheduleId re-bind) stops a live stream and resets to text BEFORE the store re-init', () => {
    const stopSpy = jasmine.createSpy('stop');
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    primeActiveCameraSession(component, stopSpy);

    component.scheduleId = 99;
    component.ngOnChanges({ scheduleId: {} as any });

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect((component as any).scannerControls).toBeNull();
    expect(component['cameraStatus']).toBe('idle');
    expect(component['scanMode']).toBe('text');
  });

  it('toggling back to text stops the stream exactly once', () => {
    const stopSpy = jasmine.createSpy('stop');
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    primeActiveCameraSession(component, stopSpy);

    component['setScanMode']('text');

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(component['scanMode']).toBe('text');
    expect(component['cameraStatus']).toBe('idle');
  });

  it('handleArrivedTransition() stops the stream — trigger site 1: onScheduleStatusAction() success (mark-arrived)', async () => {
    const stopSpy = jasmine.createSpy('stop');
    const staffApiServiceStub = {
      updateScheduleStatus: jasmine
        .createSpy('updateScheduleStatus')
        .and.returnValue(of({ code: 200, message: 'OK', data: { scheduleId: 42, status: 'arrived' } })),
    };
    const alertServiceStub = createAlertServiceStub(true);
    const component = createComponent(staffApiServiceStub, undefined, alertServiceStub);
    (component as any).tripHeader = {
      routeLabel: 'BKK-CNX',
      departureDateTime: '10 Jul 2026 15:00',
      vehicleLabel: '1กก-1234',
      driverName: 'Somchai Driver',
      statusCode: 'departed',
    };
    primeActiveCameraSession(component, stopSpy);

    await component['onScheduleStatusAction']();

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(component['cameraStatus']).toBe('idle');
  });

  it('handleArrivedTransition() stops the stream — trigger site 2: loadTripHeader() success', async () => {
    const stopSpy = jasmine.createSpy('stop');
    const staffApiServiceStub = {
      getScheduleById: jasmine
        .createSpy('getScheduleById')
        .and.returnValue(of({ code: 200, message: 'OK', data: { id: 42, status: 'ARRIVED' } })),
    };
    const component = createComponent(staffApiServiceStub);
    primeActiveCameraSession(component, stopSpy);

    await component['loadTripHeader'](42);

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(component['cameraStatus']).toBe('idle');
  });

  it('handleArrivedTransition() is NOT triggered for a non-arrived status (loadTripHeader stays departed)', async () => {
    const stopSpy = jasmine.createSpy('stop');
    const staffApiServiceStub = {
      getScheduleById: jasmine
        .createSpy('getScheduleById')
        .and.returnValue(of({ code: 200, message: 'OK', data: { id: 42, status: 'DEPARTED' } })),
    };
    const component = createComponent(staffApiServiceStub);
    primeActiveCameraSession(component, stopSpy);

    await component['loadTripHeader'](42);

    expect(stopSpy).not.toHaveBeenCalled();
    expect(component['cameraStatus']).toBe('active');
  });

  it('ngOnDestroy unconditionally stops a live stream', () => {
    const stopSpy = jasmine.createSpy('stop');
    const component = createComponent({ boardingScan: jasmine.createSpy() });
    primeActiveCameraSession(component, stopSpy);

    component.ngOnDestroy();

    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it('ngOnDestroy is safe when no camera session was ever started', () => {
    const component = createComponent({ boardingScan: jasmine.createSpy() });

    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

describe('BoardingListComponent — OBRS-256 template render: header strip, status pill, transition button, count-lock (TestBed)', () => {
  let fixture: ComponentFixture<BoardingListComponent>;
  let component: BoardingListComponent;

  function render(opts: { scheduleStatus: string; canControl: boolean }): void {
    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot()],
      declarations: [BoardingListComponent],
      providers: [
        BoardingListStore,
        {
          provide: StaffApiService,
          useValue: {
            getBoardingList: () =>
              of({
                code: 200,
                message: 'OK',
                data: [
                  buildItem({ ticketId: 1, boardedAt: undefined }),
                  buildItem({ ticketId: 2, boardedAt: '2026-07-10T08:00:00Z' }),
                ],
              }),
            getScheduleById: () =>
              of({ code: 200, message: 'OK', data: { id: 42, status: opts.scheduleStatus } }),
          },
        },
        { provide: AlertService, useValue: createAlertServiceStub() },
        {
          provide: AuthService,
          useValue: {
            hasAnyRole: () => opts.canControl,
            getUsername: () => 'operator1',
            authStatus$: of(true),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BoardingListComponent);
    component = fixture.componentInstance;
    component.scheduleId = 42;
    // TestBed.createComponent() makes this the ROOT component — there is no
    // host template binding `[scheduleId]`, so Angular never invokes
    // ngOnChanges on its own (unlike a real host). Call it explicitly, same
    // as the non-TestBed `createComponent()` helper above, so
    // store.setScheduleId()/refresh()/loadTripHeader() actually fire.
    component.ngOnChanges({ scheduleId: {} as any });
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
  });

  it('hides the transition button entirely when canControlScheduleStatus is false (driver)', fakeAsync(() => {
    render({ scheduleStatus: 'scheduled', canControl: false });
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.boarding-trip-header-status .admin-btn')).toBeFalsy();
  }));

  it('shows the transition button for salesperson on a scheduled trip', fakeAsync(() => {
    render({ scheduleStatus: 'scheduled', canControl: true });
    tick();
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.boarding-trip-header-status .admin-btn');
    expect(btn).toBeTruthy();
  }));

  it('disables the scan input, scan button, board button, and unboard button once the schedule is arrived', fakeAsync(() => {
    render({ scheduleStatus: 'arrived', canControl: true });
    tick();
    fixture.detectChanges();
    // `NgModel`'s `[disabled]` input applies via `resolvedPromise.then()`
    // internally (see @angular/forms `NgModel._updateDisabled()`) — an extra
    // microtask beyond the change-detection pass that evaluates the
    // `[disabled]` expression. Flush it before reading the DOM property.
    tick();

    const scanInput: HTMLInputElement = fixture.nativeElement.querySelector('#boardingScanInput');
    const scanBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.boarding-scan-btn');
    const boardBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.boarding-actions .admin-btn:not(.admin-btn-danger)'
    );
    const unboardBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.boarding-actions .admin-btn-danger'
    );

    expect(scanInput.disabled).toBeTrue();
    expect(scanBtn.disabled).toBeTrue();
    expect(boardBtn.disabled).toBeTrue();
    expect(unboardBtn.disabled).toBeTrue();

    expect(fixture.nativeElement.querySelector('.boarding-lock-banner')).toBeTruthy();
  }));

  // OBRS-266: design-system §11 "exactly one primary/pressed control" contract
  // for the new segmented text/camera toggle.
  it('the scan-mode toggle renders exactly one aria-pressed="true"/.is-active button, defaulting to text', fakeAsync(() => {
    render({ scheduleStatus: 'scheduled', canControl: true });
    tick();
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.boarding-scan-mode-toggle .admin-btn')
    );
    expect(buttons.length).toBe(2);

    const pressed = buttons.filter((btn) => btn.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].classList.contains('is-active')).toBeTrue();
    expect(pressed[0].textContent).toContain('STAFF.BOARDING.SCAN.MODE_TEXT');
  }));
});

// OBRS-100 / ADR 0015: unlike every other describe block above (which
// instantiates BoardingListComponent directly), the CDK Portal round-trip
// needs a REAL ViewContainerRef + a REAL #printTemplate resolved by Angular's
// view-init — neither exists on a bare `new BoardingListComponent(...)`. So
// this block alone renders the component via TestBed. NO_ERRORS_SCHEMA lets
// the template's unknown child elements (`<app-export-button>`, PrimeNG's
// `p-menu` are irrelevant here since ExportButtonComponent isn't declared)
// pass through unrendered — this suite only exercises printManifest().
describe('BoardingListComponent — printManifest() portal lifecycle (OBRS-100, CDK Portal, ADR 0015)', () => {
  let fixture: ComponentFixture<BoardingListComponent>;
  let component: BoardingListComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot()],
      declarations: [BoardingListComponent],
      providers: [
        BoardingListStore,
        {
          provide: StaffApiService,
          useValue: {
            getBoardingList: () => of({ code: 200, message: 'OK', data: [] }),
            getScheduleById: () => of({ code: 200, message: 'OK', data: null }),
          },
        },
        { provide: AlertService, useValue: {} },
        {
          provide: AuthService,
          useValue: { hasAnyRole: () => false, getUsername: () => 'operator1', authStatus$: of(true) },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BoardingListComponent);
    component = fixture.componentInstance;
    component.scheduleId = 42;
    fixture.detectChanges(); // resolves the static #printTemplate ViewChild and calls ngOnInit
  });

  afterEach(() => {
    // Belt-and-braces: a failed assertion mid-test could leave a stray body
    // node behind for the next test/suite even with fixture.destroy() below.
    document.querySelectorAll('.boarding-manifest-print-portal').forEach((el) => el.remove());
    document.body.classList.remove('boarding-manifest-printing');
  });

  it('teleports a document.body child carrying the marker class and defers window.print()', () => {
    const printSpy = spyOn(window, 'print');

    component['printManifest']();

    const host = document.querySelector('.boarding-manifest-print-portal');
    expect(host).withContext('portal host should be appended to document.body').toBeTruthy();
    expect(host?.parentElement).toBe(document.body);
    // The body-class gate scopes the global @media print isolation to a live
    // manifest print only — without it, a native Ctrl+P on any page blank-prints.
    expect(document.body.classList.contains('boarding-manifest-printing'))
      .withContext('printManifest() must arm the body-class print gate')
      .toBe(true);
    // window.print() is deferred via setTimeout(0) so the portal DOM commits first.
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('disarms the body-class print gate on teardown (native Ctrl+P elsewhere must not blank-print)', () => {
    spyOn(window, 'print');
    component['printManifest']();
    expect(document.body.classList.contains('boarding-manifest-printing')).toBe(true);

    window.dispatchEvent(new Event('afterprint'));

    expect(document.body.classList.contains('boarding-manifest-printing')).toBe(false);
  });

  it('afterprint tears the portal down (idempotent — no leaked listener/body node)', (done) => {
    spyOn(window, 'print');
    component['printManifest']();
    expect(document.querySelector('.boarding-manifest-print-portal')).toBeTruthy();

    window.dispatchEvent(new Event('afterprint'));

    setTimeout(() => {
      expect(document.querySelector('.boarding-manifest-print-portal')).toBeFalsy();
      done();
    });
  });

  it('ngOnDestroy disposes a still-open portal (scrutinize case: navigating away mid print-dialog must not leak a body node)', () => {
    spyOn(window, 'print');
    component['printManifest']();
    expect(document.querySelector('.boarding-manifest-print-portal')).toBeTruthy();

    fixture.destroy();

    expect(document.querySelector('.boarding-manifest-print-portal')).toBeFalsy();
  });

  it('printManifest() is safe to call again while already open — never leaks a second host', () => {
    spyOn(window, 'print');
    component['printManifest']();
    component['printManifest']();

    expect(document.querySelectorAll('.boarding-manifest-print-portal').length).toBe(1);
  });
});

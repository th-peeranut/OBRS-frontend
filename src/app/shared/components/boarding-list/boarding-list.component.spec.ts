import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { BoardingListComponent } from './boarding-list.component';
import { BoardingListItemDto } from '../../../services/staff/staff-api.service';
import { createTranslateStub } from '../../../testing/test-stubs';

function createAlertServiceStub(confirmResult = true): any {
  return {
    success: () => Promise.resolve(),
    error: () => Promise.resolve(),
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

function createComponent(
  staffApiServiceStub: any,
  storeStub: any = createStoreStub([buildItem()]),
  alertServiceStub: any = createAlertServiceStub(),
  authServiceStub: any = createAuthServiceStub()
): BoardingListComponent {
  const component = new BoardingListComponent(
    staffApiServiceStub,
    alertServiceStub,
    createTranslateStub(),
    authServiceStub,
    storeStub
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

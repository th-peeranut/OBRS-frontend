import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { BoardingListPageComponent } from './boarding-list-page.component';
import { BoardingListItemDto } from '../../../../services/staff/staff-api.service';
import { createRouterStub, createTranslateStub } from '../../../../testing/test-stubs';

function createActivatedRouteStub(scheduleId: number): any {
  return {
    snapshot: {
      paramMap: {
        get: (key: string) => (key === 'scheduleId' ? String(scheduleId) : null),
      },
    },
  };
}

function createAlertServiceStub(): any {
  return {
    success: () => Promise.resolve(),
    error: () => Promise.resolve(),
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
    setScheduleId: () => undefined,
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
    status: { code: 'pending', label: 'Pending' },
    ...overrides,
  };
}

describe('BoardingListPageComponent — manual boarding-scan box (OBRS-96)', () => {
  function createComponent(
    staffApiServiceStub: any,
    storeStub: any = createStoreStub([buildItem()])
  ): BoardingListPageComponent {
    const component = new BoardingListPageComponent(
      createActivatedRouteStub(42),
      createRouterStub(),
      staffApiServiceStub,
      createAlertServiceStub(),
      createTranslateStub(),
      storeStub
    );
    component.ngOnInit();
    return component;
  }

  it('does nothing for an empty/whitespace-only token', async () => {
    const staffApiServiceStub = { boardingScan: jasmine.createSpy('boardingScan') };
    const component = createComponent(staffApiServiceStub);

    (component as any).scanToken = '   ';
    await component['validateScan']();

    expect(staffApiServiceStub.boardingScan).not.toHaveBeenCalled();
  });

  it('sends { token, scheduleId } from the route (not user input) on validate', async () => {
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

  it('success: stores the scan result, clears the input, and reflects the boarded ticket in the list', async () => {
    const store = createStoreStub([buildItem({ ticketId: 7, status: { code: 'pending', label: 'Pending' } })]);
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
    expect(boardedItem?.status.code).toBe('checked_in');
    expect(boardedItem?.boardedAt).toBe('2026-07-10T08:00:00Z');
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

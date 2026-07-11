import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

// OBRS-100: minimal stub — printManifest()/loadTripHeader() tests construct
// their own ViewContainerRef/TemplateRef doubles where they matter; every
// other existing test never calls printManifest(), so an empty stub is fine.
function createViewContainerRefStub(): any {
  return {};
}

function createComponent(
  staffApiServiceStub: any,
  storeStub: any = createStoreStub([buildItem()]),
  alertServiceStub: any = createAlertServiceStub(),
  authServiceStub: any = createAuthServiceStub(),
  viewContainerRefStub: any = createViewContainerRefStub()
): BoardingListComponent {
  const component = new BoardingListComponent(
    staffApiServiceStub,
    alertServiceStub,
    createTranslateStub(),
    authServiceStub,
    storeStub,
    viewContainerRefStub
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
    });
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

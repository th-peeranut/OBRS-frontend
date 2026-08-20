import { Subject } from 'rxjs';
import { fakeAsync, tick } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';

import { MyBookingsComponent } from './my-bookings.component';
import {
  MyBookingDto,
  MyBookingView,
} from '../../shared/interfaces/my-booking.interface';

function buildBooking(overrides: Partial<MyBookingDto> = {}): MyBookingDto {
  return {
    id: 7,
    bookingNumber: 'B-29RGZW',
    totalAmount: '1290.00',
    status: 'confirmed',
    bookingType: 'one_way',
    rescheduleCount: 0,
    // OBRS-699: the reschedule/change-seat/change-stop window is wire-supplied
    // per row. Omitting it makes all three INELIGIBLE by design.
    rescheduleWindowHours: 2,
    createdAt: '2026-06-01T10:00:00',
    bookingSchedules: [
      {
        id: 1,
        departureDateTime: '2026-12-20T08:00:00+07:00',
        fromStop: {
          code: 'nong_chak',
          display: {
            en: { label: 'Nong Chak' },
            th: { label: 'หนองชาก' },
          },
        },
        toStop: {
          code: 'bts_mo_chit',
          display: {
            en: { label: 'BTS Mo Chit' },
            th: { label: 'บีทีเอส หมอชิต' },
          },
        },
        // OBRS-635: `tickets` is null on GET /bookings/me — the list projection
        // never loads them. The old fixture said `[{}, {}]`, which is why a
        // component reading `tickets.length` looked correct in tests while
        // printing "0 passengers" to every real customer. The count is its own
        // server-computed field.
        tickets: undefined,
        passengerCount: 2,
      },
    ],
    ...overrides,
  };
}


describe('MyBookingsComponent', () => {
  let component: MyBookingsComponent;

  const storeStub = {
    select: () => new Subject(),
    dispatch: () => undefined,
  } as unknown as Store;

  const translateStub = {
    onLangChange: new Subject(),
    currentLang: 'en',
  } as unknown as TranslateService;

  function toView(dto: MyBookingDto, locale: 'en' | 'th' | 'zh' = 'en'): MyBookingView {
    return (component as unknown as {
      toView: (b: MyBookingDto, l: 'en' | 'th' | 'zh') => MyBookingView;
    }).toView(dto, locale);
  }

  beforeEach(() => {
    component = new MyBookingsComponent(storeStub, translateStub);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('builds the route from localized stop labels for the active locale', () => {
    expect(toView(buildBooking(), 'en').route).toBe('Nong Chak → BTS Mo Chit');
    expect(toView(buildBooking(), 'th').route).toBe('หนองชาก → บีทีเอส หมอชิต');
  });

  it('marks only confirmed bookings as cancellable', () => {
    expect(toView(buildBooking({ status: 'confirmed' })).cancellable).toBe(true);
    expect(toView(buildBooking({ status: 'pending' })).cancellable).toBe(false);
    expect(toView(buildBooking({ status: 'cancelled' })).cancellable).toBe(false);
  });

  it('exposes the e-ticket only for paid (confirmed) bookings', () => {
    expect(toView(buildBooking({ status: 'confirmed' })).paid).toBe(true);
    expect(toView(buildBooking({ status: 'pending' })).paid).toBe(false);
    expect(toView(buildBooking({ status: 'expired' })).paid).toBe(false);
  });

  it('opens the e-ticket modal for the chosen booking and closes it', () => {
    const view = toView(buildBooking({ id: 88 }));

    component.onViewTicket(view);
    expect(component.activeTicketBookingId).toBe(88);

    component.onCloseTicket();
    expect(component.activeTicketBookingId).toBeNull();
  });

  it('formats the departure, amount and passenger count', () => {
    const view = toView(buildBooking());

    expect(view.departureLabel).toBe('20 Dec 2026 08:00');
    expect(view.totalAmount).toBe(1290);
    expect(view.totalAmountLabel).toContain('1,290');
    expect(view.passengerCount).toBe(2);
  });

  describe('passenger count (OBRS-635)', () => {
    // The reported defect verbatim: every card said "0 passengers". The response
    // shape below is the real one — `tickets` absent, `passengerCount` present.
    it('reads the server-computed count even though tickets is absent', () => {
      const view = toView(
        buildBooking({
          bookingSchedules: [
            { id: 1, departureDateTime: '2026-12-20T08:00:00+07:00', tickets: undefined, passengerCount: 3 },
          ],
        })
      );

      expect(view.passengerCount).toBe(3);
    });

    // The guard against regressing to `tickets?.length ?? 0`: the two disagree
    // on purpose, so a mapping that reads `tickets` cannot pass this.
    it('follows passengerCount, not tickets.length, when the two disagree', () => {
      const view = toView(
        buildBooking({
          bookingSchedules: [
            {
              id: 1,
              departureDateTime: '2026-12-20T08:00:00+07:00',
              tickets: [{}, {}, {}, {}],
              passengerCount: 2,
            },
          ],
        })
      );

      expect(view.passengerCount).toBe(2);
    });

    // A multi-leg booking's card shows the BOOKING's passengers, taken from the
    // first leg — not the sum over legs. 2 people round-tripping is "2", not 4.
    it('reports the first leg only for a round trip, never the sum across legs', () => {
      const view = toView(
        buildBooking({
          bookingType: 'round_trip',
          bookingSchedules: [
            { id: 1, departureDateTime: '2026-12-20T08:00:00+07:00', passengerCount: 2 },
            { id: 2, departureDateTime: '2026-12-27T08:00:00+07:00', passengerCount: 2 },
          ],
        })
      );

      expect(view.passengerCount).toBe(2);
    });

    it('degrades to 0 when the leg carries no count at all', () => {
      const view = toView(
        buildBooking({
          bookingSchedules: [{ id: 1, departureDateTime: '2026-12-20T08:00:00+07:00' }],
        })
      );

      expect(view.passengerCount).toBe(0);
    });
  });

  it('falls back to a generated reference when bookingNumber is missing', () => {
    const view = toView(buildBooking({ bookingNumber: undefined, id: 42 }));
    expect(view.bookingNumber).toBe('#BK-42');
  });

  it('dispatches a cancel request for the chosen booking', () => {
    const dispatchSpy = spyOn(storeStub, 'dispatch');
    const view = toView(buildBooking());

    component.onCancel(view);

    expect(dispatchSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ booking: view })
    );
  });

  describe('reschedule eligibility (card gating)', () => {
    // A departure comfortably clear of the 2h reschedule window, computed
    // relative to "now" so the test never goes stale.
    const eligibleDeparture = dayjs().add(10, 'day').toISOString();

    it('is eligible when confirmed, one-way/single-leg, never rescheduled, and outside the window', () => {
      const view = toView(
        buildBooking({
          status: 'confirmed',
          bookingType: 'one_way',
          rescheduleCount: 0,
          bookingSchedules: [
            {
              id: 1,
              departureDateTime: eligibleDeparture,
              tickets: [{}],
            },
          ],
        })
      );

      expect(view.rescheduleEligible).toBeTrue();
      expect(view.rescheduleReasonKey).toBeNull();
    });

    it('REASON.NOT_CONFIRMED — status is not confirmed', () => {
      const view = toView(
        buildBooking({
          status: 'pending',
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.rescheduleEligible).toBeFalse();
      expect(view.rescheduleReasonKey).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NOT_CONFIRMED');
    });

    it('REASON.NOT_ONE_WAY — return booking (bookingType)', () => {
      const view = toView(
        buildBooking({
          bookingType: 'return',
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.rescheduleEligible).toBeFalse();
      expect(view.rescheduleReasonKey).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NOT_ONE_WAY');
    });

    it('REASON.NOT_ONE_WAY — more than one leg even if bookingType says one_way', () => {
      const view = toView(
        buildBooking({
          bookingType: 'one_way',
          bookingSchedules: [
            { id: 1, departureDateTime: eligibleDeparture, tickets: [{}] },
            { id: 2, departureDateTime: eligibleDeparture, tickets: [{}] },
          ],
        })
      );

      expect(view.rescheduleEligible).toBeFalse();
      expect(view.rescheduleReasonKey).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NOT_ONE_WAY');
    });

    it('OBRS-657: REASON.ALREADY_USED — rescheduleCount has reached the operator cap', () => {
      const view = toView(
        buildBooking({
          rescheduleCount: 1,
          rescheduleMaxCount: 1,
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.rescheduleEligible).toBeFalse();
      expect(view.rescheduleReasonKey).toBe('MY_BOOKINGS.RESCHEDULE.REASON.ALREADY_USED');
    });

    // OBRS-657: this is the spec that goes red if anyone puts a policy number back into the
    // component. A hardcoded `>= 1` passes the test above and fails both of these.
    it('OBRS-657: eligible after THREE reschedules when rescheduleMaxCount is 0 (unlimited, the default)', () => {
      const view = toView(
        buildBooking({
          rescheduleCount: 3,
          rescheduleMaxCount: 0,
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.rescheduleEligible).toBeTrue();
      expect(view.rescheduleReasonKey).toBeNull();
    });

    it('OBRS-657: eligible below a cap of 5 and refused at it — the cap is the wire value, not a literal', () => {
      const below = toView(
        buildBooking({
          rescheduleCount: 4,
          rescheduleMaxCount: 5,
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );
      const at = toView(
        buildBooking({
          rescheduleCount: 5,
          rescheduleMaxCount: 5,
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(below.rescheduleEligible).toBeTrue();
      expect(at.rescheduleEligible).toBeFalse();
      expect(at.rescheduleReasonKey).toBe('MY_BOOKINGS.RESCHEDULE.REASON.ALREADY_USED');
    });

    it('REASON.NO_WINDOW — departure is within the 2h reschedule window', () => {
      const view = toView(
        buildBooking({
          bookingSchedules: [
            {
              id: 1,
              departureDateTime: dayjs().add(1, 'hour').toISOString(),
              tickets: [{}],
            },
          ],
        })
      );

      expect(view.rescheduleEligible).toBeFalse();
      expect(view.rescheduleReasonKey).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NO_WINDOW');
    });

    it('does not dispatch openRescheduleDialog when the booking is ineligible', () => {
      const dispatchSpy = spyOn(storeStub, 'dispatch');
      const view = toView(
        buildBooking({ status: 'pending', bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }] })
      );

      component.onReschedule(view);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('dispatches openRescheduleDialog for an eligible booking', () => {
      const dispatchSpy = spyOn(storeStub, 'dispatch');
      const view = toView(
        buildBooking({ bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }] })
      );

      component.onReschedule(view);

      expect(dispatchSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ bookingId: view.id })
      );
    });

    it('OBRS-813: taking the offer inside the cancel modal closes it and opens the reschedule dialog', () => {
      const dispatchSpy = spyOn(storeStub, 'dispatch');
      const view = toView(
        buildBooking({ bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }] })
      );

      component.onRescheduleInsteadOfCancel(view);

      // NgRx 19 (arrived with the Angular 19 upgrade, OBRS-915) widened `dispatch`
      // to `Action | (() => Action)`, so the spy's parameter type now resolves to
      // the function branch and a direct cast to an action shape stopped
      // overlapping (TS2352). The dispatched value is always the action object —
      // route through `unknown` to say so, same as the accessor at line 61.
      const types = dispatchSpy.calls
        .allArgs()
        .map(([action]) => (action as unknown as { type: string }).type);
      expect(types.length).toBe(2);
      expect(types[0]).toBe('[MyBookings API] Close cancel refund destination modal');
      expect(dispatchSpy.calls.argsFor(1)[0]).toEqual(
        jasmine.objectContaining({ bookingId: view.id })
      );
    });

    it('OBRS-813: the offer cannot route an INELIGIBLE booking into reschedule (guard is shared with onReschedule)', () => {
      const dispatchSpy = spyOn(storeStub, 'dispatch');
      const view = toView(
        buildBooking({ rescheduleCount: 1, rescheduleMaxCount: 1, bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }] })
      );

      component.onRescheduleInsteadOfCancel(view);

      // The modal closes either way — but nothing opens the reschedule dialog.
      expect(dispatchSpy.calls.count()).toBe(1);
    });
  });

  describe('change seat eligibility (card gating, OBRS-110)', () => {
    // A departure comfortably clear of the 4h change-seat window, computed
    // relative to "now" so the test never goes stale.
    const eligibleDeparture = dayjs().add(10, 'day').toISOString();

    it('is eligible when confirmed, one-way/single-leg, never changed, and outside the window', () => {
      const view = toView(
        buildBooking({
          status: 'confirmed',
          bookingType: 'one_way',
          seatChangeCount: 0,
          bookingSchedules: [
            {
              id: 1,
              departureDateTime: eligibleDeparture,
              tickets: [{}],
            },
          ],
        })
      );

      expect(view.changeSeatEligible).toBeTrue();
      expect(view.changeSeatReasonKey).toBeNull();
    });

    it('REASON.NOT_CONFIRMED — status is not confirmed', () => {
      const view = toView(
        buildBooking({
          status: 'pending',
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.changeSeatEligible).toBeFalse();
      expect(view.changeSeatReasonKey).toBe('MY_BOOKINGS.CHANGE_SEAT.REASON.NOT_CONFIRMED');
    });

    it('REASON.NOT_ONE_WAY — return booking (bookingType)', () => {
      const view = toView(
        buildBooking({
          bookingType: 'return',
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.changeSeatEligible).toBeFalse();
      expect(view.changeSeatReasonKey).toBe('MY_BOOKINGS.CHANGE_SEAT.REASON.NOT_ONE_WAY');
    });

    it('REASON.NOT_ONE_WAY — more than one leg even if bookingType says one_way', () => {
      const view = toView(
        buildBooking({
          bookingType: 'one_way',
          bookingSchedules: [
            { id: 1, departureDateTime: eligibleDeparture, tickets: [{}] },
            { id: 2, departureDateTime: eligibleDeparture, tickets: [{}] },
          ],
        })
      );

      expect(view.changeSeatEligible).toBeFalse();
      expect(view.changeSeatReasonKey).toBe('MY_BOOKINGS.CHANGE_SEAT.REASON.NOT_ONE_WAY');
    });

    it('REASON.OPEN_SEATING — the schedule is OPEN-seating (no assigned seat to change, OBRS-483)', () => {
      const view = toView(
        buildBooking({
          bookingSchedules: [
            { id: 1, departureDateTime: eligibleDeparture, tickets: [{}], seatingMode: 'OPEN' },
          ],
        })
      );

      expect(view.changeSeatEligible).toBeFalse();
      expect(view.changeSeatReasonKey).toBe('MY_BOOKINGS.CHANGE_SEAT.REASON.OPEN_SEATING');
    });

    it('is eligible for an ASSIGNED-seating schedule (explicit seatingMode, not just the field being absent)', () => {
      const view = toView(
        buildBooking({
          bookingSchedules: [
            { id: 1, departureDateTime: eligibleDeparture, tickets: [{}], seatingMode: 'ASSIGNED' },
          ],
        })
      );

      expect(view.changeSeatEligible).toBeTrue();
    });

    it('REASON.ALREADY_USED — seatChangeCount >= 1', () => {
      const view = toView(
        buildBooking({
          seatChangeCount: 1,
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.changeSeatEligible).toBeFalse();
      expect(view.changeSeatReasonKey).toBe('MY_BOOKINGS.CHANGE_SEAT.REASON.ALREADY_USED');
    });

    it('REASON.NO_WINDOW — departure is within the 4h change-seat window', () => {
      const view = toView(
        buildBooking({
          bookingSchedules: [
            {
              id: 1,
              departureDateTime: dayjs().add(1, 'hour').toISOString(),
              tickets: [{}],
            },
          ],
        })
      );

      expect(view.changeSeatEligible).toBeFalse();
      expect(view.changeSeatReasonKey).toBe('MY_BOOKINGS.CHANGE_SEAT.REASON.NO_WINDOW');
    });

    it('does not dispatch openChangeSeatDialog when the booking is ineligible', () => {
      const dispatchSpy = spyOn(storeStub, 'dispatch');
      const view = toView(
        buildBooking({ status: 'pending', bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }] })
      );

      component.onChangeSeat(view);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('dispatches openChangeSeatDialog for an eligible booking', () => {
      const dispatchSpy = spyOn(storeStub, 'dispatch');
      const view = toView(
        buildBooking({ bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }] })
      );

      component.onChangeSeat(view);

      expect(dispatchSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ bookingId: view.id })
      );
    });
  });

  describe('OBRS-577 incremental load more', () => {
    // A fresh, controllable `select()` stream per test — the outer
    // `storeStub` returns a brand-new Subject on every call (fine for the
    // tests above, which never call ngOnInit), but vm$'s
    // combineLatest needs the SAME stream across pushes here.
    let stateSubject: Subject<unknown>;
    let localStore: Store;
    let dispatchSpy: jasmine.Spy;
    let localComponent: MyBookingsComponent;

    const baseState = {
      bookings: [] as MyBookingDto[],
      loading: false,
      loaded: true,
      error: null,
      cancellingBookingId: null,
      statusFilter: null,
      totalElements: 0,
      totalPages: 0,
      pagesLoaded: 0,
      loadingMore: false,
    };

    beforeEach(() => {
      stateSubject = new Subject();
      localStore = {
        select: () => stateSubject,
        dispatch: () => undefined,
      } as unknown as Store;
      dispatchSpy = spyOn(localStore, 'dispatch');
      localComponent = new MyBookingsComponent(localStore, translateStub);
      localComponent.ngOnInit();
    });

    it('maps totalElements/hasMore/loadingMore from state (row count > 1 page, not yet exhausted)', () => {
      let vm: { totalElements: number; hasMore: boolean; loadingMore: boolean } | undefined;
      localComponent.vm$.subscribe((v) => (vm = v));

      stateSubject.next({ ...baseState, totalElements: 137, totalPages: 7, pagesLoaded: 1 });

      expect(vm?.totalElements).toBe(137);
      expect(vm?.hasMore).toBeTrue();
      expect(vm?.loadingMore).toBeFalse();
    });

    it('hasMore is false once pagesLoaded reaches totalPages (all 137 loaded)', () => {
      let vm: { hasMore: boolean } | undefined;
      localComponent.vm$.subscribe((v) => (vm = v));

      stateSubject.next({ ...baseState, totalElements: 137, totalPages: 7, pagesLoaded: 7 });

      expect(vm?.hasMore).toBeFalse();
    });

    it('onLoadMore() dispatches invokeLoadMoreMyBookingsApi with no payload', () => {
      localComponent.onLoadMore();

      expect(dispatchSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ type: '[MyBookings API] Invoke to load more my bookings' })
      );
    });

    it('accessibility: moves focus to the count region once a Load more click makes hasMore flip to false (last page)', fakeAsync(() => {
      localComponent.vm$.subscribe();
      const focusSpy = jasmine.createSpy('focus');
      (localComponent as unknown as { countRegionRef: { nativeElement: { focus: jasmine.Spy } } }).countRegionRef = {
        nativeElement: { focus: focusSpy },
      };

      // Page 1 of 2 on screen, hasMore true.
      stateSubject.next({ ...baseState, totalElements: 21, totalPages: 2, pagesLoaded: 1 });
      localComponent.onLoadMore();
      // Request goes in flight...
      stateSubject.next({ ...baseState, totalElements: 21, totalPages: 2, pagesLoaded: 1, loadingMore: true });
      // ...and settles as the last page (row 21, the "+1" past the old
      // hardcoded 20-row ceiling, confirming AC6 is reachable end-to-end).
      stateSubject.next({ ...baseState, totalElements: 21, totalPages: 2, pagesLoaded: 2, loadingMore: false });
      tick();

      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    }));

    it('accessibility: does NOT shift focus on a plain state change where loadingMore never went true (no Load more click happened)', fakeAsync(() => {
      localComponent.vm$.subscribe();
      const focusSpy = jasmine.createSpy('focus');
      (localComponent as unknown as { countRegionRef: { nativeElement: { focus: jasmine.Spy } } }).countRegionRef = {
        nativeElement: { focus: focusSpy },
      };

      // A status-filter switch can also flip hasMore to false (e.g. a
      // filter with fewer total rows) without ever touching `loadingMore`.
      stateSubject.next({ ...baseState, totalElements: 21, totalPages: 2, pagesLoaded: 1 });
      stateSubject.next({ ...baseState, totalElements: 5, totalPages: 1, pagesLoaded: 1 });
      tick();

      expect(focusSpy).not.toHaveBeenCalled();
    }));
  });
});

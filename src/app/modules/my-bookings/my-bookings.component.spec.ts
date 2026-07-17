import { Subject } from 'rxjs';
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
        tickets: [{}, {}],
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
    // A departure comfortably clear of the 4h reschedule window, computed
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

    it('REASON.ALREADY_USED — rescheduleCount >= 1', () => {
      const view = toView(
        buildBooking({
          rescheduleCount: 1,
          bookingSchedules: [{ id: 1, departureDateTime: eligibleDeparture, tickets: [{}] }],
        })
      );

      expect(view.rescheduleEligible).toBeFalse();
      expect(view.rescheduleReasonKey).toBe('MY_BOOKINGS.RESCHEDULE.REASON.ALREADY_USED');
    });

    it('REASON.NO_WINDOW — departure is within the 4h reschedule window', () => {
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
});

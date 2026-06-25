import { Subject } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';

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
    createdAt: '2026-06-01T10:00:00',
    bookingSchedules: [
      {
        id: 1,
        departureDateTime: '2026-12-20T08:00:00',
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

    expect(view.departureLabel).toBe('20 Dec 2026 • 08:00');
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
});

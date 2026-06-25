import { of, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../../../services/booking/booking.service';
import { BookingTicketsData } from '../../../../shared/interfaces/booking-ticket.interface';
import { MyBookingTicketModalComponent } from './my-booking-ticket-modal.component';

function buildTicketsData(): BookingTicketsData {
  return {
    bookingId: 5,
    bookingNumber: 'B-1',
    totalAmount: '500.00',
    contactPhoneNumber: '0812345678',
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: { code: 'a', label: 'Station A' },
        toStop: { code: 'b', label: 'Station B' },
        departureDateTime: '2026-12-20T08:00:00',
        arrivalDateTime: '2026-12-20T09:00:00',
        vehicle: {
          vehicleType: { code: 'van', label: 'Van' },
          numberPlate: '1234',
          vehicleNumber: '12',
        },
        tickets: [
          { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
        ],
      },
    ],
  };
}

describe('MyBookingTicketModalComponent', () => {
  let component: MyBookingTicketModalComponent;

  const bookingServiceStub = {
    getBookingTickets: () => of({ code: 200, message: 'OK', data: buildTicketsData() }),
  } as unknown as BookingService;

  const translateStub = {
    instant: (key: string) => key,
    currentLang: 'en',
  } as unknown as TranslateService;

  function changeBookingId(value: number): void {
    component.bookingId = value;
    component.ngOnChanges({
      bookingId: {
        currentValue: value,
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
  }

  beforeEach(() => {
    component = new MyBookingTicketModalComponent(bookingServiceStub, translateStub);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads and maps the ticket when the booking id changes', () => {
    changeBookingId(5);

    expect(component.loading).toBeFalse();
    expect(component.error).toBe('');
    expect(component.card?.bookingNumber).toBe('B-1');
    expect(component.card?.route).toBe('Station A - Station B');
    expect(component.card?.passengers.length).toBe(1);
    expect(component.card?.booker?.phone).toBe('0812345678');
  });

  it('surfaces a localized error when the request fails', () => {
    spyOn(bookingServiceStub, 'getBookingTickets').and.returnValue(
      throwError(() => new Error('boom'))
    );

    changeBookingId(5);

    expect(component.loading).toBeFalse();
    expect(component.card).toBeNull();
    expect(component.error).toBe('MY_BOOKINGS.TICKET_MODAL.LOAD_FAILED');
  });

  it('closes only when the backdrop itself is clicked', () => {
    const closedSpy = jasmine.createSpy('closed');
    component.closed.subscribe(closedSpy);

    const backdrop = {} as EventTarget;
    component.onBackdropClick({
      target: document.createElement('div'),
      currentTarget: backdrop,
    } as unknown as MouseEvent);
    expect(closedSpy).not.toHaveBeenCalled();

    component.onBackdropClick({
      target: backdrop,
      currentTarget: backdrop,
    } as unknown as MouseEvent);
    expect(closedSpy).toHaveBeenCalled();
  });
});

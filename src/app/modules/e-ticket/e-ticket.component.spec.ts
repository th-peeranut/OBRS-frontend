import { of, Subject } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';

import { ETicketComponent } from './e-ticket.component';
import { BookingService } from '../../services/booking/booking.service';
import { BookingTicketsData } from '../../shared/interfaces/booking-ticket.interface';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';

function buildTicketsData(): BookingTicketsData {
  return {
    bookingId: 1,
    bookingNumber: 'B-29RGZW',
    bookingStatus: 'confirmed',
    totalTickets: 2,
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: {
          code: 'nong_chak',
          label: 'Nong chak',
          province: { code: 'chonburi', label: 'Chonburi' },
        },
        toStop: {
          code: 'bts_mo_chit',
          label: 'Bts mo chit',
          province: { code: 'bangkok', label: 'Bangkok' },
        },
        departureDateTime: '2026-12-20 08:00:00',
        arrivalDateTime: '2026-12-20 09:48:00',
        vehicle: {
          vehicleType: { code: 'van', label: 'Van' },
          numberPlate: 'กข 1234',
          vehicleNumber: '12-34',
        },
        tickets: [
          {
            id: 1,
            ticketNumber: 'T-Q4QZXTZAFY',
            passengerType: { code: 'male', label: 'Male' },
            passengerName: 'Mr. Abc Def',
            seatNumber: '1',
            status: { code: 'confirmed', label: 'Confirmed' },
          },
        ],
      },
      {
        legType: { code: 'inbound', label: 'Inbound' },
        fromStop: {
          code: 'bts_mo_chit',
          label: 'Bts mo chit',
          province: { code: 'bangkok', label: 'Bangkok' },
        },
        toStop: {
          code: 'nong_chak',
          label: 'Nong chak',
          province: { code: 'chonburi', label: 'Chonburi' },
        },
        departureDateTime: '2026-12-20 18:14:00',
        arrivalDateTime: '2026-12-20 20:02:00',
        vehicle: {
          vehicleType: { code: 'van', label: 'Van' },
          numberPlate: 'กข 1234',
          vehicleNumber: '12-34',
        },
        tickets: [
          {
            id: 2,
            ticketNumber: 'T-JJTETZNMF2',
            passengerType: { code: 'male', label: 'Male' },
            passengerName: 'Mr. Abc Def',
            seatNumber: '1',
            status: { code: 'confirmed', label: 'Confirmed' },
          },
        ],
      },
    ],
  };
}

describe('ETicketComponent', () => {
  let component: ETicketComponent;

  const storeStub = {
    pipe: () => of(null),
    dispatch: () => undefined,
  } as unknown as Store;

  const bookingServiceStub = {
    getActiveBookingId: () => 1,
    getBookingTickets: () => of(null),
  } as unknown as BookingService;

  const translateStub = {
    onLangChange: new Subject(),
    currentLang: 'en',
  } as unknown as TranslateService;

  beforeEach(() => {
    component = new ETicketComponent(
      storeStub,
      bookingServiceStub,
      translateStub
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('applyApiOverrides', () => {
    const storePassengers: PassengerInfo[] = [
      {
        isAdult: true,
        title: 1,
        firstName: 'Abc',
        middleName: '',
        lastName: 'Def',
        phoneNumber: '0812345678',
        gender: 'male',
        isSelectSeat: true,
        passengerSeat: '1',
      },
    ];

    function apply(data: BookingTicketsData): void {
      (component as any).ticketApiData = data;
      (component as any).applyApiOverrides('en', storePassengers);
    }

    it('maps booking and ticket numbers from every journey', () => {
      apply(buildTicketsData());

      expect(component.bookingNumber).toBe('B-29RGZW');
      expect(component.ticketNumber).toBe('T-Q4QZXTZAFY, T-JJTETZNMF2');
    });

    it('maps route, origin and destination from the outbound stops', () => {
      apply(buildTicketsData());

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('Bts mo chit');
      expect(component.route).toBe(
        'Nong chak - Bts mo chit / Bts mo chit - Nong chak'
      );
    });

    it('maps travel date and time from the journeys', () => {
      apply(buildTicketsData());

      expect(component.travelDate).toBe('20 Dec 2026');
      expect(component.travelTime).toBe('08:00 - 09:48 / 18:14 - 20:02');
    });

    it('maps vehicle type from the code/label object shape', () => {
      apply(buildTicketsData());

      expect(component.vehicleType).toBe('Van');
      expect(component.vehiclePlate).toBe('12-34/กข 1234');
    });

    it('maps passengers and seats, matching phone from the store by seat', () => {
      apply(buildTicketsData());

      expect(component.seats).toBe('1');
      expect(component.passengers).toEqual([
        { name: 'Mr. Abc Def', phone: '0812345678', seat: '1' },
      ]);
    });

    it('selects the outbound journey even when legType order changes', () => {
      const data = buildTicketsData();
      data.journeys = [data.journeys![1], data.journeys![0]];

      apply(data);

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('Bts mo chit');
    });

    it('keeps a one-way booking without a return leg', () => {
      const data = buildTicketsData();
      data.journeys = [data.journeys![0]];

      apply(data);

      expect(component.ticketNumber).toBe('T-Q4QZXTZAFY');
      expect(component.route).toBe('Nong chak - Bts mo chit');
      expect(component.travelTime).toBe('08:00 - 09:48');
    });

    it('does nothing when there is no api data', () => {
      component.bookingNumber = 'STORE-REF';
      (component as any).ticketApiData = null;

      (component as any).applyApiOverrides('en', storePassengers);

      expect(component.bookingNumber).toBe('STORE-REF');
    });
  });
});

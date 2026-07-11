import { BookingTicketsData } from '../interfaces/booking-ticket.interface';
import { mapBookingTicketsToCard } from './booking-ticket-view';

function buildData(overrides: Partial<BookingTicketsData> = {}): BookingTicketsData {
  return {
    bookingId: 1,
    bookingNumber: 'B-1',
    totalAmount: '500.00',
    contactPhoneNumber: '0812345678',
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: {
          code: 'a',
          label: 'Station A',
          distanceKmFromOrigin: 10,
          offsetMinutesFromOrigin: 15,
        },
        toStop: {
          code: 'b',
          label: 'Station B',
          distanceKmFromOrigin: 55,
          offsetMinutesFromOrigin: 60,
        },
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
    ...overrides,
  };
}

describe('mapBookingTicketsToCard — distance estimate', () => {
  it('one-way booking: estimateDistanceKm is the rounded absolute delta, returnEstimateDistanceKm is null', () => {
    const card = mapBookingTicketsToCard(buildData(), 'en');

    expect(card.estimateDistanceKm).toBe(45);
    expect(card.returnEstimateDistanceKm).toBeNull();
  });

  it('round-trip booking with distinct return stops populates both estimates independently', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: {
            code: 'a',
            label: 'Station A',
            distanceKmFromOrigin: 10,
            offsetMinutesFromOrigin: 15,
          },
          toStop: {
            code: 'b',
            label: 'Station B',
            distanceKmFromOrigin: 55,
            offsetMinutesFromOrigin: 60,
          },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
        {
          legType: { code: 'inbound', label: 'Inbound' },
          fromStop: {
            code: 'b',
            label: 'Station B',
            distanceKmFromOrigin: 55,
            offsetMinutesFromOrigin: 60,
          },
          toStop: {
            code: 'c',
            label: 'Station C',
            distanceKmFromOrigin: 15,
            offsetMinutesFromOrigin: 20,
          },
          departureDateTime: '2026-12-25T08:00:00',
          arrivalDateTime: '2026-12-25T09:00:00',
          tickets: [
            { id: 2, ticketNumber: 'T-2', seatNumber: '2', passengerName: 'Mr A' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.estimateDistanceKm).toBe(45);
    expect(card.returnEstimateDistanceKm).toBe(40);
  });

  it('a stop missing distanceKmFromOrigin yields a null estimate', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: {
            code: 'b',
            label: 'Station B',
            distanceKmFromOrigin: 55,
            offsetMinutesFromOrigin: 60,
          },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.estimateDistanceKm).toBeNull();
    expect(card.returnEstimateDistanceKm).toBeNull();
  });
});

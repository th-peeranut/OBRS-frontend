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

function buildRoundTripData(
  overrides: Partial<BookingTicketsData> = {}
): BookingTicketsData {
  return buildData({
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
        vehicle: {
          vehicleType: { code: 'van', label: 'Van' },
          numberPlate: '5678',
          vehicleNumber: '34',
        },
        tickets: [
          { id: 2, ticketNumber: 'T-2', seatNumber: '2', passengerName: 'Mr A' },
        ],
      },
    ],
    ...overrides,
  });
}

describe('mapBookingTicketsToCard — legs', () => {
  it('one-way booking produces a single leg with the journey fields and the distance estimate', () => {
    const card = mapBookingTicketsToCard(buildData(), 'en');

    expect(card.legs.length).toBe(1);
    expect(card.legs[0].route).toBe('Station A - Station B');
    expect(card.legs[0].origin).toBe('Station A');
    expect(card.legs[0].destination).toBe('Station B');
    expect(card.legs[0].vehicleType).toBe('Van');
    expect(card.legs[0].vehiclePlate).toBe('12/1234');
    expect(card.legs[0].seats).toBe('1');
    expect(card.legs[0].distanceKm).toBe(45);
    expect(card.legs[0].travelDate).toBe('20 Dec 2026');
    expect(card.legs[0].travelTime).toBe('08:00 - 09:00');
  });

  it('round-trip booking produces two legs [outbound, return], each with its own route/date/time/seats/distance', () => {
    const card = mapBookingTicketsToCard(buildRoundTripData(), 'en');

    expect(card.legs.length).toBe(2);

    const [outboundLeg, returnLeg] = card.legs;
    expect(outboundLeg.route).toBe('Station A - Station B');
    expect(outboundLeg.travelDate).toBe('20 Dec 2026');
    expect(outboundLeg.travelTime).toBe('08:00 - 09:00');
    expect(outboundLeg.seats).toBe('1');
    expect(outboundLeg.distanceKm).toBe(45);

    expect(returnLeg.route).toBe('Station B - Station C');
    expect(returnLeg.travelDate).toBe('25 Dec 2026');
    expect(returnLeg.travelTime).toBe('08:00 - 09:00');
    expect(returnLeg.seats).toBe('2');
    expect(returnLeg.distanceKm).toBe(40);

    // Legs must be independently distinct, not the outbound leg duplicated.
    expect(returnLeg.route).not.toBe(outboundLeg.route);
    expect(returnLeg.distanceKm).not.toBe(outboundLeg.distanceKm);
  });

  it('empty journeys degrade to a single all-"-" placeholder leg, not zero legs', () => {
    const card = mapBookingTicketsToCard(buildData({ journeys: [] }), 'en');

    expect(card.legs.length).toBe(1);
    expect(card.legs[0].route).toBe('-');
    expect(card.legs[0].origin).toBe('-');
    expect(card.legs[0].destination).toBe('-');
    expect(card.legs[0].vehicleType).toBe('-');
    expect(card.legs[0].vehiclePlate).toBe('-');
    expect(card.legs[0].seats).toBe('-');
    expect(card.legs[0].travelDate).toBe('-');
    expect(card.legs[0].travelTime).toBe('-');
    expect(card.legs[0].distanceKm).toBeNull();
  });

  it('a stop missing distanceKmFromOrigin yields a null distanceKm for that leg', () => {
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

    expect(card.legs.length).toBe(1);
    expect(card.legs[0].distanceKm).toBeNull();
  });

  it('picks passenger names from the leg with the most tickets, falling back to outbound on a tie', () => {
    const data = buildRoundTripData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
        {
          legType: { code: 'inbound', label: 'Inbound' },
          fromStop: { code: 'b', label: 'Station B' },
          toStop: { code: 'a', label: 'Station A' },
          departureDateTime: '2026-12-25T08:00:00',
          arrivalDateTime: '2026-12-25T09:00:00',
          tickets: [
            { id: 2, ticketNumber: 'T-2', seatNumber: '1', passengerName: 'Mr A' },
            { id: 3, ticketNumber: 'T-3', seatNumber: '2', passengerName: 'Mrs B' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.passengers.length).toBe(2);
    expect(card.passengers.map((p) => p.name)).toEqual(['Mr A', 'Mrs B']);
  });

  it('falls back to the outbound leg for passenger names when ticket counts tie', () => {
    const card = mapBookingTicketsToCard(buildRoundTripData(), 'en');

    expect(card.passengers.length).toBe(1);
    expect(card.passengers[0].name).toBe('Mr A');
  });
});

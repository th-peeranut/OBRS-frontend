import { BookingTicketsData } from '../interfaces/booking-ticket.interface';
import { mapBookingTicketsToCard, mapBookingTicketsToTrackTargets } from './booking-ticket-view';

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

  it('OBRS-873: each leg carries its OWN tickets — the return leg\'s are never collapsed into the outbound\'s', () => {
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

    // The defect this replaces: a booking-level list built from "the fullest
    // journey" showed these two INBOUND names and silently dropped the
    // outbound ticket — whichever leg lost had no boarding QR at all.
    expect(card.legs[0].passengers.map((p) => p.ticketId)).toEqual([1]);
    expect(card.legs[0].passengers.map((p) => p.name)).toEqual(['Mr A']);
    expect(card.legs[1].passengers.map((p) => p.ticketId)).toEqual([2, 3]);
    expect(card.legs[1].passengers.map((p) => p.name)).toEqual(['Mr A', 'Mrs B']);
  });

  it('OBRS-873: a round trip whose legs tie on ticket count still exposes BOTH legs\' ticket ids', () => {
    const card = mapBookingTicketsToCard(buildRoundTripData(), 'en');

    expect(card.legs.length).toBe(2);
    // Same traveller on both legs, but two DIFFERENT tickets — which is exactly
    // why one shared passenger list could never board the return leg.
    expect(card.legs[0].passengers.map((p) => p.name)).toEqual(['Mr A']);
    expect(card.legs[1].passengers.map((p) => p.name)).toEqual(['Mr A']);
    expect(card.legs[0].passengers[0].ticketId).not.toBe(
      card.legs[1].passengers[0].ticketId
    );
  });

  it('OBRS-873: a one-way booking still yields exactly one leg with its own passengers', () => {
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
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.legs.length).toBe(1);
    expect(card.legs[0].passengers.map((p) => p.ticketNumber)).toEqual(['T-1']);
  });

  it('OBRS-866: threads each passenger\'s own ticketId/ticketNumber through, so the card can fetch that ticket\'s boarding token', () => {
    const data = buildRoundTripData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 11, ticketNumber: 'T-11', seatNumber: '1', passengerName: 'Mr A' },
            { id: 12, ticketNumber: 'T-12', seatNumber: '2', passengerName: 'Mrs B' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.legs[0].passengers.map((p) => p.ticketId)).toEqual([11, 12]);
    expect(card.legs[0].passengers.map((p) => p.ticketNumber)).toEqual(['T-11', 'T-12']);
  });

  it('OBRS-866: a ticket with no usable id yields ticketId null rather than a GET on /tickets/0/boarding-token', () => {
    const data = buildRoundTripData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 0, ticketNumber: 'T-0', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.legs[0].passengers[0].ticketId).toBeNull();
  });

  it('OBRS-269: maps each leg\'s pickupLatitude/pickupLongitude from its own fromStop coords', () => {
    const data = buildRoundTripData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A', latitude: 13.7563, longitude: 100.5018 },
          toStop: { code: 'b', label: 'Station B' },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
        {
          legType: { code: 'inbound', label: 'Inbound' },
          fromStop: { code: 'b', label: 'Station B', latitude: 18.7883, longitude: 98.9853 },
          toStop: { code: 'a', label: 'Station A' },
          departureDateTime: '2026-12-25T08:00:00',
          arrivalDateTime: '2026-12-25T09:00:00',
          tickets: [
            { id: 2, ticketNumber: 'T-2', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.legs[0].pickupLatitude).toBe(13.7563);
    expect(card.legs[0].pickupLongitude).toBe(100.5018);
    expect(card.legs[1].pickupLatitude).toBe(18.7883);
    expect(card.legs[1].pickupLongitude).toBe(98.9853);
  });

  it('OBRS-269: a fromStop with no coordinates maps to null pickupLatitude/pickupLongitude', () => {
    const card = mapBookingTicketsToCard(buildData(), 'en');

    expect(card.legs[0].pickupLatitude).toBeNull();
    expect(card.legs[0].pickupLongitude).toBeNull();
  });
});

describe('mapBookingTicketsToCard — isOpenSeating (OBRS-325)', () => {
  it('ASSIGNED regression: a leg whose tickets all carry a seatNumber is not open-seating', () => {
    const card = mapBookingTicketsToCard(buildData(), 'en');

    expect(card.legs[0].isOpenSeating).toBeFalse();
    expect(card.legs[0].seats).toBe('1');
  });

  it('OPEN: a leg whose tickets all have a null seatNumber is open-seating and seats stays "-"', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: undefined, passengerName: 'Mr A' },
            { id: 2, ticketNumber: 'T-2', seatNumber: undefined, passengerName: 'Mrs B' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.legs[0].isOpenSeating).toBeTrue();
    expect(card.legs[0].seats).toBe('-');
  });

  it('a leg with no tickets at all (the empty-journey placeholder) is not open-seating', () => {
    const card = mapBookingTicketsToCard(buildData({ journeys: [] }), 'en');

    expect(card.legs[0].isOpenSeating).toBeFalse();
  });

  it('round-trip: each leg\'s isOpenSeating is derived independently', () => {
    const data = buildRoundTripData();
    data.journeys![1].tickets = [
      { id: 2, ticketNumber: 'T-2', seatNumber: undefined, passengerName: 'Mr A' },
    ];

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.legs[0].isOpenSeating).toBeFalse();
    expect(card.legs[1].isOpenSeating).toBeTrue();
  });
});

describe('mapBookingTicketsToCard — province-level route heading (OBRS-264)', () => {
  it('uses the stop province names for the route line while keeping stop labels in origin/destination', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: {
            code: 'a',
            label: 'Nong Chak',
            province: { code: 'chonburi', label: 'Chonburi' },
          },
          toStop: {
            code: 'b',
            label: 'Mo Chit 2 Bus Terminal',
            province: { code: 'bangkok', label: 'Bangkok' },
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

    // Route line = province pair ...
    expect(card.legs[0].route).toBe('Chonburi - Bangkok');
    // ... while the specific stop names stay on the origin/destination detail rows.
    expect(card.legs[0].origin).toBe('Nong Chak');
    expect(card.legs[0].destination).toBe('Mo Chit 2 Bus Terminal');
  });

  it('reverses the province pair on the return leg of a round trip', () => {
    const data = buildRoundTripData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: {
            code: 'a',
            label: 'Nong Chak',
            province: { code: 'chonburi', label: 'Chonburi' },
          },
          toStop: {
            code: 'b',
            label: 'Mo Chit',
            province: { code: 'bangkok', label: 'Bangkok' },
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
            label: 'Mo Chit',
            province: { code: 'bangkok', label: 'Bangkok' },
          },
          toStop: {
            code: 'a',
            label: 'Nong Chak',
            province: { code: 'chonburi', label: 'Chonburi' },
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

    expect(card.legs[0].route).toBe('Chonburi - Bangkok');
    expect(card.legs[1].route).toBe('Bangkok - Chonburi');
  });

  it('falls back to both stop labels (not mixed granularity) when one stop has no province', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          // from has a province, to does not -> the whole line uses stop labels, so the
          // heading is not a mixed "Chonburi - Mo Chit 2 Bus Terminal".
          fromStop: {
            code: 'a',
            label: 'Nong Chak',
            province: { code: 'chonburi', label: 'Chonburi' },
          },
          toStop: { code: 'b', label: 'Mo Chit 2 Bus Terminal' },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'en');

    expect(card.legs[0].route).toBe('Nong Chak - Mo Chit 2 Bus Terminal');
  });

  it('uses stop labels (not "Province - Province") for a same-province segment', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          // both stops sit in Chonburi -> province pair would be a useless "Chonburi - Chonburi".
          fromStop: {
            code: 'a',
            label: 'Nong Chak',
            province: { code: 'chonburi', label: 'Chonburi' },
          },
          toStop: {
            code: 'b',
            label: 'Ban Bueng Hospital',
            province: { code: 'chonburi', label: 'Chonburi' },
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

    expect(card.legs[0].route).toBe('Nong Chak - Ban Bueng Hospital');
    // detail rows unchanged
    expect(card.legs[0].origin).toBe('Nong Chak');
    expect(card.legs[0].destination).toBe('Ban Bueng Hospital');
  });
});

// OBRS-1219 — the owner reversed OBRS-264 for this one line on 2026-08-10: the route line is the
// ROUTE's name now, and the province pair survives as the fallback for a route with no seeded
// name. The block above is deliberately left intact — it still describes what happens when
// `routeLabel` is absent, which is a live state, not a legacy one (`zh`, OBRS-1046).
describe('mapBookingTicketsToCard — route name on the route line (OBRS-1219)', () => {
  it('prefers the route name over the province pair, and leaves the stop detail rows alone', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          routeLabel: 'หนองชาก-บ้านบึง-กรุงเทพฯ',
          fromStop: {
            code: 'a',
            label: 'หนองชาก',
            province: { code: 'chonburi', label: 'ชลบุรี' },
          },
          toStop: {
            code: 'b',
            label: 'หมอชิต 2',
            province: { code: 'bangkok', label: 'กรุงเทพมหานคร' },
          },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'th');

    // The province pair this same fixture produces under OBRS-264 alone is named explicitly:
    // this asserts the route name WON, not merely that the line is non-empty.
    expect(card.legs[0].route).toBe('หนองชาก-บ้านบึง-กรุงเทพฯ');
    expect(card.legs[0].route).not.toBe('ชลบุรี - กรุงเทพมหานคร');
    // AC-2 (= OBRS-264's AC-3): the stop-level rows keep their own stop labels.
    expect(card.legs[0].origin).toBe('หนองชาก');
    expect(card.legs[0].destination).toBe('หมอชิต 2');
  });

  it('AC-3: each leg of a round trip carries its own route name', () => {
    const data = buildRoundTripData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          routeLabel: 'หนองชาก-บ้านบึง-กรุงเทพฯ',
          fromStop: { code: 'a', label: 'หนองชาก' },
          toStop: { code: 'b', label: 'หมอชิต 2' },
          departureDateTime: '2026-12-20T08:00:00',
          arrivalDateTime: '2026-12-20T09:00:00',
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
          ],
        },
        {
          legType: { code: 'inbound', label: 'Inbound' },
          routeLabel: 'กรุงเทพฯ-บ้านบึง-หนองชาก',
          fromStop: { code: 'b', label: 'หมอชิต 2' },
          toStop: { code: 'a', label: 'หนองชาก' },
          departureDateTime: '2026-12-25T08:00:00',
          arrivalDateTime: '2026-12-25T09:00:00',
          tickets: [
            { id: 2, ticketNumber: 'T-2', seatNumber: '2', passengerName: 'Mr A' },
          ],
        },
      ],
    });

    const card = mapBookingTicketsToCard(data, 'th');

    expect(card.legs[0].route).toBe('หนองชาก-บ้านบึง-กรุงเทพฯ');
    expect(card.legs[1].route).toBe('กรุงเทพฯ-บ้านบึง-หนองชาก');
  });

  it('AC-4: no route name falls back to the province pair, not to a dash', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          // What the backend sends for a route with no seeded translation in any locale of the
          // ladder: RouteLabelResolver answers null rather than '-' precisely so this runs.
          routeLabel: null,
          fromStop: {
            code: 'a',
            label: 'Nong Chak',
            province: { code: 'chonburi', label: 'Chonburi' },
          },
          toStop: {
            code: 'b',
            label: 'Mo Chit',
            province: { code: 'bangkok', label: 'Bangkok' },
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

    expect(card.legs[0].route).toBe('Chonburi - Bangkok');
  });

  it('AC-4: a blank route name is not an answer either — the pair still wins', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          routeLabel: '   ',
          fromStop: {
            code: 'a',
            label: 'Nong Chak',
            province: { code: 'chonburi', label: 'Chonburi' },
          },
          toStop: {
            code: 'b',
            label: 'Mo Chit',
            province: { code: 'bangkok', label: 'Bangkok' },
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

    expect(card.legs[0].route).toBe('Chonburi - Bangkok');
  });
});

// SPEC-OBRS-426 M1 — mapBookingTicketsToTrackTargets (BR-4a/BR-5/BR-6).
describe('mapBookingTicketsToTrackTargets', () => {
  it('U8: carries the real ticket id through — TicketLeg drops it entirely (BR-5)', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          tickets: [{ id: 4321, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' }],
        },
      ],
    });

    const targets = mapBookingTicketsToTrackTargets(data);

    expect(targets[0]?.ticketId).toBe(4321);
  });

  it('U9: an INBOUND-FIRST wire response still pairs by legType.code, not array order (the BR-4a headline bug)', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'inbound', label: 'Inbound' },
          fromStop: { code: 'b', label: 'Station B' },
          toStop: { code: 'a', label: 'Station A' },
          tickets: [{ id: 222, ticketNumber: 'T-2', seatNumber: '2', passengerName: 'Mr A' }],
        },
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          tickets: [{ id: 111, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' }],
        },
      ],
    });

    const targets = mapBookingTicketsToTrackTargets(data);
    const card = mapBookingTicketsToCard(data, 'en');

    // targets[0] must be the OUTBOUND ticket (111), matching card.legs[0]
    // (also outbound) — never the wire-order-first inbound ticket (222).
    expect(targets[0]?.ticketId).toBe(111);
    expect(targets[1]?.ticketId).toBe(222);
    expect(card.legs[0].route).toBe('Station A - Station B'); // outbound
    expect(card.legs[1].route).toBe('Station B - Station A'); // inbound
  });

  it('U9a: a THREE-journey fixture still emits exactly two targets, index-aligned with the card\'s two legs', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          tickets: [{ id: 111, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' }],
        },
        {
          legType: { code: 'inbound', label: 'Inbound' },
          fromStop: { code: 'b', label: 'Station B' },
          toStop: { code: 'a', label: 'Station A' },
          tickets: [{ id: 222, ticketNumber: 'T-2', seatNumber: '2', passengerName: 'Mr A' }],
        },
        {
          legType: { code: 'outbound', label: 'Outbound (dup)' },
          fromStop: { code: 'c', label: 'Station C' },
          toStop: { code: 'd', label: 'Station D' },
          tickets: [{ id: 333, ticketNumber: 'T-3', seatNumber: '3', passengerName: 'Mr A' }],
        },
      ],
    });

    const targets = mapBookingTicketsToTrackTargets(data);
    const card = mapBookingTicketsToCard(data, 'en');

    expect(targets.length).toBe(2);
    expect(card.legs.length).toBe(2);
  });

  it('U10: carries fromStop lat/lon through when present; null (never 0) when absent — target still produced', () => {
    const withCoords = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A', latitude: 13.7563, longitude: 100.5018 },
          toStop: { code: 'b', label: 'Station B' },
          tickets: [{ id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' }],
        },
      ],
    });
    const withoutCoords = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          tickets: [{ id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' }],
        },
      ],
    });

    expect(mapBookingTicketsToTrackTargets(withCoords)[0]).toEqual({
      ticketId: 1,
      boardingStopLabel: 'Station A',
      boardingStopLat: 13.7563,
      boardingStopLon: 100.5018,
    });
    const target = mapBookingTicketsToTrackTargets(withoutCoords)[0];
    expect(target).not.toBeNull();
    expect(target?.boardingStopLat).toBeNull();
    expect(target?.boardingStopLon).toBeNull();
  });

  it('U11: outbound leg with zero tickets yields a NULL HOLE at index 0, never a shifted/filtered array', () => {
    const data = buildRoundTripData();
    data.journeys![0].tickets = []; // outbound now has no tickets

    const targets = mapBookingTicketsToTrackTargets(data);

    expect(targets.length).toBe(2);
    expect(targets[0]).toBeNull();
    expect(targets[1]?.ticketId).toBe(2); // still the inbound leg's id, still at index 1
  });

  it('U12: a partially-cancelled leg selects the confirmed ticket, not tickets[0] (BR-6)', () => {
    const data = buildData({
      journeys: [
        {
          legType: { code: 'outbound', label: 'Outbound' },
          fromStop: { code: 'a', label: 'Station A' },
          toStop: { code: 'b', label: 'Station B' },
          tickets: [
            { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A', status: { code: 'cancelled', label: 'Cancelled' } },
            { id: 2, ticketNumber: 'T-2', seatNumber: '2', passengerName: 'Mrs B', status: { code: 'confirmed', label: 'Confirmed' } },
          ],
        },
      ],
    });

    const targets = mapBookingTicketsToTrackTargets(data);

    expect(targets[0]?.ticketId).toBe(2);
  });

  it('U13: mapBookingTicketsToCard\'s own output is unchanged by the M1 addition (regression pin)', () => {
    const card = mapBookingTicketsToCard(buildRoundTripData(), 'en');

    expect(card).toEqual({
      bookingNumber: 'B-1',
      ticketNumber: 'T-1, T-2',
      legs: [
        jasmine.objectContaining({
          route: 'Station A - Station B',
          seats: '1',
          distanceKm: 45,
          // OBRS-873: each leg owns its ticket rows; there is no booking-level
          // `passengers` key on the card any more.
          passengers: [jasmine.objectContaining({ name: 'Mr A', ticketNumber: 'T-1' })],
        }),
        jasmine.objectContaining({
          route: 'Station B - Station C',
          seats: '2',
          distanceKm: 40,
          passengers: [jasmine.objectContaining({ name: 'Mr A', ticketNumber: 'T-2' })],
        }),
      ],
      // OBRS-866: the booker is a contact row, not a traveller — no ticket of
      // its own, so it never gets a boarding QR.
      booker: {
        name: '-',
        phone: '0812345678',
        seat: '-',
        ticketId: null,
        ticketNumber: '-',
      },
      paymentDate: '-',
      totalAmount: '500.00',
    });
  });
});

import dayjs from 'dayjs';
import {
  BookingTicketJourney,
  BookingTicketsData,
} from '../interfaces/booking-ticket.interface';
import {
  ETicketCardData,
  TicketLeg,
  TicketPassenger,
} from '../interfaces/e-ticket.interface';
import { laterBangkokArrivalDay, tripEstimateFromStops } from './trip-format';

export type ETicketLocale = 'en' | 'th' | 'zh';

const MONTHS: Record<ETicketLocale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
};

/**
 * Maps a `BookingTicketsData` API response (GET /bookings/{id}/tickets) into the
 * per-leg fields the shared e-ticket card renders. Pure — drives the my-bookings
 * ticket modal without the booking-flow store the e-ticket page relies on.
 */
export function mapBookingTicketsToCard(
  data: BookingTicketsData,
  locale: ETicketLocale
): ETicketCardData {
  const journeys = data.journeys ?? [];
  const { outbound, inbound } = resolveLegPair(journeys);

  const journeyToLeg = (journey: BookingTicketJourney): TicketLeg => {
    // OBRS-873: built once and KEPT on the leg. It used to be built here, boiled
    // down to the seat string, and discarded — so the only passenger rows that
    // survived into the card came from a second, booking-level call below that
    // could see one leg at a time.
    const passengers = buildPassengers(journey);
    return {
      travelDate: formatDate(journey.departureDateTime, locale) || '-',
      travelTime:
        formatTimeRange(journey.departureDateTime, journey.arrivalDateTime) || '-',
      // OBRS-1510 (AC-2): filled only when this leg lands on a later Bangkok
      // day than it left — same rule the e-ticket page has used since
      // OBRS-1502, now on the shared card so the modal gets the same cell.
      arrivalDate: arrivalDateWhenLater(journey, locale),
      // OBRS-1219: the route's own name when the backend could resolve one, and
      // OBRS-264's province pair when it could not (an unseeded locale — `zh` is
      // seeded in none today, OBRS-1046). Both halves are load-bearing: the owner
      // asked for the route name on 2026-08-10, and 264's pair is the only thing
      // left to print when there is no name to print.
      route:
        journey.routeLabel?.trim() ||
        buildSingleLegRoute(journey.fromStop, journey.toStop),
      // AC-2: the stop-level detail rows are NOT touched by the line above — they
      // keep the specific stop labels, which is OBRS-264's own AC-3.
      origin: journey.fromStop?.label?.trim() || '-',
      destination: journey.toStop?.label?.trim() || '-',
      vehicleType: formatVehicleType(journey.vehicle?.vehicleType?.label) || '-',
      vehiclePlate:
        buildVehiclePlate(
          journey.vehicle?.vehicleNumber,
          journey.vehicle?.numberPlate
        ) || '-',
      seats: buildSeatList(passengers) || '-',
      isOpenSeating: isJourneyOpenSeating(journey),
      distanceKm: tripEstimateFromStops(journey.fromStop, journey.toStop).distanceKm,
      pickupLatitude: journey.fromStop?.latitude ?? null,
      pickupLongitude: journey.fromStop?.longitude ?? null,
      passengers,
    };
  };

  const legs: TicketLeg[] = [outbound, inbound]
    .filter((journey): journey is BookingTicketJourney => !!journey)
    .map(journeyToLeg);
  if (legs.length === 0) {
    // Degrade to a single all-'-' placeholder leg rather than an empty array, so the
    // card always has at least one leg to render (matches the pre-OBRS-254 flat-mapper
    // behaviour of showing dashes instead of nothing).
    legs.push(journeyToLeg({}));
  }

  // OBRS-873: no booking-level `passengers` any more. It used to pick ONE
  // journey ("the fullest", tie-breaking to outbound) and render its tickets as
  // the whole booking's passenger list — which on a round trip silently dropped
  // the other leg's tickets, and with them the only QR that leg's passengers
  // could have boarded with. Names repeating across the two legs is the correct
  // reading of a round trip: each leg really does issue its own ticket.
  return {
    bookingNumber: data.bookingNumber?.trim() || '-',
    ticketNumber: collectTicketNumbers(journeys) || '-',
    legs,
    booker: buildBooker(data),
    paymentDate: '-',
    totalAmount: formatAmount(data.totalAmount),
  };
}

/** OBRS-1510: the same rule `e-ticket.component.ts`'s `arrivalDateWhenLater`
 *  applies to the store pass — kept as its own function here (not exported)
 *  because `BookingTicketJourney`'s field names differ from that page's
 *  `TripTimestamps`, even though the two satisfy the same shape. */
function arrivalDateWhenLater(
  journey: BookingTicketJourney,
  locale: ETicketLocale
): string {
  const arrivalDay = laterBangkokArrivalDay(
    journey.departureDateTime,
    journey.arrivalDateTime
  );
  return arrivalDay ? formatDate(arrivalDay, locale) : '';
}

function findJourney(
  journeys: BookingTicketJourney[],
  code: string
): BookingTicketJourney | null {
  return (
    journeys.find(
      (journey) => (journey.legType?.code ?? '').trim().toLowerCase() === code
    ) ?? null
  );
}

/**
 * SPEC-OBRS-426 BR-4a: the ONE shared outbound/inbound pair-resolution rule,
 * used by BOTH `mapBookingTicketsToCard` and `mapBookingTicketsToTrackTargets`
 * below. Resolves by `legType.code`, never by `journeys[]` array order —
 * `journeys[]` order is not guaranteed on the wire, and a booking can (and
 * does, in practice) arrive inbound-first. Do not fork this selection logic
 * into a second copy; two copies of a pairing rule is how they drift.
 */
function resolveLegPair(journeys: BookingTicketJourney[]): {
  outbound: BookingTicketJourney | null;
  inbound: BookingTicketJourney | null;
} {
  const outbound = findJourney(journeys, 'outbound') ?? journeys[0] ?? null;
  const inbound =
    findJourney(journeys, 'inbound') ?? (journeys.length > 1 ? journeys[1] : null);
  return { outbound, inbound };
}

/** SPEC-OBRS-426 M1 output — one per journey leg, `null` when the leg has no
 * eligible ticket to track. */
export interface TripTrackTarget {
  ticketId: number;
  boardingStopLabel: string;
  boardingStopLat: number | null;
  boardingStopLon: number | null;
}

/** SPEC-OBRS-426 BR-6: selection heuristic only (never a security dispatch —
 * the backend re-verifies ownership/window regardless). Deliberate LITERAL
 * copy of the backend's `CustomerTripPositionService.OPEN_TICKET_STATUSES`;
 * see the spec's "Known duplication, accepted with eyes open" note — a future
 * backend change to that allow-list must grep this file in the same pass. */
const TRACKABLE_TICKET_STATUSES = ['confirmed', 'checked_in'];

/**
 * M1 (SPEC-OBRS-426 BR-5): resolves the per-leg vehicle-tracking target for
 * the my-bookings ticket modal. `TicketLeg` (the e-ticket card's own view
 * model) drops `journey.tickets[].id` entirely — this mapper reads it from
 * the raw `BookingTicketsData.journeys[].tickets[].id` the card mapper never
 * exposes.
 *
 * Returns exactly two entries, `[outboundTarget, inboundTarget]`, resolved by
 * the SAME `resolveLegPair` helper `mapBookingTicketsToCard` uses — so the two
 * mappers can never disagree about which journey is "the outbound leg"
 * (BR-4a). A leg with no eligible ticket yields a `null` HOLE at that index,
 * never a shortened/filtered array: the caller indexes into this array by the
 * same position it indexes into `ETicketCardData.legs`, so index alignment is
 * the whole contract.
 */
export function mapBookingTicketsToTrackTargets(
  data: BookingTicketsData
): (TripTrackTarget | null)[] {
  const journeys = data.journeys ?? [];
  const { outbound, inbound } = resolveLegPair(journeys);
  return [outbound, inbound].map(buildTrackTarget);
}

function buildTrackTarget(journey: BookingTicketJourney | null): TripTrackTarget | null {
  const tickets = journey?.tickets ?? [];
  if (tickets.length === 0) {
    return null;
  }
  const ticket =
    tickets.find((t) =>
      TRACKABLE_TICKET_STATUSES.includes((t.status?.code ?? '').trim().toLowerCase())
    ) ?? tickets[0];

  return {
    ticketId: ticket.id,
    boardingStopLabel: journey?.fromStop?.label?.trim() || '-',
    boardingStopLat: journey?.fromStop?.latitude ?? null,
    boardingStopLon: journey?.fromStop?.longitude ?? null,
  };
}

function collectTicketNumbers(journeys: BookingTicketJourney[]): string {
  const numbers: string[] = [];
  for (const journey of journeys) {
    for (const ticket of journey.tickets ?? []) {
      const number = ticket.ticketNumber?.trim();
      if (number && !numbers.includes(number)) {
        numbers.push(number);
      }
    }
  }
  return numbers.join(', ');
}

function buildPassengers(journey: BookingTicketJourney | null): TicketPassenger[] {
  const tickets = journey?.tickets ?? [];
  return tickets.map((ticket) => ({
    name: ticket.passengerName?.trim() || '-',
    phone: '-',
    seat: ticket.seatNumber?.trim() || '-',
    // OBRS-866: the row's own ticket id — what the card turns into a
    // boarding-token QR. Same guard the e-ticket page uses: a missing/0 id
    // becomes `null` (no QR) rather than a GET on `/tickets/0/boarding-token`.
    ticketId: Number.isFinite(ticket.id) && ticket.id > 0 ? ticket.id : null,
    ticketNumber: ticket.ticketNumber?.trim() || '-',
    // OBRS-296: server-authoritative — carried straight through, never
    // re-derived client-side.
    fareCategory: ticket.fareCategory ?? null,
    // OBRS-1510 (AC-8): per-ticket, mirrors isJourneyOpenSeating's own signal.
    seatOpen: !ticket.seatNumber?.trim(),
  }));
}

/**
 * OBRS-325: a leg is open-seating when it has at least one ticket and every
 * ticket's `seatNumber` is null/blank (`schedules.seating_mode = OPEN`,
 * OBRS-321 — the read DTO doesn't expose `seatingMode` itself yet on the FE
 * models, so this derives the same signal from `seat_number == null`; see the
 * handoff note requesting the field directly). A leg with zero tickets (the
 * empty-journey placeholder) is not "open" — it's the pre-existing "no data"
 * case and must keep showing the `'-'` placeholder unchanged.
 */
function isJourneyOpenSeating(journey: BookingTicketJourney): boolean {
  const tickets = journey.tickets ?? [];
  if (tickets.length === 0) {
    return false;
  }
  return tickets.every((ticket) => !ticket.seatNumber?.trim());
}

function buildSeatList(passengers: TicketPassenger[]): string {
  const seats = passengers
    .map((passenger) => passenger.seat)
    .filter((seat) => seat && seat !== '-');
  return seats.join(', ');
}

function buildBooker(data: BookingTicketsData): TicketPassenger | null {
  const phone = data.contactPhoneNumber?.trim();
  // The booker is a contact row, not a traveller — it has no ticket of its
  // own, so `ticketId: null` (OBRS-866) keeps it out of the QR fetch entirely.
  return phone
    ? { name: '-', phone, seat: '-', ticketId: null, ticketNumber: '-', seatOpen: false }
    : null;
}

function buildSingleLegRoute(
  fromStop: BookingTicketJourney['fromStop'],
  toStop: BookingTicketJourney['toStop']
): string {
  const fromProvince = fromStop?.province?.label?.trim() ?? '';
  const toProvince = toStop?.province?.label?.trim() ?? '';
  // Show the province pair (e.g. "ชลบุรี - กรุงเทพมหานคร") only when BOTH stops have a
  // province AND the two differ — the intercity case. For a same-province segment the
  // province pair would collapse to a useless "ชลบุรี - ชลบุรี", and a partially-mapped
  // segment would read at mixed granularity; in both cases fall back to the distinct stop
  // labels so the line stays informative and consistent. The origin/destination detail
  // rows always keep the specific stop labels regardless.
  const useProvince = !!fromProvince && !!toProvince && fromProvince !== toProvince;
  const from = useProvince ? fromProvince : (fromStop?.label?.trim() ?? '');
  const to = useProvince ? toProvince : (toStop?.label?.trim() ?? '');
  if (from && to) {
    return `${from} - ${to}`;
  }
  return from || to || '-';
}

function buildVehiclePlate(
  vehicleNumber: string | undefined,
  numberPlate: string | undefined
): string {
  const number = vehicleNumber?.trim() ?? '';
  const plate = numberPlate?.trim() ?? '';
  if (number && plate) {
    return `${number}/${plate}`;
  }
  return number || plate || '';
}

function formatVehicleType(type: string | null | undefined): string {
  const value = type?.trim();
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(dateTime: string | undefined, locale: ETicketLocale): string {
  if (!dateTime) {
    return '';
  }
  const date = dayjs(dateTime);
  if (!date.isValid()) {
    return '';
  }
  return `${date.date()} ${MONTHS[locale][date.month()]} ${date.year()}`;
}

function formatTimeRange(
  departureDateTime: string | undefined,
  arrivalDateTime: string | undefined
): string {
  const startTime = formatTime(departureDateTime);
  const endTime = formatTime(arrivalDateTime);
  if (startTime && endTime) {
    return `${startTime} - ${endTime}`;
  }
  return startTime || endTime || '';
}

function formatTime(dateTime: string | undefined): string {
  if (!dateTime) {
    return '';
  }
  const date = dayjs(dateTime);
  return date.isValid() ? date.format('HH:mm') : '';
}

function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value);
}

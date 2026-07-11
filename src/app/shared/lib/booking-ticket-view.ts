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
import { tripEstimateFromStops } from './trip-format';

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
  const outbound = findJourney(journeys, 'outbound') ?? journeys[0] ?? null;
  const inbound =
    findJourney(journeys, 'inbound') ?? (journeys.length > 1 ? journeys[1] : null);

  const journeyToLeg = (journey: BookingTicketJourney): TicketLeg => ({
    travelDate: formatDate(journey.departureDateTime, locale) || '-',
    travelTime:
      formatTimeRange(journey.departureDateTime, journey.arrivalDateTime) || '-',
    route: buildSingleLegRoute(journey.fromStop, journey.toStop),
    origin: journey.fromStop?.label?.trim() || '-',
    destination: journey.toStop?.label?.trim() || '-',
    vehicleType: formatVehicleType(journey.vehicle?.vehicleType?.label) || '-',
    vehiclePlate:
      buildVehiclePlate(
        journey.vehicle?.vehicleNumber,
        journey.vehicle?.numberPlate
      ) || '-',
    seats: buildSeatList(buildPassengers(journey)) || '-',
    distanceKm: tripEstimateFromStops(journey.fromStop, journey.toStop).distanceKm,
  });

  const legs: TicketLeg[] = [outbound, inbound]
    .filter((journey): journey is BookingTicketJourney => !!journey)
    .map(journeyToLeg);
  if (legs.length === 0) {
    // Degrade to a single all-'-' placeholder leg rather than an empty array, so the
    // card always has at least one leg to render (matches the pre-OBRS-254 flat-mapper
    // behaviour of showing dashes instead of nothing).
    legs.push(journeyToLeg({}));
  }

  // Travellers are assumed identical across legs (the FE model can't guarantee it —
  // a round-trip pairs the same passengers on both legs); seats are shown per-leg
  // (`TicketLeg.seats` above), but names are shown once, taken from whichever leg has
  // the most tickets (falling back to outbound) so a leg with more passengers than the
  // outbound leg doesn't drop names.
  const passengers = buildPassengers(fullestJourney(journeys) ?? outbound);

  return {
    bookingNumber: data.bookingNumber?.trim() || '-',
    ticketNumber: collectTicketNumbers(journeys) || '-',
    legs,
    passengers,
    booker: buildBooker(data),
    paymentDate: '-',
    totalAmount: formatAmount(data.totalAmount),
  };
}

function fullestJourney(
  journeys: BookingTicketJourney[]
): BookingTicketJourney | null {
  if (journeys.length === 0) {
    return null;
  }
  return journeys.reduce((fullest, journey) =>
    (journey.tickets?.length ?? 0) > (fullest.tickets?.length ?? 0) ? journey : fullest
  );
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
  }));
}

function buildSeatList(passengers: TicketPassenger[]): string {
  const seats = passengers
    .map((passenger) => passenger.seat)
    .filter((seat) => seat && seat !== '-');
  return seats.join(', ');
}

function buildBooker(data: BookingTicketsData): TicketPassenger | null {
  const phone = data.contactPhoneNumber?.trim();
  return phone ? { name: '-', phone, seat: '-' } : null;
}

function buildSingleLegRoute(
  fromStop: BookingTicketJourney['fromStop'],
  toStop: BookingTicketJourney['toStop']
): string {
  const from = fromStop?.label?.trim() ?? '';
  const to = toStop?.label?.trim() ?? '';
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

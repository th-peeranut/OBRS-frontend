import dayjs from 'dayjs';
import {
  BookingTicketJourney,
  BookingTicketsData,
} from '../interfaces/booking-ticket.interface';
import { ETicketCardData, TicketPassenger } from '../interfaces/e-ticket.interface';

export type ETicketLocale = 'en' | 'th' | 'zh';

const MONTHS: Record<ETicketLocale, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
};

/**
 * Maps a `BookingTicketsData` API response (GET /bookings/{id}/tickets) into the
 * flat fields the shared e-ticket card renders. Pure — drives the my-bookings
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

  const origin = outbound?.fromStop?.label?.trim() ?? '';
  const destination = outbound?.toStop?.label?.trim() ?? '';
  const passengers = buildPassengers(outbound);

  return {
    bookingNumber: data.bookingNumber?.trim() || '-',
    ticketNumber: collectTicketNumbers(journeys) || '-',
    travelDate: buildTravelDate(
      outbound?.departureDateTime,
      inbound?.departureDateTime,
      locale
    ),
    travelTime: buildTravelTime(outbound, inbound),
    route: buildRouteLabel(origin, destination, !!inbound),
    origin: origin || '-',
    destination: destination || '-',
    vehicleType: formatVehicleType(outbound?.vehicle?.vehicleType?.label) || '-',
    vehiclePlate:
      buildVehiclePlate(
        outbound?.vehicle?.vehicleNumber,
        outbound?.vehicle?.numberPlate
      ) || '-',
    seats: buildSeatList(passengers) || '-',
    passengers,
    booker: buildBooker(data),
    paymentDate: '-',
    totalAmount: formatAmount(data.totalAmount),
  };
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

function buildTravelDate(
  departureDateTime: string | undefined,
  returnDateTime: string | undefined,
  locale: ETicketLocale
): string {
  const departureDate = formatDate(departureDateTime, locale);
  const returnDate = formatDate(returnDateTime, locale);
  if (departureDate && returnDate && departureDate !== returnDate) {
    return `${departureDate} / ${returnDate}`;
  }
  return departureDate || returnDate || '-';
}

function buildTravelTime(
  outbound: BookingTicketJourney | null,
  inbound: BookingTicketJourney | null
): string {
  const departureTime = formatTimeRange(
    outbound?.departureDateTime,
    outbound?.arrivalDateTime
  );
  const returnTime = formatTimeRange(
    inbound?.departureDateTime,
    inbound?.arrivalDateTime
  );
  if (departureTime && returnTime) {
    return `${departureTime} / ${returnTime}`;
  }
  return departureTime || returnTime || '-';
}

function buildRouteLabel(from: string, to: string, hasReturn: boolean): string {
  const departureRoute = from && to ? `${from} - ${to}` : from || to;
  if (!departureRoute) {
    return '-';
  }
  if (!hasReturn || !from || !to) {
    return departureRoute;
  }
  return `${departureRoute} / ${to} - ${from}`;
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

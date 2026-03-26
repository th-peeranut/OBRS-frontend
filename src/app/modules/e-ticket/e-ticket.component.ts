import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import {
  combineLatest,
  firstValueFrom,
  map,
  Observable,
  startWith,
  Subject,
  takeUntil,
} from 'rxjs';
import dayjs from 'dayjs';
import QRCode from 'qrcode';
import { BookingService } from '../../services/booking/booking.service';
import { BookingState } from '../../shared/interfaces/booking.interface';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import { ScheduleBooking } from '../../shared/interfaces/schedule-booking.interface';
import { Schedule, ScheduleFilter } from '../../shared/interfaces/schedule.interface';
import { StationApi } from '../../shared/interfaces/station.interface';
import { invokeGetBookingApi } from '../../shared/stores/booking/booking.action';
import { selectBooking } from '../../shared/stores/booking/booking.selector';
import { invokeGetPassengerInfo } from '../../shared/stores/passenger-info/passenger-info.action';
import { selectPassengerInfo } from '../../shared/stores/passenger-info/passenger-info.selector';
import { invokeGetScheduleBookingApi } from '../../shared/stores/schedule-booking/schedule-booking.action';
import { selectScheduleBooking } from '../../shared/stores/schedule-booking/schedule-booking.selector';
import { invokeGetScheduleFilterApi } from '../../shared/stores/schedule-filter/schedule-filter.action';
import { selectScheduleFilter } from '../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/station/station.action';
import { selectProvinceWithStation } from '../../shared/stores/station/station.selector';

interface TicketPassenger {
  name: string;
  phone: string;
  seat: string;
}
type Locale = 'en' | 'th';

@Component({
  selector: 'app-e-ticket',
  templateUrl: './e-ticket.component.html',
  styleUrl: './e-ticket.component.scss',
})
export class ETicketComponent implements OnInit, OnDestroy {
  bookingNumber = '-';
  ticketNumber = '-';
  travelDate = '-';
  travelTime = '-';
  route = '-';
  origin = '-';
  destination = '-';
  vehicleType = '-';
  vehiclePlate = '-';
  seats = '-';
  passengerSummary = '-';
  paymentDate = '-';
  totalAmount = '0.00';
  qrCodeDataUrl = '';

  passengers: TicketPassenger[] = [];
  private latestQrPayload = '';
  private ticketApiBookingNumber = '';
  private ticketApiTicketNumber = '';
  private ticketApiPaymentDateTime = '';
  private ticketApiVehicleType = '';
  private ticketApiVehiclePlate = '';
  private lastTicketRequestBookingId: number | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly titleMap: Record<number, { en: string; th: string }> = {
    1: { en: 'Mr.', th: 'นาย' },
    2: { en: 'Miss', th: 'นางสาว' },
    3: { en: 'Mrs.', th: 'นาง' },
    4: { en: 'Master', th: 'เด็กชาย' },
    5: { en: 'Miss (Child)', th: 'เด็กหญิง' },
    6: { en: 'Dr.', th: 'ดร.' },
    7: { en: 'Professor', th: 'ศ.' },
    8: { en: 'Associate Professor', th: 'รศ.' },
    9: { en: 'Assistant Professor', th: 'ผศ.' },
  };

  private readonly scheduleBooking$: Observable<ScheduleBooking | null>;
  private readonly booking$: Observable<BookingState | null>;
  private readonly scheduleFilter$: Observable<ScheduleFilter | null>;
  private readonly passengerInfo$: Observable<PassengerInfo[] | null>;
  private readonly stationList$: Observable<StationApi[]>;

  constructor(
    private store: Store,
    private bookingService: BookingService,
    private translateService: TranslateService
  ) {
    this.scheduleBooking$ = this.store.pipe(
      select(selectScheduleBooking)
    ) as Observable<ScheduleBooking | null>;
    this.booking$ = this.store.pipe(
      select(selectBooking)
    ) as Observable<BookingState | null>;
    this.scheduleFilter$ = this.store.pipe(
      select(selectScheduleFilter)
    ) as Observable<ScheduleFilter | null>;
    this.passengerInfo$ = this.store.pipe(
      select(selectPassengerInfo)
    ) as Observable<PassengerInfo[] | null>;
    this.stationList$ = this.store.pipe(select(selectProvinceWithStation));
  }

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
    this.store.dispatch(invokeGetPassengerInfo());

    const locale$ = this.translateService.onLangChange.pipe(
      map((event: LangChangeEvent) => this.normalizeLocale(event.lang)),
      startWith(this.normalizeLocale(this.translateService.currentLang))
    );

    combineLatest([
      this.scheduleBooking$,
      this.booking$,
      this.scheduleFilter$,
      this.passengerInfo$,
      this.stationList$,
      locale$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([scheduleBooking, booking, scheduleFilter, passengerInfo, stationList, locale]) => {
        this.mapTicketFields(
          scheduleBooking,
          booking,
          scheduleFilter,
          passengerInfo,
          stationList,
          locale
        );
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private mapTicketFields(
    scheduleBooking: ScheduleBooking | null,
    booking: BookingState | null,
    scheduleFilter: ScheduleFilter | null,
    passengerInfo: PassengerInfo[] | null,
    stationList: StationApi[],
    locale: Locale
  ): void {
    const schedules = this.getSchedules(scheduleBooking?.schedule);
    const departureSchedule = schedules[0] ?? null;
    const returnSchedule = schedules[1] ?? null;
    const bookingId = this.getBookingId(booking?.bookingId);
    const bookingNumber =
      this.ticketApiBookingNumber ||
      this.normalizeBookingNumber(booking?.bookingNumber);
    const ticketPassengers = this.buildPassengerRows(passengerInfo, locale);

    const fromName = this.getStationLabelById(
      scheduleFilter?.startStationId,
      stationList,
      locale
    );
    const toName = this.getStationLabelById(
      scheduleFilter?.stopStationId,
      stationList,
      locale
    );

    this.bookingNumber = bookingNumber || '-';
    this.ticketNumber =
      this.ticketApiTicketNumber ||
      (this.bookingNumber !== '-'
        ? this.bookingNumber
        : this.buildTicketNumber(bookingId, departureSchedule));
    void this.updateQrCode(this.ticketNumber);
    this.travelDate = this.buildTravelDate(
      departureSchedule?.departureDateTime,
      returnSchedule?.departureDateTime,
      locale
    );
    this.travelTime = this.buildTravelTime(departureSchedule, returnSchedule);
    this.route = this.buildRouteLabel(fromName, toName, !!returnSchedule);
    this.origin = fromName || '-';
    this.destination = toName || '-';
    this.vehicleType =
      this.ticketApiVehicleType ||
      this.formatVehicleType(departureSchedule?.vehicleType) ||
      '-';
    this.vehiclePlate = this.ticketApiVehiclePlate || '-';
    this.seats = this.buildSeatList(ticketPassengers);
    this.passengers = ticketPassengers;
    this.passengerSummary = this.buildPassengerSummary(scheduleFilter?.passengerInfo);
    this.paymentDate = this.formatDateTime(
      this.ticketApiPaymentDateTime || dayjs().toISOString(),
      locale
    );
    this.totalAmount = this.calculateTotalAmount(
      schedules,
      scheduleFilter?.passengerInfo,
      ticketPassengers.length
    ).toFixed(2);

    void this.loadTicketFromApi(bookingId, locale);
  }

  private getSchedules(schedule?: Schedule[] | null): Schedule[] {
    return schedule ?? [];
  }

  private buildTicketNumber(
    bookingId: number | null,
    departureSchedule: Schedule | null
  ): string {
    const datePart = departureSchedule?.departureDateTime
      ? dayjs(departureSchedule.departureDateTime).format('YYYYMMDD')
      : dayjs().format('YYYYMMDD');

    if (bookingId && bookingId > 0) {
      return `${datePart}-${bookingId}`;
    }

    if (departureSchedule?.id) {
      return `${datePart}-${String(departureSchedule.id).padStart(3, '0')}`;
    }

    return '-';
  }

  private buildTravelDate(
    departureDateTime: string | undefined,
    returnDateTime: string | undefined,
    locale: Locale
  ): string {
    const departureDate = this.formatDate(departureDateTime, locale);
    const returnDate = this.formatDate(returnDateTime, locale);

    if (departureDate && returnDate && departureDate !== returnDate) {
      return `${departureDate} / ${returnDate}`;
    }

    return departureDate || returnDate || '-';
  }

  private buildTravelTime(
    departureSchedule: Schedule | null,
    returnSchedule: Schedule | null
  ): string {
    const departureTime = this.formatScheduleTimeRange(departureSchedule);
    const returnTime = this.formatScheduleTimeRange(returnSchedule);

    if (departureTime && returnTime) {
      return `${departureTime} / ${returnTime}`;
    }

    return departureTime || returnTime || '-';
  }

  private formatScheduleTimeRange(schedule: Schedule | null): string {
    if (!schedule) return '';

    const startTime = this.formatTime(schedule.departureDateTime);
    const endTime = this.formatTime(schedule.arrivalDateTime);

    if (startTime && endTime) {
      return `${startTime} - ${endTime}`;
    }

    return startTime || endTime || '';
  }

  private buildRouteLabel(fromName: string, toName: string, hasReturn: boolean): string {
    const departureRoute = fromName && toName ? `${fromName} - ${toName}` : fromName || toName;
    if (!departureRoute) {
      return '-';
    }

    if (!hasReturn || !fromName || !toName) {
      return departureRoute;
    }

    return `${departureRoute} / ${toName} - ${fromName}`;
  }

  private buildSeatList(passengers: TicketPassenger[]): string {
    const seats = passengers
      .map((passenger) => passenger.seat)
      .filter((seat) => seat && seat !== '-');

    return seats.length > 0 ? seats.join(', ') : '-';
  }

  private buildPassengerRows(
    passengerInfo: PassengerInfo[] | null,
    locale: Locale
  ): TicketPassenger[] {
    const passengers = passengerInfo ?? [];
    return passengers.map((passenger) => {
      const title = this.resolveTitleLabel(passenger.title, locale);
      const nameParts = [
        title,
        passenger.firstName,
        passenger.middleName,
        passenger.lastName,
      ].filter((part) => !!part && String(part).trim().length > 0);

      return {
        name: nameParts.join(' ').trim() || '-',
        phone: passenger.phoneNumber?.trim() || '-',
        seat: passenger.passengerSeat?.trim() || '-',
      };
    });
  }

  private buildPassengerSummary(
    passengerConfig?: { type: string; count: number }[]
  ): string {
    const adults = passengerConfig?.find((item) => item.type === 'ADULT')?.count ?? 0;
    const kids = passengerConfig?.find((item) => item.type === 'KIDS')?.count ?? 0;

    const summary: string[] = [];
    if (adults > 0) summary.push(`Adult ${adults}`);
    if (kids > 0) summary.push(`Child ${kids}`);

    return summary.length > 0 ? summary.join(', ') : '-';
  }

  private calculateTotalAmount(
    schedules: Schedule[],
    passengerConfig: { type: string; count: number }[] | undefined,
    fallbackPassengerCount: number
  ): number {
    const scheduleFareSum = schedules.reduce(
      (total, schedule) => total + this.getPricePerSeat(schedule.pricePerSeat),
      0
    );

    const configuredPassengerCount =
      passengerConfig?.reduce((total, item) => total + (Number(item.count) || 0), 0) ?? 0;
    const passengerCount =
      configuredPassengerCount > 0 ? configuredPassengerCount : fallbackPassengerCount;

    return scheduleFareSum * passengerCount;
  }

  private getPricePerSeat(value: string | number | null | undefined): number {
    const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getStationLabelById(
    stationId: string | number | null | undefined,
    stationList: StationApi[],
    locale: Locale
  ): string {
    if (stationId === null || stationId === undefined || stationId === '') {
      return '';
    }

    const parsedId = Number(stationId);
    const station = stationList.find((item) => item.id === parsedId);
    if (!station) {
      return '';
    }

    const translation = station.translations?.find((item) =>
      item.locale?.toLowerCase().startsWith(locale)
    );

    return translation?.label || station.translations?.[0]?.label || station.slug || '';
  }

  private resolveTitleLabel(titleCode: number | null, locale: Locale): string {
    if (titleCode == null) {
      return '';
    }

    return this.titleMap[titleCode]?.[locale] || this.titleMap[titleCode]?.en || '';
  }

  private formatDate(dateTime: string | undefined, locale: Locale): string {
    if (!dateTime) {
      return '';
    }

    const date = dayjs(dateTime);
    if (!date.isValid()) {
      return '';
    }

    const months: Record<Locale, readonly string[]> = {
      en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    };

    const day = date.date();
    const month = months[locale][date.month()];
    const year = date.year();

    return `${day} ${month} ${year}`;
  }

  private formatTime(dateTime: string | undefined): string {
    if (!dateTime) {
      return '';
    }

    const date = dayjs(dateTime);
    return date.isValid() ? date.format('HH:mm') : '';
  }

  private formatDateTime(dateTime: string | undefined, locale: Locale): string {
    if (!dateTime) {
      return '-';
    }

    const date = dayjs(dateTime);
    if (!date.isValid()) {
      return '-';
    }

    const datePart = this.formatDate(date.toISOString(), locale);
    const timePart = date.format('HH:mm');
    return `${datePart} ${timePart}`.trim();
  }

  private formatVehicleType(type: string | null | undefined): string {
    if (!type) {
      return '';
    }

    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private normalizeLocale(locale: string | null | undefined): Locale {
    return (locale || '').toLowerCase().startsWith('th') ? 'th' : 'en';
  }

  private normalizeBookingNumber(value: string | null | undefined): string {
    const bookingNumber = String(value ?? '').trim();
    return bookingNumber.length > 0 ? bookingNumber : '';
  }

  private getBookingId(value: number | null | undefined): number | null {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return this.bookingService.getActiveBookingId();
  }

  private async loadTicketFromApi(
    bookingId: number | null,
    locale: Locale
  ): Promise<void> {
    if (!bookingId) {
      return;
    }

    if (this.lastTicketRequestBookingId === bookingId) {
      return;
    }
    this.lastTicketRequestBookingId = bookingId;

    try {
      const response = await firstValueFrom(
        this.bookingService.getBookingTickets(bookingId)
      );
      if (response?.code === 200 || response?.code === 201) {
        this.applyTicketApiResponse(response?.data);
        this.refreshTicketFieldsFromApi(locale);
      }
    } catch (error) {
      console.error('Get booking tickets failed', error);
    }
  }

  private refreshTicketFieldsFromApi(locale: Locale): void {
    if (this.ticketApiBookingNumber) {
      this.bookingNumber = this.ticketApiBookingNumber;
    }

    if (this.ticketApiTicketNumber) {
      this.ticketNumber = this.ticketApiTicketNumber;
      void this.updateQrCode(this.ticketNumber);
    }

    if (this.ticketApiPaymentDateTime) {
      this.paymentDate = this.formatDateTime(this.ticketApiPaymentDateTime, locale);
    }

    if (this.ticketApiVehicleType) {
      this.vehicleType = this.ticketApiVehicleType;
    }

    if (this.ticketApiVehiclePlate) {
      this.vehiclePlate = this.ticketApiVehiclePlate;
    }
  }

  private applyTicketApiResponse(data: unknown): void {
    const rootPayload = this.extractRootPayload(data);
    const primaryJourney = rootPayload
      ? this.extractPrimaryJourney(rootPayload)
      : null;
    const vehicle = primaryJourney ? this.asRecord(primaryJourney['vehicle']) : null;
    if (vehicle) {
      const vehicleType = this.pickFirstString(vehicle, ['vehicleType']);
      if (vehicleType) {
        this.ticketApiVehicleType = this.formatVehicleType(vehicleType);
      }

      const vehicleNumber = this.pickFirstString(vehicle, ['vehicleNumber']);
      const numberPlate = this.pickFirstString(vehicle, ['numberPlate']);
      const vehiclePlate = this.buildVehiclePlate(vehicleNumber, numberPlate);
      if (vehiclePlate) {
        this.ticketApiVehiclePlate = vehiclePlate;
      }
    }

    const ticketPayload = this.extractTicketPayload(data);
    if (!ticketPayload) {
      return;
    }

    const bookingNumber = this.pickFirstString(ticketPayload, [
      'bookingNumber',
      'bookingNo',
    ]);
    if (bookingNumber) {
      this.ticketApiBookingNumber = bookingNumber;
    }

    const ticketNumber = this.pickFirstString(ticketPayload, [
      'ticketNumber',
      'ticketNo',
      'ticketCode',
      'number',
    ]);
    if (ticketNumber) {
      this.ticketApiTicketNumber = ticketNumber;
    }

    const paymentDateTime = this.pickFirstString(ticketPayload, [
      'paymentDateTime',
      'paymentDate',
      'paidAt',
      'createdAt',
    ]);
    if (paymentDateTime) {
      this.ticketApiPaymentDateTime = paymentDateTime;
    }
  }

  private extractTicketPayload(data: unknown): Record<string, unknown> | null {
    if (Array.isArray(data)) {
      return this.asRecord(data[0]);
    }

    const root = this.asRecord(data);
    if (!root) {
      return null;
    }

    const tickets = root['tickets'];
    if (Array.isArray(tickets) && tickets.length > 0) {
      const primaryTicket = this.asRecord(tickets[0]);
      if (primaryTicket) {
        return {
          ...root,
          ...primaryTicket,
        };
      }
    }

    const ticket = this.asRecord(root['ticket']);
    if (ticket) {
      return {
        ...root,
        ...ticket,
      };
    }

    return root;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private pickFirstString(
    source: Record<string, unknown>,
    keys: string[]
  ): string {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return '';
  }

  private extractRootPayload(data: unknown): Record<string, unknown> | null {
    if (Array.isArray(data)) {
      return this.asRecord(data[0]);
    }

    return this.asRecord(data);
  }

  private extractPrimaryJourney(
    source: Record<string, unknown>
  ): Record<string, unknown> | null {
    const journeys = source['journeys'];
    if (!Array.isArray(journeys) || journeys.length === 0) {
      return null;
    }

    const outbound =
      journeys.find((item) => {
        const candidate = this.asRecord(item);
        const legType = candidate?.['legType'];
        return (
          typeof legType === 'string' &&
          legType.trim().toLowerCase() === 'outbound'
        );
      }) ?? journeys[0];

    return this.asRecord(outbound);
  }

  private buildVehiclePlate(vehicleNumber: string, numberPlate: string): string {
    if (vehicleNumber && numberPlate) {
      return `${vehicleNumber}/${numberPlate}`;
    }

    return vehicleNumber || numberPlate || '';
  }

  private async updateQrCode(ticketNumber: string): Promise<void> {
    const normalizedTicketNumber = ticketNumber?.trim();
    this.latestQrPayload = normalizedTicketNumber;

    if (!normalizedTicketNumber || normalizedTicketNumber === '-') {
      this.qrCodeDataUrl = '';
      return;
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(normalizedTicketNumber, {
        width: 140,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      if (this.latestQrPayload === normalizedTicketNumber) {
        this.qrCodeDataUrl = qrDataUrl;
      }
    } catch {
      if (this.latestQrPayload === normalizedTicketNumber) {
        this.qrCodeDataUrl = '';
      }
    }
  }
}

import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { capitalizeVehicleType, parsePricePerSeat } from '../../shared/lib/trip-format';
import { buildMapsDirectionsUrl } from '../../shared/lib/maps-directions-url';
import html2canvas from 'html2canvas';
import { AuthService } from '../../auth/auth.service';
import { BookingService } from '../../services/booking/booking.service';
import { RouteMapService } from '../../services/route-map/route-map.service';
import { BoardingQrService } from '../../shared/services/boarding-qr.service';
import { BookingState } from '../../shared/interfaces/booking.interface';
import {
  BookingTicketItem,
  BookingTicketJourney,
  BookingTicketsData,
} from '../../shared/interfaces/booking-ticket.interface';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import { ScheduleBooking } from '../../shared/interfaces/schedule-booking.interface';
import { Schedule, ScheduleFilter } from '../../shared/interfaces/schedule.interface';
import {
  getStationFallbackLabel,
  StationApi,
} from '../../shared/interfaces/station.interface';
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
  /** OBRS-96: threaded through from `BookingTicketItem.id` so each row can
   * fetch its own boarding-token QR. `null` for rows built before the ticket
   * API response lands (store-only passengers have no ticket id yet). */
  ticketId: number | null;
  /** This ticket's own human-readable number (was previously only shown
   * joined across the whole booking in the header). */
  ticketNumber: string;
  /** Data-URL of the QR rendered from this ticket's `boardingToken` — empty
   * until the per-ticket fetch resolves. */
  qrDataUrl: string;
  /** True when the boarding-token fetch failed for this ticket specifically
   * (e.g. 409 TICKET_NOT_CONFIRMED on a cancelled/refunded leg) — renders a
   * placeholder instead of blanking the whole page (OBRS-96). */
  qrUnavailable: boolean;
  /** OBRS-325: true when this ticket's `seatNumber` is null (an open-seating
   * schedule, `schedules.seating_mode = OPEN`, OBRS-321) — the template shows
   * the open-seating label instead of `seat` (which stays `'-'`, same as the
   * pre-existing "no data" placeholder). Always `false` before the ticket API
   * response lands (store-only rows never have a real ticket seat yet). */
  seatOpen: boolean;
  /** OBRS-296: server-authoritative fare category — `null` on the
   *  pre-API/store-only render (derived from `PassengerInfo.isAdult` there;
   *  see `buildPassengerRows()`) until `buildPassengersFromApi()` overrides
   *  it from the ticket response. */
  fareCategory: 'adult' | 'child' | null;
}

/**
 * OBRS-873: one leg's ticket rows. A round trip issues a separate ticket per
 * leg, so its QRs have to be grouped and labelled by leg — the page used to
 * build rows from the outbound journey alone (`buildPassengersFromApi(outbound,
 * …)`), which left the return leg with no QR to scan at the gate at all.
 * Groups are only ever created non-empty, so `passengerGroups.length > 1` is
 * exactly "this booking shows both legs" and drives the heading.
 */
interface TicketPassengerGroup {
  /** `false` for the outbound leg (and for the single group a one-way booking
   *  or the pre-API store render produces), `true` for the return leg. */
  isReturn: boolean;
  passengers: TicketPassenger[];
}
type Locale = 'en' | 'th' | 'zh';

/**
 * OBRS-1249: the inputs of the "route" line, snapshotted by whichever render
 * pass ran last. `*RouteName` is the authoritative name when the tickets API
 * has answered (it resolves the locale ladder server-side — OBRS-1219);
 * `*Slug` is the fallback route into the public lookup, which is the only one
 * a guest ever gets.
 */
interface RouteLineContext {
  fromName: string;
  toName: string;
  hasReturn: boolean;
  locale: Locale;
  outboundSlug?: string;
  inboundSlug?: string;
  outboundRouteName: string | null;
  inboundRouteName: string | null;
}

@Component({
    selector: 'app-e-ticket',
    templateUrl: './e-ticket.component.html',
    styleUrl: './e-ticket.component.scss',
    // Component-scoped so its dedupe/cache state doesn't leak across page
    // visits — see the class comment on BoardingQrService.
    providers: [BoardingQrService],
    standalone: false
})
export class ETicketComponent implements OnInit, OnDestroy {
  @ViewChild('ticketPaper') private ticketPaper?: ElementRef<HTMLElement>;

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
  /** OBRS-325: true when every ticket in the outbound journey has a null
   *  `seatNumber` — mirrors `TicketLeg.isOpenSeating` on the shared card. */
  seatsOpen = false;
  passengerSummary = '-';
  paymentDate = '-';
  totalAmount = '0.00';
  isDownloadingTicket = false;
  /** OBRS-269: outbound pickup-stop coords, threaded through from the tickets
   *  API's `fromStop.latitude`/`longitude` in `applyApiOverrides()`. `null` until
   *  the API response lands (store-only pre-API render) — the Navigate button
   *  hides until then. */
  originLatitude: number | null = null;
  originLongitude: number | null = null;

  /** OBRS-873: what the template renders — the per-leg groups. */
  passengerGroups: TicketPassengerGroup[] = [];
  /** Every group's rows flattened, in leg order. Derived — only ever written
   *  by `setPassengerGroups`, so it cannot drift from `passengerGroups`. Used
   *  for the boarding-token fetch (which must cover BOTH legs) and by the
   *  seat/QR-state helpers. */
  passengers: TicketPassenger[] = [];
  booker: TicketPassenger | null = null;
  private ticketApiData: BookingTicketsData | null = null;
  private latestLocale: Locale = 'en';
  private latestStorePassengers: PassengerInfo[] | null = null;
  private lastTicketRequestBookingId: number | null = null;

  /**
   * OBRS-1249: everything the route line is built from, kept in one place so
   * BOTH render passes (the store-only first paint and the tickets-API overlay)
   * go through `refreshRouteLine()` and cannot end up disagreeing — which is
   * the whole defect this card exists for.
   */
  private routeLineContext: RouteLineContext | null = null;
  /**
   * `routeSlug` → the route's own name per locale, from the PUBLIC
   * `/api/routes/{slug}/pickup-dropoff`. Keyed by slug rather than by leg
   * because an out-and-back on the same physical route asks twice for one
   * answer. An entry present with an empty object means "asked, nothing there"
   * — that is what stops `loadRouteNames` from re-firing forever.
   */
  private readonly routeTitlesBySlug = new Map<string, Partial<Record<Locale, string>>>();

  private readonly destroy$ = new Subject<void>();
  private readonly titleMap: Record<number, { en: string; th: string; zh: string }> = {
    1: { en: 'Mr.', th: 'นาย', zh: '先生' },
    2: { en: 'Miss', th: 'นางสาว', zh: '小姐' },
    3: { en: 'Mrs.', th: 'นาง', zh: '女士' },
    4: { en: 'Master', th: 'เด็กชาย', zh: '小弟' },
    5: { en: 'Miss (Child)', th: 'เด็กหญิง', zh: '小妹' },
    6: { en: 'Dr.', th: 'ดร.', zh: '博士' },
    7: { en: 'Professor', th: 'ศ.', zh: '教授' },
    8: { en: 'Associate Professor', th: 'รศ.', zh: '副教授' },
    9: { en: 'Assistant Professor', th: 'ผศ.', zh: '助理教授' },
  };

  private readonly scheduleBooking$: Observable<ScheduleBooking | null>;
  private readonly booking$: Observable<BookingState | null>;
  private readonly scheduleFilter$: Observable<ScheduleFilter | null>;
  private readonly passengerInfo$: Observable<PassengerInfo[] | null>;
  private readonly stationList$: Observable<StationApi[]>;

  constructor(
    private store: Store,
    private bookingService: BookingService,
    private boardingQrService: BoardingQrService,
    private translateService: TranslateService,
    // OBRS-858: read ONLY to decide whether the private ticket API can be called at all;
    // see loadTicketFromApi. Nothing on this page derives authorization from it.
    private authService: AuthService,
    // OBRS-1249: the route's own name for the pre-API render. Its endpoint is
    // public, which is the point — a guest never reaches the tickets API.
    private routeMapService: RouteMapService
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

  trackByIndex(index: number): number {
    return index;
  }

  /** OBRS-269: opens Google Maps Directions from the user's current location to
   *  the outbound pickup stop — a deep-link only (no Directions API call). The
   *  template hides the button entirely when either coord is null, so this is a
   *  defensive no-op rather than the primary gate. */
  navigateToPickup(): void {
    if (this.originLatitude == null || this.originLongitude == null) {
      return;
    }
    const url = buildMapsDirectionsUrl(this.originLatitude, this.originLongitude);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async downloadTicketImage(): Promise<void> {
    const ticketElement = this.ticketPaper?.nativeElement;
    if (!ticketElement || this.isDownloadingTicket) {
      return;
    }

    this.isDownloadingTicket = true;

    try {
      const canvas = await html2canvas(ticketElement, {
        backgroundColor: '#ffffff',
        scale: Math.max(window.devicePixelRatio || 1, 2),
        useCORS: true,
        onclone: (clonedDocument) => {
          clonedDocument
            .querySelector('.ticket-paper')
            ?.classList.add('is-exporting');
        },
        ignoreElements: (element) =>
          element.classList.contains('download-btn') ||
          element.classList.contains('ticket-nav-btn'),
      });

      const imageUrl = canvas.toDataURL('image/png');
      this.triggerTicketDownload(imageUrl);
    } catch (error) {
      console.error('Download e-ticket image failed', error);
    } finally {
      this.isDownloadingTicket = false;
    }
  }

  private triggerTicketDownload(imageUrl: string): void {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = this.getTicketDownloadFilename();
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private getTicketDownloadFilename(): string {
    const rawReference =
      this.ticketNumber !== '-' ? this.ticketNumber : this.bookingNumber;
    const safeReference = String(rawReference || 'ticket')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-');

    return `e-ticket-${safeReference || 'ticket'}.png`;
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
    const bookingNumber = this.normalizeBookingNumber(booking?.bookingNumber);
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
      this.bookingNumber !== '-'
        ? this.bookingNumber
        : this.buildTicketNumber(bookingId, departureSchedule);
    this.travelDate = this.buildTravelDate(
      departureSchedule?.departureDateTime,
      returnSchedule?.departureDateTime,
      locale
    );
    this.travelTime = this.buildTravelTime(departureSchedule, returnSchedule);
    // OBRS-1249: this pass knows the stations the customer searched with, never
    // the route's name — the store keeps `routeSlug` and nothing else about the
    // route (schedule.interface.ts). So it paints the station pair now and
    // upgrades the same line in place once the public lookup answers. This is
    // the ONLY pass a guest gets: `loadTicketFromApi` returns early without a
    // token (OBRS-858), and `/e-ticket` has no `requireAuth`.
    this.routeLineContext = {
      fromName,
      toName,
      hasReturn: !!returnSchedule,
      locale,
      outboundSlug: departureSchedule?.routeSlug?.trim() || undefined,
      inboundSlug: returnSchedule?.routeSlug?.trim() || undefined,
      outboundRouteName: null,
      inboundRouteName: null,
    };
    this.refreshRouteLine();
    this.loadRouteNames([departureSchedule, returnSchedule]);
    this.origin = fromName || '-';
    this.destination = toName || '-';
    this.vehicleType =
      capitalizeVehicleType(departureSchedule?.vehicleType) || '-';
    this.vehiclePlate = '-';
    this.seats = this.buildSeatList(ticketPassengers);
    // Pre-API render: the store only knows the booking's passenger form, which
    // has no leg dimension at all — one unlabelled group, same as a one-way.
    this.setPassengerGroups([{ isReturn: false, passengers: ticketPassengers }]);
    this.passengerSummary = this.buildPassengerSummary(scheduleFilter?.passengerInfo);
    this.paymentDate = this.formatDateTime(dayjs().toISOString(), locale);
    this.totalAmount = this.calculateTotalAmount(
      schedules,
      scheduleFilter?.passengerInfo,
      ticketPassengers.length
    ).toFixed(2);

    this.latestLocale = locale;
    this.latestStorePassengers = passengerInfo;
    this.applyApiOverrides(locale, passengerInfo);

    void this.loadTicketFromApi(bookingId);
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

    return this.formatTimeRange(
      schedule.departureDateTime,
      schedule.arrivalDateTime
    );
  }

  private formatTimeRange(
    departureDateTime: string | undefined,
    arrivalDateTime: string | undefined
  ): string {
    const startTime = this.formatTime(departureDateTime);
    const endTime = this.formatTime(arrivalDateTime);

    if (startTime && endTime) {
      return `${startTime} - ${endTime}`;
    }

    return startTime || endTime || '';
  }

  /**
   * OBRS-1249: the route's own name wins over the endpoint pair, PER LEG.
   *
   * Per leg rather than all-or-nothing because a route seeded on the way out
   * but not on the way back is a real state (`route_translations` is written
   * per route, and the two directions are two routes) — falling back to the
   * pair for both would hide a name the owner did write. `'-'` stays the last
   * resort, and the slug is never a candidate here: it is not passed in at all
   * (OBRS-1216).
   */
  private buildRouteLabel(
    fromName: string,
    toName: string,
    hasReturn: boolean,
    outboundRouteName: string | null = null,
    inboundRouteName: string | null = null
  ): string {
    const departurePair = fromName && toName ? `${fromName} - ${toName}` : fromName || toName;
    const outbound = outboundRouteName?.trim() || departurePair;
    if (!outbound) {
      return '-';
    }

    if (!hasReturn) {
      return outbound;
    }

    // Without both endpoints there is no pair to reverse, so a return leg with
    // no name of its own contributes nothing rather than repeating one station
    // back at itself — the pre-OBRS-1249 behaviour, kept byte-for-byte.
    const returnPair = fromName && toName ? `${toName} - ${fromName}` : '';
    const inbound = inboundRouteName?.trim() || returnPair;

    return inbound ? `${outbound} / ${inbound}` : outbound;
  }

  /**
   * OBRS-1249: re-renders the route line from whatever has landed so far. Every
   * writer of `routeLineContext` calls this instead of assigning `this.route`,
   * so the store pass, the API overlay and the late-arriving public lookup all
   * produce the line the same way.
   */
  private refreshRouteLine(): void {
    const context = this.routeLineContext;
    if (!context) {
      return;
    }

    this.route = this.buildRouteLabel(
      context.fromName,
      context.toName,
      context.hasReturn,
      context.outboundRouteName ?? this.routeNameForSlug(context.outboundSlug, context.locale),
      context.inboundRouteName ?? this.routeNameForSlug(context.inboundSlug, context.locale)
    );
  }

  /**
   * The route name for one leg, cached per slug. Same ladder as OBRS-1219's
   * server-side `RouteLabelResolver` (requested locale → th → en → nothing), so
   * this page and the my-bookings modal land on the same string for the same
   * booking even when the requested language is unseeded.
   */
  private routeNameForSlug(slug: string | undefined, locale: Locale): string | null {
    if (!slug) {
      return null;
    }

    const titles = this.routeTitlesBySlug.get(slug);
    if (!titles) {
      return null;
    }

    return titles[locale]?.trim() || titles.th?.trim() || titles.en?.trim() || null;
  }

  /**
   * Fetches the route names for the legs on screen. Shared with the home page's
   * map through `RouteMapService`, so on a booking made in this same tab the
   * answer is usually already deduped there rather than a fresh round trip; the
   * backend `@Cacheable`s it besides.
   *
   * Errors are already swallowed to `null` by `getPickupDropoffCached` and that
   * is deliberate here: a route lookup failing must leave the ticket on its
   * station pair, never put an error in front of a customer who has just paid.
   */
  private loadRouteNames(schedules: (Schedule | null)[]): void {
    for (const schedule of schedules) {
      const slug = schedule?.routeSlug?.trim();
      if (!slug || this.routeTitlesBySlug.has(slug)) {
        continue;
      }

      // Claim the slug before the request resolves, so the re-render this
      // subscription triggers cannot start a second request for it.
      this.routeTitlesBySlug.set(slug, {});
      this.routeMapService
        .getPickupDropoffCached(slug)
        .pipe(takeUntil(this.destroy$))
        .subscribe((data) => {
          // `RouteMeta.titleLocalized` is TYPED with all three locales
          // required, but the backend only puts the locales that are actually
          // seeded into the map (`RouteDtoService.toTitleLocalizedMap`) — `zh`
          // is seeded on no route today (OBRS-1046). Reading it as the type
          // claims would render `undefined`; `routeNameForSlug` treats it as
          // partial, which is what it is.
          this.routeTitlesBySlug.set(
            slug,
            (data?.route?.titleLocalized ?? {}) as Partial<Record<Locale, string>>
          );
          this.refreshRouteLine();
        });
    }
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
        // No ticket id exists yet at this stage — the store only carries the
        // passenger-info form, not the created ticket. Real ticketId/QR data
        // is filled in once `buildPassengersFromApi` runs (loadTicketFromApi).
        ticketId: null,
        ticketNumber: '-',
        qrDataUrl: '',
        qrUnavailable: false,
        // No ticket exists yet at this stage, so there is no real
        // seat_number to inspect — mirrors seat above (real value fills in
        // once buildPassengersFromApi runs).
        seatOpen: false,
        // OBRS-296: pre-API render — derived from the form's isAdult, same
        // adult/child mapping as buildPassengersPayload(). Overridden by the
        // server-authoritative value once buildPassengersFromApi() runs.
        fareCategory: passenger.isAdult ? 'adult' : 'child',
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
      (total, schedule) => total + parsePricePerSeat(schedule.pricePerSeat),
      0
    );

    const configuredPassengerCount =
      passengerConfig?.reduce((total, item) => total + (Number(item.count) || 0), 0) ?? 0;
    const passengerCount =
      configuredPassengerCount > 0 ? configuredPassengerCount : fallbackPassengerCount;

    return scheduleFareSum * passengerCount;
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

    return getStationFallbackLabel(station, locale);
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
      zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    };

    const day = date.date();
    // proto-key-ok: `Locale` is the inline union declared at the top of this file, and
    // every value reaching here has passed through normalizeLocale(), which returns one
    // of the three literals rather than asserting the raw ngx-translate lang string.
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

  private normalizeLocale(locale: string | null | undefined): Locale {
    const l = (locale || '').toLowerCase();
    if (l.startsWith('th')) return 'th';
    if (l.startsWith('zh')) return 'zh';
    return 'en';
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

  private async loadTicketFromApi(bookingId: number | null): Promise<void> {
    if (!bookingId) {
      return;
    }

    // OBRS-858: a guest holds no token and this endpoint is under /api/private/**, so the
    // call could only ever 401. NOT calling it is the fix, not catching it: the interceptor
    // turns a token-less 401 into a "Please sign in to continue" toast (OBRS-856) — exactly
    // the wall guest checkout exists to remove, shown at the moment the customer has just
    // paid.
    //
    // What a guest gives up by skipping this is the per-ticket QR and the real ticket
    // numbers, which this page OVERLAYS on top of a render already built from the store;
    // booking number, route, date, seats and total all come from the store and are
    // unaffected. The guest's authoritative copy is /find-booking (OBRS-857), which the
    // retrieval note further down this page points at — ADR-0123 Decision 5's "retrievable,
    // not merely delivered". That is why this returns quietly instead of erroring.
    if (!this.authService.isAuthenticated()) {
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
      if (
        (response?.code === 200 || response?.code === 201) &&
        response?.data
      ) {
        this.ticketApiData = response.data;
        this.applyApiOverrides(this.latestLocale, this.latestStorePassengers);
      }
    } catch (error) {
      console.error('Get booking tickets failed', error);
    }
  }

  private applyApiOverrides(
    locale: Locale,
    storePassengers: PassengerInfo[] | null
  ): void {
    const data = this.ticketApiData;
    if (!data) {
      return;
    }

    const journeys = data.journeys ?? [];
    const outbound =
      this.findJourney(journeys, 'outbound') ?? journeys[0] ?? null;
    const inbound =
      this.findJourney(journeys, 'inbound') ??
      (journeys.length > 1 ? journeys[1] : null);

    const bookingNumber = data.bookingNumber?.trim();
    if (bookingNumber) {
      this.bookingNumber = bookingNumber;
    }

    const ticketNumber = this.collectTicketNumbers(journeys);
    if (ticketNumber) {
      this.ticketNumber = ticketNumber;
    }

    const fromName = outbound?.fromStop?.label?.trim() ?? '';
    const toName = outbound?.toStop?.label?.trim() ?? '';
    if (fromName) {
      this.origin = fromName;
    }
    if (toName) {
      this.destination = toName;
    }
    if (fromName || toName) {
      // OBRS-1249: same line, better inputs. `routeLabel` is the name OBRS-1219
      // resolved server-side; when it is null (route unseeded) the slug lookup
      // the first pass started still applies underneath, and only if that is
      // empty too does the stop pair show. Slugs are carried over rather than
      // re-derived — this response has no route slug in it.
      this.routeLineContext = {
        fromName,
        toName,
        hasReturn: !!inbound,
        locale,
        outboundSlug: this.routeLineContext?.outboundSlug,
        inboundSlug: this.routeLineContext?.inboundSlug,
        outboundRouteName: outbound?.routeLabel ?? null,
        inboundRouteName: inbound?.routeLabel ?? null,
      };
      this.refreshRouteLine();
    }
    this.originLatitude = outbound?.fromStop?.latitude ?? null;
    this.originLongitude = outbound?.fromStop?.longitude ?? null;

    const travelDate = this.buildTravelDate(
      outbound?.departureDateTime,
      inbound?.departureDateTime,
      locale
    );
    if (travelDate !== '-') {
      this.travelDate = travelDate;
    }

    const travelTime = this.buildJourneyTravelTime(outbound, inbound);
    if (travelTime !== '-') {
      this.travelTime = travelTime;
    }

    const vehicleType = outbound?.vehicle?.vehicleType?.label?.trim();
    if (vehicleType) {
      this.vehicleType = capitalizeVehicleType(vehicleType);
    }

    const vehiclePlate = this.buildVehiclePlate(
      outbound?.vehicle?.vehicleNumber?.trim() ?? '',
      outbound?.vehicle?.numberPlate?.trim() ?? ''
    );
    if (vehiclePlate) {
      this.vehiclePlate = vehiclePlate;
    }

    // OBRS-873: BOTH legs, not just the outbound one. The return leg has its
    // own tickets and therefore its own boarding QRs; building rows from
    // `outbound` alone is what left a round-trip passenger with nothing to scan
    // on the way home. Empty legs are dropped rather than rendered as a headed
    // but empty list, so `passengerGroups.length > 1` means "both legs are
    // shown" and is exactly the condition for labelling them.
    const outboundPassengers = this.buildPassengersFromApi(outbound, storePassengers);
    const inboundPassengers = this.buildPassengersFromApi(inbound, storePassengers);
    const apiGroups: TicketPassengerGroup[] = [
      { isReturn: false, passengers: outboundPassengers },
      { isReturn: true, passengers: inboundPassengers },
    ].filter((group) => group.passengers.length > 0);

    if (apiGroups.length > 0) {
      this.setPassengerGroups(apiGroups);
      this.fetchBoardingTokensForPassengers();
    }
    if (outboundPassengers.length > 0) {
      // The page's seat/open-seating summary is a single journey-level line and
      // stays outbound-only, unchanged — the per-leg seat breakdown lives on
      // the shared card (`TicketLeg.seats`), not on this flat page.
      this.seats = this.buildSeatList(outboundPassengers);
      // OBRS-325: every ticket on the outbound leg shares one schedule, so
      // either all of them are open-seating or none are.
      this.seatsOpen = outboundPassengers.every((passenger) => passenger.seatOpen);
    }

    this.booker = this.buildBookerFromApi(data);

    if (data.totalAmount !== undefined && data.totalAmount !== null) {
      this.totalAmount = this.formatAmount(data.totalAmount);
    }
  }

  private buildBookerFromApi(data: BookingTicketsData): TicketPassenger | null {
    const phone = data.contactPhoneNumber?.trim();
    if (!phone) {
      return null;
    }

    return {
      name: '-',
      phone,
      seat: '-',
      ticketId: null,
      ticketNumber: '-',
      qrDataUrl: '',
      qrUnavailable: false,
      seatOpen: false,
      // OBRS-296: the booker row has no fare category of its own.
      fareCategory: null,
    };
  }

  private formatAmount(value: number | string): string {
    const parsed = typeof value === 'string' ? parseFloat(value) : value;
    return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value);
  }

  private findJourney(
    journeys: BookingTicketJourney[],
    code: string
  ): BookingTicketJourney | null {
    return (
      journeys.find(
        (journey) =>
          (journey.legType?.code ?? '').trim().toLowerCase() === code
      ) ?? null
    );
  }

  private collectTicketNumbers(journeys: BookingTicketJourney[]): string {
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

  private buildJourneyTravelTime(
    outbound: BookingTicketJourney | null,
    inbound: BookingTicketJourney | null
  ): string {
    const departureTime = this.formatTimeRange(
      outbound?.departureDateTime,
      outbound?.arrivalDateTime
    );
    const returnTime = this.formatTimeRange(
      inbound?.departureDateTime,
      inbound?.arrivalDateTime
    );

    if (departureTime && returnTime) {
      return `${departureTime} / ${returnTime}`;
    }

    return departureTime || returnTime || '-';
  }

  private buildPassengersFromApi(
    journey: BookingTicketJourney | null,
    storePassengers: PassengerInfo[] | null
  ): TicketPassenger[] {
    const tickets = journey?.tickets ?? [];
    return tickets.map((ticket, index) => {
      const rawSeatNumber = ticket.seatNumber?.trim();
      const seatOpen = !rawSeatNumber;
      const seat = rawSeatNumber || '-';
      const ticketId = Number.isFinite(ticket.id) && ticket.id > 0 ? ticket.id : null;
      const qrState = ticketId !== null ? this.boardingQrService.getState(ticketId) : undefined;

      return {
        name: ticket.passengerName?.trim() || '-',
        phone: this.findPhoneForPassenger(
          ticket,
          index,
          tickets.length,
          seat,
          storePassengers
        ),
        seat,
        ticketId,
        ticketNumber: ticket.ticketNumber?.trim() || '-',
        qrDataUrl: qrState?.qrDataUrl ?? '',
        qrUnavailable: qrState?.qrUnavailable ?? false,
        seatOpen,
        // OBRS-296: server-authoritative — replaces the pre-API isAdult-derived
        // guess from buildPassengerRows() once the ticket API response lands.
        fareCategory: ticket.fareCategory ?? null,
      };
    });
  }

  /**
   * OBRS-350: under OPEN seating (Epic OBRS-318/321) `ticket.seatNumber` is
   * null for every ticket, so `seat` collapses to `'-'` for every passenger
   * and the original seat-keyed match could never tell passengers apart —
   * every row resolved to the same (non-)match and showed '-'. Re-keys off a
   * stable identity instead, without touching the ASSIGNED path at all.
   */
  private findPhoneForPassenger(
    ticket: BookingTicketItem,
    index: number,
    ticketCount: number,
    seat: string,
    storePassengers: PassengerInfo[] | null
  ): string {
    const passengers = storePassengers ?? [];
    if (passengers.length === 0) {
      return '-';
    }

    if (seat && seat !== '-') {
      // ASSIGNED seating: real seat number present — unchanged, byte-for-byte,
      // from the pre-OBRS-350 behavior. Never falls through to the OPEN
      // strategies below, so existing ASSIGNED bookings can't regress.
      const bySeat = passengers.find(
        (passenger) => passenger.passengerSeat?.trim() === seat
      );
      return bySeat?.phoneNumber?.trim() || '-';
    }

    // OBRS-350 OPEN fallback 1: match by passenger name. `ticket.passengerName`
    // often carries a title the store doesn't ("Mr. Abc Def" vs.
    // firstName/lastName "Abc"/"Def"), so compare by containment rather than
    // strict equality. Only trust it when exactly one store passenger
    // matches — a duplicate name is ambiguous, not a match, and must not risk
    // handing back a stranger's phone number.
    const ticketName = ticket.passengerName?.trim().toLowerCase();
    if (ticketName) {
      const nameMatches = passengers.filter((passenger) => {
        const storeName = this.buildStorePassengerName(passenger).toLowerCase();
        return !!storeName && ticketName.includes(storeName);
      });
      if (nameMatches.length === 1) {
        return nameMatches[0].phoneNumber?.trim() || '-';
      }
    }

    // OBRS-350 OPEN fallback 2: positional index. Only safe when
    // `storePassengers` and this journey's `tickets` are known to correspond
    // 1:1 (same length) — e.g. a one-way OPEN booking, or a duplicate-name
    // case where fallback 1 above was ambiguous. A round-trip where the store
    // holds every passenger for the whole booking while `tickets` is a single
    // leg can have a different length; guessing positionally there risks
    // showing the wrong person's phone, so bail to '-' instead (same as
    // today) rather than guess.
    if (passengers.length === ticketCount) {
      return passengers[index]?.phoneNumber?.trim() || '-';
    }

    return '-';
  }

  private buildStorePassengerName(passenger: PassengerInfo): string {
    return [passenger.firstName, passenger.middleName, passenger.lastName]
      .map((part) => part?.trim())
      .filter((part): part is string => !!part)
      .join(' ');
  }

  private buildVehiclePlate(vehicleNumber: string, numberPlate: string): string {
    if (vehicleNumber && numberPlate) {
      return `${vehicleNumber}/${numberPlate}`;
    }

    return vehicleNumber || numberPlate || '';
  }

  /**
   * OBRS-96 / OBRS-221: fetch one boarding token per ticket and render each
   * as its own QR — replaces the old single booking-level QR. Delegates the
   * dedupe guard, per-ticket failure isolation, and QR rendering to
   * `BoardingQrService` (shared verbatim with `SellReceiptPageComponent`),
   * which no-ops (emits nothing) when every ticket here is already
   * fetched/in-flight — including on a locale switch, since
   * `applyApiOverrides` re-runs on every `combineLatest` emission.
   */
  private fetchBoardingTokensForPassengers(): void {
    const ticketIds = this.passengers.map((passenger) => passenger.ticketId);

    this.boardingQrService.fetchBoardingTokens(ticketIds, () =>
      this.applyBoardingQrStates()
    );
  }

  // Re-derive from the service's now-populated state rather than mutating
  // passenger objects in place, so a stray re-render always reflects the
  // latest resolved state.
  private applyBoardingQrStates(): void {
    this.setPassengerGroups(
      this.passengerGroups.map((group) => ({
        ...group,
        passengers: group.passengers.map((passenger) => {
          if (passenger.ticketId === null) {
            return passenger;
          }
          const qrState = this.boardingQrService.getState(passenger.ticketId);
          return qrState ? { ...passenger, ...qrState } : passenger;
        }),
      }))
    );
  }

  /** OBRS-873: the ONE write path for the passenger rows — sets the per-leg
   *  groups and re-derives the flat `passengers` list from them in the same
   *  statement, so the two can never disagree about which tickets the page is
   *  showing. */
  private setPassengerGroups(groups: TicketPassengerGroup[]): void {
    this.passengerGroups = groups;
    this.passengers = groups.flatMap((group) => group.passengers);
  }
}

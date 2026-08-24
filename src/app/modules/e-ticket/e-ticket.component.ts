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
import {
  capitalizeVehicleType,
  laterBangkokArrivalDay,
  parsePricePerSeat,
} from '../../shared/lib/trip-format';
import { AuthService } from '../../auth/auth.service';
import { BookingService } from '../../services/booking/booking.service';
import { RouteMapService } from '../../services/route-map/route-map.service';
import { BookingState } from '../../shared/interfaces/booking.interface';
import {
  BookingTicketItem,
  BookingTicketJourney,
  BookingTicketsData,
} from '../../shared/interfaces/booking-ticket.interface';
import { TicketLeg, TicketPassenger } from '../../shared/interfaces/e-ticket.interface';
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
import { TITLE_OPTIONS } from '../../shared/constants/title-options';

/** The all-dashes leg. What a render with nothing in the store shows — the
 *  same placeholders the booking-level scalars held before OBRS-260.
 *  OBRS-1510: `distanceKm` stays `null` always (AC-9 — this page never shows
 *  the distance chip) and `passengers` starts empty (filled in by the
 *  caller — see `buildLegsFromSchedules`/`legFromJourney`). */
function emptyLegView(): TicketLeg {
  return {
    travelDate: '-',
    travelTime: '-',
    arrivalDate: '',
    route: '-',
    origin: '-',
    destination: '-',
    vehicleType: '-',
    vehiclePlate: '-',
    seats: '-',
    isOpenSeating: false,
    distanceKm: null,
    pickupLatitude: null,
    pickupLongitude: null,
    passengers: [],
  };
}
type Locale = 'en' | 'th' | 'zh';

/**
 * OBRS-1502 — the two timestamps of one leg, which is all `arrivalDateWhenLater`
 * reads. `Schedule` (store pass) and `BookingTicketJourney` (API pass) both
 * satisfy it, so one builder serves both.
 */
interface TripTimestamps {
  departureDateTime?: string;
  arrivalDateTime?: string;
}

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

/**
 * OBRS-1510: this page's job is finding the data — `.ticket-paper` markup
 * (including the download button and per-passenger QR) now lives solely in
 * `<app-e-ticket-card>`, which owns its own `BoardingQrService` instance and
 * resolves the boarding QRs directly from `legs[].passengers[].ticketId`.
 * This page's one real piece of work is the mapper below: store/API data ->
 * `TicketLeg[]`.
 */
@Component({
    selector: 'app-e-ticket',
    templateUrl: './e-ticket.component.html',
    styleUrl: './e-ticket.component.scss',
    standalone: false
})
export class ETicketComponent implements OnInit, OnDestroy {
  bookingNumber = '-';
  ticketNumber = '-';
  /**
   * OBRS-260: one entry per leg — length 1 for a one-way booking, 2 for a round
   * trip. Every field in here used to be a booking-level scalar carrying
   * `outbound / return`, which left the reader pairing up four parallel lines
   * by position; OBRS-1502's arrival date is what made that unreadable out
   * loud, printing `23 ส.ค. 2026 / -` on a trip that crossed midnight one way.
   *
   * Never empty — the placeholder leg is what keeps a render with nothing in
   * the store showing dashes rather than nothing, exactly as the scalars did.
   *
   * OBRS-1510: now the shared `TicketLeg[]` shape (`<app-e-ticket-card>`'s own
   * `@Input()`), each leg carrying its own `passengers` — see
   * `buildLegsFromSchedules`/`legFromJourney`.
   */
  legs: TicketLeg[] = [emptyLegView()];
  passengerSummary = '-';
  paymentDate = '-';
  totalAmount = '0.00';
  /**
   * OBRS-1246: true when this ticket's origin AND/OR destination could not be
   * resolved to a real station name — neither from the roster
   * (`selectProvinceWithStation`, which OBRS-1222 now leaves empty and SILENT
   * when `GET /api/stops` fails) nor from the tickets API, which only a
   * signed-in customer gets at all (`loadTicketFromApi` returns early for a
   * guest — OBRS-858).
   *
   * The template ANDs this with `<app-station-load-error>`'s own condition
   * (`hasFailed && !stations.length`) rather than dropping that component in
   * bare. Bare is right on `home-booking`, where the roster IS the page, and
   * wrong here: a signed-in customer whose roster fetch died still receives a
   * COMPLETE ticket, because `applyApiOverrides` overwrites the blank labels
   * from the API. Telling them the station list failed would be precisely the
   * "interruption for someone with nothing wrong" that OBRS-1222's own class
   * comment on StationLoadErrorComponent argues against.
   *
   * Starts `false`, not `true`: `combineLatest` in `ngOnInit` emits
   * synchronously (every one of its store selectors has an initial value), so
   * the first `mapTicketFields` sets the real value before this can be
   * painted, and `false` avoids a red flash on the ordinary path.
   */
  stationLabelsUnresolved = false;
  /**
   * OBRS-1252: true when this render is the trip summary and NOT the ticket —
   * no booking reference, no seat, no passenger row, no QR — and nothing is
   * coming that would fill them in.
   *
   * <p><b>Why the page can be in that state at all.</b> Everything a guest's
   * browser keeps between page loads is in `booking-context-storage.ts`, whose
   * PDPA boundary admits trip identifiers ONLY — never a name, a phone number or
   * a booking reference. The `booking` and `passengerInfo` slices start at
   * `null` and are written in-session by `passenger-info.component.ts`. So a
   * hard load — a direct link, a bookmark, a restored tab, a refresh — restores
   * the trip and provably cannot restore the ticket. Measured on this branch:
   * the schedule, the stations, the vehicle type and the total all come back;
   * the booking reference, the seat and the passenger rows do not.
   *
   * <p><b>Why a banner rather than a blank page.</b> The restored half is real
   * and useful (the customer is usually checking their departure time), and
   * `/find-booking` (OBRS-857) is the one place a guest can get the authoritative
   * copy — ADR-0123 Decision 5's "retrievable, not merely delivered". What the
   * ticket must never do is imply it is the whole thing: before this card it
   * showed a total of 400.00 baht over a booking reference of `-` with nobody's
   * name on it, and said nothing.
   *
   * <p><b>The condition is deliberately not "some field is a dash".</b> It is
   * "no booking reference AND no API pass is coming", i.e. the two facts that
   * decide whether this render can still improve. A signed-in customer hard-
   * loading the same URL holds a token and an `active_booking_id`, so
   * `loadTicketFromApi` fills the ticket in a moment — the banner must not flash
   * at them on the way. A customer arriving in-session from checkout has the
   * booking reference in the store already, so it never fires there either.
   */
  ticketIncomplete = false;
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
  private readonly scheduleBooking$: Observable<ScheduleBooking | null>;
  private readonly booking$: Observable<BookingState | null>;
  private readonly scheduleFilter$: Observable<ScheduleFilter | null>;
  private readonly passengerInfo$: Observable<PassengerInfo[] | null>;
  private readonly stationList$: Observable<StationApi[]>;

  constructor(
    private store: Store,
    private bookingService: BookingService,
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
    // OBRS-1252. Two facts, and between them they decide whether this render can
    // still get better: is the booking reference here, and is an API pass coming?
    // `loadTicketFromApi` below returns early on exactly this pair of conditions
    // (no id, or no token — OBRS-858), so reading them here is reading its answer
    // in advance rather than guessing at it.
    const ticketApiPassExpected = !!bookingId && this.authService.isAuthenticated();
    this.ticketIncomplete = this.bookingNumber === '-' && !ticketApiPassExpected;
    // OBRS-1510 Scrutinize fix: the store pass is the ONLY pass a guest ever
    // gets (OBRS-858), and `<app-e-ticket-card>` now gates its TICKET_NO row
    // on `ticketNumber !== '-'` (AC-7). This used to backfill `ticketNumber`
    // from `bookingNumber`/a synthesized `YYYYMMDD-<id>` string here — on the
    // OLD page that string was never rendered (the page had no TICKET_NO row
    // of its own; the only pre-card use of this field was the download
    // filename). Feeding it to the card now would render a real row: either a
    // duplicate of BOOKING_REF (same value, different label) on an ordinary
    // guest ticket, or a synthetic number that LOOKS like a real ticket
    // number on a hard-load guest can't even retrieve (OBRS-1252). So the
    // store pass leaves `ticketNumber` untouched — it stays whatever it
    // already was (the field default `'-'`, or a real number a PRIOR API
    // pass already set — `applyApiOverrides` runs after this on every call
    // and never resets it). Only `collectTicketNumbers` (API pass,
    // `applyApiOverrides`) ever assigns a real value.
    this.legs = this.buildLegsFromSchedules(
      departureSchedule,
      returnSchedule,
      fromName,
      toName,
      ticketPassengers,
      locale
    );
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
    // OBRS-1246: recorded from the STORE-only render, then cleared further down
    // by `applyApiOverrides` when the API supplies what the roster could not.
    // `-` is this page's generic "no data yet" placeholder, so it cannot be read
    // back as "the lookup failed" — the failure has to be captured here, at the
    // one place that knows the lookup returned nothing.
    this.stationLabelsUnresolved = !fromName || !toName;
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

  /**
   * OBRS-260: the store pass's legs.
   *
   * The way home runs the customer's searched station pair backwards. The store
   * holds exactly one pair (`ScheduleFilter.startStationId`/`stopStationId`) and
   * has no second one to read, so reversing it is not a guess — it is the only
   * reading there is, and it is what the return schedule in `schedules[1]`
   * means.
   */
  private buildLegsFromSchedules(
    departureSchedule: Schedule | null,
    returnSchedule: Schedule | null,
    fromName: string,
    toName: string,
    passengers: TicketPassenger[],
    locale: Locale
  ): TicketLeg[] {
    // The store's passenger form has no leg dimension at all (see
    // `buildPassengerRows`), so both legs carry the same seat list until the API
    // pass replaces each with that leg's own tickets.
    const seats = this.buildSeatList(passengers);
    const legs = [
      this.legFromSchedule(departureSchedule, fromName, toName, seats, locale),
    ];
    if (returnSchedule) {
      legs.push(
        this.legFromSchedule(returnSchedule, toName, fromName, seats, locale)
      );
    }
    // OBRS-1510/OBRS-873: same rule the flat `passengerGroups` used to encode —
    // the store's passenger form has no leg dimension, so only the FIRST leg
    // carries the rows (an unlabelled single list, since a lone non-empty leg
    // never triggers the card's outbound/return heading). The second leg's
    // `passengers` stays empty until the API pass supplies its own leg-specific
    // rows (`legFromJourney`).
    legs[0].passengers = passengers;

    return legs;
  }

  private legFromSchedule(
    schedule: Schedule | null,
    fromName: string,
    toName: string,
    seats: string,
    locale: Locale
  ): TicketLeg {
    return {
      ...emptyLegView(),
      travelDate: this.formatDate(schedule?.departureDateTime, locale) || '-',
      travelTime: this.formatScheduleTimeRange(schedule) || '-',
      // OBRS-1502, now per leg: `''` when this leg lands on the day it left, so
      // the cell is absent rather than holding a `-` to keep its position.
      arrivalDate: this.arrivalDateWhenLater(schedule, locale),
      // `route` is deliberately left at its placeholder: `refreshRouteLine()` is
      // the ONE writer of that line (OBRS-1249) and runs straight after this,
      // once for both legs.
      origin: fromName || '-',
      destination: toName || '-',
      vehicleType: capitalizeVehicleType(schedule?.vehicleType) || '-',
      seats,
    };
  }

  private arrivalDateWhenLater(
    trip: TripTimestamps | null | undefined,
    locale: Locale
  ): string {
    const arrivalDay = laterBangkokArrivalDay(
      trip?.departureDateTime,
      trip?.arrivalDateTime
    );

    return arrivalDay ? this.formatDate(arrivalDay, locale) : '';
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
   * OBRS-1249: re-renders each leg's route line from whatever has landed so
   * far. Every writer of `routeLineContext` calls this instead of assigning a
   * leg's `route`, so the store pass, the API overlay and the late-arriving
   * public lookup all produce the line the same way.
   *
   * The route's own name wins over the endpoint pair PER LEG — a route seeded
   * on the way out but not on the way back is a real state (`route_translations`
   * is written per route, and the two directions are two routes), so falling
   * back to the pair for both would hide a name the owner did write. `'-'` stays
   * the last resort, and the slug is never a candidate here: it is not passed in
   * at all (OBRS-1216).
   *
   * OBRS-260 turned the one `A / B` line into one line per leg. Before, a return
   * leg with neither a name nor a reversible pair contributed nothing and the
   * line silently showed the outbound alone; now that leg prints `-` in its own
   * cell, under its own heading, where it cannot be read as the outbound's.
   */
  private refreshRouteLine(): void {
    const context = this.routeLineContext;
    if (!context) {
      return;
    }

    const { fromName, toName, locale } = context;
    const outboundPair = fromName && toName ? `${fromName} - ${toName}` : fromName || toName;
    // Without both endpoints there is no pair to reverse, so the way home falls
    // through to `-` rather than repeating one station back at itself.
    const inboundPair = fromName && toName ? `${toName} - ${fromName}` : '';
    const outboundName =
      context.outboundRouteName ?? this.routeNameForSlug(context.outboundSlug, locale);
    const inboundName =
      context.inboundRouteName ?? this.routeNameForSlug(context.inboundSlug, locale);

    if (this.legs[0]) {
      this.legs[0].route = outboundName?.trim() || outboundPair || '-';
    }
    if (this.legs[1]) {
      this.legs[1].route = inboundName?.trim() || inboundPair || '-';
    }
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
      const nameParts = [
        passenger.firstName,
        passenger.middleName,
        passenger.lastName,
      ].filter((part) => !!part && String(part).trim().length > 0);

      return {
        // OBRS-1232: this used to resolve the label here, off a SECOND private title map that
        // disagreed with title-options.ts on three Chinese words. The card carries the code and
        // the `titleLabel` pipe renders it, so there is one catalogue and one composition rule.
        title: TITLE_OPTIONS.find((option) => option.id === passenger.title)?.code ?? null,
        name: nameParts.join(' ').trim() || '-',
        phone: passenger.phoneNumber?.trim() || '-',
        seat: passenger.passengerSeat?.trim() || '-',
        // No ticket id exists yet at this stage — the store only carries the
        // passenger-info form, not the created ticket. Real ticketId is
        // filled in once `buildPassengersFromApi` runs (loadTicketFromApi);
        // the boarding QR itself is now resolved entirely by the card.
        ticketId: null,
        ticketNumber: '-',
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
    // turns a token-less 401 into a "Please sign in to continue" toast (OBRS-856) - exactly
    // the wall guest checkout exists to remove, shown at the moment the customer has just
    // paid.
    //
    // What a guest gives up by skipping this is the per-ticket QR and the real ticket
    // numbers, which this page OVERLAYS on top of a render already built from the store;
    // booking number, route, date, seats and total all come from the store and are
    // unaffected. The guest's authoritative copy is /find-booking (OBRS-857), which the
    // retrieval note further down this page points at - ADR-0123 Decision 5's "retrievable,
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
      // OBRS-1252: the authoritative copy has landed, so this IS the full ticket
      // and the banner must go. Cleared here rather than left to the next
      // `mapTicketFields` pass — that pass would agree (it recomputes the flag
      // from `this.bookingNumber`, which the line above has just filled in), but
      // a `combineLatest` emission is not guaranteed to follow an API response,
      // and a banner that outlives its reason is worse than one that never came.
      this.ticketIncomplete = false;
    }

    const ticketNumber = this.collectTicketNumbers(journeys);
    if (ticketNumber) {
      this.ticketNumber = ticketNumber;
    }

    const fromName = outbound?.fromStop?.label?.trim() ?? '';
    const toName = outbound?.toStop?.label?.trim() ?? '';

    // OBRS-873: BOTH legs, not just the outbound one. The return leg has its
    // own tickets and therefore its own boarding QRs; building rows from
    // `outbound` alone is what left a round-trip passenger with nothing to scan
    // on the way home.
    const outboundPassengers = this.buildPassengersFromApi(outbound, storePassengers);
    const inboundPassengers = this.buildPassengersFromApi(inbound, storePassengers);

    // OBRS-260: the legs, rebuilt from the authoritative copy and merged over
    // what the store pass painted. The fallback per field is the same guard the
    // flat fields each carried before this card — a response that arrives
    // without a value must not wipe a good one — and the leg COUNT never
    // shrinks, so a response with no journeys in it leaves a round trip still
    // reading as one.
    const apiLegs = [
      { journey: outbound, passengers: outboundPassengers },
      { journey: inbound, passengers: inboundPassengers },
    ];
    const legCount = Math.max(this.legs.length, inbound ? 2 : 1);
    this.legs = Array.from({ length: legCount }, (_, index) =>
      this.legFromJourney(
        apiLegs[index]?.journey ?? null,
        apiLegs[index]?.passengers ?? [],
        this.legs[index] ?? emptyLegView(),
        locale
      )
    );

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
    if (fromName && toName) {
      // OBRS-1246: the API is authoritative and has just supplied both names, so
      // the roster's failure has no visible consequence on THIS ticket and the
      // notice must not appear. BOTH is the condition, not either: one real name
      // beside a `-` is still a ticket the gate staff cannot read.
      this.stationLabelsUnresolved = false;
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

  /**
   * OBRS-260: one leg as the authoritative copy describes it, over `base` —
   * the same leg as the store pass painted it. Every field falls back rather
   * than overwriting with nothing, which is what the flat fields' individual
   * `if (value)` guards did before this card: this response can arrive without
   * timestamps, without a vehicle, or without stop labels, and none of those
   * absences may wipe what the store already got right.
   */
  private legFromJourney(
    journey: BookingTicketJourney | null,
    passengers: TicketPassenger[],
    base: TicketLeg,
    locale: Locale
  ): TicketLeg {
    const vehicleType = journey?.vehicle?.vehicleType?.label?.trim();
    const vehiclePlate = this.buildVehiclePlate(
      journey?.vehicle?.vehicleNumber?.trim() ?? '',
      journey?.vehicle?.numberPlate?.trim() ?? ''
    );

    return {
      ...base,
      travelDate: this.formatDate(journey?.departureDateTime, locale) || base.travelDate,
      travelTime:
        this.formatTimeRange(journey?.departureDateTime, journey?.arrivalDateTime) ||
        base.travelTime,
      arrivalDate: this.arrivalDateWhenLater(journey, locale) || base.arrivalDate,
      // `route` rides along in `base`: `refreshRouteLine()` owns that line and
      // runs straight after this (OBRS-1249).
      origin: journey?.fromStop?.label?.trim() || base.origin,
      destination: journey?.toStop?.label?.trim() || base.destination,
      vehicleType: vehicleType ? capitalizeVehicleType(vehicleType) : base.vehicleType,
      vehiclePlate: vehiclePlate || base.vehiclePlate,
      // OBRS-873: this leg's OWN tickets. The seat line was outbound-only for
      // the whole ticket before OBRS-260, so a round trip printed the seats it
      // was leaving in under the heading for the seats it was coming home in.
      seats: passengers.length ? this.buildSeatList(passengers) : base.seats,
      // OBRS-325: every ticket on a leg shares one schedule, so either all of
      // them are open-seating or none are.
      isOpenSeating: passengers.length
        ? passengers.every((passenger) => passenger.seatOpen)
        : base.isOpenSeating,
      pickupLatitude: journey?.fromStop?.latitude ?? null,
      pickupLongitude: journey?.fromStop?.longitude ?? null,
      // OBRS-1510: this leg's own rows once the API supplies them; a response
      // with nothing for this leg (yet) must not wipe what the store pass or a
      // previous API pass already had.
      passengers: passengers.length ? passengers : base.passengers,
      // AC-9: this page never shows the distance chip.
      distanceKm: null,
    };
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

      return {
        title: ticket.passengerTitle ?? null,
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
}

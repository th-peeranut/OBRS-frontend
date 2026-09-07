import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { of } from 'rxjs';
import { ScheduleBookingListComponent } from './schedule-booking-list.component';
import {
  createAnalyticsServiceStub,
  createRouteMapServiceStub,
  createRouterStub,
  createStoreStub,
  createTranslateStub,
  createAuthServiceStub,
  createScheduleServiceStub,
  createBookingPolicyServiceStub,
} from '../../../../testing/test-stubs';
import {
  Schedule,
  ScheduleAvailability,
  ScheduleFilter,
  ScheduleList,
} from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import {
  RoutePickupDropoffData,
  RouteStop,
} from '../../../../shared/interfaces/route-map.interface';
import { StationApi } from '../../../../shared/interfaces/station.interface';
// OBRS-1141: declared alongside the component under test because the row
// template now hosts it; without it every render logs an unknown-element error.
import { ArrivalDateNoticeComponent } from '../../../../shared/components/arrival-date-notice/arrival-date-notice.component';
import { ScheduleDelayNoticeComponent } from '../../../../shared/components/schedule-delay-notice/schedule-delay-notice.component';
// OBRS-1302: the flag and the fallback channel the two arms assert against.
import { environment } from '../../../../../environments/environment';
import { NJ_FACEBOOK_PAGE_URL } from '../../../../shared/lib/online-booking-channel';
// OBRS-1583: the gate now asks AuthService as well as the flag.
import { AuthService } from '../../../../auth/auth.service';
import { ScheduleService } from '../../../../services/schedule/schedule.service';
import { BookingPolicyService } from '../../../../services/booking-policy/booking-policy.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
// The component's own time formatter — see the AC-2 assertion for why the expected
// value is computed and not written down.
import { formatTimeHHMM } from '../../../../shared/lib/trip-format';

describe('ScheduleBookingListComponent', () => {
  let component: ScheduleBookingListComponent;

  beforeEach(() => {
    component = new ScheduleBookingListComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub(),
      createRouteMapServiceStub(),
      createAnalyticsServiceStub(),
      createAuthServiceStub(),
      createScheduleServiceStub(),
      createBookingPolicyServiceStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('ScheduleBookingListComponent (rendered no-results states)', () => {
  let fixture: ComponentFixture<ScheduleBookingListComponent>;
  let store: MockStore;

  const sampleSchedule: Schedule = {
    id: 1,
    vehicleType: 'van',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    arrivalDateTime: '2030-06-17T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A'],
    routeSlug: 'chonburi-bangkok',
  };

  function render(scheduleList: ScheduleList | null) {
    store.overrideSelector(selectScheduleList, scheduleList as ScheduleList);
    store.overrideSelector(selectScheduleFilter, null as any);
    store.overrideSelector(selectProvinceWithStation, [] as any);
    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    fixture.detectChanges();
  }

  // every '.no-results' paragraph's rendered text (= the i18n key, since no
  // translations are loaded under TranslateModule.forRoot()).
  function noResultsKeys(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.no-results'))
      .map((p) => (p.nativeElement.textContent || '').trim());
  }

  // every rendered section heading, in document order.
  function titleKeys(): string[] {
    return fixture.debugElement
      .queryAll(By.css('h3.title'))
      .map((h) => (h.nativeElement.textContent || '').trim());
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        ScheduleBookingListComponent,
        ScheduleDelayNoticeComponent,
        ArrivalDateNoticeComponent,
      ],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub() },
        { provide: ScheduleService, useValue: createScheduleServiceStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
  });

  it('shows the return-no-results message when outbound has trips but the return leg is empty', () => {
    render({ departureSchedules: [sampleSchedule], arrivalSchedules: [] });
    const keys = noResultsKeys();
    expect(keys).toContain('SCHEDULE_BOOKING.NO_RETURN_RESULTS');
    // the outbound (departure) no-results must NOT show — there are outbound trips
    expect(keys).not.toContain('SCHEDULE_BOOKING.NO_RESULTS');
  });

  it('shows the generic no-results message for a one-way search with no schedules', () => {
    render({ departureSchedules: [], arrivalSchedules: null });
    const keys = noResultsKeys();
    expect(keys).toContain('SCHEDULE_BOOKING.NO_RESULTS');
    // one-way: arrivalSchedules is null, so the return message must never render
    expect(keys).not.toContain('SCHEDULE_BOOKING.NO_RETURN_RESULTS');
  });

  it('shows no message when both outbound and return schedules exist', () => {
    render({ departureSchedules: [sampleSchedule], arrivalSchedules: [sampleSchedule] });
    expect(noResultsKeys()).toEqual([]);
  });

  // OBRS-1574 pins the two shapes whose heading must NOT change while the
  // sold-out outbound below stops printing one.
  it('keeps the split departure heading for a round trip that HAS outbound trips', () => {
    render({ departureSchedules: [sampleSchedule], arrivalSchedules: [sampleSchedule] });
    expect(titleKeys()).toEqual(['SCHEDULE_BOOKING.SUBHEADER_DEPARTURE']);
  });

  it('keeps the single header for a one-way search that has trips', () => {
    render({ departureSchedules: [sampleSchedule], arrivalSchedules: null });
    expect(titleKeys()).toEqual(['SCHEDULE_BOOKING.HEADER']);
  });

  // OBRS-1654 — OBRS-1574's defect on the other leg. `isSelectFirst` is set the
  // moment an outbound round is picked (component:267) and, on a round trip with
  // no return rounds, the same call opens OBRS-1336's modal instead of navigating
  // (component:295) — so this exact DOM is what the customer is left looking at
  // through a 55%-opaque backdrop.
  it('prints no return heading once an outbound is picked and the return list is empty', () => {
    render({ departureSchedules: [sampleSchedule], arrivalSchedules: [] });
    fixture.componentInstance.isSelectFirst = true;
    fixture.detectChanges();

    expect(noResultsKeys()).toContain('SCHEDULE_BOOKING.NO_RETURN_RESULTS');
    expect(titleKeys()).toEqual(['SCHEDULE_BOOKING.HEADER']);
  });

  // AC-2: the shape that must not regress — a return leg that HAS rounds still
  // gets its heading, and the outbound one OBRS-1574 fixed is still above it.
  it('keeps the return heading once an outbound is picked and the return list has rounds', () => {
    render({ departureSchedules: [sampleSchedule], arrivalSchedules: [sampleSchedule] });
    fixture.componentInstance.isSelectFirst = true;
    fixture.detectChanges();

    expect(titleKeys()).toEqual([
      'SCHEDULE_BOOKING.SUBHEADER_DEPARTURE',
      'SCHEDULE_BOOKING.SUBHEADER_RETURN',
    ]);
  });
});

describe('ScheduleBookingListComponent (trip estimate resolution)', () => {
  let fixture: ComponentFixture<ScheduleBookingListComponent>;
  let component: ScheduleBookingListComponent;
  let store: MockStore;

  const departureSchedule: Schedule = {
    id: 10,
    vehicleType: 'van',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    arrivalDateTime: '2030-06-17T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A'],
    routeSlug: 'chonburi-bangkok',
  };

  const returnSchedule: Schedule = {
    id: 20,
    vehicleType: 'van',
    departureDateTime: '2030-06-20T08:00:00+07:00',
    arrivalDateTime: '2030-06-20T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A'],
    // The return leg's routeSlug is the reverse physical route.
    routeSlug: 'bangkok-chonburi',
  };

  const stations: StationApi[] = [
    {
      id: 1,
      slug: 'chonburi-terminal',
      status: 'active',
      stopType: 'station',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 2,
      slug: 'bangkok-terminal',
      status: 'active',
      stopType: 'station',
      createdAt: '',
      updatedAt: '',
    },
  ];

  function makeStop(
    slug: string,
    distanceKmFromOrigin: number,
    offsetMinutesFromOrigin: number
  ): RouteStop {
    return {
      order: 1,
      slug,
      name: slug,
      address: '',
      approxTime: '05:00',
      distanceKmFromOrigin,
      offsetMinutesFromOrigin,
      latitude: null,
      longitude: null,
      primaryPhotoUrl: null,
      googleMapsUrl: null,
    };
  }

  const outboundData: RoutePickupDropoffData = {
    route: {
      slug: 'chonburi-bangkok',
      titleLocalized: { en: '', th: '', zh: '' },
      totalDistanceKm: 100,
      durationMinMinutes: 90,
      durationMaxMinutes: 120,
      originProvinceLabel: '',
      destinationProvinceLabel: '',
    },
    pickup: [makeStop('chonburi-terminal', 0, 0)],
    dropoff: [makeStop('bangkok-terminal', 90, 100)],
  };

  // Reverse route: `pickup[]` holds the destination-city (Bangkok) stops,
  // `dropoff[]` holds the origin-city (Chonburi) stops.
  const returnData: RoutePickupDropoffData = {
    route: {
      slug: 'bangkok-chonburi',
      titleLocalized: { en: '', th: '', zh: '' },
      totalDistanceKm: 100,
      durationMinMinutes: 90,
      durationMaxMinutes: 120,
      originProvinceLabel: '',
      destinationProvinceLabel: '',
    },
    pickup: [makeStop('bangkok-terminal', 0, 0)],
    dropoff: [makeStop('chonburi-terminal', 88, 95)],
  };

  beforeEach(async () => {
    const routeMapServiceStub = {
      getPickupDropoffCached: (slug: string) => {
        if (slug === 'chonburi-bangkok') return of(outboundData);
        if (slug === 'bangkok-chonburi') return of(returnData);
        return of(null);
      },
    };

    await TestBed.configureTestingModule({
      declarations: [
        ScheduleBookingListComponent,
        ScheduleDelayNoticeComponent,
        ArrivalDateNoticeComponent,
      ],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: routeMapServiceStub },
        { provide: AuthService, useValue: createAuthServiceStub() },
        { provide: ScheduleService, useValue: createScheduleServiceStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectScheduleList, {
      departureSchedules: [departureSchedule],
      arrivalSchedules: [returnSchedule],
    } as ScheduleList);
    store.overrideSelector(selectScheduleFilter, {
      roundTrip: { code: 'return', label: '' },
      passengerInfo: [],
      startStationId: 1,
      stopStationId: 2,
      departureDate: '2030-06-17',
    } as any);
    store.overrideSelector(selectProvinceWithStation, stations as any);

    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('resolves the departure leg estimate directly: pickup=fromSlug, dropoff=toSlug', () => {
    expect(component.departureEstimates[10]).toEqual({
      distanceKm: 90,
      durationMinutes: 100,
    });
  });

  it('resolves the return leg estimate with the pickup/dropoff swap (reverse-route slug space)', () => {
    expect(component.returnEstimates[20]).toEqual({
      distanceKm: 88,
      durationMinutes: 95,
    });
  });

  it('renders a distance-only ≈ km chip for the departure row (not silently empty)', () => {
    const chip = fixture.debugElement.query(By.css('.trip-estimate'));
    expect(chip).toBeTruthy();
    const text = (chip.nativeElement.textContent || '').replace(/\s+/g, ' ').trim();
    expect(text).toContain('90');
    expect(text).toContain('≈');
    // PO decision: duration is redundant with the already-shown scheduled
    // clock-time duration on this surface — the chip must never render it.
    expect(text).not.toContain('100');
    expect(text).not.toContain('·');
    expect(text).not.toContain('ESTIMATE_MIN_UNIT');
  });
});

describe('ScheduleBookingListComponent (seat-scarcity display — OBRS-229)', () => {
  let fixture: ComponentFixture<ScheduleBookingListComponent>;
  let component: ScheduleBookingListComponent;
  let store: MockStore;

  function makeSchedule(id: number, availableSeats: number): Schedule {
    return {
      id,
      vehicleType: 'van',
      departureDateTime: '2030-06-17T08:00:00+07:00',
      arrivalDateTime: '2030-06-17T09:58:00+07:00',
      pricePerSeat: '200',
      availableSeats,
      availableSeatNumbers: [],
      routeSlug: 'chonburi-bangkok',
    };
  }

  // `isSelectFirst` gates which button renders: the departure leg's
  // `.select-btn` only shows while `false` (its first-choose state), and the
  // return leg only renders at all while `true` (after the first choose) —
  // so departure- and return-leg button assertions need different states.
  function render(departureSeats: number, arrivalSeats: number | null, isSelectFirst = false): void {
    const departureSchedule = makeSchedule(1, departureSeats);
    const arrivalSchedules = arrivalSeats === null ? [] : [makeSchedule(2, arrivalSeats)];

    store.overrideSelector(selectScheduleList, {
      departureSchedules: [departureSchedule],
      arrivalSchedules,
    } as ScheduleList);
    store.overrideSelector(selectScheduleFilter, null as any);
    store.overrideSelector(selectProvinceWithStation, [] as any);

    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    component = fixture.componentInstance;
    // ngOnInit (run by the first detectChanges) resets isSelectFirst to
    // false, so it must be set only after that initial change-detection pass.
    fixture.detectChanges();
    component.isSelectFirst = isSelectFirst;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        ScheduleBookingListComponent,
        ScheduleDelayNoticeComponent,
        ArrivalDateNoticeComponent,
      ],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub() },
        { provide: ScheduleService, useValue: createScheduleServiceStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
  });

  it('departure leg: low seats (5) renders SEAT_REMAIN + count + SEAT_UNIT with the low status class, and the price line carries SEAT_PER_PASSENGER', () => {
    render(5, 10);
    const availability = fixture.debugElement.query(By.css('.schedule-item .availability'));
    const text = (availability.nativeElement.textContent || '').replace(/\s+/g, ' ').trim();
    expect(text).toContain('SCHEDULE_BOOKING.SEAT_REMAIN');
    expect(text).toContain('5');
    expect(text).toContain('SCHEDULE_BOOKING.SEAT_UNIT');
    const lowEl = fixture.debugElement.query(By.css('.schedule-item .seat-status--low'));
    expect(lowEl).toBeTruthy();

    const priceUnit = fixture.debugElement.query(By.css('.schedule-item .price .price-unit'));
    expect((priceUnit.nativeElement.textContent || '').trim()).toBe('SCHEDULE_BOOKING.SEAT_PER_PASSENGER');
  });

  it('departure leg: comfortable seats (6) renders no `.availability` block at all', () => {
    render(6, 10);
    const availability = fixture.debugElement.query(By.css('.schedule-item .availability'));
    expect(availability).toBeFalsy();
    const lowEl = fixture.debugElement.query(By.css('.schedule-item .seat-status--low'));
    expect(lowEl).toBeFalsy();

    const priceUnit = fixture.debugElement.query(By.css('.schedule-item .price .price-unit'));
    expect((priceUnit.nativeElement.textContent || '').trim()).toBe('SCHEDULE_BOOKING.SEAT_PER_PASSENGER');
  });

  it('return leg: low seats (5) renders SEAT_REMAIN + count + SEAT_UNIT with the low status class', () => {
    render(10, 5, true);
    const items = fixture.debugElement.queryAll(By.css('.schedule-item'));
    const returnAvailability = items[1].query(By.css('.availability'));
    const text = (returnAvailability.nativeElement.textContent || '').replace(/\s+/g, ' ').trim();
    expect(text).toContain('SCHEDULE_BOOKING.SEAT_REMAIN');
    expect(text).toContain('5');
    expect(items[1].query(By.css('.seat-status--low'))).toBeTruthy();
  });

  it('return leg: comfortable seats (6) renders no `.availability` block at all', () => {
    render(10, 6, true);
    const items = fixture.debugElement.queryAll(By.css('.schedule-item'));
    expect(items[1].query(By.css('.availability'))).toBeFalsy();
    expect(items[1].query(By.css('.seat-status--low'))).toBeFalsy();
  });
});

// OBRS-1141 — the disclosure of an announced delay on the customer search
// results. OBRS-1099 made the time in these rows CORRECT; this asserts a
// customer can also tell that it moved, on BOTH legs of a round trip (AC3).
describe('ScheduleBookingListComponent (announced-delay disclosure, OBRS-1141)', () => {
  let fixture: ComponentFixture<ScheduleBookingListComponent>;
  let component: ScheduleBookingListComponent;
  let store: MockStore;

  const onTime: Schedule = {
    id: 31,
    vehicleType: 'van',
    departureDateTime: '2030-06-17T08:00:00',
    arrivalDateTime: '2030-06-17T09:58:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A'],
    routeSlug: 'chonburi-bangkok',
  };

  // What the backend sends for a round announced 2 hours late: departureDateTime
  // is ALREADY the effective 10:00, and the planned 08:00 arrives beside it.
  const delayed: Schedule = {
    ...onTime,
    id: 32,
    departureDateTime: '2030-06-17T10:00:00',
    arrivalDateTime: '2030-06-17T11:58:00',
    scheduledDepartureDateTime: '2030-06-17T08:00:00',
  };

  function render(departures: Schedule[], returns: Schedule[] | null = null): void {
    store.overrideSelector(selectScheduleList, {
      departureSchedules: departures,
      arrivalSchedules: returns,
    } as ScheduleList);
    store.overrideSelector(selectScheduleFilter, null as any);
    store.overrideSelector(selectProvinceWithStation, [] as any);

    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // The return leg only renders once an outbound trip has been picked.
    component.isSelectFirst = returns !== null;
    fixture.detectChanges();
  }

  function noticesIn(itemIndex: number) {
    const items = fixture.debugElement.queryAll(By.css('.schedule-item'));
    return items[itemIndex].queryAll(By.css('[data-testid="schedule-delay-notice"]'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        ScheduleBookingListComponent,
        ScheduleDelayNoticeComponent,
        ArrivalDateNoticeComponent,
      ],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub() },
        { provide: ScheduleService, useValue: createScheduleServiceStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
  });

  it('AC2 — an ordinary row renders no delay markup at all, and its time text is unchanged', () => {
    render([onTime]);

    expect(noticesIn(0).length).toBe(0);
    const time = fixture.debugElement.queryAll(By.css('.schedule-item .time'))[0];
    expect((time.nativeElement.textContent || '').replace(/\s+/g, ' ').trim()).toBe(
      '08:00 SCHEDULE_BOOKING.TIME_UNIT'
    );
  });

  it('AC1 — a delayed outbound row shows the EFFECTIVE time plus a badge and the planned time', () => {
    render([delayed]);

    const time = fixture.debugElement.queryAll(By.css('.schedule-item .time'))[0];
    const text = (time.nativeElement.textContent || '').replace(/\s+/g, ' ').trim();
    // The headline time is the one the bus actually leaves at (OBRS-1099)...
    expect(text).toContain('10:00');
    // ...and the row now also says that this is not the time it was planned for.
    expect(text).toContain('SCHEDULE_DELAY_NOTICE.BADGE');
    expect(text).toContain('SCHEDULE_DELAY_NOTICE.PLANNED');
    expect(noticesIn(0).length).toBe(1);
  });

  it('AC3 — the RETURN leg discloses its own delay, and an on-time return leg does not', () => {
    render([onTime], [delayed]);

    const items = fixture.debugElement.queryAll(By.css('.schedule-item'));
    expect(items.length).toBe(2);
    expect(noticesIn(0).length).toBe(0);
    expect(noticesIn(1).length).toBe(1);

    render([delayed], [onTime]);
    expect(noticesIn(0).length).toBe(1);
    expect(noticesIn(1).length).toBe(0);
  });

  it('AC5 — a delay that crosses midnight also names the departure DATE', () => {
    const overnight: Schedule = {
      ...onTime,
      id: 33,
      // 23:30 announced an hour late leaves at 00:30 the NEXT day, and stays in
      // the searched day's results because the sale window and the day bucket
      // are both computed from the planned time (OBRS-1099 AC1/AC9).
      departureDateTime: '2030-06-18T00:30:00',
      arrivalDateTime: '2030-06-18T02:28:00',
      scheduledDepartureDateTime: '2030-06-17T23:30:00',
    };
    render([overnight]);

    expect(
      fixture.debugElement.query(By.css('[data-testid="schedule-delay-date"]'))
    ).not.toBeNull();

    // ...and an ordinary same-day delay must NOT carry that date, or the cue
    // stops meaning anything.
    render([delayed]);
    expect(fixture.debugElement.query(By.css('[data-testid="schedule-delay-date"]'))).toBeNull();
  });

  it('AC4 — the disclosure says nothing about the sale window; the seat/price cells are untouched', () => {
    render([delayed]);

    const notice = fixture.debugElement.query(By.css('[data-testid="schedule-delay-notice"]'));
    const text: string = notice.nativeElement.textContent.replace(/\s+/g, ' ').trim();
    // Every token is an i18n KEY under the notice's own namespace (no dictionary
    // is loaded in these specs), so no copy — reassuring or otherwise — can be
    // smuggled in as a literal. Online sale still closes at the PLANNED time
    // minus booking_offset_minutes, so any "there is still time" wording would
    // be a lie the backend contradicts.
    expect(
      text.split(' ').filter((t) => t && !t.startsWith('SCHEDULE_DELAY_NOTICE.'))
    ).toEqual([]);

    // The select button is still the plain one — a delayed round is bought the
    // same way, at the same price.
    expect(fixture.debugElement.query(By.css('.schedule-item .select-btn'))).toBeTruthy();
  });
});

// OBRS-1217 — the empty list a customer gets every evening once the last bus
// has left. `ScheduleRepository:151` filters departed rounds out in SQL, so a
// route that runs daily still answers `[]` after ~17:30 while tomorrow morning
// is fully bookable. The point of these tests is that the two reasons for an
// empty list stay TOLD APART: today-is-over gets the new copy plus a way out,
// every other empty day keeps `NO_RESULTS`.
describe('ScheduleBookingListComponent (OBRS-1217 sold-out-today empty state)', () => {
  let fixture: ComponentFixture<ScheduleBookingListComponent>;
  let component: ScheduleBookingListComponent;
  let store: MockStore;

  /**
   * 2026-08-10, 20:58 — the wall-clock of the prod report.
   *
   * NO `+07:00`. It carried one until CI went red on the midnight test below,
   * and the offset was the bug: what the component compares is `dayjs(date)`
   * against `dayjs()`, and both resolve in the RUNNER's zone. Pinning an
   * instant in ICT and then asking a UTC runner what day it is gives a
   * different answer than it gives here — 2026-08-11T00:05+07:00 is still
   * 10 August in UTC, so "midnight passed" never happened and the sold-out
   * panel was still on screen.
   *
   * A bare literal is parsed as LOCAL time, so these say "20:58 on the day
   * being searched" in whatever zone the machine is in, which is the claim
   * the tests are actually making. This suite passed on a UTC+7 laptop and
   * failed in CI for a week (measured: run 31452623314).
   */
  const TONIGHT = new Date('2026-08-10T20:58:00');

  // OBRS-1574: the return leg the owner's screenshot had under it - the
  // outbound day is over, the return day is fully bookable.
  const returnRound: Schedule = {
    id: 2,
    vehicleType: 'van',
    departureDateTime: '2026-08-11T08:00:00+07:00',
    arrivalDateTime: '2026-08-11T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 20,
    availableSeatNumbers: ['1A'],
    routeSlug: 'chonburi-bangkok',
  };

  function filterFor(departureDate: string, roundTripId: number = 1): any {
    return {
      roundTrip: { id: roundTripId },
      passengerInfo: [{ type: 'ADULT', count: 1 }],
      startStationId: 1,
      stopStationId: 24,
      departureDate,
    };
  }

  function render(scheduleList: ScheduleList | null, scheduleFilter: any) {
    store.overrideSelector(selectScheduleList, scheduleList as ScheduleList);
    store.overrideSelector(selectScheduleFilter, scheduleFilter);
    store.overrideSelector(selectProvinceWithStation, [] as any);
    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function textOf(selector: string): string[] {
    return fixture.debugElement
      .queryAll(By.css(selector))
      .map((el) => (el.nativeElement.textContent || '').trim());
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        ScheduleBookingListComponent,
        ScheduleDelayNoticeComponent,
        ArrivalDateNoticeComponent,
      ],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub() },
        { provide: ScheduleService, useValue: createScheduleServiceStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    jasmine.clock().install();
    jasmine.clock().mockDate(TONIGHT);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('replaces NO_RESULTS with the sold-out-today copy and a next-day button when the searched date IS today', () => {
    render({ departureSchedules: [], arrivalSchedules: null }, filterFor('2026-08-10'));

    expect(textOf('.sold-out-today__title')).toEqual([
      'SCHEDULE_BOOKING.SOLD_OUT_TODAY_TITLE',
    ]);
    // The old copy tells the customer to change ROUTE, which is wrong advice
    // here — the route is fine and sells out tomorrow morning.
    expect(textOf('.no-results')).not.toContain('SCHEDULE_BOOKING.NO_RESULTS');
    expect(fixture.debugElement.query(By.css('.sold-out-today__action'))).toBeTruthy();
  });

  it('keeps the original NO_RESULTS copy when the empty day is NOT today', () => {
    render({ departureSchedules: [], arrivalSchedules: null }, filterFor('2026-08-15'));

    expect(textOf('.no-results')).toContain('SCHEDULE_BOOKING.NO_RESULTS');
    // OBRS-862 wraps `.no-results` in the same `.sold-out-today` panel so the
    // nearest-day hint has somewhere to sit, so the panel DIV is no longer the
    // branch discriminator — `__title` is, and it is what the contrast gate
    // pins for this state too.
    expect(fixture.debugElement.query(By.css('.sold-out-today__title'))).toBeNull();
  });

  it('shows the message but NO button for a round trip — moving the outbound could put it after the return', () => {
    render({ departureSchedules: [], arrivalSchedules: null }, filterFor('2026-08-10', 2));

    expect(textOf('.sold-out-today__title')).toEqual([
      'SCHEDULE_BOOKING.SOLD_OUT_TODAY_TITLE',
    ]);
    expect(fixture.debugElement.query(By.css('.sold-out-today__action'))).toBeNull();
  });

  it('renders nothing at all before a search has run (null schedule list)', () => {
    render(null, filterFor('2026-08-10'));

    expect(fixture.debugElement.query(By.css('.sold-out-today'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.no-results'))).toBeNull();
  });

  it('carries the NEXT day, localized, in the button label', (done) => {
    render({ departureSchedules: [], arrivalSchedules: null }, filterFor('2026-08-10'));

    component.soldOutToday$.subscribe((state) => {
      // 2026-08-11 is a Tuesday. Asserted through Intl rather than a literal so
      // this does not become a test of one runtime's ICU data.
      const expected = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }).format(new Date('2026-08-11T00:00:00'));
      expect(state?.nextDayLabel).toBe(expected);
      done();
    });
  });

  it('dispatches ONE filter change on click — the filter form re-runs the search and re-labels its own date control', () => {
    render({ departureSchedules: [], arrivalSchedules: null }, filterFor('2026-08-10'));
    const dispatch = spyOn(store, 'dispatch');

    fixture.debugElement
      .query(By.css('.sold-out-today__action'))
      .triggerEventHandler('click', null);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.calls.mostRecent().args[0] as any;
    expect(action.schedule_filter.departureDate).toBe('2026-08-11');
    // Everything else about the search must survive the jump.
    expect(action.schedule_filter.startStationId).toBe(1);
    expect(action.schedule_filter.stopStationId).toBe(24);
  });

  // AC#5. The bug this guards is invisible in every other test: resolve "today"
  // once at construction and a tab opened at 23:50 tells the customer at 00:05
  // that yesterday's exhausted search is today's.
  it('re-evaluates "today" when the result arrives, not when the page loaded', () => {
    // Local literals, no offset -- see TONIGHT above for what an offset here
    // costs: in UTC these two instants are the same calendar day and the test
    // asserts a rollover that never occurred.
    jasmine.clock().mockDate(new Date('2026-08-10T23:50:00'));
    render({ departureSchedules: [], arrivalSchedules: null }, filterFor('2026-08-10'));
    expect(fixture.debugElement.query(By.css('.sold-out-today'))).toBeTruthy();

    // Midnight passes with the tab open, then the same search is re-run.
    jasmine.clock().mockDate(new Date('2026-08-11T00:05:00'));
    store.overrideSelector(selectScheduleList, {
      departureSchedules: [],
      arrivalSchedules: null,
    } as ScheduleList);
    store.refreshState();
    fixture.detectChanges();

    // 2026-08-10 is now YESTERDAY: it is no longer "today's rounds have left".
    // `__title` and not the panel div — see the OBRS-862 note above.
    expect(fixture.debugElement.query(By.css('.sold-out-today__title'))).toBeNull();
    expect(textOf('.no-results')).toContain('SCHEDULE_BOOKING.NO_RESULTS');
  });

  // OBRS-1574 - same evening, round trip: the outbound answers `[]` while the
  // return day still sells, so the outbound heading printed itself over an
  // empty list directly under the sold-out copy.
  it('prints no outbound heading when the sold-out leg has no rounds to head', () => {
    render({ departureSchedules: [], arrivalSchedules: [returnRound] }, filterFor('2026-08-10', 2));

    expect(textOf('.sold-out-today__title')).toEqual([
      'SCHEDULE_BOOKING.SOLD_OUT_TODAY_TITLE',
    ]);
    expect(textOf('h3.title')).not.toContain('SCHEDULE_BOOKING.SUBHEADER_DEPARTURE');
  });
});

/**
 * OBRS-1302 — the trip list while online booking is closed.
 *
 * The list is deliberately the ONE customer surface that keeps working: rounds,
 * times, fares and remaining seats are what earns the site's Google position and
 * what a customer reads before messaging the page. So the closed arm asserts not
 * only that the booking button is gone but that the fare is still on screen —
 * the regression AC-2 exists to prevent, and the one a "close the booking flow"
 * edit is most likely to cause by gating the whole route.
 *
 * Both arms, per AC-8. The open arm is the owner's reopen path.
 */
describe('ScheduleBookingListComponent (OBRS-1302 — online booking closed)', () => {
  let fixture: ComponentFixture<ScheduleBookingListComponent>;
  let store: MockStore;
  let originalOnlineTicketBooking: boolean;

  const trip: Schedule = {
    id: 77,
    vehicleType: 'van',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    arrivalDateTime: '2030-06-17T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A'],
    routeSlug: 'chonburi-bangkok',
  };

  function render(): void {
    store.overrideSelector(selectScheduleList, {
      departureSchedules: [trip],
      arrivalSchedules: null,
    } as ScheduleList);
    store.overrideSelector(selectScheduleFilter, null as any);
    store.overrideSelector(selectProvinceWithStation, [] as any);
    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    originalOnlineTicketBooking = environment.features.onlineTicketBooking;

    await TestBed.configureTestingModule({
      declarations: [
        ScheduleBookingListComponent,
        ScheduleDelayNoticeComponent,
        ArrivalDateNoticeComponent,
      ],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        // OBRS-1583: the REAL AuthService here, not the stub the other blocks
        // use. What the staff-preview arms below have to prove is that a held
        // role expands through ROLE_GRANTS the way the card claims — a stub
        // returning a canned boolean would prove only that the stub was called.
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    localStorage.removeItem('auth_roles');
  });

  afterEach(() => {
    environment.features.onlineTicketBooking = originalOnlineTicketBooking;
    localStorage.removeItem('auth_roles');
  });

  describe('flag OFF', () => {
    beforeEach(() => {
      environment.features.onlineTicketBooking = false;
      render();
    });

    it('offers no button that would start a booking', () => {
      expect(fixture.debugElement.query(By.css('button.select-btn'))).toBeNull();
    });

    it('offers the Facebook page instead, in a new tab and with rel=noopener', () => {
      const anchor = fixture.debugElement.query(By.css('a.select-btn--closed'));

      expect(anchor).not.toBeNull();
      const el = anchor.nativeElement as HTMLAnchorElement;
      expect(el.href).toBe(NJ_FACEBOOK_PAGE_URL);
      expect(el.target).toBe('_blank');
      expect(el.rel).toContain('noopener');
      expect((el.textContent || '').trim()).toBe('SCHEDULE_BOOKING.CLOSED_CHOOSE');
    });

    it('still shows the round, its time and its fare — AC-2, the thing that must NOT regress', () => {
      const text = (fixture.nativeElement.textContent || '') as string;

      expect(text).toContain('200');
      expect(fixture.debugElement.query(By.css('.price'))).not.toBeNull();
      expect(fixture.debugElement.queryAll(By.css('.schedule-item')).length).toBe(1);

      // The time, asserted against the app's OWN formatter rather than a literal.
      // `formatTimeHHMM` is `dayjs(iso).format('HH:mm')`, i.e. the RUNNER's local
      // zone — so a hard-coded '08:00' passes in Asia/Bangkok and fails on a UTC
      // CI runner with '01:00', which is exactly how this line was first written
      // and exactly how CI caught it (run 31688562452). What AC-2 needs proved is
      // that the time row still renders at all; that HH:mm is the right rendering
      // of the ISO string is `trip-format.spec.ts`'s job, not this spec's.
      const timeEl = fixture.debugElement.query(By.css('.schedule-item .time'));
      expect(timeEl).not.toBeNull();
      expect((timeEl.nativeElement.textContent || '').trim()).toContain(
        formatTimeHHMM(trip.departureDateTime)
      );
      expect(formatTimeHHMM(trip.departureDateTime)).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('flag ON — nothing about today changes', () => {
    beforeEach(() => {
      environment.features.onlineTicketBooking = true;
      render();
    });

    it('offers the booking button again', () => {
      expect(fixture.debugElement.query(By.css('button.select-btn'))).not.toBeNull();
    });

    it('offers no Facebook fallback — a reopened site carries no trace of the close', () => {
      expect(fixture.debugElement.query(By.css('a.select-btn--closed'))).toBeNull();
    });
  });

  /**
   * OBRS-1583 — with the flag still OFF, a signed-in staff member sees the
   * booking button and a customer does not.
   *
   * `driver` is asserted separately from `salesperson` on purpose: they are the
   * pair the owner's decision moved. `salesperson` carries `driver` in
   * ROLE_GRANTS but not the other way round, so a preview list written as
   * `['salesperson']` would pass the salesperson case and silently drop every
   * driver — the exact mistake this arm exists to catch.
   */
  describe('OBRS-1583 — flag OFF, staff preview', () => {
    beforeEach(() => {
      environment.features.onlineTicketBooking = false;
    });

    function renderAs(roles: string[] | null): void {
      if (roles) {
        localStorage.setItem('auth_roles', JSON.stringify(roles));
      }
      render();
    }

    ['owner', 'admin', 'salesperson', 'driver'].forEach((role) => {
      it(`${role} gets the booking button, not the Facebook fallback`, () => {
        renderAs([role]);

        expect(fixture.debugElement.query(By.css('button.select-btn')))
          .withContext(role)
          .not.toBeNull();
        expect(fixture.debugElement.query(By.css('a.select-btn--closed')))
          .withContext(role)
          .toBeNull();
      });
    });

    // The must-NOT-regress half. Anyone who is not staff must see exactly what
    // they see today, and "signed out" is the case a role check gets wrong by
    // reading an empty list as permissive.
    [null, ['customer'], ['__proto__']].forEach((roles) => {
      it(`${roles ? roles.join(',') : 'signed out'} still gets the Facebook fallback and no button`, () => {
        renderAs(roles);

        expect(fixture.debugElement.query(By.css('button.select-btn')))
          .withContext(String(roles))
          .toBeNull();
        expect(fixture.debugElement.query(By.css('a.select-btn--closed')))
          .withContext(String(roles))
          .not.toBeNull();
      });
    });
  });
});

/**
 * OBRS-1302 — `selectSchedule` is inert while booking is closed.
 *
 * The template and the route guard both already stop this being reached, and
 * both fail OPEN into side effects if they are ever wrong: a `schedule_selected`
 * analytics event that pollutes the funnel with intent nobody could act on, and
 * a store write that leaves a customer mid-flow before the guard gets a say.
 * That is the whole reason the early return exists, so it is asserted directly
 * rather than through the rendered button.
 */
describe('ScheduleBookingListComponent (OBRS-1302 — selectSchedule side effects)', () => {
  let originalOnlineTicketBooking: boolean;
  let router: any;
  let analytics: any;
  let store: any;

  const trip: Schedule = {
    id: 78,
    vehicleType: 'van',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    arrivalDateTime: '2030-06-17T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A'],
    routeSlug: 'chonburi-bangkok',
  };

  function build(): ScheduleBookingListComponent {
    store = createStoreStub();
    router = createRouterStub();
    analytics = createAnalyticsServiceStub();
    spyOn(store, 'dispatch').and.callThrough();
    spyOn(router, 'navigate').and.callThrough();
    spyOn(analytics, 'track').and.callThrough();

    return new ScheduleBookingListComponent(
      store,
      router,
      createStoreStub(),
      createTranslateStub(),
      createRouteMapServiceStub(),
      analytics,
      createAuthServiceStub(),
      createScheduleServiceStub(),
      createBookingPolicyServiceStub()
    );
  }

  beforeEach(() => {
    originalOnlineTicketBooking = environment.features.onlineTicketBooking;
  });

  afterEach(() => {
    environment.features.onlineTicketBooking = originalOnlineTicketBooking;
  });

  it('fires no analytics, writes nothing to the store and navigates nowhere when closed', () => {
    environment.features.onlineTicketBooking = false;
    const component = build();

    component.selectSchedule(trip, true);

    expect(analytics.track).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('still tracks and still writes to the store when open', () => {
    environment.features.onlineTicketBooking = true;
    const component = build();

    component.selectSchedule(trip, true);

    expect(analytics.track).toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalled();
  });
});

/**
 * OBRS-1336. A round-trip search whose return list came back empty used to
 * navigate straight to review on the outbound pick, turning the trip into a
 * one-way ticket with nothing said and `bookingType: 'return'` still on the
 * payload. These assert the fork directly rather than through the rendered
 * button: the decision is made inside `selectSchedule`'s subscription, and a
 * DOM-level test would pass on a component that navigated for the wrong reason.
 */
describe('ScheduleBookingListComponent (OBRS-1336 — round trip with no return leg)', () => {
  let originalOnlineTicketBooking: boolean;
  let router: any;
  let store: any;

  const trip: Schedule = {
    id: 78,
    vehicleType: 'van',
    departureDateTime: '2030-06-17T08:00:00+07:00',
    arrivalDateTime: '2030-06-17T09:58:00+07:00',
    pricePerSeat: '200',
    availableSeats: 10,
    availableSeatNumbers: ['1A'],
    routeSlug: 'chonburi-bangkok',
  };

  /** `roundTripId` 2 = the round-trip option, 1 = one-way — the ids the search
   *  form's `roundTripDropdowns` uses. */
  function build(
    roundTripId: number,
    arrivalSchedules: Schedule[] | null
  ): ScheduleBookingListComponent {
    store = createStoreStub();
    router = createRouterStub();
    spyOn(store, 'dispatch').and.callThrough();
    spyOn(router, 'navigate').and.callThrough();

    const component = new ScheduleBookingListComponent(
      store,
      router,
      createStoreStub(),
      createTranslateStub(),
      createRouteMapServiceStub(),
      createAnalyticsServiceStub(),
      createAuthServiceStub(),
      createScheduleServiceStub(),
      createBookingPolicyServiceStub()
    );
    component.scheduleList = of({
      departureSchedules: [trip],
      arrivalSchedules,
    } as ScheduleList);
    component.scheduleFilter = of({ roundTrip: { id: roundTripId } } as any);
    return component;
  }

  beforeEach(() => {
    originalOnlineTicketBooking = environment.features.onlineTicketBooking;
    environment.features.onlineTicketBooking = true;
  });

  afterEach(() => {
    environment.features.onlineTicketBooking = originalOnlineTicketBooking;
  });

  it('AC1: asks instead of navigating when a round-trip search has no return leg', () => {
    const component = build(2, []);

    component.selectSchedule(trip, true);

    expect(component.showNoReturnConfirm).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('AC3: leaves the normal round trip alone — return legs exist, so no dialog and no jump', () => {
    const component = build(2, [trip]);

    component.selectSchedule(trip, true);

    expect(component.showNoReturnConfirm).toBeFalse();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('AC3: picking the RETURN leg still goes straight to review', () => {
    const component = build(2, [trip]);

    component.selectSchedule(trip, false);

    expect(component.showNoReturnConfirm).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/review-schedule-booking']);
  });

  it('AC4: a genuine one-way search is never interrupted', () => {
    const component = build(1, null);

    component.selectSchedule(trip, true);

    expect(component.showNoReturnConfirm).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/review-schedule-booking']);
  });

  it('AC2: accepting one-way rewrites the search filter to one-way before navigating', () => {
    const component = build(2, []);
    component.selectSchedule(trip, true);
    (store.dispatch as jasmine.Spy).calls.reset();

    component.continueAsOneWay();

    const filterAction = (store.dispatch as jasmine.Spy).calls
      .allArgs()
      .map((args) => args[0])
      .find((action) => action?.schedule_filter);
    expect(filterAction.schedule_filter.roundTrip.id).toBe(1);
    expect(router.navigate).toHaveBeenCalledWith(['/review-schedule-booking']);
    expect(component.showNoReturnConfirm).toBeFalse();
  });

  it('AC1: editing the search instead clears the outbound that was already stored', () => {
    const component = build(2, []);
    component.selectSchedule(trip, true);

    component.cancelNoReturnConfirm();

    expect(component.showNoReturnConfirm).toBeFalse();
    expect(component.selectedSchedule).toEqual([]);
    expect(component.isSelectFirst).toBeFalse();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

/**
 * OBRS-862 (review finding 1) — the card's headline behaviour, which shipped
 * with no unit test at all.
 *
 * Every other block in this file wires `createScheduleServiceStub()`, whose
 * `getAvailabilityCached` answers `of(null)` — the "we were told nothing"
 * branch — so `nearestDay$`, `showDay()` and `resolveNearestDay()` were only
 * ever exercised down the path that returns `null` and renders nothing. The
 * proof it was uncovered: a reviewer changed behaviour INSIDE
 * `resolveNearestDay` and the suite did not move (6734 passing before and
 * after). These arms feed it a real availability answer.
 */
describe('ScheduleBookingListComponent (OBRS-862 nearest day with trips)', () => {
  let fixture: ComponentFixture<ScheduleBookingListComponent>;
  let component: ScheduleBookingListComponent;
  let store: MockStore;
  let availability: ScheduleAvailability | null;

  /**
   * NO `+07:00`, for the reason the OBRS-1217 block above documents at length:
   * the component compares `dayjs(date)` against `dayjs()`, both in the
   * RUNNER's zone, so pinning an instant in ICT makes "which day is it" a
   * different question here than in CI. A bare literal is parsed as LOCAL time.
   */
  const TONIGHT = new Date('2026-08-10T20:58:00');
  /** 3 days out, so this is NOT the sold-out-today panel — it is the plain
   *  empty-result state, the one the card's new copy had to fit into. */
  const SEARCHED = '2026-08-13';
  /** The window `buildDayWindow` produces for SEARCHED at TONIGHT:
   *  2026-08-10 (today, the lower clamp) … 2026-08-16. */
  const WINDOW_END = '2026-08-16';

  const STATIONS = [
    { id: 1, slug: 'nong_chak' },
    { id: 4, slug: 'bts_mo_chit' },
  ] as unknown as StationApi[];

  function filterFor(
    departureDate: string | null,
    extra: Record<string, unknown> = {}
  ): any {
    return {
      roundTrip: { id: 1 },
      passengerInfo: [{ type: 'ADULT', count: 1 }],
      startStationId: 1,
      stopStationId: 4,
      departureDate,
      ...extra,
    };
  }

  /** Through `Intl`, never a literal, so this stays a test of the component and
   *  not of one runtime's ICU data — same reasoning as OBRS-1217's label test. */
  function expectedLabel(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso + 'T00:00:00'));
  }

  function hint(iso: string): string {
    return 'The nearest day with trips is ' + expectedLabel(iso);
  }

  function render(scheduleFilter: any) {
    store.overrideSelector(selectScheduleList, {
      departureSchedules: [],
      arrivalSchedules: null,
    } as unknown as ScheduleList);
    store.overrideSelector(selectScheduleFilter, scheduleFilter);
    store.overrideSelector(selectProvinceWithStation, STATIONS as never);
    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function hintText(): string | null {
    const el = fixture.debugElement.query(By.css('.sold-out-today__hint'));
    return el ? (el.nativeElement.textContent || '').trim() : null;
  }

  function actionButton(): DebugElement | null {
    return fixture.debugElement.query(By.css('[data-testid="nearest-day-action"]'));
  }

  beforeEach(async () => {
    availability = null;

    await TestBed.configureTestingModule({
      declarations: [
        ScheduleBookingListComponent,
        ScheduleDelayNoticeComponent,
        ArrivalDateNoticeComponent,
      ],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub() },
        {
          provide: ScheduleService,
          useValue: {
            ...createScheduleServiceStub(),
            // Read at subscribe time, so each arm sets `availability` first.
            getAvailabilityCached: () => of(availability),
          },
        },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);

    // The hint's whole point is the DATE it names, and an untranslated key
    // renders WITHOUT its interpolation — so the copy has to be loaded for the
    // assertion to be about anything at all. Only the two keys these arms read.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      SCHEDULE_BOOKING: {
        NEAREST_DAY_HINT: 'The nearest day with trips is {{date}}',
        SOLD_OUT_TODAY_ACTION: 'Show trips on {{date}}',
        NO_RESULTS: 'No trips found',
      },
    });
    translate.use('en');

    jasmine.clock().install();
    jasmine.clock().mockDate(TONIGHT);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('names the nearest day AFTER the searched one when the result is empty', () => {
    availability = { availableDates: ['2026-08-11', '2026-08-15'], effectiveDays: 7 };
    render(filterFor(SEARCHED));

    expect(hintText()).toBe(hint('2026-08-15'));
  });

  it('prefers a day AFTER the searched date over an equally near one before it', () => {
    // 08-12 and 08-14 are both one day from 08-13. A customer looking for a
    // trip wants the next one, not the one they have already missed.
    availability = { availableDates: ['2026-08-12', '2026-08-14'], effectiveDays: 7 };
    render(filterFor(SEARCHED));

    expect(hintText()).toBe(hint('2026-08-14'));
    expect(hintText()).not.toContain(expectedLabel('2026-08-12'));
  });

  it('falls back to the CLOSEST earlier day when nothing later has trips', () => {
    availability = { availableDates: ['2026-08-10', '2026-08-11'], effectiveDays: 7 };
    render(filterFor(SEARCHED));

    // 08-11, not 08-10: the backward arm takes the LAST entry before the
    // searched day, which is the nearest one and not the earliest.
    expect(hintText()).toBe(hint('2026-08-11'));
  });

  it('showDay() dispatches the filter change and carries the return date', () => {
    // The return date is set BEFORE the day being jumped to, so the carry rule
    // has visible work to do. A jump that only spread the old filter and
    // overwrote `departureDate` would leave 08-14 behind a 08-16 outbound —
    // the pair the backend rejects — and would pass any arm where the return
    // date happened to already be valid. `scheduleFilterForDay`'s own rules are
    // pinned in schedule-day-jump.spec.ts; what this asserts is that showDay()
    // goes THROUGH it rather than round the side of it.
    availability = { availableDates: ['2026-08-16'], effectiveDays: 7 };
    render(filterFor(SEARCHED, { roundTrip: { id: 2 }, returnDate: '2026-08-14' }));
    const dispatch = spyOn(store, 'dispatch');

    component.showDay('2026-08-16');

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.calls.mostRecent().args[0] as unknown as {
      type: string;
      schedule_filter: ScheduleFilter;
    };
    expect(action.type).toBe(invokeSetScheduleFilterApi.type);
    expect(action.schedule_filter.departureDate).toBe('2026-08-16');
    expect(action.schedule_filter.returnDate).toBe('2026-08-17');
  });

  // AC "พร้อมปุ่มกดไปวันนั้นเลย": the hint alone is not the deliverable. This is
  // the plain empty-result branch (SEARCHED is 3 days out, so `soldOutToday$`
  // is null) — the case the card was opened about, and the one that shipped
  // with a hint and no way to act on it.
  it('offers a jump button on the named day for a ONE-WAY empty result', () => {
    availability = { availableDates: ['2026-08-15'], effectiveDays: 7 };
    render(filterFor(SEARCHED));
    const dispatch = spyOn(store, 'dispatch');

    const button = actionButton();
    expect(button).not.toBeNull();
    expect((button!.nativeElement.textContent || '').trim()).toBe(
      'Show trips on ' + expectedLabel('2026-08-15')
    );

    button!.nativeElement.click();

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.calls.mostRecent().args[0] as unknown as {
      type: string;
      schedule_filter: ScheduleFilter;
    };
    expect(action.type).toBe(invokeSetScheduleFilterApi.type);
    // The day the hint named, not the day after the searched one — this button
    // goes through showDay(nearestDay.iso), not showNextDay().
    expect(action.schedule_filter.departureDate).toBe('2026-08-15');
  });

  // The other half of the same rule, and the half that is easy to break by
  // "fixing" the asymmetry: the owner's 2026-08-10 call keeps the BUTTON
  // one-way-only, while the HINT names the nearest day for every trip type.
  // Asserting both in one arm is what stops a widened gate from passing (button
  // appears) and a deleted hint from passing (hint gone) alike. The arm above
  // is the positive control that proves this selector can match at all.
  it('withholds the jump button for a ROUND TRIP but still names the day', () => {
    availability = { availableDates: ['2026-08-15'], effectiveDays: 7 };
    render(filterFor(SEARCHED, { roundTrip: { id: 2 }, returnDate: '2026-08-20' }));

    expect(actionButton()).toBeNull();
    expect(hintText()).toBe(hint('2026-08-15'));
  });

  // What commit 455f697e guards. `dayjs(null).format('YYYY-MM-DD')` is the
  // literal string "Invalid Date", which sorts ABOVE every ISO date ('I' 0x49
  // vs a leading digit 0x32) — so without the validity guard nothing in the
  // window is "after" it, the backward arm takes over, and the hint names
  // WINDOW_END: the FARTHEST day in the window, announced as the nearest.
  it('renders the pre-card copy, and no hint, when the filter has no valid date', () => {
    availability = { availableDates: ['2026-08-11', WINDOW_END], effectiveDays: 7 };
    render(filterFor(null));

    expect(fixture.debugElement.query(By.css('.sold-out-today__hint'))).toBeNull();
    expect(
      (
        fixture.debugElement.query(By.css('.no-results')).nativeElement.textContent || ''
      ).trim()
    ).toBe('No trips found');
  });
});

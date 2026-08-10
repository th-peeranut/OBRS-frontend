import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { of } from 'rxjs';
import { ScheduleBookingListComponent } from './schedule-booking-list.component';
import {
  createAnalyticsServiceStub,
  createRouteMapServiceStub,
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { Schedule, ScheduleList } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import {
  RoutePickupDropoffData,
  RouteStop,
} from '../../../../shared/interfaces/route-map.interface';
import { StationApi } from '../../../../shared/interfaces/station.interface';
// OBRS-1141: declared alongside the component under test because the row
// template now hosts it; without it every render logs an unknown-element error.
import { ScheduleDelayNoticeComponent } from '../../../../shared/components/schedule-delay-notice/schedule-delay-notice.component';

describe('ScheduleBookingListComponent', () => {
  let component: ScheduleBookingListComponent;

  beforeEach(() => {
    component = new ScheduleBookingListComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub(),
      createRouteMapServiceStub(),
      createAnalyticsServiceStub()
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingListComponent, ScheduleDelayNoticeComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
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
      declarations: [ScheduleBookingListComponent, ScheduleDelayNoticeComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: routeMapServiceStub },
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
      declarations: [ScheduleBookingListComponent, ScheduleDelayNoticeComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
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
      declarations: [ScheduleBookingListComponent, ScheduleDelayNoticeComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
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

  /** 2026-08-10 20:58 ICT — the exact wall-clock of the prod report. */
  const TONIGHT = new Date('2026-08-10T20:58:00+07:00');

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
      declarations: [ScheduleBookingListComponent, ScheduleDelayNoticeComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
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
    expect(fixture.debugElement.query(By.css('.sold-out-today'))).toBeNull();
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
    jasmine.clock().mockDate(new Date('2026-08-10T23:50:00+07:00'));
    render({ departureSchedules: [], arrivalSchedules: null }, filterFor('2026-08-10'));
    expect(fixture.debugElement.query(By.css('.sold-out-today'))).toBeTruthy();

    // Midnight passes with the tab open, then the same search is re-run.
    jasmine.clock().mockDate(new Date('2026-08-11T00:05:00+07:00'));
    store.overrideSelector(selectScheduleList, {
      departureSchedules: [],
      arrivalSchedules: null,
    } as ScheduleList);
    store.refreshState();
    fixture.detectChanges();

    // 2026-08-10 is now YESTERDAY: it is no longer "today's rounds have left".
    expect(fixture.debugElement.query(By.css('.sold-out-today'))).toBeNull();
    expect(textOf('.no-results')).toContain('SCHEDULE_BOOKING.NO_RESULTS');
  });
});

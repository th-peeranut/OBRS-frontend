import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { of } from 'rxjs';
import { ScheduleBookingListComponent } from './schedule-booking-list.component';
import {
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

describe('ScheduleBookingListComponent', () => {
  let component: ScheduleBookingListComponent;

  beforeEach(() => {
    component = new ScheduleBookingListComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub(),
      createRouteMapServiceStub()
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
      declarations: [ScheduleBookingListComponent],
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
      declarations: [ScheduleBookingListComponent],
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

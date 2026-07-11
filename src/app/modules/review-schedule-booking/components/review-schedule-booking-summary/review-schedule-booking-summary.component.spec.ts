import { firstValueFrom, of } from 'rxjs';

import { ReviewScheduleBookingSummaryComponent } from './review-schedule-booking-summary.component';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { Schedule } from '../../../../shared/interfaces/schedule.interface';
import {
  RoutePickupDropoffData,
  RouteStop,
} from '../../../../shared/interfaces/route-map.interface';

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

describe('ReviewScheduleBookingSummaryComponent', () => {
  let component: ReviewScheduleBookingSummaryComponent;
  let routeMapServiceStub: { getPickupDropoffCached: jasmine.Spy };

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

  const scheduleFilter = {
    roundTrip: { code: 'return', label: '' },
    passengerInfo: [],
    startStationId: 1,
    stopStationId: 2,
    departureDate: '2030-06-17',
  };

  beforeEach(() => {
    const store = {
      pipe: jasmine.createSpy('pipe').and.returnValue(of([])),
    };
    const router = {
      navigate: jasmine.createSpy('navigate'),
    };
    const translateService = {
      currentLang: 'en',
    };
    routeMapServiceStub = {
      getPickupDropoffCached: jasmine
        .createSpy('getPickupDropoffCached')
        .and.returnValue(of(null)),
    };

    component = new ReviewScheduleBookingSummaryComponent(
      store as never,
      router as never,
      store as never,
      translateService as never,
      routeMapServiceStub as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read stop type labels from lookup responses', async () => {
    const stations: StationApi[] = [
      {
        id: 1,
        slug: 'bangkok',
        status: 'active',
        stopType: {
          code: 'station',
          display: {
            en: { label: 'Station' },
            th: { label: 'Station' },
          },
        },
        display: {
          en: { label: 'Bangkok' },
          th: { label: 'Bangkok' },
        },
        createdAt: '',
        updatedAt: '',
      },
    ];
    component.rawProvinceStationList = of(stations);

    const station = await firstValueFrom(component.findStationById(1));

    expect(station?.nameEnglish).toBe('Station');
    expect(station?.station.nameEnglish).toBe('Bangkok');
  });

  describe('findTripEstimate', () => {
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

    beforeEach(() => {
      component.rawProvinceStationList = of(stations);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component.scheduleFilter = of(scheduleFilter as any);
    });

    it('resolves null when the schedule has no routeSlug', async () => {
      const schedule = { id: 1, routeSlug: undefined } as unknown as Schedule;
      const estimate = await firstValueFrom(component.findTripEstimate(schedule, false));
      expect(estimate).toBeNull();
      expect(routeMapServiceStub.getPickupDropoffCached).not.toHaveBeenCalled();
    });

    it('resolves the departure leg estimate directly: pickup=fromSlug, dropoff=toSlug', async () => {
      routeMapServiceStub.getPickupDropoffCached.and.returnValue(of(outboundData));
      const schedule = { id: 1, routeSlug: 'chonburi-bangkok' } as unknown as Schedule;

      const estimate = await firstValueFrom(component.findTripEstimate(schedule, false));

      expect(routeMapServiceStub.getPickupDropoffCached).toHaveBeenCalledWith('chonburi-bangkok');
      expect(estimate).toEqual({ distanceKm: 90, durationMinutes: 100 });
    });

    it('resolves the return leg estimate with the pickup/dropoff swap (reverse-route slug space)', async () => {
      routeMapServiceStub.getPickupDropoffCached.and.returnValue(of(returnData));
      const schedule = { id: 2, routeSlug: 'bangkok-chonburi' } as unknown as Schedule;

      const estimate = await firstValueFrom(component.findTripEstimate(schedule, true));

      expect(estimate).toEqual({ distanceKm: 88, durationMinutes: 95 });
    });
  });
});

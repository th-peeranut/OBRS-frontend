import { firstValueFrom, of } from 'rxjs';

import { ReviewScheduleBookingSummaryComponent } from './review-schedule-booking-summary.component';
import { StationApi } from '../../../../shared/interfaces/station.interface';

describe('ReviewScheduleBookingSummaryComponent', () => {
  let component: ReviewScheduleBookingSummaryComponent;

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

    component = new ReviewScheduleBookingSummaryComponent(
      store as never,
      router as never,
      store as never,
      translateService as never
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
        createdBy: '',
        createdDate: '',
        lastUpdatedBy: '',
        lastUpdatedDate: '',
      },
    ];
    component.rawProvinceStationList = of(stations);

    const station = await firstValueFrom(component.findStationById(1));

    expect(station?.nameEnglish).toBe('Station');
    expect(station?.station.nameEnglish).toBe('Bangkok');
  });
});

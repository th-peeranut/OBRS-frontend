import { FormBuilder } from '@angular/forms';

import { ScheduleBookingFilterComponent } from './schedule-booking-filter.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('ScheduleBookingFilterComponent', () => {
  let component: ScheduleBookingFilterComponent;
  let store: any;
  let alertService: any;

  beforeEach(() => {
    store = createStoreStub();
    alertService = { warning: () => {}, error: () => {}, success: () => {} };
    component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      store,
      createStoreStub(),
      createTranslateStub(),
      alertService
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('warns and does not search when origin/destination/passengers are missing', () => {
    // Regression for #22: clicking Search with only a departure date used to
    // fire the request and surface the backend's generic "validation failed"
    // modal. It should instead show a clear, localized message and not search.
    const dispatchSpy = spyOn(store, 'dispatch');
    const warnSpy = spyOn(alertService, 'warning');

    component.onSearch();

    expect(warnSpy).toHaveBeenCalledWith('HOME.HOME_BOOKING.SEARCH_VALIDATION');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('dispatches the search when origin, destination and a passenger are set', () => {
    (component as any).allProvinceStationList = [
      { id: 1, slug: 'station-a' },
      { id: 2, slug: 'station-b' },
    ];
    component.bookingForm.patchValue({
      startStationId: 1,
      stopStationId: 2,
      passengerInfo: [
        { type: 'ADULT', count: 2 },
        { type: 'KIDS', count: 0 },
      ],
      departureDate: new Date(),
    });

    const dispatchSpy = spyOn(store, 'dispatch');
    const warnSpy = spyOn(alertService, 'warning');

    component.onSearch();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalled();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { ScheduleBookingListComponent } from './schedule-booking-list.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { Schedule, ScheduleList } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleList } from '../../../../shared/stores/schedule-list/schedule-list.selector';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';

describe('ScheduleBookingListComponent', () => {
  let component: ScheduleBookingListComponent;

  beforeEach(() => {
    component = new ScheduleBookingListComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub()
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
      providers: [provideMockStore()],
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

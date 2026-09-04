import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import dayjs from 'dayjs';
import { of, throwError } from 'rxjs';

import { ScheduleBookingDayStripComponent } from './schedule-booking-day-strip.component';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { ScheduleService } from '../../../../services/schedule/schedule.service';
import { BookingPolicyService } from '../../../../services/booking-policy/booking-policy.service';
import { ScheduleFilter } from '../../../../shared/interfaces/schedule.interface';
import { StationApi } from '../../../../shared/interfaces/station.interface';

const STATIONS = [
  { id: 1, slug: 'nong_chak' },
  { id: 4, slug: 'bts_mo_chit' },
] as unknown as StationApi[];

const iso = (offsetDays: number) => dayjs().add(offsetDays, 'day').format('YYYY-MM-DD');

function filterFor(departureDate: string, extra: Partial<ScheduleFilter> = {}): ScheduleFilter {
  return {
    roundTrip: { id: 1 },
    passengerInfo: [
      { type: 'ADULT', count: 1 },
      { type: 'KIDS', count: 0 },
    ],
    startStationId: 1,
    stopStationId: 4,
    departureDate,
    ...extra,
  } as ScheduleFilter;
}

describe('ScheduleBookingDayStripComponent', () => {
  let fixture: ComponentFixture<ScheduleBookingDayStripComponent>;
  let component: ScheduleBookingDayStripComponent;
  let store: MockStore;
  let scheduleServiceStub: { getAvailabilityCached: jasmine.Spy };
  let bookingPolicyServiceStub: { getBookingPolicy: jasmine.Spy };

  function setup(options: {
    filter: ScheduleFilter | null;
    policy?: unknown;
    availability?: unknown;
    stations?: StationApi[];
  }) {
    scheduleServiceStub = {
      getAvailabilityCached: jasmine
        .createSpy('getAvailabilityCached')
        .and.returnValue(of(options.availability ?? null)),
    };
    bookingPolicyServiceStub = {
      getBookingPolicy: jasmine
        .createSpy('getBookingPolicy')
        .and.returnValue(options.policy ?? of({ data: { maxAdvanceDays: 60, cutoffMinutes: 20 } })),
    };

    TestBed.configureTestingModule({
      declarations: [ScheduleBookingDayStripComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        provideMockStore(),
        { provide: ScheduleService, useValue: scheduleServiceStub },
        { provide: BookingPolicyService, useValue: bookingPolicyServiceStub },
      ],
    });

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectScheduleFilter, options.filter as ScheduleFilter);
    store.overrideSelector(
      selectProvinceWithStation,
      (options.stations ?? STATIONS) as never
    );

    fixture = TestBed.createComponent(ScheduleBookingDayStripComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function chipDates(): string[] {
    return fixture.debugElement
      .queryAll(By.css('[data-testid="day-strip-chip"]'))
      .map((chip) => chip.nativeElement.getAttribute('data-date'));
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── AC#3: the upper bound is READ FROM THE API, never a constant ─────────
  describe('AC#3 — upper bound from BookingPolicyService', () => {
    it('renders no chip past today + maxAdvanceDays when the policy is short', () => {
      setup({
        filter: filterFor(iso(0)),
        policy: of({ data: { maxAdvanceDays: 3, cutoffMinutes: 20 } }),
      });

      expect(chipDates()).toEqual([iso(0), iso(1), iso(2), iso(3)]);
      expect(chipDates()).not.toContain(iso(4));
    });

    it('reaches a day the fallback could never reach when the policy is long', () => {
      // The load-bearing arm: today+80 is unreachable under the fallback 60, so
      // a hardcoded constant clamps the selection to today+60 and fails here.
      setup({
        filter: filterFor(iso(80)),
        policy: of({ data: { maxAdvanceDays: 90, cutoffMinutes: 20 } }),
      });

      expect(chipDates()).toEqual([
        iso(77),
        iso(78),
        iso(79),
        iso(80),
        iso(81),
        iso(82),
        iso(83),
      ]);
    });

    it('keeps the fallback cap and still renders when the policy call fails', () => {
      setup({
        filter: filterFor(iso(80)),
        policy: throwError(() => new Error('boom')),
      });

      // Selection clamped to the fallback cap, window slid back to hold 7 days.
      expect(chipDates()).toEqual([
        iso(54),
        iso(55),
        iso(56),
        iso(57),
        iso(58),
        iso(59),
        iso(60),
      ]);
      expect(chipDates()).not.toContain(iso(61));
    });
  });

  // ── AC#1/AC#2 ────────────────────────────────────────────────────────────
  it('marks the searched day selected and clamps a past date up to today', () => {
    setup({ filter: filterFor(iso(-5)) });

    const selected = fixture.debugElement.query(By.css('.day-strip__chip.is-selected'));
    expect(selected.nativeElement.getAttribute('data-date')).toBe(iso(0));
    expect(selected.nativeElement.getAttribute('aria-pressed')).toBe('true');
    expect(chipDates()[0]).toBe(iso(0));
  });

  it('greys only the days availability answered for, and never past effectiveDays', () => {
    setup({
      filter: filterFor(iso(0)),
      availability: { availableDates: [iso(1), iso(3)], effectiveDays: 5 },
    });

    const stateOf = (offset: number) => {
      const chip = fixture.debugElement.query(By.css(`[data-date="${iso(offset)}"]`));
      return chip.nativeElement.classList.contains('is-unavailable');
    };

    expect(stateOf(1)).toBeFalse();
    expect(stateOf(2)).toBeTrue();
    expect(stateOf(3)).toBeFalse();
    expect(stateOf(4)).toBeTrue();
    // Beyond effectiveDays the server said nothing, so nothing is claimed.
    expect(stateOf(5)).toBeFalse();
    expect(stateOf(6)).toBeFalse();
  });

  it('dispatches the filter (and never a search) when an available day is tapped', () => {
    setup({ filter: filterFor(iso(0)) });
    const dispatch = spyOn(store, 'dispatch');

    fixture.debugElement
      .query(By.css(`[data-date="${iso(2)}"]`))
      .triggerEventHandler('click', null);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.calls.mostRecent().args[0] as unknown as {
      type: string;
      schedule_filter: ScheduleFilter;
    };
    expect(action.type).toBe(invokeSetScheduleFilterApi.type);
    expect(action.schedule_filter.departureDate).toBe(iso(2));
  });

  it('dispatches nothing when an unavailable day is tapped', () => {
    setup({
      filter: filterFor(iso(0)),
      availability: { availableDates: [iso(1)], effectiveDays: 7 },
    });
    const dispatch = spyOn(store, 'dispatch');

    const dead = fixture.debugElement.query(By.css(`[data-date="${iso(2)}"]`));
    expect(dead.nativeElement.getAttribute('aria-disabled')).toBe('true');
    // aria-disabled, not the native attribute — the chip stays reachable.
    expect(dead.nativeElement.hasAttribute('disabled')).toBeFalse();

    dead.triggerEventHandler('click', null);
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ── AC#4 ─────────────────────────────────────────────────────────────────
  it('carries the return date on a round trip, in the same dispatch', () => {
    setup({
      filter: filterFor(iso(0), {
        roundTrip: { id: 2 } as ScheduleFilter['roundTrip'],
        returnDate: iso(1),
      }),
    });
    const dispatch = spyOn(store, 'dispatch');

    fixture.debugElement
      .query(By.css(`[data-date="${iso(3)}"]`))
      .triggerEventHandler('click', null);

    const action = dispatch.calls.mostRecent().args[0] as unknown as {
      type: string;
      schedule_filter: ScheduleFilter;
    };
    expect(action.schedule_filter.departureDate).toBe(iso(3));
    expect(action.schedule_filter.returnDate).toBe(iso(4));
  });

  // ── §4.3 ─────────────────────────────────────────────────────────────────
  it('renders nothing and asks nothing when the filter cannot produce a search', () => {
    setup({ filter: filterFor(iso(0)), stations: [] as StationApi[] });

    expect(component.isSearchable).toBeFalse();
    expect(fixture.debugElement.query(By.css('[data-testid="day-strip"]'))).toBeNull();
    expect(scheduleServiceStub.getAvailabilityCached).not.toHaveBeenCalled();
  });

  it('asks availability once for a filter that keeps re-emitting the same question', () => {
    setup({ filter: filterFor(iso(0)) });
    store.refreshState();
    fixture.detectChanges();
    store.refreshState();
    fixture.detectChanges();

    expect(scheduleServiceStub.getAvailabilityCached).toHaveBeenCalledTimes(1);
    expect(scheduleServiceStub.getAvailabilityCached.calls.mostRecent().args[0]).toEqual({
      fromStop: 'nong_chak',
      toStop: 'bts_mo_chit',
      numberOfPassengers: 1,
      fromDate: iso(0),
      days: 7,
    });
  });

  it('never asks for a day past the cap — the endpoint 400s rather than clamping', () => {
    setup({
      filter: filterFor(iso(80)),
      policy: of({ data: { maxAdvanceDays: 3, cutoffMinutes: 20 } }),
    });

    const request = scheduleServiceStub.getAvailabilityCached.calls.mostRecent().args[0];
    expect(request.fromDate).toBe(iso(0));
    expect(request.days).toBe(4);
  });
});

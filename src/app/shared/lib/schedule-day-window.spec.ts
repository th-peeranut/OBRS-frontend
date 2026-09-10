import dayjs from 'dayjs';
import {
  availabilityRequestFor,
  buildDayWindow,
} from './schedule-day-window';
import { ScheduleFilter } from '../interfaces/schedule.interface';
import { StationApi } from '../interfaces/station.interface';

const TODAY = new Date('2026-09-05T09:00:00+07:00');
const day = (offset: number) => dayjs(TODAY).add(offset, 'day').format('YYYY-MM-DD');

const STATIONS = [
  { id: 1, slug: 'nong_chak' },
  { id: 4, slug: 'bts_mo_chit' },
] as unknown as StationApi[];

const filter = (extra: Partial<ScheduleFilter> = {}): ScheduleFilter =>
  ({
    roundTrip: { id: 1 },
    passengerInfo: [
      { type: 'ADULT', count: 2 },
      { type: 'KIDS', count: 1 },
    ],
    startStationId: 1,
    stopStationId: 4,
    departureDate: day(0),
    ...extra,
  }) as ScheduleFilter;

describe('buildDayWindow', () => {
  it('starts at today rather than three days before it', () => {
    expect(buildDayWindow(day(0), TODAY, 60)).toEqual([
      day(0),
      day(1),
      day(2),
      day(3),
      day(4),
      day(5),
      day(6),
    ]);
  });

  it('puts three days before the selection once there is room', () => {
    expect(buildDayWindow(day(10), TODAY, 60)[0]).toBe(day(7));
    expect(buildDayWindow(day(10), TODAY, 60)).toContain(day(13));
  });

  it('slides back rather than shrinking at the advance-sale cap', () => {
    const window = buildDayWindow(day(60), TODAY, 60);
    expect(window.length).toBe(7);
    expect(window[window.length - 1]).toBe(day(60));
    expect(window[0]).toBe(day(54));
  });

  it('never asks for a day past the cap, whatever the filter holds', () => {
    // The cap is a 400 on this endpoint, not a clamp — see the interface note.
    const window = buildDayWindow(day(500), TODAY, 60);
    expect(window[window.length - 1]).toBe(day(60));
  });

  it('never starts before today, whatever the filter holds', () => {
    expect(buildDayWindow(day(-30), TODAY, 60)[0]).toBe(day(0));
  });

  it('is shorter than the window only when the whole legal range is', () => {
    expect(buildDayWindow(day(0), TODAY, 2)).toEqual([day(0), day(1), day(2)]);
  });
});

describe('availabilityRequestFor', () => {
  const window = buildDayWindow(day(0), TODAY, 60);

  it('sums every passenger type and reads the window start and length', () => {
    expect(availabilityRequestFor(filter(), STATIONS, window)).toEqual({
      fromStop: 'nong_chak',
      toStop: 'bts_mo_chit',
      numberOfPassengers: 3,
      fromDate: day(0),
      days: 7,
    });
  });

  it('is null when either station does not resolve to a slug', () => {
    expect(availabilityRequestFor(filter(), [], window)).toBeNull();
    expect(
      availabilityRequestFor(filter({ stopStationId: '' }), STATIONS, window)
    ).toBeNull();
  });

  it('is null outside the passenger range the server accepts', () => {
    expect(
      availabilityRequestFor(
        filter({ passengerInfo: [{ type: 'ADULT', count: 0 }] }),
        STATIONS,
        window
      )
    ).toBeNull();
    expect(
      availabilityRequestFor(
        filter({ passengerInfo: [{ type: 'ADULT', count: 22 }] }),
        STATIONS,
        window
      )
    ).toBeNull();
  });
});

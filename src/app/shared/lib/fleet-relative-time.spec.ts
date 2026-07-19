import { fleetRelativeTime, fleetRelativeTimeLabel } from './fleet-relative-time';

describe('fleetRelativeTime', () => {
  const now = new Date('2026-07-19T12:00:00Z');

  it('null recordedAt -> no-signal', () => {
    expect(fleetRelativeTime(null, now)).toEqual({ kind: 'no-signal' });
  });

  it('an unparsable recordedAt -> no-signal', () => {
    expect(fleetRelativeTime('not-a-date', now)).toEqual({ kind: 'no-signal' });
  });

  it('under 60s ago -> just-now', () => {
    expect(fleetRelativeTime('2026-07-19T11:59:31Z', now)).toEqual({ kind: 'just-now' });
  });

  it('exactly at the 60s boundary -> minutes-ago(1)', () => {
    expect(fleetRelativeTime('2026-07-19T11:59:00Z', now)).toEqual({ kind: 'minutes-ago', count: 1 });
  });

  it('30 minutes ago -> minutes-ago(30)', () => {
    expect(fleetRelativeTime('2026-07-19T11:30:00Z', now)).toEqual({ kind: 'minutes-ago', count: 30 });
  });

  it('exactly at the 60min boundary -> hours-ago(1)', () => {
    expect(fleetRelativeTime('2026-07-19T11:00:00Z', now)).toEqual({ kind: 'hours-ago', count: 1 });
  });

  it('3 hours ago -> hours-ago(3)', () => {
    expect(fleetRelativeTime('2026-07-19T09:00:00Z', now)).toEqual({ kind: 'hours-ago', count: 3 });
  });

  it('a future recordedAt (clock skew) does not go negative -> just-now', () => {
    expect(fleetRelativeTime('2026-07-19T12:00:05Z', now)).toEqual({ kind: 'just-now' });
  });
});

describe('fleetRelativeTimeLabel', () => {
  it('maps every result kind to its i18n key, carrying params for the counted kinds', () => {
    expect(fleetRelativeTimeLabel({ kind: 'no-signal' })).toEqual({ key: 'STAFF.FLEET_MAP.NO_SIGNAL_LABEL' });
    expect(fleetRelativeTimeLabel({ kind: 'just-now' })).toEqual({ key: 'STAFF.FLEET_MAP.UPDATED_JUST_NOW' });
    expect(fleetRelativeTimeLabel({ kind: 'minutes-ago', count: 5 })).toEqual({
      key: 'STAFF.FLEET_MAP.UPDATED_MINUTES_AGO',
      params: { count: 5 },
    });
    expect(fleetRelativeTimeLabel({ kind: 'hours-ago', count: 2 })).toEqual({
      key: 'STAFF.FLEET_MAP.UPDATED_HOURS_AGO',
      params: { count: 2 },
    });
  });
});

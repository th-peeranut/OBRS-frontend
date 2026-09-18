import {
  CustomerTripPositionRespDto,
  resolveTripTrackView,
  TRIP_TRACK_POLL_ACTIVE_MS,
  TRIP_TRACK_POLL_IDLE_MS,
} from './trip-track-view';

function dto(overrides: Partial<CustomerTripPositionRespDto> = {}): CustomerTripPositionRespDto {
  return {
    state: 'LIVE',
    lat: null,
    lon: null,
    recordedAt: null,
    stale: false,
    windowOpensAt: null,
    boardingStopOrder: null,
    nextStopOrder: null,
    totalStops: null,
    stopsRemaining: null,
    ...overrides,
  };
}

describe('resolveTripTrackView', () => {
  // U1: six cases, one per state, each asserting { chipKey, bodyKey, hasMap,
  // markerStyle, pollIntervalMs }. TripTrackView carries pollIntervalMs, not a
  // keepPolling boolean — every case below asserts a NUMBER, never a boolean.
  it('U1: LIVE resolves to the live chip/body, a map, the live marker, active-lane polling', () => {
    const view = resolveTripTrackView(dto({ state: 'LIVE', lat: 13.7, lon: 100.5, recordedAt: '2026-07-19T10:00:00+07:00' }));
    expect(view.chipKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.LIVE');
    expect(view.bodyKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.LIVE_BODY');
    expect(view.hasMap).toBeTrue();
    expect(view.markerStyle).toBe('live');
    expect(view.pollIntervalMs).toBe(TRIP_TRACK_POLL_ACTIVE_MS);
  });

  it('U1: STALE resolves to a distinct chip/body, a map, the stale marker, active-lane polling', () => {
    const view = resolveTripTrackView(dto({ state: 'STALE', lat: 13.7, lon: 100.5, recordedAt: '2026-07-19T09:00:00+07:00' }));
    expect(view.chipKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.STALE');
    expect(view.bodyKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.STALE_BODY');
    expect(view.hasMap).toBeTrue();
    expect(view.markerStyle).toBe('stale');
    expect(view.pollIntervalMs).toBe(TRIP_TRACK_POLL_ACTIVE_MS);
  });

  it('U1: NO_SIGNAL resolves to no map, no marker, active-lane polling', () => {
    const view = resolveTripTrackView(dto({ state: 'NO_SIGNAL' }));
    expect(view.chipKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.NO_SIGNAL');
    expect(view.bodyKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.NO_SIGNAL_BODY');
    expect(view.hasMap).toBeFalse();
    expect(view.markerStyle).toBeNull();
    expect(view.pollIntervalMs).toBe(TRIP_TRACK_POLL_ACTIVE_MS);
  });

  it('U1: UNAVAILABLE resolves to no map, no marker, active-lane polling', () => {
    const view = resolveTripTrackView(dto({ state: 'UNAVAILABLE' }));
    expect(view.chipKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.UNAVAILABLE');
    expect(view.bodyKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.UNAVAILABLE_BODY');
    expect(view.hasMap).toBeFalse();
    expect(view.markerStyle).toBeNull();
    expect(view.pollIntervalMs).toBe(TRIP_TRACK_POLL_ACTIVE_MS);
  });

  it('U1: NOT_YET_OPEN resolves to no map, no marker, IDLE-lane polling', () => {
    const view = resolveTripTrackView(dto({ state: 'NOT_YET_OPEN', windowOpensAt: '2026-07-22T07:30:00+07:00' }));
    expect(view.chipKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.NOT_YET_OPEN');
    expect(view.bodyKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.NOT_YET_OPEN_BODY');
    expect(view.hasMap).toBeFalse();
    expect(view.markerStyle).toBeNull();
    expect(view.pollIntervalMs).toBe(TRIP_TRACK_POLL_IDLE_MS);
  });

  it('U1: CLOSED resolves to no map, no marker, IDLE-lane polling', () => {
    const view = resolveTripTrackView(dto({ state: 'CLOSED' }));
    expect(view.chipKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.CLOSED');
    expect(view.bodyKey).toBe('MY_BOOKINGS.TRIP_TRACK.STATE.CLOSED_BODY');
    expect(view.hasMap).toBeFalse();
    expect(view.markerStyle).toBeNull();
    expect(view.pollIntervalMs).toBe(TRIP_TRACK_POLL_IDLE_MS);
  });

  it('U2: STALE with real coordinates renders a map with the STALE marker style, and its chip differs from LIVE\'s — the headline bug', () => {
    const stale = resolveTripTrackView(dto({ state: 'STALE', lat: 13.7, lon: 100.5, recordedAt: '2026-07-19T09:00:00+07:00' }));
    const live = resolveTripTrackView(dto({ state: 'LIVE', lat: 13.7, lon: 100.5, recordedAt: '2026-07-19T10:00:00+07:00' }));

    expect(stale.hasMap).toBeTrue();
    expect(stale.markerStyle).toBe('stale');
    expect(stale.chipKey).not.toBe(live.chipKey);
  });

  it('U3: CLOSED, NO_SIGNAL, and NOT_YET_OPEN each get a DISTINCT bodyKey, never collapsed by `stale`', () => {
    const closed = resolveTripTrackView(dto({ state: 'CLOSED', stale: true }));
    const noSignal = resolveTripTrackView(dto({ state: 'NO_SIGNAL', stale: true }));
    const notYetOpen = resolveTripTrackView(dto({ state: 'NOT_YET_OPEN', stale: true }));

    const bodyKeys = new Set([closed.bodyKey, noSignal.bodyKey, notYetOpen.bodyKey]);
    expect(bodyKeys.size).toBe(3);
  });

  it('U4: NO_SIGNAL and UNAVAILABLE get distinct bodyKeys', () => {
    const noSignal = resolveTripTrackView(dto({ state: 'NO_SIGNAL' }));
    const unavailable = resolveTripTrackView(dto({ state: 'UNAVAILABLE' }));
    expect(noSignal.bodyKey).not.toBe(unavailable.bodyKey);
  });

  it('U5: pollIntervalMs is ACTIVE for LIVE/STALE/NO_SIGNAL/UNAVAILABLE, IDLE for NOT_YET_OPEN/CLOSED — no state yields null/stop', () => {
    const activeStates: CustomerTripPositionRespDto['state'][] = ['LIVE', 'STALE', 'NO_SIGNAL', 'UNAVAILABLE'];
    const idleStates: CustomerTripPositionRespDto['state'][] = ['NOT_YET_OPEN', 'CLOSED'];

    for (const state of activeStates) {
      expect(resolveTripTrackView(dto({ state })).pollIntervalMs).toBe(TRIP_TRACK_POLL_ACTIVE_MS);
    }
    for (const state of idleStates) {
      expect(resolveTripTrackView(dto({ state })).pollIntervalMs).toBe(TRIP_TRACK_POLL_IDLE_MS);
    }
  });

  it('U6: an unrecognized future state fails CLOSED to the neutral unavailable panel — never renders as live', () => {
    const view = resolveTripTrackView(dto({ state: 'SOMETHING_NEW' as unknown as CustomerTripPositionRespDto['state'], lat: 1, lon: 1 }));
    expect(view.hasMap).toBeFalse();
    expect(view.markerStyle).toBeNull();
  });

  it('U7: NOT_YET_OPEN carries formatted windowOpensAt; LIVE/STALE carry formatted recordedAt; neither exposes a raw ISO string', () => {
    const notYetOpen = resolveTripTrackView(dto({ state: 'NOT_YET_OPEN', windowOpensAt: '2026-07-22T07:30:00+07:00' }), 'en');
    const live = resolveTripTrackView(dto({ state: 'LIVE', lat: 1, lon: 1, recordedAt: '2026-07-19T14:32:00+07:00' }));

    expect(notYetOpen.timeText).toBe('22 Jul 2026 07:30');
    expect(notYetOpen.timeText).not.toContain('T');
    expect(live.timeText).toBe('14:32');
    expect(live.timeText).not.toContain('T');
  });

  // ── OBRS-1084 — positional "stops remaining" progress line ─────────────
  const PROGRESS_FIELDS = { boardingStopOrder: 5, nextStopOrder: 2, totalStops: 8 };

  describe('resolveTripTrackView — OBRS-1084 progress line', () => {
    it('AC4: progress is null for every state EXCEPT LIVE/STALE, even when all four source fields are present', () => {
      const otherStates: CustomerTripPositionRespDto['state'][] = [
        'NO_SIGNAL',
        'UNAVAILABLE',
        'NOT_YET_OPEN',
        'CLOSED',
      ];
      for (const state of otherStates) {
        const view = resolveTripTrackView(dto({ state, ...PROGRESS_FIELDS, stopsRemaining: 3 }));
        expect(view.progress).withContext(`${state} must never carry a progress line`).toBeNull();
      }
    });

    it('AC4: LIVE and STALE use DIFFERENT headline keys for the same stopsRemaining — STALE reads as "last known", never LIVE copy', () => {
      const live = resolveTripTrackView(dto({ state: 'LIVE', ...PROGRESS_FIELDS, stopsRemaining: 3 }));
      const stale = resolveTripTrackView(dto({ state: 'STALE', ...PROGRESS_FIELDS, stopsRemaining: 3 }));

      expect(live.progress?.headlineKey).toBe('MY_BOOKINGS.TRIP_TRACK.PROGRESS.LIVE_REMAINING');
      expect(stale.progress?.headlineKey).toBe('MY_BOOKINGS.TRIP_TRACK.PROGRESS.STALE_REMAINING');
      expect(stale.progress?.headlineKey).not.toBe(live.progress?.headlineKey);
    });

    it('stopsRemaining = 3 / 0 / -2 resolve to three distinct headline keys (LIVE)', () => {
      const positive = resolveTripTrackView(dto({ state: 'LIVE', ...PROGRESS_FIELDS, stopsRemaining: 3 }));
      const zero = resolveTripTrackView(dto({ state: 'LIVE', ...PROGRESS_FIELDS, stopsRemaining: 0 }));
      const negative = resolveTripTrackView(dto({ state: 'LIVE', ...PROGRESS_FIELDS, stopsRemaining: -2 }));

      const keys = [positive.progress?.headlineKey, zero.progress?.headlineKey, negative.progress?.headlineKey];
      expect(new Set(keys).size).toBe(3);
      expect(positive.progress?.headlineKey).toBe('MY_BOOKINGS.TRIP_TRACK.PROGRESS.LIVE_REMAINING');
      expect(positive.progress?.headlineParams).toEqual({ count: 3 });
      expect(zero.progress?.headlineKey).toBe('MY_BOOKINGS.TRIP_TRACK.PROGRESS.LIVE_NEXT_IS_YOURS');
      expect(zero.progress?.headlineParams).toBeNull();
      expect(negative.progress?.headlineKey).toBe('MY_BOOKINGS.TRIP_TRACK.PROGRESS.LIVE_PASSED');
    });

    it('AC5: stopsRemaining < 0 never uses the REMAINING key (no "0 stops left" rendering) and carries no count param', () => {
      const negative = resolveTripTrackView(dto({ state: 'LIVE', ...PROGRESS_FIELDS, stopsRemaining: -2 }));

      expect(negative.progress?.headlineKey).not.toContain('REMAINING');
      expect(negative.progress?.headlineKey).toBe('MY_BOOKINGS.TRIP_TRACK.PROGRESS.LIVE_PASSED');
      expect(negative.progress?.headlineParams).toBeNull();
    });

    it('the "passed N of M stops" line is derived from nextStopOrder/totalStops, independent of the sign of stopsRemaining', () => {
      const view = resolveTripTrackView(dto({ state: 'LIVE', boardingStopOrder: 5, nextStopOrder: 2, totalStops: 8, stopsRemaining: 3 }));

      expect(view.progress?.passedKey).toBe('MY_BOOKINGS.TRIP_TRACK.PROGRESS.STOPS_PASSED_COUNT');
      expect(view.progress?.passedParams).toEqual({ passed: 1, total: 8 }); // nextStopOrder - 1
    });

    it('any one of the four required fields being null collapses the WHOLE progress line to null', () => {
      const missingBoarding = resolveTripTrackView(
        dto({ state: 'LIVE', boardingStopOrder: null, nextStopOrder: 2, totalStops: 8, stopsRemaining: 3 })
      );
      const missingNext = resolveTripTrackView(
        dto({ state: 'STALE', boardingStopOrder: 5, nextStopOrder: null, totalStops: 8, stopsRemaining: 3 })
      );
      const missingTotal = resolveTripTrackView(
        dto({ state: 'LIVE', boardingStopOrder: 5, nextStopOrder: 2, totalStops: null, stopsRemaining: 3 })
      );
      const missingRemaining = resolveTripTrackView(
        dto({ state: 'LIVE', boardingStopOrder: 5, nextStopOrder: 2, totalStops: 8, stopsRemaining: null })
      );

      expect(missingBoarding.progress).toBeNull();
      expect(missingNext.progress).toBeNull();
      expect(missingTotal.progress).toBeNull();
      expect(missingRemaining.progress).toBeNull();
    });

    it('all four fields present resolves a non-null progress line for both LIVE and STALE', () => {
      const live = resolveTripTrackView(dto({ state: 'LIVE', ...PROGRESS_FIELDS, stopsRemaining: 3 }));
      const stale = resolveTripTrackView(dto({ state: 'STALE', ...PROGRESS_FIELDS, stopsRemaining: 3 }));

      expect(live.progress).not.toBeNull();
      expect(stale.progress).not.toBeNull();
    });
  });
});

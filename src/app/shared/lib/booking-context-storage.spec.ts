import {
  BOOKING_CONTEXT_KEY,
  BOOKING_CONTEXT_TTL_MS,
  clearBookingContext,
  isBookingSelectionRestored,
  readBookingContext,
  rememberBookingFilter,
  rememberBookingSearchPayload,
  rememberBookingSelection,
  resetBookingContextRestoreFlag,
  restoreBookingFilter,
  restoreBookingSelection,
} from './booking-context-storage';
import {
  Schedule,
  ScheduleFilter,
  ScheduleFilterPayload,
} from '../interfaces/schedule.interface';

const SCHEDULE: Schedule = {
  id: 42,
  vehicleType: 'van',
  departureDateTime: '2026-08-01T08:00:00+07:00',
  arrivalDateTime: '2026-08-01T11:00:00+07:00',
  pricePerSeat: '250',
  availableSeats: 9,
  availableSeatNumbers: ['1', '2', '3'],
};

const FILTER = {
  startStationId: 1,
  stopStationId: 2,
  departureDate: '2026-08-01',
} as unknown as ScheduleFilter;

const PAYLOAD: ScheduleFilterPayload = {
  bookingType: 'one_way',
  numberOfPassengers: 2,
  fromStop: 'bangkok',
  toStop: 'phuket',
  departureDate: '2026-08-01',
};

function ageStoredContextBy(ms: number): void {
  const envelope = JSON.parse(
    localStorage.getItem(BOOKING_CONTEXT_KEY) as string
  ) as { savedAt: number };
  envelope.savedAt -= ms;
  localStorage.setItem(BOOKING_CONTEXT_KEY, JSON.stringify(envelope));
}

describe('booking-context-storage (OBRS-903)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetBookingContextRestoreFlag();
  });

  afterEach(() => localStorage.clear());

  it('keeps filter, search payload and selection in ONE entry that expires as a unit', () => {
    rememberBookingFilter(FILTER);
    rememberBookingSearchPayload(PAYLOAD);
    rememberBookingSelection([SCHEDULE]);

    const context = readBookingContext();
    expect(context?.filter).toEqual(FILTER);
    expect(context?.searchPayload).toEqual(PAYLOAD);
    expect(context?.selection).toEqual([SCHEDULE]);
  });

  it('restores what the previous tab chose', () => {
    rememberBookingSelection([SCHEDULE]);
    rememberBookingFilter(FILTER);
    resetBookingContextRestoreFlag(); // a new tab starts with the flag down

    expect(restoreBookingSelection()).toEqual([SCHEDULE]);
    expect(restoreBookingFilter()).toEqual(FILTER);
  });

  it('flags a RESTORED selection, so only that one gets re-validated', () => {
    rememberBookingSelection([SCHEDULE]);
    resetBookingContextRestoreFlag();

    expect(isBookingSelectionRestored()).toBeFalse();
    restoreBookingSelection();
    expect(isBookingSelectionRestored()).toBeTrue();
  });

  it('does NOT flag a selection made in this tab — the healthy path costs no request', () => {
    restoreBookingSelection(); // nothing stored yet
    rememberBookingSelection([SCHEDULE]);

    expect(isBookingSelectionRestored()).toBeFalse();
  });

  it('clears the flag once the selection is rewritten (the re-validation refresh)', () => {
    rememberBookingSelection([SCHEDULE]);
    resetBookingContextRestoreFlag();
    restoreBookingSelection();
    expect(isBookingSelectionRestored()).toBeTrue();

    rememberBookingSelection([{ ...SCHEDULE, availableSeats: 4 }]);

    expect(isBookingSelectionRestored()).toBeFalse();
  });

  it('a deselect drops the selection but keeps the filter, so the search page still repopulates', () => {
    rememberBookingFilter(FILTER);
    rememberBookingSelection([SCHEDULE]);

    rememberBookingSelection(null);

    expect(readBookingContext()?.selection).toBeNull();
    expect(readBookingContext()?.filter).toEqual(FILTER);
  });

  it('drops the whole entry once nothing is left in it', () => {
    rememberBookingSelection([SCHEDULE]);
    rememberBookingSelection(null);

    expect(localStorage.getItem(BOOKING_CONTEXT_KEY)).toBeNull();
  });

  it('restores nothing past the TTL', () => {
    rememberBookingFilter(FILTER);
    rememberBookingSelection([SCHEDULE]);
    ageStoredContextBy(BOOKING_CONTEXT_TTL_MS + 1000);
    resetBookingContextRestoreFlag();

    expect(restoreBookingSelection()).toBeNull();
    expect(isBookingSelectionRestored()).toBeFalse();
  });

  it('a later write refreshes the window — the TTL is sliding, not absolute', () => {
    rememberBookingFilter(FILTER);
    ageStoredContextBy(BOOKING_CONTEXT_TTL_MS - 60 * 1000);

    rememberBookingSelection([SCHEDULE]);
    ageStoredContextBy(BOOKING_CONTEXT_TTL_MS - 60 * 1000);

    // Without the refresh this read would be ~58 minutes past the write.
    expect(readBookingContext()?.selection).toEqual([SCHEDULE]);
  });

  it('clearBookingContext removes the entry and the flag together', () => {
    rememberBookingSelection([SCHEDULE]);
    resetBookingContextRestoreFlag();
    restoreBookingSelection();

    clearBookingContext();

    expect(readBookingContext()).toBeNull();
    expect(isBookingSelectionRestored()).toBeFalse();
  });

  it('must-NOT (PDPA): nothing written here identifies a person', () => {
    // A census of the persisted keys, not a spot check — a future field that
    // names, phones or e-mails the customer fails this and has to be argued for
    // on the card, not slipped in. Passenger COUNTS are fine; passengers are not.
    rememberBookingFilter(FILTER);
    rememberBookingSearchPayload(PAYLOAD);
    rememberBookingSelection([SCHEDULE]);

    const serialized = localStorage.getItem(BOOKING_CONTEXT_KEY) as string;
    const keys = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          keys.add(key.toLowerCase());
          walk(value);
        }
      }
    };
    walk(JSON.parse(serialized));

    for (const forbidden of [
      'firstname',
      'lastname',
      'middlename',
      'phonenumber',
      'email',
      'identitycardnumber',
      'passengers',
      'contact',
      'card',
      'token',
    ]) {
      expect(keys.has(forbidden)).withContext(forbidden).toBeFalse();
    }
  });
});

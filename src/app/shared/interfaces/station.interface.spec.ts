import { StationApi, stationAllowsChildBoarding } from './station.interface';

/**
 * OBRS-1238 — the one decision the whole child-boarding UX hangs off. Kept as a pure function with
 * its own spec because both surfaces that use it (the online passenger form and the counter's sell
 * page) would otherwise each re-implement the "absent means allowed" rule, and getting that rule
 * backwards on either one hides the child option at every stop in the country.
 */
describe('stationAllowsChildBoarding (OBRS-1238)', () => {
  const stations: StationApi[] = [
    { id: 1, slug: 'nong_chak', status: '', stopType: '', createdAt: '', updatedAt: '', hasTicketDesk: true },
    { id: 2, slug: 'roadside', status: '', stopType: '', createdAt: '', updatedAt: '', hasTicketDesk: false },
    // A body that predates the field — what a 5-minute-cached GET /api/stops can still return.
    { id: 3, slug: 'legacy', status: '', stopType: '', createdAt: '', updatedAt: '' },
  ];

  it('allows a stop that has a ticket desk', () => {
    expect(stationAllowsChildBoarding(1, stations)).toBeTrue();
  });

  it('refuses a stop that has none', () => {
    expect(stationAllowsChildBoarding(2, stations)).toBeFalse();
  });

  it('accepts the id as a string, because the schedule filter holds it that way', () => {
    expect(stationAllowsChildBoarding('2', stations)).toBeFalse();
    expect(stationAllowsChildBoarding('1', stations)).toBeTrue();
  });

  it('allows when the field is absent — a cached body must not blank out every stop', () => {
    expect(stationAllowsChildBoarding(3, stations)).toBeTrue();
  });

  it('allows when the station list has not loaded, or the id is not in it', () => {
    expect(stationAllowsChildBoarding(1, null)).toBeTrue();
    expect(stationAllowsChildBoarding(1, [])).toBeTrue();
    expect(stationAllowsChildBoarding(99, stations)).toBeTrue();
  });

  it('allows when no station is selected yet', () => {
    expect(stationAllowsChildBoarding(null, stations)).toBeTrue();
    expect(stationAllowsChildBoarding(undefined, stations)).toBeTrue();
    expect(stationAllowsChildBoarding('', stations)).toBeTrue();
  });
});

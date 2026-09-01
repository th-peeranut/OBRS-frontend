import { buildStationPairOptions } from './station-pair-options';
import { StationApi } from '../interfaces/station.interface';

/**
 * OBRS-1701. The three filters this composes each have their own spec
 * (`bookable-stations.spec.ts`, `station-groups.spec.ts`) and the two screens
 * that call it have theirs, so what is asserted here is only what belongs to
 * the composition itself: the ORDER the filters run in, and `clearStopStation`,
 * which is a return value no caller's spec can observe directly.
 */
describe('buildStationPairOptions', () => {
  function station(id: number): StationApi {
    return {
      id,
      slug: `station-${id}`,
      status: 'active',
      stopType: 'station',
      createdAt: '',
      updatedAt: '',
    };
  }

  function routeStop(order: number, slug: string): any {
    return { order, slug, name: slug, address: '', approxTime: '' };
  }

  // The same corridor-in-miniature both component specs use: two routes that
  // are the two directions of one corridor. `station-3` is a drop-off outbound
  // and a pickup inbound, which is what makes "released back into the origin
  // list" a real assertion rather than one about a stop that was never an
  // origin.
  const ROUTES: any[] = [
    {
      pickup: [routeStop(1, 'station-1'), routeStop(5, 'station-2')],
      dropoff: [routeStop(3, 'station-3'), routeStop(7, 'station-4')],
    },
    {
      pickup: [routeStop(1, 'station-3')],
      dropoff: [routeStop(9, 'station-1')],
    },
  ];
  const STATIONS = [station(1), station(2), station(3), station(4)];

  function build(
    startStationId: string | number | null,
    stopStationId: string | number | null,
    routeSegments = ROUTES
  ) {
    return buildStationPairOptions({
      stations: STATIONS,
      routeSegments,
      provinceStops: null,
      startStationId,
      stopStationId,
    });
  }

  const ids = (list: readonly any[]) => list.map((s) => s.id);

  it('flags a destination the chosen origin cannot reach', () => {
    // station-3 is a drop-off at order 3; boarding at station-2 (order 5) the
    // van has already passed it.
    expect(build(2, 3).clearStopStation).toBeTrue();
    // ...and the same pair from station-1 (order 1) is a real trip.
    expect(build(1, 3).clearStopStation).toBeFalse();
  });

  it('releases the cleared stop back into the origin list in the SAME pass', () => {
    // The order the filters run in is the whole point: the origin list excludes
    // whatever the destination currently is, so a clear that landed AFTER the
    // lists were built would keep station-3 hidden as an origin until some
    // later sync happened to run.
    const options = build(2, 3);

    expect(options.clearStopStation).toBeTrue();
    expect(ids(options.origins)).toContain(3);
  });

  it('keeps the mirror-stop exclusion that predates the narrowing', () => {
    const options = build(1, 3);

    expect(options.clearStopStation).toBeFalse();
    expect(ids(options.origins)).not.toContain(3);
    expect(ids(options.destinations)).not.toContain(1);
  });

  it('narrows nothing, and clears nothing, when there is no route data', () => {
    const options = build(2, 3, null as any);

    expect(options.clearStopStation).toBeFalse();
    expect(ids(options.origins)).toEqual(jasmine.arrayWithExactContents([1, 2, 4]));
    expect(ids(options.destinations)).toEqual(jasmine.arrayWithExactContents([1, 3, 4]));
  });
});

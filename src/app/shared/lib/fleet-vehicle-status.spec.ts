import {
  FLEET_STATUS_HAS_MARKER,
  FleetVehicleStatusFlags,
  fleetVehicleStatusChip,
  resolveFleetVehicleStatus,
} from './fleet-vehicle-status';

// UX-OBRS-424 §3.3 — five real flag-combinations plus the §3.2 edge case, fed
// through the REAL function (not a shape that can pass against a wrong branch
// order). The ORDER of the ladder in fleet-vehicle-status.ts is load-bearing:
// this suite was verified to go RED when `stale` was checked before
// `positionKnown` (the day-one bug this card exists to prevent), then restored.
describe('resolveFleetVehicleStatus', () => {
  const cases: Array<{ name: string; flags: FleetVehicleStatusFlags; expected: ReturnType<typeof resolveFleetVehicleStatus> }> = [
    {
      name: 'day-one: no tracker mapped, never reported, backend stale=true — ordering-sensitive',
      flags: { gpsImeiConfigured: false, positionKnown: false, deviceOnline: null, stale: true },
      expected: 'NOT_TRACKED',
    },
    {
      name: 'tracker mapped, never produced a fix',
      flags: { gpsImeiConfigured: true, positionKnown: false, deviceOnline: null, stale: true },
      expected: 'AWAITING_SIGNAL',
    },
    {
      name: 'device stopped transmitting',
      flags: { gpsImeiConfigured: true, positionKnown: true, deviceOnline: false, stale: true },
      expected: 'OFFLINE',
    },
    {
      name: 'device transmitting, fix is old',
      flags: { gpsImeiConfigured: true, positionKnown: true, deviceOnline: true, stale: true },
      expected: 'GPS_LOST',
    },
    {
      name: 'live',
      flags: { gpsImeiConfigured: true, positionKnown: true, deviceOnline: true, stale: false },
      expected: 'LIVE',
    },
    {
      name: '§3.2 edge case: unmapped tracker with a surviving stale position row — NOT_TRACKED wins, never LIVE',
      flags: { gpsImeiConfigured: false, positionKnown: true, deviceOnline: true, stale: false },
      expected: 'NOT_TRACKED',
    },
  ];

  for (const { name, flags, expected } of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(resolveFleetVehicleStatus(flags)).toBe(expected);
    });
  }

  it('NOT_TRACKED and AWAITING_SIGNAL never get a marker; OFFLINE/GPS_LOST/LIVE always do', () => {
    expect(FLEET_STATUS_HAS_MARKER.NOT_TRACKED).toBeFalse();
    expect(FLEET_STATUS_HAS_MARKER.AWAITING_SIGNAL).toBeFalse();
    expect(FLEET_STATUS_HAS_MARKER.OFFLINE).toBeTrue();
    expect(FLEET_STATUS_HAS_MARKER.GPS_LOST).toBeTrue();
    expect(FLEET_STATUS_HAS_MARKER.LIVE).toBeTrue();
  });

  it('maps every status to a distinct chip token (§3.3)', () => {
    const tokens = new Set(
      (['NOT_TRACKED', 'AWAITING_SIGNAL', 'OFFLINE', 'GPS_LOST', 'LIVE'] as const).map(
        (s) => fleetVehicleStatusChip(s).token
      )
    );
    expect(tokens.size).toBe(5);
    expect(fleetVehicleStatusChip('OFFLINE').token).toBe('is-danger');
    expect(fleetVehicleStatusChip('GPS_LOST').token).toBe('is-warning');
    expect(fleetVehicleStatusChip('LIVE').token).toBe('is-success');
  });
});

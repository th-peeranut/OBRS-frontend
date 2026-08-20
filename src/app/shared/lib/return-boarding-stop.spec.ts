import { ScheduleList } from '../interfaces/schedule.interface';
import {
  boardingDistanceView,
  crossPairBoardingStop,
} from './return-boarding-stop';

function listWith(
  returnBoardingStop: ScheduleList['returnBoardingStop']
): ScheduleList {
  return { departureSchedules: [], arrivalSchedules: [], returnBoardingStop };
}

describe('crossPairBoardingStop (OBRS-1343)', () => {
  it('returns the stop when the way back boards somewhere else', () => {
    const boarding = {
      slug: 'ds293_chatuchak_bus_stop',
      name: 'DS293 จตุจักร',
      distanceMeters: 233,
      sameAsDropOff: false,
    };

    expect(crossPairBoardingStop(listWith(boarding))).toBe(boarding);
  });

  it('must-NOT: announce a return that boards exactly where the customer got off', () => {
    // 2 of the owner's 6 Bangkok pairs are self-pairs and were never broken. A
    // notice on those is noise on every round trip, which is how the real one
    // stops being read.
    expect(
      crossPairBoardingStop(
        listWith({
          slug: 'mo_chit_2_bus_terminal',
          name: 'หมอชิต 2',
          distanceMeters: 0,
          sameAsDropOff: true,
        })
      )
    ).toBeNull();
  });

  it('is null for a one-way search and for a result with nothing to sell back', () => {
    // Both arrive as an absent field. The empty-return case stays OBRS-1336's
    // confirm dialog; a second way of saying "no return leg" would rival it.
    expect(crossPairBoardingStop(listWith(null))).toBeNull();
    expect(crossPairBoardingStop(listWith(undefined))).toBeNull();
    expect(crossPairBoardingStop(null)).toBeNull();
    expect(crossPairBoardingStop(undefined)).toBeNull();
  });
});

describe('boardingDistanceView (OBRS-1343)', () => {
  it('quotes a short walk in whole metres', () => {
    // The two real short pairs: 204 m (Srinakarin) and 233 m (BTS Mo Chit).
    expect(boardingDistanceView(204)).toEqual({
      amount: '204',
      unitKey: 'COMMON.RETURN_BOARDING.UNIT_METERS',
    });
    expect(boardingDistanceView(233)).toEqual({
      amount: '233',
      unitKey: 'COMMON.RETURN_BOARDING.UNIT_METERS',
    });
  });

  it('quotes the far pair in kilometres, because 8626 m is not a walk', () => {
    // Lat Krabang. This figure is the entire reason the owner refused the word
    // "nearby" — the customer must be able to see it is a second journey.
    expect(boardingDistanceView(8626)).toEqual({
      amount: '8.6',
      unitKey: 'COMMON.RETURN_BOARDING.UNIT_KILOMETERS',
    });
  });

  it('switches unit at 1 km exactly, not around it', () => {
    expect(boardingDistanceView(999)!.unitKey).toContain('METERS');
    expect(boardingDistanceView(1000)!.unitKey).toContain('KILOMETERS');
    expect(boardingDistanceView(1000)!.amount).toBe('1.0');
  });

  it('must-NOT: invent a figure when the backend sent none', () => {
    // Reachable only if the drop-off stop has no pin. Callers show the stop
    // NAME with no distance; a fabricated "0 m" would read as "same stop".
    expect(boardingDistanceView(null)).toBeNull();
    expect(boardingDistanceView(undefined)).toBeNull();
  });

  it('a self-pair distance of 0 is still a real measurement', () => {
    // Not reached through the notice (crossPairBoardingStop filters self-pairs
    // out first), but 0 must not be confused with "no figure" if it ever is.
    expect(boardingDistanceView(0)).toEqual({
      amount: '0',
      unitKey: 'COMMON.RETURN_BOARDING.UNIT_METERS',
    });
  });
});

import { ReturnBoardingStop, ScheduleList } from '../interfaces/schedule.interface';

/**
 * OBRS-1343: the notice-worthy half of `ScheduleList.returnBoardingStop`.
 *
 * A round trip's way home does not always leave from the stop the outbound leg
 * drops you at — on `chonburi_bangkok` it is a different stop for 4 of the 6
 * Bangkok destinations. The backend resolves which stop it searched from and
 * says so; this narrows that to the case worth telling the customer about.
 *
 * `sameAsDropOff` is filtered out here rather than in each template, because
 * "board where you got off" is not news, and a notice on every round trip is
 * how a real one stops being read.
 */
export function crossPairBoardingStop(
  scheduleList: ScheduleList | null | undefined
): ReturnBoardingStop | null {
  const boarding = scheduleList?.returnBoardingStop;
  if (!boarding || boarding.sameAsDropOff) {
    return null;
  }
  return boarding;
}

/** A distance ready to render: the number as text, and the key its unit is translated by. */
export interface BoardingDistanceView {
  amount: string;
  unitKey: string;
}

/** Below this, the figure is quoted in whole metres; at or above it, in kilometres. */
const KILOMETRE_THRESHOLD_METERS = 1000;

/**
 * The owner's condition on this whole feature (2026-08-14): a real figure, never
 * the word "nearby". The two real extremes are 204 m — cross the road — and
 * 8,626 m, which is a second bus. One phrase cannot cover both, so the number
 * is always shown; only its unit changes, and only at 1 km, because "8626 ม."
 * is a number nobody converts while standing at a bus stop.
 *
 * Returns null when the backend sent no distance, which happens only if the
 * drop-off stop carries no pin — every stop on today's routes does. Callers
 * must then show the stop NAME with no figure rather than invent one.
 */
export function boardingDistanceView(
  meters: number | null | undefined
): BoardingDistanceView | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) {
    return null;
  }

  if (meters < KILOMETRE_THRESHOLD_METERS) {
    return { amount: String(Math.round(meters)), unitKey: 'COMMON.RETURN_BOARDING.UNIT_METERS' };
  }

  return {
    amount: (meters / KILOMETRE_THRESHOLD_METERS).toFixed(1),
    unitKey: 'COMMON.RETURN_BOARDING.UNIT_KILOMETERS',
  };
}

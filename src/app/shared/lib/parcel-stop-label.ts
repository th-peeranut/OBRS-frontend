import { ParcelStopRefDto } from '../interfaces/parcel.interface';

/**
 * Resolves a display label for a `ParcelStopRefDto | string` field
 * (`pickupStop`/`dropoffStop` on the tracking/waybill/delivery-list
 * responses) whose exact shape isn't fully pinned down by the backend doc —
 * see the interface's own doc comment. Tries every field name already used
 * for a "stop reference" elsewhere in this codebase before falling back to a
 * dash, so a genuinely empty/malformed value never renders as `undefined`.
 */
export function parcelStopLabel(stop: ParcelStopRefDto | string | null | undefined): string {
  if (!stop) {
    return '-';
  }
  if (typeof stop === 'string') {
    return stop;
  }
  return stop.name ?? stop.label ?? stop.code ?? stop.slug ?? '-';
}

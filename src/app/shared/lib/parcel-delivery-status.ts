import { ParcelDeliveryStatus } from '../interfaces/parcel.interface';

/** One of the existing `.admin-status.is-*` modifier classes (admin-theme.scss,
 * design-system.md §2.4) — never a new hex/class. */
export type ParcelStatusToken =
  | 'is-accepted'
  | 'is-warning'
  | 'is-info'
  | 'is-success'
  | 'is-delayed'
  | 'is-neutral'
  | 'is-danger';

export interface ParcelStatusChip {
  token: ParcelStatusToken;
  i18nKey: string;
}

/**
 * OBRS-305 scrutinize note: the 7 renderable `parcel_delivery_status` slugs
 * map 1:1 onto the 7 EXISTING `.admin-status.is-*` tokens (design-system.md
 * §2.4/§11) — no new hex, no forked chip look. See the design-system rows
 * added alongside this file for the rationale behind each mapping (the short
 * version: `accepted`/`rejected`/`arrived_notified` per the scrutinize note's
 * own examples; `in_transit`→warning (active/in-progress, "needs attention"),
 * `collected`→success (terminal positive — `.is-success` resolves to blue,
 * matching a *resolved* outcome per its own §2.4 note), `left_at_stop`→
 * delayed (an off-happy-path exception state, distinct violet),
 * `unclaimed_returned`→neutral (a dormant/inactive terminal outcome)).
 */
const PARCEL_STATUS_CHIP_MAP: Record<ParcelDeliveryStatus, ParcelStatusChip> = {
  accepted: { token: 'is-accepted', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.ACCEPTED' },
  in_transit: { token: 'is-warning', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.IN_TRANSIT' },
  arrived_notified: { token: 'is-info', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.ARRIVED_NOTIFIED' },
  collected: { token: 'is-success', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.COLLECTED' },
  left_at_stop: { token: 'is-delayed', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.LEFT_AT_STOP' },
  unclaimed_returned: { token: 'is-neutral', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.UNCLAIMED_RETURNED' },
  rejected: { token: 'is-danger', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.REJECTED' },
};

const FALLBACK_CHIP: ParcelStatusChip = {
  token: 'is-neutral',
  i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.UNKNOWN',
};

/** Resolve a `parcel_delivery_status` slug (any casing) to its chip token +
 * i18n key. An unrecognized/empty value (e.g. the never-rendered `created`
 * slug, or a future status this FE hasn't been updated for) degrades to the
 * neutral chip rather than throwing or rendering blank. */
export function parcelDeliveryStatusChip(status: string | null | undefined): ParcelStatusChip {
  const key = String(status ?? '').trim().toLowerCase();
  return PARCEL_STATUS_CHIP_MAP[key as ParcelDeliveryStatus] ?? FALLBACK_CHIP;
}

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
 * OBRS-305 scrutinize note: the (originally 7, now 8 with OBRS-415's
 * `created`) renderable `parcel_delivery_status` slugs map onto the 7
 * EXISTING `.admin-status.is-*` tokens (design-system.md §2.4/§11) — no new
 * hex, no forked chip look (`created` reuses `is-neutral`, same token as
 * `unclaimed_returned`). See the design-system rows added alongside this file
 * for the rationale behind each mapping (the short version:
 * `accepted`/`rejected`/`arrived_notified` per the scrutinize note's own
 * examples; `in_transit`→warning (active/in-progress, "needs attention"),
 * `collected`→success (terminal positive — `.is-success` resolves to blue,
 * matching a *resolved* outcome per its own §2.4 note), `left_at_stop`→
 * delayed (an off-happy-path exception state, distinct violet),
 * `unclaimed_returned`→neutral (a dormant/inactive terminal outcome),
 * `created`→neutral (declared, nothing has happened yet — OBRS-415)).
 */
const PARCEL_STATUS_CHIP_MAP: Record<ParcelDeliveryStatus, ParcelStatusChip> = {
  // OBRS-415: the online-intake starting state — paid, awaiting staff
  // physical inspection. `is-neutral` ("inactive/unset, waiting" — design
  // system §2.4), distinct from `is-info`'s "already in the pipeline"
  // meaning used by `arrived_notified`. `i18nKey` here is the STAFF/driver
  // copy; customer-facing surfaces (success screen, /my-parcels,
  // /track-parcel) render their OWN `PARCEL_TRACKING.STATUS.CREATED` string
  // next to this same token instead of this key — see design-system §12 new
  // pattern note / UX-OBRS-415 §8 (the OBRS-427 STAFF.* namespace mistake
  // this card is explicitly told not to repeat).
  created: { token: 'is-neutral', i18nKey: 'STAFF.PARCEL_DELIVERY.STATUS.CREATED' },
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
 * i18n key. An unrecognized/empty value (e.g. a future status this FE hasn't
 * been updated for) degrades to the neutral chip rather than throwing or
 * rendering blank. */
export function parcelDeliveryStatusChip(status: string | null | undefined): ParcelStatusChip {
  const key = String(status ?? '').trim().toLowerCase();
  return PARCEL_STATUS_CHIP_MAP[key as ParcelDeliveryStatus] ?? FALLBACK_CHIP;
}

/**
 * The i18n key a CUSTOMER-facing surface should render next to
 * `parcelDeliveryStatusChip(status).token` (UX-OBRS-415 §8). `chipFor()`'s
 * own `i18nKey` stays the STAFF/driver copy for every slug — for `created`
 * specifically, a customer surface (success screen, `/my-parcels`,
 * `/track-parcel`) renders `PARCEL_TRACKING.STATUS.CREATED` instead, so a
 * customer never reads "Declared — not yet at counter" (driver phrasing).
 * Every OTHER slug still falls through to the shared STAFF.* copy — that is
 * pre-existing behavior on the public tracking page (OBRS-427 tracks the
 * broader STAFF.* reuse as its own, separate fix; this helper does not
 * attempt it here) — this function only forks the ONE slug this card adds.
 */
export function parcelCustomerStatusLabelKey(status: string | null | undefined): string {
  const key = String(status ?? '').trim().toLowerCase();
  if (key === 'created') {
    return 'PARCEL_TRACKING.STATUS.CREATED';
  }
  return parcelDeliveryStatusChip(status).i18nKey;
}

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
 *
 * Every `i18nKey` here is the STAFF/driver copy (`STAFF.PARCEL_DELIVERY.STATUS.*`)
 * — this is the single source of truth for slug→token AND slug→STAFF-key.
 * `parcelCustomerStatusLabelKey()` below derives its OWN customer-namespace
 * key from the same slug list rather than hand-maintaining a second map
 * (OBRS-427).
 */
const PARCEL_STATUS_CHIP_MAP: Record<ParcelDeliveryStatus, ParcelStatusChip> = {
  // OBRS-415: the online-intake starting state — paid, awaiting staff
  // physical inspection. `is-neutral` ("inactive/unset, waiting" — design
  // system §2.4), distinct from `is-info`'s "already in the pipeline"
  // meaning used by `arrived_notified`.
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

function normalizeStatusSlug(status: string | null | undefined): string {
  return String(status ?? '').trim().toLowerCase();
}

/**
 * Membership test that ignores the prototype chain. A plain object literal
 * inherits from `Object.prototype`, so `'constructor' in PARCEL_STATUS_CHIP_MAP`
 * and `PARCEL_STATUS_CHIP_MAP['__proto__']` are both truthy while resolving to
 * something that is NOT a `ParcelStatusChip`. Left unguarded that yields an
 * `undefined` token/i18nKey from `parcelDeliveryStatusChip()` and a bogus
 * `PARCEL_TRACKING.STATUS.CONSTRUCTOR` key from
 * `parcelCustomerStatusLabelKey()` — a key present in no locale bundle, which
 * ngx-translate renders to the customer verbatim. That is the exact "raw i18n
 * key on a customer screen" symptom OBRS-427 exists to prevent, so the guard
 * belongs here rather than at each call site.
 */
function isKnownStatusSlug(slug: string): slug is ParcelDeliveryStatus {
  return Object.prototype.hasOwnProperty.call(PARCEL_STATUS_CHIP_MAP, slug);
}

/** Resolve a `parcel_delivery_status` slug (any casing) to its chip token +
 * i18n key. An unrecognized/empty value (e.g. a future status this FE hasn't
 * been updated for) degrades to the neutral chip rather than throwing or
 * rendering blank. */
export function parcelDeliveryStatusChip(status: string | null | undefined): ParcelStatusChip {
  const slug = normalizeStatusSlug(status);
  return isKnownStatusSlug(slug) ? PARCEL_STATUS_CHIP_MAP[slug] : FALLBACK_CHIP;
}

/**
 * The i18n key a CUSTOMER-facing surface should render next to
 * `parcelDeliveryStatusChip(status).token` (UX-OBRS-415 §8, OBRS-427).
 *
 * Every `parcel_delivery_status` slug — plus the unknown/unrecognized
 * fallback — gets its OWN key in the `PARCEL_TRACKING.STATUS.*` namespace,
 * never `STAFF.PARCEL_DELIVERY.STATUS.*`. This is a hard separation: the
 * STAFF namespace is driver/back-office copy (e.g. `created`'s "Declared —
 * not yet at counter") and a future edit to that copy must never leak onto
 * a customer screen (success screen, `/my-parcels`, `/track-parcel`) again
 * — that was the exact latent risk OBRS-415 flagged and OBRS-427 closes.
 *
 * The key is derived mechanically from the slug (`PARCEL_TRACKING.STATUS.`
 * + upper-cased slug) rather than a second hand-maintained map, so adding a
 * slug to `PARCEL_STATUS_CHIP_MAP` above is the only place a future status
 * needs to be registered — this function can't drift out of sync with it.
 * The unrecognized/empty case resolves to `PARCEL_TRACKING.STATUS.UNKNOWN`,
 * mirroring `FALLBACK_CHIP` above (both `public/i18n/{en,th,zh}.json` carry
 * that key).
 */
export function parcelCustomerStatusLabelKey(status: string | null | undefined): string {
  const key = normalizeStatusSlug(status);
  const slug = isKnownStatusSlug(key) ? key : 'unknown';
  return `PARCEL_TRACKING.STATUS.${slug.toUpperCase()}`;
}

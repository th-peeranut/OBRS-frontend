import { ParcelClaimStatus } from '../interfaces/parcel-claim.interface';
import { hasOwnKey } from './own-key';

/**
 * `.admin-status.is-*` token per `ParcelClaimStatus` (design-system §2.4 — no
 * new hex, reuse the existing warning/success/danger tokens). Shared by the
 * staff claim-history panel (`ParcelClaimDialogComponent`), the owner's
 * pending-claims queue (`ParcelClaimsPageComponent`) and the owner's approve
 * modal history (`ParcelClaimApproveModalComponent`) — one status
 * vocabulary, translated into a chip in exactly one place.
 */
const PARCEL_CLAIM_STATUS_TOKEN: Record<ParcelClaimStatus, string> = {
  PENDING: 'is-warning',
  APPROVED: 'is-success',
  REJECTED: 'is-danger',
};

/** Falls back to `is-neutral` for anything not in the closed set above —
 * never throws on an unrecognized/empty status. */
export function parcelClaimStatusToken(status: string): string {
  return hasOwnKey(PARCEL_CLAIM_STATUS_TOKEN, status)
    ? PARCEL_CLAIM_STATUS_TOKEN[status]
    : 'is-neutral';
}

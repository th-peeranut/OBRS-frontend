/**
 * OBRS-1388 — parcel damage-claim record & cross-counter claim history.
 * Field names/types match `docs/spec/parcel-damage-claim-obrs-1388.md` §4 (the
 * locked backend spec) exactly — do not rename or add fields on spec. Shared
 * across `StaffApiService` (file/history/reject — the counter's flow) and
 * `AdminApiService` (queue/history/approve — the owner's flow), so this lives
 * in `shared/interfaces/` per CLAUDE.md §8.
 */

/** `POST /api/private/parcel-claims` body. SALESPERSON. */
export interface ParcelClaimReqDto {
  parcelId: number;
  claimReason: string;
}

/** `POST /api/private/parcel-claims/{id}/reject` body. SALESPERSON (OWNER inherits). */
export interface ParcelClaimRejectReqDto {
  decisionNote: string;
}

/** `POST /api/private/parcel-claims/{id}/approve` body. OWNER-only.
 * `approvedAmount` must be `> 0` and `<= 500` (§1's ฿500 ceiling, BR-4). */
export interface ParcelClaimApproveReqDto {
  approvedAmount: number;
  decisionNote?: string;
}

export type ParcelClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * The shape returned by all five endpoints (file / history / queue / approve
 * / reject). `salesPointId` is BEST-EFFORT, never a gate (BR-1) — it is NULL
 * on every claim today (every `user_profiles.active_sales_point_id` is NULL
 * in prod, OBRS-1371) and MUST render as the labelled
 * `ADMIN.PARCEL_CLAIM.SALES_POINT.UNASSIGNED` state, never blank space,
 * everywhere it appears.
 */
export interface ParcelClaimRespDto {
  id: number;
  parcelId: number;
  trackingNumber: string;
  claimantName: string;
  claimantContactPhone: string;
  claimReason: string;
  salesPointId: number | null;
  status: ParcelClaimStatus;
  filedByUserId: number;
  filedAt: string;
  approvedAmount: number | null;
  decisionNote: string | null;
  expenseId: number | null;
  decidedByUserId: number | null;
  decidedAt: string | null;
}

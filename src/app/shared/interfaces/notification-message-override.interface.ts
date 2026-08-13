// OBRS-1308: owner-editable notification message overrides with admin approval.
// Shapes mirror SPEC-OBRS-1308-notification-message-override.md's API contracts
// exactly (both controllers live under `AdminApiService` — see its
// "OBRS-1308: notification message overrides" section).

/** `notification_message_override.locale` — language-only, never a country
 * variant (`Locale#getLanguage()` on the backend). */
export type NotificationMessageLocale = 'th' | 'en' | 'zh';

/** `notification_message_override.status`, plus the synthetic `NONE` the GET
 * list/detail endpoints report when a key has never been overridden. */
export type NotificationMessageOverrideStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'NONE';

export type NotificationMessageChannel = 'SMS' | 'EMAIL' | 'IN_APP';

/** `POST .../credit-preview` 200 body, and the shape `creditEstimate` reuses
 * on the list/detail/review-detail DTOs below. `credits`/`baselineCredits`/
 * `encoding` are `null` (not an error) for a key whose channels do not
 * include SMS — the FE never computes this itself (AC12, system spec). */
export interface SmsCreditEstimateDto {
  credits: number | null;
  baselineCredits: number | null;
  encoding: 'GSM7' | 'UCS2' | null;
}

/** One locale's state on `GET /notification-messages` / `GET .../{messageCode}`. */
export interface NotificationMessageLocaleStatusDto {
  baseline: string;
  liveBody: string;
  status: NotificationMessageOverrideStatus;
  rejectReason: string | null;
  placeholderIndices: number[];
  /** Present only when the key's `channels` includes `SMS`. */
  creditEstimate: SmsCreditEstimateDto | null;
}

/** One overridable message key — `GET /notification-messages` list element,
 * and the shape of `GET /notification-messages/{messageCode}`. */
export interface OverridableMessageKeyDto {
  messageCode: string;
  notificationType: string;
  channels: NotificationMessageChannel[];
  sampleArgs: string[];
  locales: Record<NotificationMessageLocale, NotificationMessageLocaleStatusDto>;
}

/** `POST /notification-messages` request body. */
export interface SubmitNotificationMessagePayload {
  messageCode: string;
  locale: NotificationMessageLocale;
  body: string;
}

/** `POST /notification-messages` 201 response. */
export interface SubmitNotificationMessageRespDto {
  id: number;
  messageCode: string;
  locale: string;
  status: string;
  proposedAt: string;
}

/**
 * The `data` payload of a `POST /notification-messages` 400 —
 * `reason: 'PLACEHOLDER_MISMATCH'` carries `missingIndices`/`extraIndices`;
 * a `MessageFormat` compile failure instead sets `formatError` non-null.
 * Rendered verbatim under the textarea — the frontend never re-derives this,
 * the backend 400 is the tested authority (system spec, Business rule 3).
 */
export interface PlaceholderErrorDto {
  reason: string;
  missingIndices: number[];
  extraIndices: number[];
  formatError: string | null;
}

/** `POST .../credit-preview` request body. */
export interface CreditPreviewReqDto {
  body: string;
}

/** `GET .../reviews/pending` row. */
export interface PendingReviewRowDto {
  id: number;
  messageCode: string;
  notificationType: string;
  locale: string;
  proposedBy: string;
  proposedAt: string;
}

/** `GET .../reviews/{id}` — the admin review + diff detail. */
export interface NotificationMessageReviewDetailDto {
  id: number;
  messageCode: string;
  locale: string;
  status: NotificationMessageOverrideStatus;
  oldBody: string;
  newBody: string;
  placeholderIndices: number[];
  proposedBy: string;
  proposedAt: string;
  creditEstimate: SmsCreditEstimateDto | null;
}

/** `POST .../reviews/{id}/reject` request body. */
export interface RejectNotificationMessageReviewPayload {
  reason: string;
}

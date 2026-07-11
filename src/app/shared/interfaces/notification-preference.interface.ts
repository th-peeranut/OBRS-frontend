/**
 * One row of the notification-preferences matrix (OBRS-141). `type` is a
 * stable UPPER_SNAKE identifier (e.g. `PAYMENT_CONFIRMED`) that maps to an
 * i18n key under `NOTIFICATION_PREFS.TYPE.*` — never render it raw.
 *
 * `critical` rows must keep at least one channel on (server-enforced via the
 * `NOTIFICATION_PREFERENCE_CRITICAL_CHANNEL_REQUIRED` errorCode; mirrored
 * client-side in `NotificationPreferencesPageComponent`). `emailSupported` is
 * `false` only for `BOARDING_REMINDER` (SMS-only, no email toggle at all).
 */
export interface NotificationPreferenceRow {
  type: string;
  critical: boolean;
  emailSupported: boolean;
  smsSupported: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

/** Envelope of GET/PUT `/api/private/users/me/notification-preferences`. */
export interface NotificationPreferencesData {
  preferences: NotificationPreferenceRow[];
}

/** PUT request item — the server only accepts the editable channel flags. */
export interface UpdateNotificationPreferenceItem {
  type: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

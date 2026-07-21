// OBRS-576: config change history — GET /api/private/admin/configs/history
// (SA-OBRS-576 §6, LOCKED contract).
//
// `actorSource` has EXACTLY four values, enforced by a DB CHECK constraint
// (`system_configs_history_actor_source_check`) — the backend will never emit
// a fifth. The UX spec's summary table describes a "deleted user" render case
// that is NOT a fifth actorSource: it is `actorSource === 'USER'` with
// `actorName === null` (SA §6.5 — a user row the history still legitimately
// attributes to, but whose `users`/`user_profiles` row no longer exists,
// since `changed_by_user_id` carries no FK by design, SA §4.2). Rendering
// must branch on `actorName` nullability WITHIN the 'USER' case, never invent
// a 'DELETED_USER' member of ConfigHistoryActorSource — see
// config-change-history-page.mappers.ts's actorDisplay().
export type ConfigHistoryValue = string | number | boolean | Array<string | number | boolean> | null;

export type ConfigHistoryActorSource = 'USER' | 'SYSTEM' | 'UNATTRIBUTED' | 'PRE_FEATURE';

export interface ConfigHistoryRow {
  // BIGSERIAL -> JSON number. NEVER string (OBRS-376: the exact interface +
  // fixture pair where that bug lived before — a fixture "built to look
  // right" tends to encode the same wrong type as the interface).
  id: number;
  configKey: string;
  operation: 'UPDATE' | 'DELETE';
  // ISO-8601 WITH the +07:00 Bangkok offset already applied server-side — do
  // NOT re-convert timezone at the FE (SA §6.4 / §7.3).
  changedAt: string;
  oldValue: ConfigHistoryValue;
  // null only when operation === 'DELETE'.
  newValue: ConfigHistoryValue;
  actorSource: ConfigHistoryActorSource;
  // non-null only when actorSource === 'USER' AND the user row still exists.
  actorName: string | null;
  // lowercase role slug; non-null only alongside actorName.
  actorRole: string | null;
}

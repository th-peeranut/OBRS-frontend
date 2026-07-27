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

// OBRS-722: WHICH config the row changed, derived server-side from
// `system_configs_history.owner_id` (NULL -> 'PLATFORM'). Strictly orthogonal
// to `actorSource`/`actorRole`, which say WHO changed it: a user holding the
// `owner` role editing the platform default is actorRole:'owner' with
// scope:'PLATFORM'. Reading either column as the other is exactly the
// confusion this field exists to remove — "the default every non-overriding
// owner inherits just moved" and "one owner customised their own copy" are
// different events with different blast radius, and before this field they
// rendered identically.
export type ConfigHistoryScope = 'PLATFORM' | 'OWNER';

// OBRS-742: 'INSERT' arrived with OBRS-730's V51, which widened
// `trg_system_config_override_audit` from `AFTER UPDATE OR DELETE` to cover
// INSERT so an owner's FIRST override is audited too. Every reader that
// enumerated this union before V51 was written against a two-value world and
// must be re-checked, not assumed still-total — the `oldValue` comment below
// is exactly such a reader, and it was wrong from the day V51 landed.
export type ConfigHistoryOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ConfigHistoryRow {
  // BIGSERIAL -> JSON number. NEVER string (OBRS-376: the exact interface +
  // fixture pair where that bug lived before — a fixture "built to look
  // right" tends to encode the same wrong type as the interface).
  id: number;
  configKey: string;
  operation: ConfigHistoryOperation;
  // ISO-8601 WITH the +07:00 Bangkok offset already applied server-side — do
  // NOT re-convert timezone at the FE (SA §6.4 / §7.3).
  changedAt: string;
  // null on an 'INSERT' row — there was no previous value, because this row IS
  // the config's (or the owner's override's) first. Reachable only since
  // OBRS-730's V51; before that the trigger fired on UPDATE/DELETE alone and
  // this was NOT NULL in practice.
  oldValue: ConfigHistoryValue;
  // null on a 'DELETE' row — the value is gone now.
  //
  // OBRS-742: the two nulls above mean OPPOSITE things ("never set yet" vs
  // "removed") and neither is inferable from the value alone. Render them via
  // formatConfigValue(row, slot, …), which takes the whole row for that
  // reason; a helper handed a bare `value` cannot tell them apart and will
  // report an owner's brand-new override as deleted.
  newValue: ConfigHistoryValue;
  actorSource: ConfigHistoryActorSource;
  // non-null only when actorSource === 'USER' AND the user row still exists.
  actorName: string | null;
  // lowercase role slug; non-null only alongside actorName.
  actorRole: string | null;
  // OBRS-722: never null — the backend derives it from a nullable column, so
  // there is no "unknown scope" state to render.
  scope: ConfigHistoryScope;
  // OBRS-722: the owner's display name. null when scope === 'PLATFORM', and
  // ALSO null on a scope === 'OWNER' row whose owner row has since been
  // deleted (`owner_id` carries no FK by design, V50) — the same
  // known-but-unresolvable shape as actorName on a 'USER' row. Both nulls must
  // render as explicit text: a blank cell here reads as "platform", which is
  // the opposite of the truth.
  ownerName: string | null;
}

import { extractApiErrorCode } from '../../../../shared/lib/api-error-code';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import {
  ConfigHistoryActorSource,
  ConfigHistoryRow,
  ConfigHistoryScope,
  ConfigHistoryValue,
} from '../../../../shared/interfaces/config-history.interface';
import { translateRoleSlug } from '../user-management/user-management.mappers';

// Pure mappers/formatters extracted from ConfigChangeHistoryPageComponent, no
// Angular/service dependencies — every translation-dependent value the
// component pulls off `this.translate` is an explicit parameter here, so
// these stay unit-testable in isolation (mirrors usability-reports-page.mappers.ts,
// reports-page's own inline pure helpers, etc.).

const KEY_LABEL_PREFIX = 'ADMIN.CONFIG_CHANGE_HISTORY.KEYS.';

/**
 * Config-key display label — copies the SA's exact mechanism (SA §7.4)
 * verbatim, two traps already diagnosed there:
 *
 * 1. A config key can contain a dot (`parcel.prohibited_categories`) and
 *    ngx-translate treats `.` as a NESTED-PATH separator, so the lookup key
 *    must sanitize `.` -> `_` first or it walks KEYS -> parcel ->
 *    prohibited_categories instead of a flat key.
 * 2. ngx-translate's own "not found" fallback returns the FULL key PATH, not
 *    the raw config key the owner asked for (design-system.md §0.5 lock: a
 *    new, untranslated config key must still show up, ugly label and all —
 *    never blank, never hidden, never the key path). Detect that ourselves
 *    (`translated === i18nKey`) and substitute the raw key.
 */
export function configKeyLabel(
  configKey: string,
  translateFn: (key: string) => string
): string {
  const i18nKey = KEY_LABEL_PREFIX + configKey.replace(/\./g, '_');
  const translated = translateFn(i18nKey);
  return translated === i18nKey ? configKey : translated;
}

/**
 * Render a raw `oldValue`/`newValue` JSON node for the "จาก -> เป็น" column
 * (Hard constraint #5). Dispatch is STRICTLY on the real JSON shape
 * (`typeof`/`Array.isArray()`) — never inferred from the config key's name.
 */
export function formatConfigValue(
  value: ConfigHistoryValue,
  translateFn: (key: string, params?: Record<string, unknown>) => string
): string {
  if (value === null) {
    return translateFn('ADMIN.CONFIG_CHANGE_HISTORY.VALUE_DELETED');
  }
  if (typeof value === 'boolean') {
    return translateFn(
      value ? 'ADMIN.CONFIG_CHANGE_HISTORY.BOOL.ON' : 'ADMIN.CONFIG_CHANGE_HISTORY.BOOL.OFF'
    );
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item));
    const shown = items.slice(0, 3).join(', ');
    return items.length > 3
      ? `${shown} ${translateFn('ADMIN.CONFIG_CHANGE_HISTORY.VALUE.MORE', { count: items.length - 3 })}`
      : shown;
  }
  // string
  return `"${value}"`;
}

/** Role slug -> translated label, reusing the EXISTING role-name mapper
 * (user-management.mappers.ts, already shipped for the Users table's role
 * chips) rather than adding a parallel role-label map for this page. */
export function roleLabel(
  role: string | null,
  translateFn: (key: string) => string
): string {
  return role ? translateRoleSlug(role, translateFn) : '';
}

/**
 * The five renderable actor states for the "ผู้แก้ไข" column.
 *
 * IMPORTANT — this is a RENDER-level split, not a fifth backend value.
 * `ConfigHistoryActorSource` has EXACTLY four values (USER/SYSTEM/
 * UNATTRIBUTED/PRE_FEATURE), enforced by a DB CHECK constraint the backend
 * can never violate (SA §4.3). The UX spec's "DELETED_USER" summary row is
 * `actorSource === 'USER'` with `actorName === null` — a user the history
 * legitimately attributes to, whose `users`/`user_profiles` row has since
 * been deleted (no FK from changed_by_user_id, SA §4.2/§6.5). It is a KNOWN,
 * legitimate USER row, and must render distinctly from both PRE_FEATURE
 * ("no user was ever recorded — predates the feature") and UNATTRIBUTED ("no
 * user declared itself to the trigger at all") — collapsing it into either
 * would misrepresent a case the backend can actually prove happened.
 */
export type ActorDisplayKind =
  | 'user'
  | 'user-deleted'
  | 'system'
  | 'unattributed'
  | 'pre-feature';

export interface ActorDisplay {
  kind: ActorDisplayKind;
}

/**
 * Classifies a row's actor into its render bucket. Exhaustive over the 4
 * real actorSource values plus the actorName-nullability split of 'USER' —
 * every branch produces non-empty text at the template layer (SA §7.6 / UX
 * §7: all 5 cases must render, none may be blank).
 */
export function actorDisplayKind(row: Pick<ConfigHistoryRow, 'actorSource' | 'actorName'>): ActorDisplayKind {
  switch (row.actorSource as ConfigHistoryActorSource) {
    case 'USER':
      return row.actorName ? 'user' : 'user-deleted';
    case 'SYSTEM':
      return 'system';
    case 'PRE_FEATURE':
      return 'pre-feature';
    case 'UNATTRIBUTED':
    default:
      return 'unattributed';
  }
}

/**
 * OBRS-722 — the three renderable states of the "ขอบเขต" column.
 *
 * Same RENDER-level-split shape as {@link ActorDisplayKind} above, and for the
 * same reason: `ConfigHistoryScope` has EXACTLY two values, and
 * `'owner-deleted'` is not a third one — it is `scope === 'OWNER'` with
 * `ownerName === null`, an owner the row legitimately names whose users row no
 * longer exists (`owner_id` carries no FK, V50).
 *
 * The load-bearing rule is that a deleted owner must NOT collapse into
 * 'platform'. "Nobody could resolve that owner's name" and "this changed the
 * default for the whole platform" are opposite claims about blast radius, and
 * the falsy-check a developer reaches for first (`row.ownerName ? … : platform`)
 * quietly asserts the wrong one. Dispatch on `scope`, then on the name.
 */
export type ScopeDisplayKind = 'platform' | 'owner' | 'owner-deleted';

/** Classifies a row's scope into its render bucket. Total over both scope values. */
export function scopeDisplayKind(
  row: Pick<ConfigHistoryRow, 'scope' | 'ownerName'>
): ScopeDisplayKind {
  switch (row.scope as ConfigHistoryScope) {
    case 'OWNER':
      return row.ownerName ? 'owner' : 'owner-deleted';
    case 'PLATFORM':
    default:
      return 'platform';
  }
}

// OBRS-576: branch on the stable errorCode, never the localized `message`
// (design-system §9) — mirrors reports-page's resolveLoadError /
// extractUsabilityReportErrorCode.
export function extractConfigHistoryErrorCode(error: unknown): string | null {
  return extractApiErrorCode(error, null);
}

// Bangkok-rendered "เวลา" column. The backend already applies the +07:00
// offset (SA §6.4) — this reuses the app's single Bangkok-render helper
// (display-date-time.ts, OBRS-178) instead of Angular's native `date` pipe,
// which would format in the VIEWER's local browser timezone, not the
// embedded Bangkok offset, unless a timezone string is passed to every call
// site (a duplicate of what this helper already centralizes app-wide).
export function displayChangedAt(value: string, lang: string | null | undefined): string {
  return formatDisplayDateTime(value, lang);
}

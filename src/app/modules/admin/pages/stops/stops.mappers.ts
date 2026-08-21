import {
  AdminStopDetailDto,
  AdminStopSummaryDto,
  AdminTranslationDto,
  AdminStopUpdatePayload,
  AdminTranslationReqDto,
  getAdminLookupCode,
  getAdminLookupLabel,
  getAdminTranslationLabel,
} from '../../../../services/admin/admin-api.service';
import { hasOwnKey } from '../../../../shared/lib/own-key';

/**
 * OBRS-1022: pure mappers for the stop management page. No Angular, no services —
 * every locale-dependent value is an explicit parameter, so these are unit-testable
 * on their own (same split as `routes.mappers.ts`).
 */

/** The three locales the stop form edits. Fixed, matching the DB CHECK constraint
 *  on `stop_translations.locale` — an owner cannot invent a fourth. */
export const STOP_LOCALES = ['th', 'en', 'zh'] as const;
export type StopLocale = (typeof STOP_LOCALES)[number];

/** A dropdown option shown on the stop form (province / status / stop type).
 *  OBRS-1298: shared by StopsPageComponent (which owns the option lists) and
 *  StopFormModalComponent (which only renders them) — one interface, not a
 *  duplicate declared in each file. */
export interface Option {
  code: string;
  label: string;
}

/**
 * OBRS-1481: one choice in the "ขากลับขึ้นรถที่" dropdown.
 *
 * <p>Keyed by `id`, not by a slug `code` like {@link Option}: `stop_return_pairs` stores stop
 * IDs, and the PUT body carries the id straight through. Round-tripping it through a slug would
 * mean resolving it back on the server for no gain.
 */
export interface ReturnStopOption {
  id: number;
  label: string;
}

export interface StopRow {
  id: number;
  slug: string;
  name: string;
  status: string;
  statusCode: string;
  stopType: string;
  stopTypeCode: string;
}

/** One locale's editable content for a stop. */
export interface StopTranslationForm {
  locale: StopLocale;
  label: string;
  /** The landmark note — `stop_translations.description`. */
  description: string;
  address: string;
}

export interface StopDetailForm {
  id: number;
  slug: string;
  provinceCode: string;
  statusCode: string;
  stopTypeCode: string;
  latitude: number | null;
  longitude: number | null;
  primaryPhotoUrl: string | null;
  /** OBRS-1481: the pinned return boarding stop's id, or null for "ไม่กำหนด". */
  returnStopId: number | null;
  translations: StopTranslationForm[];
}

export function toStopRow(dto: AdminStopSummaryDto, locale: string): StopRow {
  return {
    id: dto.id,
    slug: dto.slug,
    name:
      getAdminTranslationLabel(dto.translations, locale) ??
      getAdminTranslationLabel(dto.translations, 'en') ??
      dto.slug,
    status: getAdminLookupLabel(dto.status, locale) ?? '',
    statusCode: getAdminLookupCode(dto.status),
    stopType: getAdminLookupLabel(dto.stopType, locale) ?? '',
    stopTypeCode: getAdminLookupCode(dto.stopType),
  };
}

/**
 * Builds the edit form's state from the detail payload.
 *
 * <p>Always emits all three locales in {@link STOP_LOCALES} order, filling the ones the
 * stop has no row for with empty strings. The alternative — rendering only the locales
 * that exist — would make a missing translation invisible in the very screen that exists
 * to add it: today every stop's `en` address is empty (OBRS-929) and no stop has a
 * description at all, so "only what exists" would render an almost blank form and hide
 * exactly the fields an owner came to fill in.
 */
export function toStopDetailForm(dto: AdminStopDetailDto): StopDetailForm {
  const addresses = dto.addresses ?? {};

  return {
    id: dto.id,
    slug: dto.slug,
    provinceCode: getAdminLookupCode(dto.province),
    statusCode: getAdminLookupCode(dto.status),
    stopTypeCode: getAdminLookupCode(dto.stopType),
    latitude: toNumberOrNull(dto.latitude),
    longitude: toNumberOrNull(dto.longitude),
    primaryPhotoUrl: dto.primaryPhotoUrl ?? null,
    returnStopId: dto.returnStopId ?? null,
    translations: STOP_LOCALES.map((locale) => {
      const exact = readExactTranslation(dto.translations, locale);
      return {
        locale,
        label: exact?.label ?? '',
        description: exact?.description ?? '',
        // hasOwnKey, not `addresses[locale] ?? ''` — `addresses` is an object literal
        // deserialized from the API, so it inherits Object.prototype and a key of
        // `constructor` resolves to a FUNCTION that `??` cannot catch (OBRS-601).
        address: hasOwnKey(addresses, locale) ? String(addresses[locale] ?? '') : '',
      };
    }),
  };
}

/**
 * Reads ONE locale's translation, with no fallback to any other locale.
 *
 * <p><b>Why not {@code getAdminTranslationLabel}.</b> That helper — correctly, for its own
 * callers — falls back to whatever locale has content when the requested one is empty, so a
 * table row never renders blank. In an EDIT FORM that behaviour is destructive: `nong_chak`
 * has a `th` label and no `en` one, so the shared helper would pre-fill the English box with
 * `หนองชาก`, and the owner's next save would write Thai into the `en` row. Silent corruption
 * of exactly the data this screen exists to fix — caught by
 * {@code stops.mappers.spec.ts} "always emits all three locales", which is why that test
 * asserts the EMPTY string rather than "something".
 *
 * <p>A display fallback and an edit fallback are opposites: one wants any value, the other
 * wants the truth about this locale, including that it is empty.
 */
function readExactTranslation(
  translations: AdminStopDetailDto['translations'],
  locale: StopLocale
): AdminTranslationDto | null {
  if (!translations) {
    return null;
  }
  if (Array.isArray(translations)) {
    return translations.find((item) => item.locale?.toLowerCase() === locale) ?? null;
  }
  return hasOwnKey(translations, locale) ? translations[locale] ?? null : null;
}

/**
 * Builds the PUT body.
 *
 * <p>Two things this deliberately does NOT do.
 *
 * <p>It never sets `primaryPhotoUrl` — the type has no such field. The endpoint is a
 * full-replace PUT that preserves the photo only while the key is ABSENT, so leaving it
 * out is what makes "owner edits the label" incapable of erasing "owner uploaded a photo
 * ten seconds ago" (OBRS-580).
 *
 * <p>It drops locales whose label is blank, because `label` is `@NotBlank` on the server
 * and a blank one would 400 the whole save. A locale the owner has not translated is
 * absent from `stop_translations`, which is what it already means today — not an empty
 * row. Blank descriptions and addresses ARE sent, since clearing one is a real edit.
 */
export function toStopUpdatePayload(form: StopDetailForm): AdminStopUpdatePayload {
  const filled = form.translations.filter((t) => t.label.trim().length > 0);

  const addresses: Record<string, string> = {};
  for (const t of filled) {
    addresses[t.locale] = t.address.trim();
  }

  const translations: AdminTranslationReqDto[] = filled.map((t) => ({
    locale: t.locale,
    label: t.label.trim(),
    description: t.description.trim(),
  }));

  return {
    slug: form.slug.trim(),
    province: form.provinceCode,
    status: form.statusCode,
    stopType: form.stopTypeCode,
    latitude: form.latitude,
    longitude: form.longitude,
    addresses,
    translations,
    // OBRS-1481: sent ALWAYS, null included — see AdminStopUpdatePayload. The opposite of
    // primaryPhotoUrl above: that key must be absent so a save cannot erase an upload, this
    // one must be present so a save CAN clear a pin the owner just unset.
    returnStopId: form.returnStopId,
  };
}

/**
 * Builds the return-boarding-stop choices.
 *
 * <p>`eligible` is the server's list of stops a bus actually picks passengers up at. `allStops`
 * is only a label source for the one case below.
 *
 * <p><b>AC-7: a pin already saved is ALWAYS offered, even when it is no longer eligible.</b> The
 * eligible set turns on `route_stops.boarding_type`, which somebody can change long after the pin
 * was made. If this list simply dropped the stale value, the `<select>` would render with nothing
 * selected and the owner's next save would post `null` — deleting a pin they never touched and
 * were never told about. That is OBRS-1476's failure wearing a dropdown, so the stale value stays
 * on the list and stays selected until the owner themselves changes it.
 */
export function toReturnStopOptions(
  eligible: AdminStopSummaryDto[],
  allStops: AdminStopSummaryDto[],
  locale: string,
  currentReturnStopId: number | null
): ReturnStopOption[] {
  const options = eligible.map((dto) => ({ id: dto.id, label: returnStopLabel(dto, locale) }));

  if (currentReturnStopId !== null && !options.some((option) => option.id === currentReturnStopId)) {
    const pinned = allStops.find((dto) => dto.id === currentReturnStopId);
    options.push({
      id: currentReturnStopId,
      // A pin can outlive the stop row itself only if the delete missed it; the id is then all
      // there is to show, and showing it beats showing an empty box.
      label: pinned ? returnStopLabel(pinned, locale) : String(currentReturnStopId),
    });
  }

  return options;
}

function returnStopLabel(dto: AdminStopSummaryDto, locale: string): string {
  return (
    getAdminTranslationLabel(dto.translations, locale) ??
    getAdminTranslationLabel(dto.translations, 'en') ??
    dto.slug
  );
}

/** Case-insensitive keyword match over the columns the table actually shows. */
export function filterStopRows(rows: StopRow[], keyword: string): StopRow[] {
  const needle = keyword.trim().toLowerCase();
  if (needle.length === 0) {
    return rows;
  }
  return rows.filter((row) =>
    [row.slug, row.name, row.status, row.stopType].join(' ').toLowerCase().includes(needle)
  );
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  // Latitude/longitude arrive as JSON numbers today, but the DTO tolerates strings
  // (BigDecimal has been serialized both ways in this codebase). NaN becomes null
  // rather than reaching the form, where it would render as an empty box that
  // silently posts NaN and 400s on a validation message about the range.
  return Number.isFinite(parsed) ? parsed : null;
}

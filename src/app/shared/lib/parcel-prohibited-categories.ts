// OBRS-629 AC-4: turn the raw `parcel.prohibited_categories` slugs the server
// serves (GET /api/parcel-policy) into something a sender can read, WITHOUT the
// screen keeping its own second copy of the list.
//
// The defect this closes: the customer wizard held a hardcoded five-entry array
// while `ParcelIntakeService#validateNotProhibited` matched against the config,
// and the staff walk-in consign form -- the only parcel channel open at go-live
// after OBRS-622 -- asked the sender to attest their parcel held nothing
// prohibited while showing them NOTHING to read. Same rule as OBRS-564: a limit
// a customer reads is never hardcoded in a translation file.
//
// What stays hardcoded here, deliberately, is the ICON and the TRANSLATION for
// slugs we already ship copy for. Those are display concerns; the LIST -- which
// categories exist and therefore what the sender is agreeing to -- comes from
// the server on every load. An admin who adds a slug we have no copy for still
// gets it shown (see UNLISTED_KEY): a category the sender cannot see is worse
// than one shown by its raw slug, because intake will still reject on it.

import { hasOwnKey } from './own-key';

export interface ProhibitedCategoryView {
  /** The raw config slug, kept so tests and templates can key off the truth. */
  slug: string;
  /** Material icon name; a slug we ship no icon for falls back to `block`. */
  icon: string;
  /** Translation key to render. */
  i18nKey: string;
  /**
   * Interpolation params for `i18nKey`, or `undefined` when it needs none.
   * Computed ONCE here rather than in a template expression: an object literal
   * built inside a template allocates on every change-detection cycle.
   */
  params?: { slug: string };
}

const ICON_BY_SLUG: Readonly<Record<string, string>> = {
  flammable: 'local_fire_department',
  explosive: 'warning',
  weapon: 'gavel',
  narcotic: 'medication',
  corpse: 'sentiment_very_dissatisfied',
};

const FALLBACK_ICON = 'block';

/** Rendered for a slug we ship no copy for; takes the slug as a parameter. */
export const UNLISTED_KEY = 'PARCEL.PROHIBITED.UNLISTED';

/**
 * Map server slugs to renderable rows. Call this ONCE per policy load and store
 * the result — never from a template expression.
 *
 * An empty input returns an empty array, which is the honest rendering of a
 * system that is currently blocking nothing: `getStringListConfig` has no
 * hardcoded fallback, so an admin who clears the config row turns the intake
 * check off entirely. The caller decides what to show in that case (see
 * `PARCEL.PROHIBITED.EMPTY`); it must not be papered over with the old five.
 */
export function toProhibitedCategoryViews(slugs: readonly string[] | null | undefined): ProhibitedCategoryView[] {
  if (!slugs?.length) {
    return [];
  }
  return slugs.map((raw) => {
    const slug = raw.trim().toLowerCase();
    // hasOwnKey, not `slug in ICON_BY_SLUG` or `ICON_BY_SLUG[slug] ?? FALLBACK`: this map is
    // indexed by an ADMIN-EDITABLE config value, so a row typed as `constructor` would resolve
    // to Object.prototype.constructor -- a function that is both non-nullish and truthy, and
    // would ship as the icon name and as `PARCEL.PROHIBITED.ITEM.CONSTRUCTOR`, a key in no
    // locale bundle (ADR-0028; OBRS-427 produced exactly that key while fixing a raw-key bug).
    if (hasOwnKey(ICON_BY_SLUG, slug)) {
      return {
        slug,
        icon: ICON_BY_SLUG[slug],
        i18nKey: `PARCEL.PROHIBITED.ITEM.${slug.toUpperCase()}`,
      };
    }
    return {
      slug,
      icon: FALLBACK_ICON,
      i18nKey: UNLISTED_KEY,
      params: { slug: raw },
    };
  });
}

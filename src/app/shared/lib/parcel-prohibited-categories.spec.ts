import { toProhibitedCategoryViews, UNLISTED_KEY } from './parcel-prohibited-categories';

describe('toProhibitedCategoryViews (OBRS-629 AC-4)', () => {
  it('maps the seven seeded slugs to their shipped copy and icons', () => {
    // OBRS-1402 added `valuables`/`animal`. `params === undefined` on every row is the
    // assertion that matters here: a slug we ship no copy for falls through to UNLISTED_KEY
    // WITH params, so a missing icon or translation would show the raw slug rather than fail.
    const views = toProhibitedCategoryViews([
      'flammable',
      'explosive',
      'weapon',
      'narcotic',
      'corpse',
      'valuables',
      'animal',
    ]);

    expect(views.map((v) => v.i18nKey)).toEqual([
      'PARCEL.PROHIBITED.ITEM.FLAMMABLE',
      'PARCEL.PROHIBITED.ITEM.EXPLOSIVE',
      'PARCEL.PROHIBITED.ITEM.WEAPON',
      'PARCEL.PROHIBITED.ITEM.NARCOTIC',
      'PARCEL.PROHIBITED.ITEM.CORPSE',
      'PARCEL.PROHIBITED.ITEM.VALUABLES',
      'PARCEL.PROHIBITED.ITEM.ANIMAL',
    ]);
    expect(views[0].icon).toBe('local_fire_department');
    expect(views[5].icon).toBe('diamond');
    expect(views[6].icon).toBe('pets');
    expect(views.every((v) => v.params === undefined)).toBeTrue();
  });

  it('shows a slug it has no copy for rather than dropping it', () => {
    // The admin owns this list. A category we cannot render is still a category intake rejects
    // on, so hiding it would send the sender away with a parcel we are about to refuse.
    const views = toProhibitedCategoryViews(['livestock']);

    expect(views.length).toBe(1);
    expect(views[0].i18nKey).toBe(UNLISTED_KEY);
    expect(views[0].params).toEqual({ slug: 'livestock' });
    expect(views[0].icon).toBe('block');
  });

  it('matches slugs case- and whitespace-insensitively, like the server does', () => {
    // validateNotProhibited lowercases both sides before its contains() check; a config row
    // typed as "Flammable" must not become an UNLISTED row here while still blocking there.
    const views = toProhibitedCategoryViews([' Flammable ']);

    expect(views[0].i18nKey).toBe('PARCEL.PROHIBITED.ITEM.FLAMMABLE');
    expect(views[0].slug).toBe('flammable');
  });

  it('treats a prototype-member slug as unlisted, not as Object.prototype.constructor', () => {
    // The config row is admin-editable, so the slug is a runtime string indexing an object
    // literal. `slug in ICON_BY_SLUG` would be TRUE here and hand back a function as the icon,
    // plus PARCEL.PROHIBITED.ITEM.CONSTRUCTOR -- a key in no locale bundle (ADR-0028/OBRS-427).
    for (const slug of ['constructor', '__proto__', 'toString']) {
      const views = toProhibitedCategoryViews([slug]);
      expect(views[0].i18nKey).withContext(slug).toBe(UNLISTED_KEY);
      expect(typeof views[0].icon).withContext(slug).toBe('string');
      expect(views[0].icon).withContext(slug).toBe('block');
    }
  });

  it('returns an empty array for an unset config, and does not substitute the old five', () => {
    // getStringListConfig has NO hardcoded fallback: an unset row means intake blocks nothing,
    // and the screen has to be able to say so. Papering over it is the defect this card closes.
    expect(toProhibitedCategoryViews([])).toEqual([]);
    expect(toProhibitedCategoryViews(null)).toEqual([]);
    expect(toProhibitedCategoryViews(undefined)).toEqual([]);
  });
});

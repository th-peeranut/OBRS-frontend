import {
  AdminLookupDto,
  AdminTranslationReqDto,
  CreateLookupPayload,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
} from '../../../../services/admin/admin-api.service';

// Pure mappers/formatters/normalizers extracted from LookupSettingsPageComponent
// (OBRS-248, mirroring OBRS-208's routes.mappers.ts, OBRS-214's
// schedules.mappers.ts, OBRS-232's user-management.mappers.ts, OBRS-237's
// role-management.mappers.ts, OBRS-241's promotions-page.mappers.ts, OBRS-244's
// vehicles-page.mappers.ts/vehicle-maintenance.mappers.ts and OBRS-247's
// usability-reports-page.mappers.ts). No Angular/service dependencies — every
// value the original private methods pulled off `this` is now an explicit
// parameter, so these stay unit-testable in isolation.
//
// Unlike its siblings, this page has NO dynamic locale threading and NO
// `dateLang` trap: toLookupEntry always resolves BOTH the 'en' and 'th'
// labels/descriptions side-by-side (the archive table displays both languages
// at once), so the 'en'/'th' literals below are intentional — do not thread a
// `locale`/`getCurrentLocale()` param through this file.

export interface LookupEntry {
  id: number;
  category: string;
  slug: string;
  enLabel: string;
  enDescription: string;
  thLabel: string;
  thDescription: string;
}

export interface CategorySummary {
  name: string;
  count: number;
}

export interface LookupCategoryGroup {
  category: string;
  items: LookupEntry[];
}

export function toLookupEntry(lookup: AdminLookupDto): LookupEntry {
  return {
    id: lookup.id,
    category: lookup.category,
    slug: lookup.slug,
    enLabel: getAdminTranslationLabel(lookup.translations, 'en') ?? '-',
    enDescription: getAdminTranslationDescription(lookup.translations, 'en') ?? '-',
    thLabel: getAdminTranslationLabel(lookup.translations, 'th') ?? '-',
    thDescription: getAdminTranslationDescription(lookup.translations, 'th') ?? '-',
  };
}

export function toEntryFromPayload(payload: CreateLookupPayload, id: number): LookupEntry {
  const byLocale = (locale: string) =>
    payload.translations.find((translation) => translation.locale === locale);
  const en = byLocale('en');
  const th = byLocale('th');

  return {
    id,
    category: payload.category,
    slug: payload.slug,
    enLabel: en?.label || '-',
    enDescription: en?.description || '-',
    thLabel: th?.label || '-',
    thDescription: th?.description || '-',
  };
}

export function toLookupPayload(rawFormValue: Record<string, unknown>): CreateLookupPayload {
  const category = String(rawFormValue['category'] ?? '')
    .trim()
    .toLowerCase();
  const slug = String(rawFormValue['slug'] ?? '')
    .trim()
    .toLowerCase();
  const enLabel = String(rawFormValue['enLabel'] ?? '').trim();
  const enDescription = String(rawFormValue['enDescription'] ?? '').trim();
  const thLabel = String(rawFormValue['thLabel'] ?? '').trim();
  const thDescription = String(rawFormValue['thDescription'] ?? '').trim();

  const translations: AdminTranslationReqDto[] = [
    {
      locale: 'en',
      label: enLabel,
      description: enDescription || undefined,
    },
  ];

  if (thLabel) {
    translations.push({
      locale: 'th',
      label: thLabel,
      description: thDescription || undefined,
    });
  }

  return {
    category,
    slug,
    translations,
  };
}

export function toCategorySummary(lookups: AdminLookupDto[]): CategorySummary[] {
  const categoryMap = new Map<string, number>();

  for (const lookup of lookups) {
    categoryMap.set(lookup.category, (categoryMap.get(lookup.category) ?? 0) + 1);
  }

  return Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function toCategorySummaryFromEntries(entries: LookupEntry[]): CategorySummary[] {
  const categoryMap = new Map<string, number>();
  for (const entry of entries) {
    categoryMap.set(entry.category, (categoryMap.get(entry.category) ?? 0) + 1);
  }

  return Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Entries grouped by category so the archive table reads by section. */
export function groupEntriesByCategory(entries: LookupEntry[]): LookupCategoryGroup[] {
  const map = new Map<string, LookupEntry[]>();
  for (const entry of entries) {
    const items = map.get(entry.category) ?? [];
    items.push(entry);
    map.set(entry.category, items);
  }

  return Array.from(map.entries())
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// The pure list-patch half of the original applyOptimisticLookup: folds the
// just-saved entry into the existing list (replace-in-place for an edit,
// prepend for a create). The `this.entries =` assignment stays in the
// component since it mutates live component state.
export function updateEntriesWithOptimistic(
  entries: LookupEntry[],
  entry: LookupEntry,
  original: LookupEntry | null
): LookupEntry[] {
  if (original) {
    return entries.map((existing) =>
      existing.category === original.category && existing.slug === original.slug
        ? entry
        : existing
    );
  }

  return [entry, ...entries];
}

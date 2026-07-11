import { AdminLookupDto, CreateLookupPayload } from '../../../../services/admin/admin-api.service';
import {
  LookupEntry,
  groupEntriesByCategory,
  toCategorySummary,
  toCategorySummaryFromEntries,
  toEntryFromPayload,
  toLookupEntry,
  toLookupPayload,
  updateEntriesWithOptimistic,
} from './lookup-settings-page.mappers';

describe('lookup-settings-page.mappers', () => {
  describe('toLookupEntry', () => {
    it('resolves en/th label and description from an array-shaped translations collection', () => {
      const lookup: AdminLookupDto = {
        id: 1,
        category: 'role_status',
        slug: 'active',
        translations: [
          { locale: 'en', label: 'Active', description: 'Active EN desc' },
          { locale: 'th', label: 'ใช้งาน', description: 'Active TH desc' },
        ],
      };

      const entry = toLookupEntry(lookup);
      expect(entry).toEqual({
        id: 1,
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        enDescription: 'Active EN desc',
        thLabel: 'ใช้งาน',
        thDescription: 'Active TH desc',
      });
    });

    it('resolves en/th label and description from a record-shaped translations collection', () => {
      const lookup: AdminLookupDto = {
        id: 2,
        category: 'booking_status',
        slug: 'paid',
        translations: {
          en: { label: 'Paid', description: 'Paid EN desc' },
          th: { label: 'ชำระแล้ว' },
        },
      };

      const entry = toLookupEntry(lookup);
      expect(entry.enLabel).toBe('Paid');
      expect(entry.enDescription).toBe('Paid EN desc');
      expect(entry.thLabel).toBe('ชำระแล้ว');
      // th entry has no description of its own — falls back to '-', NOT to
      // the en description (each locale is resolved independently).
      expect(entry.thDescription).toBe('-');
    });

    it('falls back to "-" for every field when translations has no en/th match at all', () => {
      const lookup: AdminLookupDto = {
        id: 3,
        category: 'vehicle_type',
        slug: 'van',
        translations: [{ locale: 'zh', label: '小巴' }],
      };

      // getAdminTranslation falls back to the first translation with ANY
      // label/description when the requested locale is absent — so both
      // en and th resolve to the zh entry's label, not to '-'. Asserted
      // explicitly so a change to the shared fallback rule doesn't
      // silently change this page.
      const entry = toLookupEntry(lookup);
      expect(entry.enLabel).toBe('小巴');
      expect(entry.thLabel).toBe('小巴');
    });

    it('falls back to "-" when translations is empty', () => {
      const lookup: AdminLookupDto = {
        id: 4,
        category: 'vehicle_type',
        slug: 'bus',
        translations: [],
      };

      const entry = toLookupEntry(lookup);
      expect(entry).toEqual({
        id: 4,
        category: 'vehicle_type',
        slug: 'bus',
        enLabel: '-',
        enDescription: '-',
        thLabel: '-',
        thDescription: '-',
      });
    });
  });

  describe('toEntryFromPayload', () => {
    it('maps en/th label and description from the payload translations', () => {
      const payload: CreateLookupPayload = {
        category: 'role_status',
        slug: 'active',
        translations: [
          { locale: 'en', label: 'Active', description: 'EN desc' },
          { locale: 'th', label: 'ใช้งาน', description: 'TH desc' },
        ],
      };

      expect(toEntryFromPayload(payload, 7)).toEqual({
        id: 7,
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        enDescription: 'EN desc',
        thLabel: 'ใช้งาน',
        thDescription: 'TH desc',
      });
    });

    it('defaults label/description to "-" when the th translation is absent (create with en only)', () => {
      const payload: CreateLookupPayload = {
        category: 'role_status',
        slug: 'pending',
        translations: [{ locale: 'en', label: 'Pending' }],
      };

      const entry = toEntryFromPayload(payload, 0);
      expect(entry.thLabel).toBe('-');
      expect(entry.thDescription).toBe('-');
      expect(entry.enLabel).toBe('Pending');
      expect(entry.enDescription).toBe('-');
    });

    it('defaults label to "-" when the label is an empty string (falsy, not just missing)', () => {
      const payload: CreateLookupPayload = {
        category: 'role_status',
        slug: 'pending',
        translations: [{ locale: 'en', label: '' }],
      };

      expect(toEntryFromPayload(payload, 0).enLabel).toBe('-');
    });

    it('passes the given id through unchanged', () => {
      const payload: CreateLookupPayload = {
        category: 'role_status',
        slug: 'active',
        translations: [{ locale: 'en', label: 'Active' }],
      };

      expect(toEntryFromPayload(payload, 42).id).toBe(42);
      expect(toEntryFromPayload(payload, 0).id).toBe(0);
    });
  });

  describe('toLookupPayload', () => {
    it('trims and lowercases category/slug, trims label/description fields', () => {
      const payload = toLookupPayload({
        category: '  Role_Status  ',
        slug: '  Active  ',
        enLabel: '  Active  ',
        enDescription: '  EN desc  ',
        thLabel: '  ใช้งาน  ',
        thDescription: '  TH desc  ',
      });

      expect(payload.category).toBe('role_status');
      expect(payload.slug).toBe('active');
      expect(payload.translations).toEqual([
        { locale: 'en', label: 'Active', description: 'EN desc' },
        { locale: 'th', label: 'ใช้งาน', description: 'TH desc' },
      ]);
    });

    it('always includes the en translation, even when enLabel is blank', () => {
      const payload = toLookupPayload({
        category: 'role_status',
        slug: 'active',
        enLabel: '',
      });

      expect(payload.translations.length).toBe(1);
      expect(payload.translations[0]).toEqual({
        locale: 'en',
        label: '',
        description: undefined,
      });
    });

    it('sets enDescription to undefined when the trimmed description is empty', () => {
      const payload = toLookupPayload({
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        enDescription: '   ',
      });

      expect(payload.translations[0].description).toBeUndefined();
    });

    it('omits the th translation entirely when thLabel is blank', () => {
      const payload = toLookupPayload({
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        thLabel: '   ',
      });

      expect(payload.translations.length).toBe(1);
      expect(payload.translations.some((t) => t.locale === 'th')).toBeFalse();
    });

    it('includes the th translation, trimmed, when thLabel is present', () => {
      const payload = toLookupPayload({
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        thLabel: ' ใช้งาน ',
        thDescription: ' TH desc ',
      });

      expect(payload.translations).toContain({
        locale: 'th',
        label: 'ใช้งาน',
        description: 'TH desc',
      });
    });

    it('sets thDescription to undefined when thLabel is present but thDescription is blank', () => {
      const payload = toLookupPayload({
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        thLabel: 'ใช้งาน',
        thDescription: '   ',
      });

      const th = payload.translations.find((t) => t.locale === 'th');
      expect(th?.description).toBeUndefined();
    });

    it('defaults every field to an empty string when the raw form value is empty', () => {
      const payload = toLookupPayload({});
      expect(payload.category).toBe('');
      expect(payload.slug).toBe('');
      expect(payload.translations).toEqual([
        { locale: 'en', label: '', description: undefined },
      ]);
    });

    it('coerces non-string raw values via String(...)', () => {
      const payload = toLookupPayload({
        category: null,
        slug: undefined,
        enLabel: 123,
      });

      expect(payload.category).toBe('');
      expect(payload.slug).toBe('');
      expect(payload.translations[0].label).toBe('123');
    });
  });

  describe('toCategorySummary', () => {
    it('counts lookups per category', () => {
      const lookups: AdminLookupDto[] = [
        { id: 1, category: 'role_status', slug: 'active', translations: [] },
        { id: 2, category: 'booking_status', slug: 'paid', translations: [] },
        { id: 3, category: 'role_status', slug: 'inactive', translations: [] },
        { id: 4, category: 'role_status', slug: 'pending', translations: [] },
      ];

      const summary = toCategorySummary(lookups);
      expect(summary).toEqual([
        { name: 'role_status', count: 3 },
        { name: 'booking_status', count: 1 },
      ]);
    });

    it('sorts descending by count', () => {
      const lookups: AdminLookupDto[] = [
        { id: 1, category: 'a', slug: 'x', translations: [] },
        { id: 2, category: 'b', slug: 'y', translations: [] },
        { id: 3, category: 'b', slug: 'z', translations: [] },
      ];

      expect(toCategorySummary(lookups).map((c) => c.name)).toEqual(['b', 'a']);
    });

    it('returns an empty array for an empty list', () => {
      expect(toCategorySummary([])).toEqual([]);
    });
  });

  describe('toCategorySummaryFromEntries', () => {
    function entry(partial: Partial<LookupEntry>): LookupEntry {
      return {
        id: 1,
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        enDescription: '-',
        thLabel: 'ใช้งาน',
        thDescription: '-',
        ...partial,
      };
    }

    it('counts entries per category and sorts descending by count', () => {
      const entries: LookupEntry[] = [
        entry({ id: 1, category: 'role_status', slug: 'active' }),
        entry({ id: 2, category: 'booking_status', slug: 'paid' }),
        entry({ id: 3, category: 'role_status', slug: 'inactive' }),
      ];

      expect(toCategorySummaryFromEntries(entries)).toEqual([
        { name: 'role_status', count: 2 },
        { name: 'booking_status', count: 1 },
      ]);
    });

    it('returns an empty array when there are no entries', () => {
      expect(toCategorySummaryFromEntries([])).toEqual([]);
    });
  });

  describe('groupEntriesByCategory', () => {
    function entry(partial: Partial<LookupEntry>): LookupEntry {
      return {
        id: 1,
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        enDescription: '-',
        thLabel: 'ใช้งาน',
        thDescription: '-',
        ...partial,
      };
    }

    it('groups entries by category and sorts groups by category name ascending', () => {
      const entries: LookupEntry[] = [
        entry({ id: 1, category: 'role_status', slug: 'active' }),
        entry({ id: 2, category: 'booking_status', slug: 'paid' }),
        entry({ id: 3, category: 'role_status', slug: 'inactive' }),
      ];

      const groups = groupEntriesByCategory(entries);
      expect(groups.map((g) => g.category)).toEqual(['booking_status', 'role_status']);
      expect(groups[1].items.map((i) => i.slug)).toEqual(['active', 'inactive']);
    });

    it('returns an empty array for an empty entries list', () => {
      expect(groupEntriesByCategory([])).toEqual([]);
    });
  });

  describe('updateEntriesWithOptimistic', () => {
    function entry(partial: Partial<LookupEntry>): LookupEntry {
      return {
        id: 1,
        category: 'role_status',
        slug: 'active',
        enLabel: 'Active',
        enDescription: '-',
        thLabel: 'ใช้งาน',
        thDescription: '-',
        ...partial,
      };
    }

    it('prepends the new entry when original is null (create)', () => {
      const existing = [entry({ id: 1, slug: 'active' })];
      const created = entry({ id: 2, slug: 'inactive' });

      const result = updateEntriesWithOptimistic(existing, created, null);
      expect(result).toEqual([created, existing[0]]);
    });

    it('replaces only the entry matching BOTH category AND slug (edit)', () => {
      const original = entry({ id: 1, category: 'role_status', slug: 'active', enLabel: 'Active' });
      const sameSlugDifferentCategory = entry({
        id: 2,
        category: 'booking_status',
        slug: 'active',
        enLabel: 'Paid',
      });
      const sameCategoryDifferentSlug = entry({
        id: 3,
        category: 'role_status',
        slug: 'inactive',
        enLabel: 'Inactive',
      });
      const updated = entry({ id: 1, category: 'role_status', slug: 'active', enLabel: 'Enabled' });

      const result = updateEntriesWithOptimistic(
        [original, sameSlugDifferentCategory, sameCategoryDifferentSlug],
        updated,
        original
      );

      expect(result.find((e) => e.id === 1)?.enLabel).toBe('Enabled');
      expect(result.find((e) => e.id === 2)?.enLabel).toBe('Paid');
      expect(result.find((e) => e.id === 3)?.enLabel).toBe('Inactive');
      expect(result.length).toBe(3);
    });

    it('does not mutate the input array', () => {
      const existing = [entry({ id: 1 })];
      const result = updateEntriesWithOptimistic(existing, entry({ id: 2 }), null);
      expect(result).not.toBe(existing);
      expect(existing.length).toBe(1);
    });
  });
});

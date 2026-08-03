import {
  STOP_LOCALES,
  StopDetailForm,
  filterStopRows,
  toStopDetailForm,
  toStopRow,
  toStopUpdatePayload,
} from './stops.mappers';
import {
  AdminStopDetailDto,
  AdminStopSummaryDto,
} from '../../../../services/admin/admin-api.service';

describe('stops.mappers (OBRS-1022)', () => {
  describe('toStopRow', () => {
    const dto: AdminStopSummaryDto = {
      id: 7,
      slug: 'nong_chak',
      status: { slug: 'active', translations: { th: { label: 'ใช้งาน' }, en: { label: 'Active' } } },
      stopType: { slug: 'pickup', translations: { th: { label: 'จุดรับ' }, en: { label: 'Pickup' } } },
      translations: { th: { label: 'หนองชาก' }, en: { label: 'Nong Chak' } },
    };

    it('uses the requested locale', () => {
      expect(toStopRow(dto, 'th').name).toBe('หนองชาก');
      expect(toStopRow(dto, 'en').name).toBe('Nong Chak');
    });

    it('falls back to the slug when no translation exists at all', () => {
      const row = toStopRow({ id: 1, slug: 'ghost_stop' }, 'th');
      expect(row.name).toBe('ghost_stop');
    });
  });

  describe('toStopDetailForm', () => {
    it('always emits all three locales, even ones the stop has no row for', () => {
      // Today every stop's `en` address is empty and NO stop has a description in any
      // locale. A form built only from what exists would render almost nothing and hide
      // exactly the boxes this screen exists to fill.
      const dto: AdminStopDetailDto = {
        id: 3,
        slug: 'nong_chak',
        translations: { th: { label: 'หนองชาก' } },
        addresses: { th: 'ถนนตัวอย่าง' },
      };

      const form = toStopDetailForm(dto);

      expect(form.translations.map((t) => t.locale)).toEqual([...STOP_LOCALES]);
      expect(form.translations[0]).toEqual({
        locale: 'th',
        label: 'หนองชาก',
        description: '',
        address: 'ถนนตัวอย่าง',
      });
      // EMPTY, not 'หนองชาก'. The shared getAdminTranslationLabel helper falls back to any
      // locale that has content — right for a table cell, destructive here: it would pre-fill
      // the English box with the Thai name and the owner's next save would store it as the
      // English translation.
      expect(form.translations[1]).toEqual({ locale: 'en', label: '', description: '', address: '' });
      expect(form.translations[2]).toEqual({ locale: 'zh', label: '', description: '', address: '' });
    });

    it('does not leak one locale\'s landmark note into another locale\'s box', () => {
      const form = toStopDetailForm({
        id: 3,
        slug: 's',
        translations: { th: { label: 'หนองชาก', description: 'ติดร้านมือถือ' } },
      });

      expect(form.translations.find((t) => t.locale === 'en')?.description).toBe('');
    });

    it('carries the landmark note through', () => {
      const form = toStopDetailForm({
        id: 3,
        slug: 's',
        translations: { th: { label: 'หนองชาก', description: 'อยู่ติดกับร้านขายโทรศัพท์มือถือ' } },
      });

      expect(form.translations[0].description).toBe('อยู่ติดกับร้านขายโทรศัพท์มือถือ');
    });

    it('coerces a non-numeric coordinate to null rather than NaN', () => {
      const form = toStopDetailForm({ id: 3, slug: 's', latitude: 'not-a-number', longitude: '101.5' });

      expect(form.latitude).toBeNull();
      expect(form.longitude).toBe(101.5);
    });
  });

  describe('toStopUpdatePayload', () => {
    const baseForm = (): StopDetailForm => ({
      id: 3,
      slug: ' nong_chak ',
      provinceCode: 'chonburi',
      statusCode: 'active',
      stopTypeCode: 'pickup',
      latitude: 13.5,
      longitude: 101.5,
      primaryPhotoUrl: 'https://sb.example/storage/v1/object/public/b/stops/3/a.jpg',
      translations: [
        { locale: 'th', label: 'หนองชาก', description: 'ติดร้านมือถือ', address: 'ถนนตัวอย่าง' },
        { locale: 'en', label: 'Nong Chak', description: '', address: '' },
        { locale: 'zh', label: '', description: '', address: '' },
      ],
    });

    it('NEVER sends primaryPhotoUrl — the key must be absent, not null', () => {
      // The whole OBRS-580 guard: the server preserves the stored photo only while the key
      // is absent. A payload carrying `primaryPhotoUrl: null` would clear it, so a form save
      // would silently delete a photo the owner uploaded seconds earlier.
      const payload = toStopUpdatePayload(baseForm());

      expect('primaryPhotoUrl' in payload).toBeFalse();
    });

    it('drops locales with a blank label — the server requires a non-blank one', () => {
      const payload = toStopUpdatePayload(baseForm());

      expect(payload.translations.map((t) => t.locale)).toEqual(['th', 'en']);
      expect(payload.addresses['zh']).toBeUndefined();
    });

    it('keeps a blank description — clearing a landmark note is a real edit', () => {
      const payload = toStopUpdatePayload(baseForm());

      const en = payload.translations.find((t) => t.locale === 'en');
      expect(en?.description).toBe('');
    });

    it('trims the slug and the per-locale values', () => {
      const payload = toStopUpdatePayload(baseForm());

      expect(payload.slug).toBe('nong_chak');
      expect(payload.translations[0].description).toBe('ติดร้านมือถือ');
    });
  });

  describe('filterStopRows', () => {
    const rows = [
      { id: 1, slug: 'nong_chak', name: 'หนองชาก', status: 'Active', statusCode: 'active', stopType: 'Pickup', stopTypeCode: 'pickup' },
      { id: 2, slug: 'bang_saen', name: 'บางแสน', status: 'Active', statusCode: 'active', stopType: 'Dropoff', stopTypeCode: 'dropoff' },
    ];

    it('returns everything for a blank keyword', () => {
      expect(filterStopRows(rows, '   ').length).toBe(2);
    });

    it('matches case-insensitively on slug', () => {
      expect(filterStopRows(rows, 'NONG').map((r) => r.id)).toEqual([1]);
    });

    it('matches on the localized name', () => {
      expect(filterStopRows(rows, 'บางแสน').map((r) => r.id)).toEqual([2]);
    });
  });
});

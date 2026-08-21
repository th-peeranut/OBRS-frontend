import {
  STOP_LOCALES,
  StopDetailForm,
  filterStopRows,
  toReturnStopOptions,
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
      returnStopId: null,
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

  // -------------------------------------------------------------------------
  // OBRS-1481: the return boarding pin
  // -------------------------------------------------------------------------

  describe('the return boarding pin', () => {
    const detail: AdminStopDetailDto = {
      id: 7,
      slug: 'bts_mo_chit',
      status: { slug: 'active' },
      stopType: { slug: 'pickup' },
      province: { slug: 'bangkok' },
      translations: {},
      addresses: {},
    };

    it('reads a saved pin onto the form', () => {
      expect(toStopDetailForm({ ...detail, returnStopId: 12 }).returnStopId).toBe(12);
    });

    it('reads an absent pin as null rather than undefined', () => {
      // The select binds [ngValue]="null" for "ไม่กำหนด"; undefined would match no option and
      // the box would open blank on every unpinned stop.
      expect(toStopDetailForm(detail).returnStopId).toBeNull();
    });

    it('ALWAYS sends the key, including when it is null', () => {
      // The opposite rule to primaryPhotoUrl, and deliberately so: the server tells "leave it
      // alone" from "clear it" by key presence, so omitting a null here would make "ไม่กำหนด"
      // impossible to save.
      const form = { ...toStopDetailForm(detail), returnStopId: null } as StopDetailForm;

      const payload = toStopUpdatePayload(form);

      expect('returnStopId' in payload).toBeTrue();
      expect(payload.returnStopId).toBeNull();
    });

    it('sends the chosen id', () => {
      const form = { ...toStopDetailForm(detail), returnStopId: 12 } as StopDetailForm;

      expect(toStopUpdatePayload(form).returnStopId).toBe(12);
    });
  });

  describe('toReturnStopOptions', () => {
    const eligible: AdminStopSummaryDto[] = [
      { id: 2, slug: 'ds293', translations: { th: { label: 'ดีเอส293' }, en: { label: 'DS293' } } },
      { id: 3, slug: 'pt_srinakarin', translations: { en: { label: 'PT Srinakarin' } } },
    ];

    it('labels each choice in the requested locale, falling back to en then the slug', () => {
      const options = toReturnStopOptions(eligible, eligible, 'th', null);

      expect(options).toEqual([
        { id: 2, label: 'ดีเอส293' },
        { id: 3, label: 'PT Srinakarin' },
      ]);
    });

    it('adds the currently saved pin when it is no longer eligible', () => {
      const all = [
        ...eligible,
        { id: 9, slug: 'lat_krabang', translations: { th: { label: 'ลาดกระบัง' } } },
      ];

      const options = toReturnStopOptions(eligible, all, 'th', 9);

      expect(options.map((o) => o.id)).toEqual([2, 3, 9]);
      expect(options[2].label).toBe('ลาดกระบัง');
    });

    it('does not duplicate the saved pin when it IS eligible', () => {
      expect(toReturnStopOptions(eligible, eligible, 'th', 2).map((o) => o.id)).toEqual([2, 3]);
    });

    it('falls back to the bare id when the pinned stop is not in the stop list at all', () => {
      // Only reachable if a delete missed the pin row. Showing the id beats showing an empty box
      // that the next save would silently turn into null.
      const options = toReturnStopOptions(eligible, eligible, 'th', 404);

      expect(options[2]).toEqual({ id: 404, label: '404' });
    });
  });
});
import {
  Option,
  PromotionRow,
  ROUND_TRIP_SLUG,
  buildPromotionFormValues,
  buildPromotionOptionLists,
  hasDateRangeError,
  statusClass,
  toDateValue,
  toFallbackDto,
  toIsoString,
  toNumber,
  toPromotionPayload,
  toRow,
} from './promotions-page.mappers';
import { PromotionRespDto } from '../../../../services/admin/admin-api.service';

describe('promotions-page.mappers', () => {
  describe('statusClass', () => {
    it('maps "active" (case/whitespace-insensitively) to is-success', () => {
      expect(statusClass('active')).toBe('is-success');
      expect(statusClass('ACTIVE')).toBe('is-success');
      expect(statusClass('  Active  ')).toBe('is-success');
    });

    it('falls back to is-danger for anything else', () => {
      expect(statusClass('inactive')).toBe('is-danger');
      expect(statusClass('unknown')).toBe('is-danger');
      expect(statusClass('')).toBe('is-danger');
    });
  });

  describe('toNumber', () => {
    it('returns null for null/undefined/empty string', () => {
      expect(toNumber(null)).toBeNull();
      expect(toNumber(undefined)).toBeNull();
      expect(toNumber('')).toBeNull();
    });

    it('returns null for a non-numeric value', () => {
      expect(toNumber('abc')).toBeNull();
      expect(toNumber(NaN)).toBeNull();
    });

    it('parses a numeric string', () => {
      expect(toNumber('10')).toBe(10);
      expect(toNumber('0')).toBe(0);
      expect(toNumber('12.5')).toBe(12.5);
    });

    it('passes through a finite number', () => {
      expect(toNumber(5)).toBe(5);
      expect(toNumber(0)).toBe(0);
    });
  });

  describe('toDateValue', () => {
    it('returns null for null/undefined/empty string', () => {
      expect(toDateValue(null)).toBeNull();
      expect(toDateValue(undefined)).toBeNull();
      expect(toDateValue('')).toBeNull();
    });

    it('returns the same Date instance when given a valid Date', () => {
      const date = new Date('2026-01-01T00:00:00Z');
      expect(toDateValue(date)).toBe(date);
    });

    it('returns null for an invalid Date instance', () => {
      const invalid = new Date('not-a-date');
      expect(toDateValue(invalid)).toBeNull();
    });

    it('parses a valid date string', () => {
      const result = toDateValue('2026-01-01T00:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(new Date('2026-01-01T00:00:00Z').getTime());
    });

    it('returns null for an invalid date string', () => {
      expect(toDateValue('not-a-date')).toBeNull();
    });
  });

  describe('toIsoString', () => {
    it('returns null for a blank/invalid value', () => {
      expect(toIsoString(null)).toBeNull();
      expect(toIsoString('')).toBeNull();
      expect(toIsoString('not-a-date')).toBeNull();
    });

    it('returns an ISO string for a valid date value', () => {
      expect(toIsoString('2026-01-01T00:00:00Z')).toBe(
        new Date('2026-01-01T00:00:00Z').toISOString()
      );
    });

    it('returns an ISO string for a valid Date instance', () => {
      const date = new Date('2026-06-01T12:00:00Z');
      expect(toIsoString(date)).toBe(date.toISOString());
    });
  });

  describe('hasDateRangeError', () => {
    it('is true when endDateTime is earlier than startDateTime', () => {
      expect(
        hasDateRangeError('2026-06-10T00:00:00Z', '2026-06-01T00:00:00Z')
      ).toBeTrue();
    });

    it('is false when endDateTime equals startDateTime', () => {
      expect(
        hasDateRangeError('2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z')
      ).toBeFalse();
    });

    it('is false when endDateTime is after startDateTime', () => {
      expect(
        hasDateRangeError('2026-06-01T00:00:00Z', '2026-06-10T00:00:00Z')
      ).toBeFalse();
    });

    it('is false when either value is missing', () => {
      expect(hasDateRangeError(null, '2026-06-10T00:00:00Z')).toBeFalse();
      expect(hasDateRangeError('2026-06-01T00:00:00Z', null)).toBeFalse();
      expect(hasDateRangeError(null, null)).toBeFalse();
    });
  });

  describe('buildPromotionOptionLists', () => {
    it('builds discountType/status/autoApply options from the given labels', () => {
      const lists = buildPromotionOptionLists({
        discountTypePercentage: 'Percentage',
        discountTypeFixedAmount: 'Fixed Amount',
        statusActive: 'Active',
        statusInactive: 'Inactive',
        autoApplyYes: 'Yes',
        autoApplyNo: 'No',
      });

      expect(lists.discountTypeOptions).toEqual([
        { value: 'percentage', label: 'Percentage' },
        { value: 'fixed_amount', label: 'Fixed Amount' },
      ]);
      expect(lists.statusOptions).toEqual([
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ]);
      expect(lists.autoApplyOptions).toEqual([
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ]);
    });
  });

  describe('toRow', () => {
    const discountTypeOptions: Option[] = [
      { value: 'percentage', label: 'Percentage' },
      { value: 'fixed_amount', label: 'Fixed Amount' },
    ];

    const base: PromotionRespDto = {
      id: 2,
      slug: 'summer-sale',
      code: 'SUMMER10',
      discountType: 'percentage',
      status: 'active',
      discountValue: 10,
      maxDiscountAmount: 100,
      minBookingAmount: 500,
      startDateTime: '2026-01-01T00:00:00+07:00',
      endDateTime: null,
      usageLimit: 100,
      currentUsage: 3,
      autoApply: false,
    };

    it('prefers the FE known-option label over the parseAdminStatus fallback for discountType', () => {
      const row = toRow(base, 'en', discountTypeOptions);
      expect(row.discountTypeCode).toBe('percentage');
      expect(row.discountTypeLabel).toBe('Percentage');
    });

    it('falls back to the parseAdminStatus-derived name when discountType has no known option', () => {
      const row = toRow(
        { ...base, discountType: 'buy_one_get_one' },
        'en',
        discountTypeOptions
      );
      expect(row.discountTypeCode).toBe('buy_one_get_one');
      expect(row.discountTypeLabel).toBe('BUY ONE GET ONE');
    });

    it('maps numeric/date/usage fields straight through, with no date formatting applied', () => {
      const row = toRow(base, 'en', discountTypeOptions);
      expect(row.discountValue).toBe(10);
      expect(row.maxDiscountAmount).toBe(100);
      expect(row.minBookingAmount).toBe(500);
      expect(row.startDateTime).toBe('2026-01-01T00:00:00+07:00');
      expect(row.endDateTime).toBeNull();
      expect(row.usageLimit).toBe(100);
      expect(row.currentUsage).toBe(3);
      expect(row.statusCode).toBe('active');
      expect(row.autoApply).toBeFalse();
    });

    it('flags slug "round_trip" as isRoundTrip (case-insensitively)', () => {
      expect(toRow({ ...base, slug: ROUND_TRIP_SLUG }, 'en', discountTypeOptions).isRoundTrip).toBeTrue();
      expect(toRow({ ...base, slug: 'ROUND_TRIP' }, 'en', discountTypeOptions).isRoundTrip).toBeTrue();
      expect(toRow(base, 'en', discountTypeOptions).isRoundTrip).toBeFalse();
    });

    it('defaults code to "-" and currentUsage to 0 when missing', () => {
      const sparse: PromotionRespDto = { id: 5, discountType: 'percentage', status: 'active' };
      const row = toRow(sparse, 'en', discountTypeOptions);
      expect(row.code).toBe('-');
      expect(row.currentUsage).toBe(0);
      expect(row.slug).toBe('');
    });

    it('carries the translations collection through unchanged', () => {
      const translations = [{ locale: 'en', label: 'Summer Sale' }];
      const row = toRow({ ...base, translations }, 'en', discountTypeOptions);
      expect(row.translations).toBe(translations);
    });
  });

  describe('toFallbackDto', () => {
    const row: PromotionRow = {
      id: 2,
      slug: 'summer-sale',
      code: 'SUMMER10',
      discountTypeCode: 'percentage',
      discountTypeLabel: 'Percentage',
      discountValue: 10,
      maxDiscountAmount: 100,
      minBookingAmount: 500,
      startDateTime: '2026-01-01T00:00:00+07:00',
      endDateTime: null,
      usageLimit: 100,
      currentUsage: 3,
      statusCode: 'active',
      statusLabel: 'ACTIVE',
      autoApply: false,
      isRoundTrip: false,
    };

    it('maps a PromotionRow back into a PromotionRespDto shape', () => {
      expect(toFallbackDto(row)).toEqual({
        id: 2,
        slug: 'summer-sale',
        code: 'SUMMER10',
        discountType: 'percentage',
        status: 'active',
        discountValue: 10,
        maxDiscountAmount: 100,
        minBookingAmount: 500,
        startDateTime: '2026-01-01T00:00:00+07:00',
        endDateTime: null,
        usageLimit: 100,
        currentUsage: 3,
        autoApply: false,
        translations: undefined,
      });
    });

    it('defaults discountValue/minBookingAmount to undefined when null', () => {
      const fallback = toFallbackDto({ ...row, discountValue: null, minBookingAmount: null });
      expect(fallback.discountValue).toBeUndefined();
      expect(fallback.minBookingAmount).toBeUndefined();
    });
  });

  describe('buildPromotionFormValues', () => {
    const row: PromotionRow = {
      id: 2,
      slug: 'summer-sale',
      code: 'SUMMER10',
      discountTypeCode: 'percentage',
      discountTypeLabel: 'Percentage',
      discountValue: 10,
      maxDiscountAmount: 100,
      minBookingAmount: 500,
      startDateTime: '2026-01-01T00:00:00+07:00',
      endDateTime: null,
      usageLimit: 100,
      currentUsage: 3,
      statusCode: 'active',
      statusLabel: 'ACTIVE',
      autoApply: false,
      isRoundTrip: false,
    };

    it('prefers detail DTO values, falling back to the row for missing fields', () => {
      const dto: PromotionRespDto = {
        id: 2,
        discountValue: 15,
        status: 'inactive',
      };
      const values = buildPromotionFormValues(dto, row, 'en');
      expect(values['discountValue']).toBe(15);
      expect(values['status']).toBe('inactive');
      // Fields absent on the detail DTO fall back to the row.
      expect(values['slug']).toBe('summer-sale');
      expect(values['code']).toBe('SUMMER10');
      expect(values['discountType']).toBe('percentage');
      expect(values['maxDiscountAmount']).toBe(100);
      expect(values['minBookingAmount']).toBe(500);
      expect(values['usageLimit']).toBe(100);
      expect(values['autoApply']).toBe('false');
    });

    it('parses startDateTime/endDateTime into Date values (or null)', () => {
      const dto: PromotionRespDto = {
        id: 2,
        startDateTime: '2026-02-01T00:00:00Z',
        endDateTime: '2026-03-01T00:00:00Z',
      };
      const values = buildPromotionFormValues(dto, row, 'en');
      expect(values['startDateTime']).toEqual(new Date('2026-02-01T00:00:00Z'));
      expect(values['endDateTime']).toEqual(new Date('2026-03-01T00:00:00Z'));
    });

    it('resolves en/th label/description from translations, leaving an unmatched field blank', () => {
      const dto: PromotionRespDto = {
        id: 2,
        translations: [
          { locale: 'en', label: 'Summer Sale', description: 'EN desc' },
          { locale: 'th', label: 'ลดร้อนแรง' },
        ],
      };
      const values = buildPromotionFormValues(dto, row, 'en');
      expect(values['enLabel']).toBe('Summer Sale');
      expect(values['enDescription']).toBe('EN desc');
      expect(values['thLabel']).toBe('ลดร้อนแรง');
      // th entry has no description of its own; getAdminTranslation only
      // treats a locale match as "found" when it has a label or a
      // description, so the th match is used as-is (no further fallback).
      expect(values['thDescription']).toBe('');
    });

    // getAdminTranslationLabel/Description (admin-api.service, shared and
    // unmodified by this refactor) fall back to the first translation that
    // has ANY label/description when the requested locale isn't present at
    // all — so a dto with no zh entry resolves zhLabel/zhDescription to the
    // first (en) translation, not to ''. This is pre-existing shared-helper
    // behavior, not something introduced here; asserted explicitly so a
    // future change to the shared helper's fallback rule doesn't silently
    // change this page too.
    it('falls back zh label/description to the first available translation when zh is absent', () => {
      const dto: PromotionRespDto = {
        id: 2,
        translations: [
          { locale: 'en', label: 'Summer Sale', description: 'EN desc' },
          { locale: 'th', label: 'ลดร้อนแรง' },
        ],
      };
      const values = buildPromotionFormValues(dto, row, 'en');
      expect(values['zhLabel']).toBe('Summer Sale');
      expect(values['zhDescription']).toBe('EN desc');
    });

    it('defaults label/description fields to empty string when there are no translations at all', () => {
      const dto: PromotionRespDto = { id: 2 };
      const values = buildPromotionFormValues(dto, row, 'en');
      expect(values['enLabel']).toBe('');
      expect(values['enDescription']).toBe('');
      expect(values['thLabel']).toBe('');
      expect(values['thDescription']).toBe('');
      expect(values['zhLabel']).toBe('');
      expect(values['zhDescription']).toBe('');
    });
  });

  describe('toPromotionPayload', () => {
    it('lowercases slug/discountType/status and trims code, building the en translation', () => {
      const payload = toPromotionPayload({
        slug: 'Winter-Sale',
        code: ' WINTER10 ',
        discountType: ' Percentage ',
        discountValue: 10,
        startDateTime: new Date('2026-06-01T00:00:00Z'),
        status: ' Active ',
        autoApply: 'false',
        enLabel: 'Winter Sale',
        enDescription: ' EN desc ',
      });

      expect(payload.slug).toBe('winter-sale');
      expect(payload.code).toBe('WINTER10');
      expect(payload.discountType).toBe('percentage');
      expect(payload.status).toBe('active');
      expect(payload.autoApply).toBeFalse();
      expect(payload.translations).toEqual([
        { locale: 'en', label: 'Winter Sale', description: 'EN desc' },
      ]);
    });

    it('defaults blank minBookingAmount/usageLimit/discountValue to 0 (backend @NotNull)', () => {
      const payload = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: '',
        minBookingAmount: '',
        usageLimit: '',
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
      });

      expect(payload.discountValue).toBe(0);
      expect(payload.minBookingAmount).toBe(0);
      expect(payload.usageLimit).toBe(0);
    });

    it('leaves maxDiscountAmount as null when blank (no @NotNull default)', () => {
      const payload = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: 10,
        maxDiscountAmount: '',
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
      });

      expect(payload.maxDiscountAmount).toBeNull();
    });

    it('omits the th translation when thLabel is blank', () => {
      const payload = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
        thLabel: '   ',
      });

      expect(payload.translations.length).toBe(1);
      expect(payload.translations[0].locale).toBe('en');
    });

    it('includes the th translation, trimmed, when thLabel is present', () => {
      const payload = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
        thLabel: ' ลดราคา ',
        thDescription: ' TH desc ',
      });

      expect(payload.translations).toContain({
        locale: 'th',
        label: 'ลดราคา',
        description: 'TH desc',
      });
    });

    it('omits the zh translation when zhLabel is blank, includes it when present', () => {
      const withoutZh = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
      });
      expect(withoutZh.translations.some((t) => t.locale === 'zh')).toBeFalse();

      const withZh = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
        zhLabel: '促销',
      });
      expect(withZh.translations.some((t) => t.locale === 'zh')).toBeTrue();
    });

    it('sets description to undefined when the trimmed description is empty', () => {
      const payload = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
        enDescription: '   ',
      });
      expect(payload.translations[0].description).toBeUndefined();
    });

    it('parses autoApply from a string, case-insensitively', () => {
      expect(
        toPromotionPayload({
          slug: 'a',
          code: 'A',
          discountType: 'percentage',
          discountValue: 10,
          status: 'active',
          autoApply: 'True',
          enLabel: 'A',
        }).autoApply
      ).toBeTrue();

      expect(
        toPromotionPayload({
          slug: 'a',
          code: 'A',
          discountType: 'percentage',
          discountValue: 10,
          status: 'active',
          autoApply: 'garbage',
          enLabel: 'A',
        }).autoApply
      ).toBeFalse();
    });

    it('converts a Date startDateTime/endDateTime into an ISO string', () => {
      const payload = toPromotionPayload({
        slug: 'a',
        code: 'A',
        discountType: 'percentage',
        discountValue: 10,
        status: 'active',
        autoApply: 'true',
        enLabel: 'A',
        startDateTime: new Date('2026-06-01T00:00:00Z'),
        endDateTime: new Date('2026-06-10T00:00:00Z'),
      });
      expect(payload.startDateTime).toBe(new Date('2026-06-01T00:00:00Z').toISOString());
      expect(payload.endDateTime).toBe(new Date('2026-06-10T00:00:00Z').toISOString());
    });

    it('defaults missing fields to empty string', () => {
      const payload = toPromotionPayload({});
      expect(payload.slug).toBe('');
      expect(payload.code).toBe('');
      expect(payload.discountType).toBe('');
      expect(payload.status).toBe('');
      expect(payload.translations[0].label).toBe('');
    });
  });
});

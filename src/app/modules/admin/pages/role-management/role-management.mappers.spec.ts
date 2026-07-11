import {
  RoleRow,
  StatusOption,
  buildRoleFormValues,
  extractResponseArray,
  extractResponseData,
  filterRolesByStatus,
  isFilterStatusStale,
  sortRolesByLatestUpdated,
  statusClass,
  toLatestTimestamp,
  toRoleDetailFallback,
  toRolePayload,
  toRoleRow,
  toStatusOptions,
  toTimestamp,
} from './role-management.mappers';
import { AdminLookupDto, AdminRoleDto } from '../../../../services/admin/admin-api.service';

describe('role-management.mappers', () => {
  describe('statusClass', () => {
    it('maps ACTIVE (case-insensitively) to is-success', () => {
      expect(statusClass('active')).toBe('is-success');
      expect(statusClass('ACTIVE')).toBe('is-success');
    });

    it('maps any status containing PENDING to is-warning', () => {
      expect(statusClass('PENDING')).toBe('is-warning');
      expect(statusClass('approval_pending')).toBe('is-warning');
    });

    it('falls back to is-danger for anything else', () => {
      expect(statusClass('SUSPENDED')).toBe('is-danger');
      expect(statusClass('unknown')).toBe('is-danger');
    });
  });

  describe('toRoleRow', () => {
    const baseRole: AdminRoleDto = {
      id: 7,
      slug: 'owner',
      status: 'active',
      translations: [
        { locale: 'en', label: 'Owner', description: 'Owner EN desc' },
        { locale: 'th', label: 'เจ้าของ', description: 'Owner TH desc' },
      ],
      updatedAt: '2026-07-01T03:00:00Z',
    };

    it('maps slug/status and derives localized label/description from the given locale', () => {
      const row = toRoleRow(baseRole, 'en', 'en');
      expect(row.id).toBe(7);
      expect(row.slug).toBe('owner');
      expect(row.label).toBe('Owner');
      expect(row.description).toBe('Owner EN desc');
      expect(row.statusCode).toBe('active');
      expect(row.status).toBe('ACTIVE');
    });

    it('resolves the th-locale label/description when locale is th', () => {
      const row = toRoleRow(baseRole, 'th', 'th');
      expect(row.label).toBe('เจ้าของ');
      expect(row.description).toBe('Owner TH desc');
    });

    it('always derives en/th label/description pairs regardless of the requested locale', () => {
      const row = toRoleRow(baseRole, 'th', 'th');
      expect(row.enLabel).toBe('Owner');
      expect(row.enDescription).toBe('Owner EN desc');
      expect(row.thLabel).toBe('เจ้าของ');
      expect(row.thDescription).toBe('Owner TH desc');
    });

    it('falls back enLabel to role.name then slug, and enDescription/thLabel/thDescription to "-"', () => {
      const sparse: AdminRoleDto = { id: 1, slug: 'bare', status: 'active' };
      const row = toRoleRow(sparse, 'en', 'en');
      expect(row.enLabel).toBe('bare');
      expect(row.enDescription).toBe('-');
      expect(row.thLabel).toBe('-');
      expect(row.thDescription).toBe('-');
      expect(row.label).toBe('bare');
      expect(row.description).toBe('-');
    });

    it('falls back updatedAt to createdAt when updatedAt is missing', () => {
      const role: AdminRoleDto = {
        ...baseRole,
        updatedAt: undefined,
        createdAt: '2026-01-01T00:00:00Z',
      };
      const row = toRoleRow(role, 'en', 'en');
      expect(row.updatedAt).not.toBe('-');
    });

    // CRITICAL: dateLang (raw translate.currentLang) must be distinct from the
    // th/en-normalized `locale` used for label/description lookups. Passing
    // 'en' as locale (so label/description resolve to English) while passing
    // 'th' as dateLang must still produce the TH-formatted date, proving the
    // two parameters are wired independently and never collapsed into one
    // (same trap as toRouteRow/toUserRow).
    it('CRITICAL: uses dateLang, not the normalized locale, for the date format', () => {
      const rowThDate = toRoleRow(baseRole, 'en', 'th');
      const rowEnDate = toRoleRow(baseRole, 'en', 'en');

      expect(rowThDate.updatedAt).not.toBe(rowEnDate.updatedAt);
      // Locale-derived fields must be identical between the two calls — only
      // the date format differs.
      expect(rowThDate.label).toBe(rowEnDate.label);
      expect(rowThDate.description).toBe(rowEnDate.description);
    });
  });

  describe('toLatestTimestamp', () => {
    it('returns "-" for an empty roles array', () => {
      expect(toLatestTimestamp([], 'en')).toBe('-');
    });

    it('selects the max of updatedAt/createdAt across all roles', () => {
      const roles: AdminRoleDto[] = [
        { id: 1, slug: 'a', status: 'active', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 2, slug: 'b', status: 'active', updatedAt: '2026-07-01T00:00:00Z' },
        { id: 3, slug: 'c', status: 'active', createdAt: '2026-03-01T00:00:00Z' },
      ];
      const latest = toLatestTimestamp(roles, 'en');
      expect(latest).not.toBe('-');
    });

    it('ignores roles with no updatedAt/createdAt', () => {
      const roles: AdminRoleDto[] = [{ id: 1, slug: 'a', status: 'active' }];
      expect(toLatestTimestamp(roles, 'en')).toBe('-');
    });

    // CRITICAL: same dateLang-vs-locale distinction as toRoleRow.
    it('CRITICAL: uses dateLang (raw translate.currentLang) for the date format', () => {
      const roles: AdminRoleDto[] = [
        { id: 1, slug: 'a', status: 'active', updatedAt: '2026-07-01T03:00:00Z' },
      ];
      const thDate = toLatestTimestamp(roles, 'th');
      const enDate = toLatestTimestamp(roles, 'en');
      expect(thDate).not.toBe(enDate);
    });
  });

  describe('toStatusOptions', () => {
    it('filters lookups to the role_status category and localizes labels', () => {
      const lookups: AdminLookupDto[] = [
        {
          id: 1,
          category: 'role_status',
          slug: 'active',
          translations: [{ locale: 'th', label: 'ใช้งาน' }, { locale: 'en', label: 'Active' }],
        },
        { id: 2, category: 'user_status', slug: 'suspended', translations: [] },
        { id: 3, category: 'role_status', slug: 'pending', translations: [] },
      ];

      const options: StatusOption[] = toStatusOptions(lookups, [], 'th');
      expect(options).toEqual([
        { code: 'active', label: 'ใช้งาน' },
        { code: 'pending', label: 'pending' },
      ]);
    });

    it('falls back to deriving options from the roles list when no role_status lookups exist', () => {
      const roles: AdminRoleDto[] = [
        { id: 1, slug: 'a', status: 'active' },
        { id: 2, slug: 'b', status: 'active' },
        { id: 3, slug: 'c', status: 'suspended' },
      ];

      const options = toStatusOptions([], roles, 'en');
      expect(options.map((o) => o.code).sort()).toEqual(['active', 'suspended']);
    });

    it('excludes "unknown" status codes from the roles-derived fallback', () => {
      const roles: AdminRoleDto[] = [{ id: 1, slug: 'a', status: undefined }];
      const options = toStatusOptions([], roles, 'en');
      expect(options).toEqual([]);
    });
  });

  describe('toTimestamp', () => {
    it('returns 0 for null/undefined/invalid input', () => {
      expect(toTimestamp(null)).toBe(0);
      expect(toTimestamp(undefined)).toBe(0);
    });

    it('returns the epoch ms for a valid date string', () => {
      expect(toTimestamp('2026-01-01T00:00:00Z')).toBeGreaterThan(0);
    });
  });

  describe('sortRolesByLatestUpdated', () => {
    it('sorts roles descending by updatedAt (falling back to createdAt)', () => {
      const roles: AdminRoleDto[] = [
        { id: 1, slug: 'a', status: 'active', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 2, slug: 'b', status: 'active', updatedAt: '2026-07-01T00:00:00Z' },
        { id: 3, slug: 'c', status: 'active', createdAt: '2026-03-01T00:00:00Z' },
      ];

      expect(sortRolesByLatestUpdated(roles).map((r) => r.id)).toEqual([2, 3, 1]);
    });

    it('does not mutate the input array', () => {
      const roles: AdminRoleDto[] = [
        { id: 1, slug: 'a', status: 'active', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 2, slug: 'b', status: 'active', updatedAt: '2026-07-01T00:00:00Z' },
      ];
      const original = [...roles];
      sortRolesByLatestUpdated(roles);
      expect(roles).toEqual(original);
    });
  });

  describe('filterRolesByStatus', () => {
    const roles: RoleRow[] = [
      {
        id: 1,
        slug: 'owner',
        label: 'Owner',
        description: '-',
        enLabel: 'Owner',
        enDescription: '-',
        thLabel: 'เจ้าของ',
        thDescription: '-',
        status: 'ACTIVE',
        statusCode: 'active',
        updatedAt: '-',
      },
      {
        id: 2,
        slug: 'driver',
        label: 'Driver',
        description: '-',
        enLabel: 'Driver',
        enDescription: '-',
        thLabel: 'คนขับ',
        thDescription: '-',
        status: 'SUSPENDED',
        statusCode: 'suspended',
        updatedAt: '-',
      },
    ];

    it('returns all roles when statusFilter is empty', () => {
      expect(filterRolesByStatus(roles, '')).toEqual(roles);
    });

    it('filters to roles matching the given status code', () => {
      expect(filterRolesByStatus(roles, 'suspended').map((r) => r.id)).toEqual([2]);
    });

    it('returns [] when no role matches', () => {
      expect(filterRolesByStatus(roles, 'decommissioned')).toEqual([]);
    });
  });

  describe('isFilterStatusStale', () => {
    const options: StatusOption[] = [{ code: 'active', label: 'Active' }];

    it('is false for an empty filter', () => {
      expect(isFilterStatusStale('', options)).toBeFalse();
    });

    it('is false when the filter matches an available option', () => {
      expect(isFilterStatusStale('active', options)).toBeFalse();
    });

    it('is true when the filter no longer matches any available option', () => {
      expect(isFilterStatusStale('suspended', options)).toBeTrue();
    });
  });

  describe('toRolePayload', () => {
    it('lowercases the slug/status and builds en+th translations', () => {
      const payload = toRolePayload({
        slug: 'Bus-Operator',
        enLabel: ' Bus Operator ',
        enDescription: ' EN desc ',
        thLabel: ' พนักงานรถ ',
        thDescription: ' TH desc ',
        status: ' Active ',
      });

      expect(payload).toEqual({
        slug: 'bus-operator',
        status: 'active',
        translations: [
          { locale: 'en', label: 'Bus Operator', description: 'EN desc' },
          { locale: 'th', label: 'พนักงานรถ', description: 'TH desc' },
        ],
      });
    });

    it('sets description to undefined when the trimmed description is empty', () => {
      const payload = toRolePayload({
        slug: 'owner',
        enLabel: 'Owner',
        enDescription: '   ',
        thLabel: 'เจ้าของ',
        thDescription: '',
        status: 'active',
      });

      expect(payload.translations[0].description).toBeUndefined();
      expect(payload.translations[1].description).toBeUndefined();
    });

    it('defaults missing fields to empty string', () => {
      const payload = toRolePayload({});
      expect(payload.slug).toBe('');
      expect(payload.status).toBe('');
      expect(payload.translations[0].label).toBe('');
    });
  });

  describe('toRoleDetailFallback', () => {
    it('maps a RoleRow back into an AdminRoleDto shape', () => {
      const row: RoleRow = {
        id: 7,
        slug: 'owner',
        label: 'Owner',
        description: 'Owner desc',
        enLabel: 'Owner',
        enDescription: 'Owner EN desc',
        thLabel: 'เจ้าของ',
        thDescription: 'Owner TH desc',
        status: 'ACTIVE',
        statusCode: 'active',
        updatedAt: '-',
      };

      expect(toRoleDetailFallback(row)).toEqual({
        id: 7,
        slug: 'owner',
        name: 'Owner',
        description: 'Owner desc',
        status: 'active',
        translations: [
          { locale: 'en', label: 'Owner', description: 'Owner EN desc' },
          { locale: 'th', label: 'เจ้าของ', description: 'Owner TH desc' },
        ],
      });
    });

    it('turns "-" description/enDescription/thLabel/thDescription placeholders into empty/undefined', () => {
      const row: RoleRow = {
        id: 1,
        slug: 'bare',
        label: 'bare',
        description: '-',
        enLabel: 'bare',
        enDescription: '-',
        thLabel: '-',
        thDescription: '-',
        status: 'ACTIVE',
        statusCode: 'active',
        updatedAt: '-',
      };

      const fallback = toRoleDetailFallback(row);
      expect(fallback.description).toBe('');
      expect(fallback.translations).toEqual([
        { locale: 'en', label: 'bare', description: undefined },
        { locale: 'th', label: undefined, description: undefined },
      ]);
    });
  });

  describe('buildRoleFormValues', () => {
    const row: RoleRow = {
      id: 7,
      slug: 'owner',
      label: 'Owner',
      description: '-',
      enLabel: 'Owner',
      enDescription: '-',
      thLabel: 'เจ้าของ',
      thDescription: '-',
      status: 'ACTIVE',
      statusCode: 'active',
      updatedAt: '-',
    };

    it('prefers the detail DTO translations, falling back to the row', () => {
      const detail: AdminRoleDto = {
        id: 7,
        slug: 'owner',
        status: 'pending',
        translations: [
          { locale: 'en', label: 'Owner EN', description: 'Owner EN desc' },
          { locale: 'th', label: 'เจ้าของ TH', description: 'TH desc' },
        ],
      };

      const values = buildRoleFormValues(detail, row, 'en');
      expect(values['slug']).toBe('owner');
      expect(values['enLabel']).toBe('Owner EN');
      expect(values['enDescription']).toBe('Owner EN desc');
      expect(values['thLabel']).toBe('เจ้าของ TH');
      expect(values['thDescription']).toBe('TH desc');
      expect(values['status']).toBe('pending');
    });

    it('falls back to the row fields when the detail has no translations', () => {
      const sparseDetail: AdminRoleDto = { id: 7, slug: 'owner', status: 'active' };
      const values = buildRoleFormValues(sparseDetail, row, 'en');
      expect(values['enLabel']).toBe('Owner');
      expect(values['thLabel']).toBe('เจ้าของ');
    });

    it('replaces a bare "-" placeholder value with an empty string', () => {
      const sparseDetail: AdminRoleDto = { id: 1, slug: 'bare', status: 'active' };
      const bareRow: RoleRow = { ...row, enDescription: '-', thDescription: '-' };
      const values = buildRoleFormValues(sparseDetail, bareRow, 'en');
      expect(values['enDescription']).toBe('');
      expect(values['thDescription']).toBe('');
    });
  });

  describe('extractResponseData', () => {
    it('returns null for null/undefined input', () => {
      expect(extractResponseData(null)).toBeNull();
      expect(extractResponseData(undefined)).toBeNull();
    });

    it('unwraps the "data" field from a ResponseAPI-shaped object', () => {
      expect(extractResponseData({ data: { id: 1 } })).toEqual({ id: 1 });
    });

    it('returns null when the "data" field is present but null', () => {
      expect(extractResponseData({ data: null })).toBeNull();
    });

    it('returns the raw object when it has no "data" field at all', () => {
      expect(extractResponseData({})).toEqual({});
    });

    it('returns the raw value when it is not an object with a "data" field', () => {
      expect(extractResponseData('plain')).toBe('plain');
    });
  });

  describe('extractResponseArray', () => {
    it('returns the array from a ResponseAPI-shaped object', () => {
      expect(extractResponseArray({ data: [1, 2, 3] })).toEqual([1, 2, 3]);
    });

    it('returns [] when the unwrapped data is not an array', () => {
      expect(extractResponseArray({ data: { id: 1 } })).toEqual([]);
      expect(extractResponseArray(null)).toEqual([]);
    });
  });
});

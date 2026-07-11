import {
  RoleOption,
  StatusOption,
  UserRow,
  buildUserFormValues,
  extractRoleLabels,
  extractRoleSlugs,
  filterUsers,
  parseNameFromFullName,
  parseStatus,
  roleRequiredValidator,
  statusClass,
  toCreateUserPayload,
  toRoleOptions,
  toStatusOptions,
  toUpdateUserPayload,
  toUserDtoFallback,
  toUserRow,
} from './user-management.mappers';
import { AdminLookupDto, AdminRoleDto, AdminUserDto } from '../../../../services/admin/admin-api.service';

describe('user-management.mappers', () => {
  describe('statusClass', () => {
    it('maps ACTIVE (case-insensitively) to is-success', () => {
      expect(statusClass('active')).toBe('is-success');
      expect(statusClass('ACTIVE')).toBe('is-success');
    });

    it('maps any status containing PENDING to is-warning', () => {
      expect(statusClass('PENDING')).toBe('is-warning');
      expect(statusClass('approval_pending')).toBe('is-warning');
      expect(statusClass('APPROVAL_PENDING')).toBe('is-warning');
    });

    it('falls back to is-danger for anything else, including SUSPENDED (unlike routes.mappers)', () => {
      expect(statusClass('SUSPENDED')).toBe('is-danger');
      expect(statusClass('unknown')).toBe('is-danger');
    });
  });

  describe('parseStatus', () => {
    it('parses a plain string status', () => {
      expect(parseStatus('active', 'en')).toEqual({ code: 'active', name: 'ACTIVE' });
    });

    it('falls back to "unknown" for missing value', () => {
      expect(parseStatus(undefined, 'en').code).toBe('unknown');
    });
  });

  describe('extractRoleSlugs', () => {
    it('returns [] for null/undefined/empty input', () => {
      expect(extractRoleSlugs(null)).toEqual([]);
      expect(extractRoleSlugs(undefined)).toEqual([]);
      expect(extractRoleSlugs([])).toEqual([]);
    });

    it('extracts slugs from a string[] input', () => {
      expect(extractRoleSlugs(['admin', ' staff '])).toEqual(['admin', 'staff']);
    });

    it('extracts slugs from an AdminRoleDto[] input, trimming and dropping empties', () => {
      const roles: AdminRoleDto[] = [{ slug: 'admin' }, { slug: '  ' }, { slug: 'staff' }];
      expect(extractRoleSlugs(roles)).toEqual(['admin', 'staff']);
    });
  });

  describe('extractRoleLabels', () => {
    it('returns [] for null/undefined/empty input', () => {
      expect(extractRoleLabels(null, 'en')).toEqual([]);
      expect(extractRoleLabels(undefined, 'en')).toEqual([]);
    });

    it('passes through a string[] input as-is', () => {
      expect(extractRoleLabels(['admin', 'staff'], 'en')).toEqual(['admin', 'staff']);
    });

    it('prefers name, then localized translation, then en translation, then slug', () => {
      const roles: AdminRoleDto[] = [
        { slug: 'admin', name: 'Administrator' },
        {
          slug: 'staff',
          translations: [
            { locale: 'en', label: 'Staff Member' },
            { locale: 'th', label: 'พนักงาน' },
          ],
        },
        { slug: 'driver', translations: [{ locale: 'en', label: 'Driver' }] },
        { slug: 'bare' },
      ];

      expect(extractRoleLabels(roles, 'th')).toEqual([
        'Administrator',
        'พนักงาน',
        'Driver',
        'bare',
      ]);
    });
  });

  describe('toUserRow', () => {
    const baseUser: AdminUserDto = {
      id: 1,
      fullName: 'Mr John Doe',
      email: 'john@example.com',
      phoneNumber: '0812345678',
      status: 'active',
      roles: [{ slug: 'admin', name: 'Administrator' }],
      updatedAt: '2026-07-01T03:00:00Z',
    };

    it('maps roles, status and formats the date using dateLang', () => {
      const row = toUserRow(baseUser, 'en', 'en');
      expect(row.id).toBe(1);
      expect(row.fullName).toBe('Mr John Doe');
      expect(row.roleSlugs).toEqual(['admin']);
      expect(row.roles).toEqual(['Administrator']);
      expect(row.statusCode).toBe('active');
      expect(row.status).toBe('ACTIVE');
      expect(row.locked).toBeFalse();
    });

    it('CRITICAL: uses dateLang (raw translate.currentLang), not the normalized locale, for the date format', () => {
      // th and en produce differently-formatted dates via formatDisplayDateTime;
      // locale is normalized ('th'/'en') for role/status labels, but dateLang is
      // whatever raw language string the caller passes through. Passing 'en'
      // as locale (so role/status resolve to English) while passing 'th' as
      // dateLang must produce the TH-formatted date, proving the two are wired
      // to separate parameters and never collapsed into one.
      const rowThDate = toUserRow(baseUser, 'en', 'th');
      const rowEnDate = toUserRow(baseUser, 'en', 'en');

      expect(rowThDate.lastUpdated).not.toBe(rowEnDate.lastUpdated);
    });

    it('defaults missing fields to "-" and empty roles to ["-"]', () => {
      const sparse: AdminUserDto = { id: 2, status: 'suspended', roles: [] };
      const row = toUserRow(sparse, 'en', 'en');
      expect(row.fullName).toBe('-');
      expect(row.email).toBe('-');
      expect(row.phone).toBe('-');
      expect(row.roles).toEqual(['-']);
      expect(row.locked).toBeFalse();
    });

    it('falls back updatedAt to createdAt when updatedAt is missing', () => {
      const user: AdminUserDto = {
        ...baseUser,
        updatedAt: undefined,
        createdAt: '2026-01-01T00:00:00Z',
      };
      const row = toUserRow(user, 'en', 'en');
      expect(row.lastUpdated).not.toBe('-');
    });
  });

  describe('toUserDtoFallback', () => {
    it('maps a UserRow back into an AdminUserDto shape', () => {
      const row: UserRow = {
        id: 1,
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '0899999999',
        roleSlugs: ['admin', 'staff'],
        roles: ['Administrator', 'Staff'],
        status: 'ACTIVE',
        statusCode: 'active',
        lastUpdated: '-',
        locked: false,
      };

      expect(toUserDtoFallback(row)).toEqual({
        id: 1,
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phoneNumber: '0899999999',
        status: 'active',
        roles: ['admin', 'staff'],
      });
    });
  });

  describe('parseNameFromFullName', () => {
    it('splits a title + first + last name', () => {
      expect(parseNameFromFullName('Mr John Doe')).toEqual({
        title: 'Mr',
        firstName: 'John',
        middleName: '',
        lastName: 'Doe',
      });
    });

    it('splits a title + first + middle + last name', () => {
      expect(parseNameFromFullName('Mrs Jane Middle Doe')).toEqual({
        title: 'Mrs',
        firstName: 'Jane',
        middleName: 'Middle',
        lastName: 'Doe',
      });
    });

    it('handles no title token (first token is not a recognized title)', () => {
      expect(parseNameFromFullName('John Doe')).toEqual({
        title: '',
        firstName: 'John',
        middleName: '',
        lastName: 'Doe',
      });
    });

    it('handles a single-name input (no last name)', () => {
      expect(parseNameFromFullName('John')).toEqual({
        title: '',
        firstName: 'John',
        middleName: '',
        lastName: '',
      });
    });

    it('handles empty/undefined input', () => {
      expect(parseNameFromFullName('')).toEqual({
        title: '',
        firstName: '',
        middleName: '',
        lastName: '',
      });
      expect(parseNameFromFullName(undefined)).toEqual({
        title: '',
        firstName: '',
        middleName: '',
        lastName: '',
      });
    });
  });

  describe('buildUserFormValues', () => {
    const user: UserRow = {
      id: 1,
      fullName: 'Mr John Doe',
      email: 'john@example.com',
      phone: '0812345678',
      roleSlugs: ['admin'],
      roles: ['Administrator'],
      status: 'ACTIVE',
      statusCode: 'active',
      lastUpdated: '-',
      locked: false,
    };

    it('prefers the detail DTO fields, falling back to the row and parsed name', () => {
      const detail: AdminUserDto = {
        id: 1,
        title: 'Mr',
        firstName: 'Jonathan',
        lastName: 'Smith',
        email: 'jon@example.com',
        phoneNumber: '081-234-5678',
        status: 'pending',
        roles: ['admin', 'staff'],
        preferredLocale: 'en',
      };

      const values = buildUserFormValues(detail, user, 'en');
      expect(values['title']).toBe('Mr');
      expect(values['firstName']).toBe('Jonathan');
      expect(values['lastName']).toBe('Smith');
      // Non-digit characters stripped.
      expect(values['phoneNumber']).toBe('0812345678');
      expect(values['status']).toBe('pending');
      expect(values['roles']).toEqual(['admin', 'staff']);
      expect(values['preferredLocale']).toBe('en');
      expect(values['isPhoneNumberVerify']).toBe(true);
    });

    it('falls back to the parsed full name and row values when detail fields are missing', () => {
      const sparseDetail: AdminUserDto = { id: 1, roles: [] };
      const values = buildUserFormValues(sparseDetail, user, 'en');
      expect(values['firstName']).toBe('John');
      expect(values['lastName']).toBe('Doe');
      expect(values['email']).toBe('john@example.com');
      expect(values['roles']).toEqual(['admin']);
      expect(values['preferredLocale']).toBe('th');
    });

    it('defaults title to "Mr" when neither the detail nor the parsed name provide one', () => {
      const sparseDetail: AdminUserDto = { id: 1, roles: [] };
      const bareUser: UserRow = { ...user, fullName: 'John' };
      const values = buildUserFormValues(sparseDetail, bareUser, 'en');
      expect(values['title']).toBe('Mr');
    });
  });

  describe('toCreateUserPayload', () => {
    it('trims fields, lower-cases status, copies roles and sets pdpaConsent', () => {
      const payload = toCreateUserPayload({
        title: ' Mr ',
        firstName: ' John ',
        middleName: '  ',
        lastName: ' Doe ',
        email: ' john@example.com ',
        phoneNumber: ' 0812345678 ',
        password: ' secret123 ',
        preferredLocale: ' en ',
        status: ' Active ',
        roles: ['admin'],
      });

      expect(payload).toEqual({
        title: 'Mr',
        firstName: 'John',
        middleName: undefined,
        lastName: 'Doe',
        email: 'john@example.com',
        phoneNumber: '0812345678',
        password: 'secret123',
        preferredLocale: 'en',
        status: 'active',
        roles: ['admin'],
        pdpaConsent: true,
      });
    });

    it('sets middleName when non-empty', () => {
      const payload = toCreateUserPayload({ middleName: ' Middle ' });
      expect(payload.middleName).toBe('Middle');
    });
  });

  describe('toUpdateUserPayload', () => {
    it('trims fields, lower-cases status, copies roles and maps isPhoneNumberVerify', () => {
      const payload = toUpdateUserPayload({
        title: ' Mr ',
        firstName: ' John ',
        middleName: '',
        lastName: ' Doe ',
        email: ' john@example.com ',
        phoneNumber: ' 0812345678 ',
        isPhoneNumberVerify: true,
        preferredLocale: ' en ',
        status: ' Active ',
        roles: ['admin', 'staff'],
      });

      expect(payload).toEqual({
        title: 'Mr',
        firstName: 'John',
        middleName: undefined,
        lastName: 'Doe',
        email: 'john@example.com',
        phoneNumber: '0812345678',
        isPhoneNumberVerify: true,
        preferredLocale: 'en',
        status: 'active',
        roles: ['admin', 'staff'],
      });
    });

    it('does not carry a password/pdpaConsent field (unlike create)', () => {
      const payload = toUpdateUserPayload({ roles: [] }) as unknown as Record<string, unknown>;
      expect(payload['password']).toBeUndefined();
      expect(payload['pdpaConsent']).toBeUndefined();
    });
  });

  describe('roleRequiredValidator', () => {
    it('returns { required: true } for an empty/non-array value', () => {
      expect(roleRequiredValidator({ value: [] } as any)).toEqual({ required: true });
      expect(roleRequiredValidator({ value: null } as any)).toEqual({ required: true });
    });

    it('returns null for a non-empty array value', () => {
      expect(roleRequiredValidator({ value: ['admin'] } as any)).toBeNull();
    });
  });

  describe('toRoleOptions', () => {
    it('prefers name, then localized translation, then en, then slug', () => {
      const roles: AdminRoleDto[] = [
        { slug: 'admin', name: 'Administrator' },
        {
          slug: 'staff',
          translations: [{ locale: 'th', label: 'พนักงาน' }, { locale: 'en', label: 'Staff' }],
        },
        { slug: 'bare' },
      ];

      const options: RoleOption[] = toRoleOptions(roles, 'th');
      expect(options).toEqual([
        { slug: 'admin', label: 'Administrator' },
        { slug: 'staff', label: 'พนักงาน' },
        { slug: 'bare', label: 'bare' },
      ]);
    });
  });

  describe('toStatusOptions', () => {
    it('filters to the user_status category and localizes labels', () => {
      const lookups: AdminLookupDto[] = [
        {
          id: 1,
          category: 'user_status',
          slug: 'active',
          translations: [{ locale: 'th', label: 'ใช้งาน' }, { locale: 'en', label: 'Active' }],
        },
        { id: 2, category: 'route_status', slug: 'suspended', translations: [] },
        { id: 3, category: 'user_status', slug: 'pending', translations: [] },
      ];

      const options: StatusOption[] = toStatusOptions(lookups, 'th');
      expect(options).toEqual([
        { code: 'active', label: 'ใช้งาน' },
        { code: 'pending', label: 'pending' },
      ]);
    });
  });

  describe('filterUsers', () => {
    const users: UserRow[] = [
      {
        id: 1,
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '0812345678',
        roleSlugs: ['admin'],
        roles: ['Administrator'],
        status: 'ACTIVE',
        statusCode: 'active',
        lastUpdated: '-',
        locked: false,
      },
      {
        id: 2,
        fullName: 'Jane Smith',
        email: 'jane@example.com',
        phone: '0899999999',
        roleSlugs: ['staff'],
        roles: ['Staff'],
        status: 'PENDING',
        statusCode: 'pending',
        lastUpdated: '-',
        locked: false,
      },
    ];

    it('returns all users when no filters are applied', () => {
      expect(filterUsers(users, '', '', '')).toEqual(users);
    });

    it('filters by role', () => {
      expect(filterUsers(users, 'staff', '', '').map((u) => u.id)).toEqual([2]);
    });

    it('filters by status', () => {
      expect(filterUsers(users, '', 'active', '').map((u) => u.id)).toEqual([1]);
    });

    it('filters by keyword across name/email/phone/roles/status', () => {
      expect(filterUsers(users, '', '', 'jane').map((u) => u.id)).toEqual([2]);
      expect(filterUsers(users, '', '', '0812345678').map((u) => u.id)).toEqual([1]);
      expect(filterUsers(users, '', '', 'administrator').map((u) => u.id)).toEqual([1]);
    });

    it('combines role, status and keyword filters', () => {
      expect(filterUsers(users, 'admin', 'active', 'john').map((u) => u.id)).toEqual([1]);
      expect(filterUsers(users, 'admin', 'pending', 'john')).toEqual([]);
    });
  });
});

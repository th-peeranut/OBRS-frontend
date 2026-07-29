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
  prettifyRoleSlug,
  roleRequiredValidator,
  statusClass,
  toCreateUserPayload,
  toRoleFilterOptions,
  toRoleOptions,
  toStatusOptions,
  translateRoleSlug,
  translateStatusCode,
  toUpdateUserPayload,
  toUserDtoFallback,
  toUserRow,
} from './user-management.mappers';

// Stub mirroring TranslateService.instant()'s "missing key" contract: returns
// the key itself when there's no translation for it. Mirrors ADMIN.USERS.ROLE_NAMES
// in public/i18n/en.json for the 5 system role slugs (OBRS-330).
const ROLE_NAME_STUB: Record<string, string> = {
  'ADMIN.USERS.ROLE_NAMES.admin': 'Admin',
  'ADMIN.USERS.ROLE_NAMES.owner': 'Owner',
  'ADMIN.USERS.ROLE_NAMES.salesperson': 'Salesperson',
  'ADMIN.USERS.ROLE_NAMES.driver': 'Driver',
  'ADMIN.USERS.ROLE_NAMES.customer': 'Customer',
};
const stubTranslateFn = (key: string): string => ROLE_NAME_STUB[key] ?? key;

// Same missing-key contract, mirrors ADMIN.USERS.STATUS_NAMES in
// public/i18n/en.json for the 5 known `user_status` codes (OBRS-353).
const STATUS_NAME_STUB: Record<string, string> = {
  'ADMIN.USERS.STATUS_NAMES.active': 'Active',
  'ADMIN.USERS.STATUS_NAMES.inactive': 'Inactive',
  'ADMIN.USERS.STATUS_NAMES.pending_verification': 'Pending verification',
  'ADMIN.USERS.STATUS_NAMES.suspended': 'Suspended',
  'ADMIN.USERS.STATUS_NAMES.deleted': 'Deleted',
};
const stubStatusTranslateFn = (key: string): string => STATUS_NAME_STUB[key] ?? key;
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

  // OBRS-330: role chips localize via a fixed slug -> i18n-key mapping since
  // the user-summary endpoint sends roles as bare slug strings with no
  // translations attached (unlike status).
  describe('prettifyRoleSlug', () => {
    it('title-cases a simple slug', () => {
      expect(prettifyRoleSlug('driver')).toBe('Driver');
    });

    it('splits on underscores/hyphens/whitespace and title-cases each word', () => {
      expect(prettifyRoleSlug('some_role')).toBe('Some Role');
      expect(prettifyRoleSlug('another-custom-role')).toBe('Another Custom Role');
      expect(prettifyRoleSlug('MIXED_Case')).toBe('Mixed Case');
    });
  });

  describe('translateRoleSlug', () => {
    it('translates a known slug via the provided translateFn', () => {
      expect(translateRoleSlug('driver', stubTranslateFn)).toBe('Driver');
      expect(translateRoleSlug('owner', stubTranslateFn)).toBe('Owner');
    });

    it('is case-insensitive on the slug when building the i18n key', () => {
      expect(translateRoleSlug('DRIVER', stubTranslateFn)).toBe('Driver');
    });

    it('falls back to a prettified slug — never a raw i18n key — for an unknown slug', () => {
      expect(translateRoleSlug('some_role', stubTranslateFn)).toBe('Some Role');
      expect(translateRoleSlug('some_role', stubTranslateFn)).not.toContain('ADMIN.USERS.ROLE_NAMES');
    });
  });

  // OBRS-353: Status chip localizes the same way roles do (OBRS-330) —
  // Option A FE i18n takeover, since the backend's lookup_translations has
  // no zh rows for user_status.
  describe('translateStatusCode', () => {
    it('translates a known status code via the provided translateFn', () => {
      expect(translateStatusCode('active', stubStatusTranslateFn)).toBe('Active');
      expect(translateStatusCode('pending_verification', stubStatusTranslateFn)).toBe(
        'Pending verification'
      );
    });

    it('is case-insensitive on the code when building the i18n key', () => {
      expect(translateStatusCode('ACTIVE', stubStatusTranslateFn)).toBe('Active');
    });

    it('falls back to a prettified code — never a raw i18n key — for an unknown status code', () => {
      expect(translateStatusCode('some_status', stubStatusTranslateFn)).toBe('Some Status');
      expect(translateStatusCode('some_status', stubStatusTranslateFn)).not.toContain(
        'ADMIN.USERS.STATUS_NAMES'
      );
    });
  });

  describe('extractRoleLabels', () => {
    it('returns [] for null/undefined/empty input', () => {
      expect(extractRoleLabels(null, 'en')).toEqual([]);
      expect(extractRoleLabels(undefined, 'en')).toEqual([]);
    });

    it('passes through a string[] input as-is when no translateFn is supplied', () => {
      expect(extractRoleLabels(['admin', 'staff'], 'en')).toEqual(['admin', 'staff']);
    });

    it('localizes string-slug input via translateFn, falling back to prettified for unknown slugs', () => {
      expect(extractRoleLabels(['admin', 'driver', 'some_role'], 'en', stubTranslateFn)).toEqual([
        'Admin',
        'Driver',
        'Some Role',
      ]);
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
      const userWithLogin: AdminUserDto = { ...baseUser, lastLoginAt: '2026-07-10T02:00:00Z' };
      const rowThDate = toUserRow(userWithLogin, 'en', 'th');
      const rowEnDate = toUserRow(userWithLogin, 'en', 'en');

      expect(rowThDate.lastLogin).not.toBe(rowEnDate.lastLogin);
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

    // OBRS-182: real last-login activity.
    it('formats lastLogin and sets hasLoggedIn when lastLoginAt is present', () => {
      const user: AdminUserDto = { ...baseUser, lastLoginAt: '2026-07-10T02:00:00Z' };
      const row = toUserRow(user, 'en', 'en');
      expect(row.hasLoggedIn).toBeTrue();
      expect(row.lastLogin).not.toBe('-');
    });

    it('CRITICAL: does not fall back to updatedAt/createdAt when lastLoginAt is null — hasLoggedIn is false and lastLogin is the never-logged-in sentinel', () => {
      // baseUser has a real updatedAt; lastLoginAt is explicitly null. If a
      // fallback to updatedAt/createdAt were ever reintroduced into lastLogin,
      // this would fail because lastLogin would stop being '-'.
      const user: AdminUserDto = { ...baseUser, lastLoginAt: null };
      const row = toUserRow(user, 'en', 'en');
      expect(row.hasLoggedIn).toBeFalse();
      expect(row.lastLogin).toBe('-');
    });

    it('sets hasLoggedIn false when lastLoginAt is absent entirely (never provided by backend)', () => {
      const row = toUserRow(baseUser, 'en', 'en');
      expect(row.hasLoggedIn).toBeFalse();
    });

    // OBRS-330: the user-summary endpoint sends roles as bare slug strings
    // (unlike baseUser above, which uses the richer AdminRoleDto object
    // shape). Threading translateFn through toUserRow is what makes the
    // Roles column chip localize the same way the Status chip already does.
    it('localizes bare string role slugs via translateFn, falling back for an unknown slug', () => {
      const summaryUser: AdminUserDto = { ...baseUser, roles: ['owner', 'driver', 'some_role'] };
      const row = toUserRow(summaryUser, 'en', 'en', stubTranslateFn);
      expect(row.roleSlugs).toEqual(['owner', 'driver', 'some_role']);
      expect(row.roles).toEqual(['Owner', 'Driver', 'Some Role']);
    });

    it('without translateFn, string role slugs pass through unlocalized (backward-compatible default)', () => {
      const summaryUser: AdminUserDto = { ...baseUser, roles: ['owner'] };
      const row = toUserRow(summaryUser, 'en', 'en');
      expect(row.roles).toEqual(['owner']);
    });

    // OBRS-353: Status chip localization, mirroring the role tests above.
    it('localizes the status via translateFn using the STATUS_NAMES key, leaving statusCode untouched', () => {
      const row = toUserRow(baseUser, 'en', 'en', stubStatusTranslateFn);
      expect(row.statusCode).toBe('active');
      expect(row.status).toBe('Active');
    });

    it('without translateFn, status falls back to the BE label (old behavior preserved)', () => {
      const row = toUserRow(baseUser, 'en', 'en');
      expect(row.statusCode).toBe('active');
      expect(row.status).toBe('ACTIVE');
    });

    it('falls back to a prettified label — never a raw i18n key — for an unknown status code', () => {
      const summaryUser: AdminUserDto = { ...baseUser, status: 'some_status' };
      const row = toUserRow(summaryUser, 'en', 'en', stubStatusTranslateFn);
      expect(row.statusCode).toBe('some_status');
      expect(row.status).toBe('Some Status');
      expect(row.status).not.toContain('ADMIN.USERS.STATUS_NAMES');
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
        lastLogin: '-',
        hasLoggedIn: false,
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
      lastLogin: '-',
      hasLoggedIn: false,
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
      // OBRS-691: displayed grouped 3-3-4, regardless of the separator style the detail arrived with.
      expect(values['phoneNumber']).toBe('081-234-5678');
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

  // OBRS-847: pinned in BOTH directions. A filter that drops too much is the
  // same defect as one that drops too little — it would stop an OWNER
  // filtering their own staff, which is the only thing this dropdown is for.
  describe('toRoleFilterOptions', () => {
    const ALL_ROLES: RoleOption[] = [
      { slug: 'admin', label: 'Admin' },
      { slug: 'owner', label: 'Owner' },
      { slug: 'salesperson', label: 'Salesperson' },
      { slug: 'driver', label: 'Driver' },
      { slug: 'customer', label: 'Customer' },
    ];

    it('drops customer and admin for a non-platform caller (ADR-0114)', () => {
      const options = toRoleFilterOptions(ALL_ROLES, false);

      expect(options.map((option) => option.slug)).not.toContain('customer');
      expect(options.map((option) => option.slug)).not.toContain('admin');
    });

    it('keeps every staff role a non-platform caller CAN have in their list', () => {
      const options = toRoleFilterOptions(ALL_ROLES, false);

      expect(options).toEqual([
        { slug: 'owner', label: 'Owner' },
        { slug: 'salesperson', label: 'Salesperson' },
        { slug: 'driver', label: 'Driver' },
      ]);
    });

    it('returns the untouched list for a platform admin, who does see both', () => {
      const options = toRoleFilterOptions(ALL_ROLES, true);

      expect(options).toBe(ALL_ROLES);
    });

    // The backend sends slugs verbatim; nothing guarantees the casing or the
    // padding the exclusion list is written in.
    it('matches the excluded slugs case- and whitespace-insensitively', () => {
      const options = toRoleFilterOptions(
        [
          { slug: ' Customer ', label: 'Customer' },
          { slug: 'ADMIN', label: 'Admin' },
          { slug: 'driver', label: 'Driver' },
        ],
        false
      );

      expect(options).toEqual([{ slug: 'driver', label: 'Driver' }]);
    });

    // A future custom role is not the platform's business to hide.
    it('keeps an unknown custom role', () => {
      const options = toRoleFilterOptions([{ slug: 'dispatcher', label: 'Dispatcher' }], false);

      expect(options).toEqual([{ slug: 'dispatcher', label: 'Dispatcher' }]);
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
        lastLogin: '-',
        hasLoggedIn: false,
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
        lastLogin: '-',
        hasLoggedIn: false,
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

    // OBRS-330: user.roles now holds the LOCALIZED label (e.g. Thai "เจ้าของกิจการ"
    // for slug "owner"), which shares no substring with the English slug —
    // the keyword search must still match "owner" via roleSlugs, otherwise
    // search-by-slug silently breaks once the chip is localized.
    it('matches keyword search by raw role slug via roleSlugs, even when roles holds a non-overlapping localized label', () => {
      const localizedUsers: UserRow[] = [
        { ...users[0], roleSlugs: ['owner'], roles: ['เจ้าของกิจการ'] },
        users[1],
      ];
      expect(filterUsers(localizedUsers, '', '', 'owner').map((u) => u.id)).toEqual([1]);
    });
  });
});

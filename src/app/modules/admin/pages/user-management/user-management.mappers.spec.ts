import {
  RoleOption,
  StatusOption,
  UserRow,
  buildUserFormValues,
  extractRoleLabels,
  extractRoleSlugs,
  filterUsers,
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
      title: 'Mr',
      firstName: 'John',
      middleName: '',
      lastName: 'Doe',
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

    // OBRS-1230: the list endpoint (AdminUserDto) now sends the real name
    // parts and the guest flag directly - no more parsing/guessing from
    // fullName. toUserRow just carries them through, trimmed.
    it('carries the real title/firstName/middleName/lastName and guest flag through, trimmed', () => {
      const row = toUserRow(
        { ...baseUser, title: ' Mr ', middleName: ' ', guest: false },
        'en',
        'en'
      );
      expect(row.title).toBe('Mr');
      expect(row.firstName).toBe('John');
      expect(row.middleName).toBe('');
      expect(row.lastName).toBe('Doe');
      expect(row.guest).toBeFalse();
    });

    // OBRS-1230 / ADR-0123: the guest-shadow-user shape - title/middleName/
    // lastName are null, firstName holds the whole composed name (a backend
    // bug being fixed separately; the frontend's job here is only to carry
    // the parts through as-is, never to invent the missing ones).
    it('carries a guest-shaped row through with empty parts, never inventing a title/lastName', () => {
      const guestUser: AdminUserDto = {
        id: 9,
        title: undefined,
        firstName: 'Miss กุลธิดา นาใจคง',
        middleName: undefined,
        lastName: undefined,
        fullName: 'Miss กุลธิดา นาใจคง',
        status: 'active',
        roles: [],
        guest: true,
      };
      const row = toUserRow(guestUser, 'en', 'en');
      expect(row.title).toBe('');
      expect(row.firstName).toBe('Miss กุลธิดา นาใจคง');
      expect(row.lastName).toBe('');
      expect(row.guest).toBeTrue();
      expect(row.roles).toEqual(['-']);
    });

    it('defaults guest to false when the backend omits the field', () => {
      const row = toUserRow(baseUser, 'en', 'en');
      expect(row.guest).toBeFalse();
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
    it('maps a UserRow back into an AdminUserDto shape, carrying the real name parts and guest flag through (no invented values)', () => {
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
        title: '',
        firstName: 'Jane',
        middleName: '',
        lastName: 'Doe',
        guest: false,
      };

      expect(toUserDtoFallback(row)).toEqual({
        id: 1,
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phoneNumber: '0899999999',
        status: 'active',
        roles: ['admin', 'staff'],
        title: '',
        firstName: 'Jane',
        middleName: '',
        lastName: 'Doe',
        guest: false,
      });
    });

    // OBRS-1230: this is the pre-detail-fetch paint path - proves a
    // detail-fetch failure (which keeps whatever this produced) can never
    // leave a GUESSED name part behind for a guest row, only the real
    // (possibly empty) ones already on the row.
    it('carries a guest row through with empty title/lastName - no parseNameFromFullName guess reintroduced', () => {
      const guestRow: UserRow = {
        id: 9,
        fullName: 'Miss กุลธิดา นาใจคง',
        email: '-',
        phone: '-',
        roleSlugs: [],
        roles: ['-'],
        status: '-',
        statusCode: 'unknown',
        lastLogin: '-',
        hasLoggedIn: false,
        locked: false,
        title: '',
        firstName: 'Miss กุลธิดา นาใจคง',
        middleName: '',
        lastName: '',
        guest: true,
      };

      const fallback = toUserDtoFallback(guestRow);
      expect(fallback.title).toBe('');
      expect(fallback.firstName).toBe('Miss กุลธิดา นาใจคง');
      expect(fallback.lastName).toBe('');
      expect(fallback.guest).toBeTrue();
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
      title: 'Mr',
      firstName: 'John',
      middleName: '',
      lastName: 'Doe',
      guest: false,
    };

    // Control case (AC3.3): a normal user with a real title/first/last is
    // unaffected by the guest-name-fields change.
    it('prefers the detail DTO fields, falling back to the row', () => {
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

    // OBRS-1230: this used to assert a `parseNameFromFullName('Mr John Doe')` guess
    // recovered firstName/lastName when the detail omitted them. That guess is gone -
    // it now falls back to the ROW's own real name parts (populated by toUserRow from
    // the list endpoint), which happen to be the same values here because they were
    // never wrong to begin with.
    it('falls back to the row values (not a parsed guess) when detail fields are missing', () => {
      const sparseDetail: AdminUserDto = { id: 1, roles: [] };
      const values = buildUserFormValues(sparseDetail, user, 'en');
      expect(values['firstName']).toBe('John');
      expect(values['lastName']).toBe('Doe');
      expect(values['email']).toBe('john@example.com');
      expect(values['roles']).toEqual(['admin']);
      expect(values['preferredLocale']).toBe('th');
    });

    // OBRS-1231: this test used to assert the opposite - that a user with no title on
    // record opened the form already holding 'Mr'. Nothing downstream needed a value,
    // so the default only ever wrote a gender the person had not given, and a Save that
    // changed nothing else persisted it. The inverted assertion is the regression guard.
    it('leaves title blank when neither the detail nor the row provide one', () => {
      const sparseDetail: AdminUserDto = { id: 1, roles: [] };
      const bareUser: UserRow = { ...user, fullName: 'John', title: '' };
      const values = buildUserFormValues(sparseDetail, bareUser, 'en');
      expect(values['title']).toBe('');
    });

    // OBRS-1230 AC3.1 - the exact production defect: a guest-shaped detail
    // (title/middleName/lastName NULL, firstName holding the whole composed
    // name) plus a row whose fullName is the same composed string. Before
    // this fix, parseNameFromFullName('Miss กุลธิดา นาใจคง') invented
    // title='Miss' and lastName='นาใจคง' (splitting the composed name on
    // whitespace) purely because the real fields came back null - nothing
    // the admin ever entered. Now nothing is invented: a missing part stays
    // empty, and firstName is left exactly as the backend sent it (the
    // composed-name bug itself is the backend's fix, not this one's).
    it('OBRS-1230: does not invent title/lastName for a guest-shaped detail - firstName is left as the composed value, unsplit', () => {
      const guestDetail: AdminUserDto = {
        id: 42,
        // title/middleName/lastName omitted - the wire value is `null`, and
        // AdminUserDto's `?: string` fields already collapse that the same
        // way every other optional field on this DTO does (see toUserRow's
        // `?? ''` handling above); the point under test is that nothing
        // fills the gap with a guess.
        firstName: 'Miss กุลธิดา นาใจคง',
        roles: [],
        guest: true,
      };
      const guestRow: UserRow = {
        ...user,
        id: 42,
        fullName: 'Miss กุลธิดา นาใจคง',
        title: '',
        firstName: 'Miss กุลธิดา นาใจคง',
        middleName: '',
        lastName: '',
        roleSlugs: [],
        roles: ['-'],
        guest: true,
      };

      const values = buildUserFormValues(guestDetail, guestRow, 'en');
      expect(values['title']).toBe('');
      expect(values['lastName']).toBe('');
      expect(values['firstName']).toBe('Miss กุลธิดา นาใจคง');

      // The payload toUpdateUserPayload would build from these values must
      // recompose to a name IDENTICAL to the original - no duplication. The
      // old bug produced title=Miss + firstName='Miss กุลธิดา นาใจคง' +
      // lastName='นาใจคง', which the backend recomposed into
      // "Mr Miss กุลธิดา นาใจคง นาใจคง". Recomposing the SAME way here
      // (join every non-empty part with a space) must equal the original.
      const payload = toUpdateUserPayload(values);
      const recomposed = [payload.title, payload.firstName, payload.middleName, payload.lastName]
        .filter((part): part is string => Boolean(part && part.length > 0))
        .join(' ');
      expect(recomposed).toBe('Miss กุลธิดา นาใจคง');
    });

    // OBRS-1230 AC3.2 - the pre-detail paint path. Before the real detail
    // response arrives (or if the fetch fails - see initEditForm's catch
    // block, which deliberately KEEPS whatever this produced), the modal
    // paints from toUserDtoFallback(row). That fallback DTO must carry the
    // SAME real (non-guessed) parts through, so a detail-fetch failure can
    // never leave an invented title/lastName behind for a guest row.
    it('OBRS-1230: the pre-detail fallback path (toUserDtoFallback) never invents a value for a guest row either', () => {
      const guestRow: UserRow = {
        ...user,
        id: 42,
        fullName: 'Miss กุลธิดา นาใจคง',
        title: '',
        firstName: 'Miss กุลธิดา นาใจคง',
        middleName: '',
        lastName: '',
        roleSlugs: [],
        roles: ['-'],
        guest: true,
      };

      const values = buildUserFormValues(toUserDtoFallback(guestRow), guestRow, 'en');
      expect(values['title']).toBe('');
      expect(values['lastName']).toBe('');
      expect(values['firstName']).toBe('Miss กุลธิดา นาใจคง');
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

    // OBRS-1231: the DTO's @Size(min = 2) skips a null but NOT an empty string, so
    // sending '' for "no title" 400s even now that @NotBlank is gone. Omitting the key
    // is the only shape the backend reads as absent.
    it('omits title entirely when it is blank', () => {
      const payload = toCreateUserPayload({ title: '   ', firstName: 'John' });
      expect(payload.title).toBeUndefined();
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

    // OBRS-1231: the surface the owner actually hit - editing an existing user who has
    // no title. See the toCreateUserPayload twin for why '' is not an option.
    it('omits title entirely when it is blank', () => {
      const payload = toUpdateUserPayload({ title: '', firstName: 'John', roles: [] });
      expect(payload.title).toBeUndefined();
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

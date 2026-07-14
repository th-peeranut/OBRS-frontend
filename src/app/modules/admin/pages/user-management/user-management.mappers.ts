import { AbstractControl } from '@angular/forms';
import {
  AdminLookupDto,
  AdminRoleDto,
  AdminStatusDto,
  AdminUserDto,
  CreateUserPayload,
  UpdateUserPayload,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

// Pure mappers/formatters/normalizers extracted from UserManagementPageComponent
// (OBRS-232, mirroring OBRS-208's routes.mappers.ts and OBRS-214's
// schedules.mappers.ts). No Angular/service dependencies — every
// locale-dependent or translation-dependent value the original private
// methods pulled off `this` is now an explicit parameter, so these stay
// unit-testable in isolation.

export interface UserRow {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  roleSlugs: string[];
  roles: string[];
  status: string;
  statusCode: string;
  lastUpdated: string;
  // OBRS-182: real last-login activity, replacing lastUpdated as the primary
  // activity indicator shown in the list (lastUpdated is record-modified time,
  // not login activity — kept on the row but no longer the headline field).
  lastLogin: string;
  hasLoggedIn: boolean;
  locked: boolean;
}

export interface RoleOption {
  slug: string;
  label: string;
}

export interface StatusOption {
  code: string;
  label: string;
}

export function statusClass(status: string): string {
  const normalizedStatus = status.toUpperCase();

  if (normalizedStatus === 'ACTIVE') {
    return 'is-success';
  }

  if (normalizedStatus.includes('PENDING')) {
    return 'is-warning';
  }

  return 'is-danger';
}

export function parseStatus(
  value: string | AdminStatusDto | null | undefined,
  locale: string
): { code: string; name: string } {
  return parseAdminStatus(value, locale);
}

export function extractRoleSlugs(
  roles: Array<string | AdminRoleDto> | null | undefined
): string[] {
  if (!roles || roles.length === 0) {
    return [];
  }

  return roles
    .map((role) => {
      if (typeof role === 'string') {
        return role;
      }

      return role.slug ?? '';
    })
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0);
}

// OBRS-330: the user-summary endpoint sends `roles` as bare slug strings
// (Role::getSlug) with no translations attached — unlike status, which the
// backend sends as a rich object with translations. To still localize the
// role chips, the FE owns a fixed slug -> i18n-key mapping for the 5
// system roles (see public/i18n/*.json ADMIN.USERS.ROLE_NAMES) and this
// takes a translateFn callback (typically `key => translate.instant(key)`)
// so the mapper itself stays a pure, Angular-free function per the file
// header note. Any slug outside the known set (a future custom role) falls
// back to a prettified version of the slug, never a raw i18n key.
export const ROLE_NAME_TRANSLATION_PREFIX = 'ADMIN.USERS.ROLE_NAMES.';

export function prettifyRoleSlug(slug: string): string {
  return slug
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function translateRoleSlug(
  slug: string,
  translateFn: (key: string) => string
): string {
  const trimmedSlug = slug.trim();
  if (trimmedSlug.length === 0) {
    return trimmedSlug;
  }

  const key = `${ROLE_NAME_TRANSLATION_PREFIX}${trimmedSlug.toLowerCase()}`;
  const translated = translateFn(key);

  // ngx-translate's instant() returns the key itself when no translation is
  // found — that's how we detect an unknown/custom slug and fall back to a
  // readable label instead of leaking a raw i18n key into the UI.
  if (!translated || translated === key) {
    return prettifyRoleSlug(trimmedSlug);
  }

  return translated;
}

export function extractRoleLabels(
  roles: Array<string | AdminRoleDto> | null | undefined,
  locale: string,
  translateFn?: (key: string) => string
): string[] {
  if (!roles || roles.length === 0) {
    return [];
  }

  return roles
    .map((role) => {
      if (typeof role === 'string') {
        return translateFn ? translateRoleSlug(role, translateFn) : role;
      }

      return (
        role.name ??
        getAdminTranslationLabel(role.translations, locale) ??
        getAdminTranslationLabel(role.translations, 'en') ??
        role.slug
      );
    })
    .map((label) => String(label ?? '').trim())
    .filter((label) => label.length > 0);
}

export function toUserRow(
  user: AdminUserDto,
  locale: string,
  dateLang: string | null | undefined,
  translateFn?: (key: string) => string
): UserRow {
  const roleSlugs = extractRoleSlugs(user.roles);
  const roleLabels = extractRoleLabels(user.roles, locale, translateFn);
  const status = parseStatus(user.status, locale);

  return {
    id: user.id,
    fullName: user.fullName ?? '-',
    email: user.email ?? '-',
    phone: user.phoneNumber ?? '-',
    roleSlugs,
    roles: roleLabels.length > 0 ? roleLabels : ['-'],
    status: status.name,
    statusCode: status.code,
    // The user record's last-modified time (updatedAt, falling back to createdAt).
    // NOT a real login/activity time — labeled "อัปเดตล่าสุด" accordingly; a true
    // last_login_at is tracked as a backlog item (OBRS-182).
    //
    // dateLang is deliberately the RAW translate.currentLang, NOT the
    // th/en-normalized `locale` used above for role/status labels — passing the
    // normalized locale here would silently change the date format under en-US
    // (see toRouteRow in routes.mappers.ts for the same trap).
    lastUpdated: formatDisplayDateTime(user.updatedAt ?? user.createdAt, dateLang),
    // Real login activity (OBRS-182) — formatDisplayDateTime already returns
    // '-' for a null/undefined lastLoginAt, but the row never displays that
    // '-'; the template branches on hasLoggedIn and shows the
    // NEVER_LOGGED_IN translation instead, so this never silently falls back
    // to updatedAt/createdAt.
    lastLogin: formatDisplayDateTime(user.lastLoginAt, dateLang),
    hasLoggedIn: Boolean(user.lastLoginAt),
    locked: user.locked ?? false,
  };
}

export function toUserDtoFallback(user: UserRow): AdminUserDto {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phone,
    status: user.statusCode,
    roles: [...user.roleSlugs],
  };
}

export function parseNameFromFullName(fullName: string | null | undefined): {
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
} {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return { title: '', firstName: '', middleName: '', lastName: '' };
  }

  const titleTokens = new Set(['mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'dr', 'dr.']);
  let title = '';
  if (titleTokens.has(parts[0].toLowerCase())) {
    title = parts.shift() ?? '';
  }

  const firstName = parts.shift() ?? '';
  if (parts.length === 0) {
    return { title, firstName, middleName: '', lastName: '' };
  }

  const lastName = parts.pop() ?? '';
  const middleName = parts.join(' ');
  return { title, firstName, middleName, lastName };
}

// The pure value-derivation half of the original applyUserFormValues: builds
// the form `values` record from the fetched detail (falling back to the
// already-known row). The onlyPristine-vs-reset branching stays in the
// component since it mutates the live FormGroup.
export function buildUserFormValues(
  userDetail: AdminUserDto,
  user: UserRow,
  locale: string
): Record<string, unknown> {
  const parsedName = parseNameFromFullName(userDetail.fullName ?? user.fullName);
  const roles = extractRoleSlugs(userDetail.roles);
  const status = parseStatus(userDetail.status ?? user.statusCode, locale);

  return {
    title: String((userDetail.title ?? parsedName.title) || 'Mr').trim(),
    firstName: String(userDetail.firstName ?? parsedName.firstName ?? '').trim(),
    middleName: String(userDetail.middleName ?? parsedName.middleName ?? '').trim(),
    lastName: String(userDetail.lastName ?? parsedName.lastName ?? '').trim(),
    email: userDetail.email ?? user.email,
    phoneNumber: String(userDetail.phoneNumber ?? user.phone).replace(/\D/g, ''),
    preferredLocale: userDetail.preferredLocale ?? 'th',
    status: status.code,
    roles: roles.length > 0 ? roles : [...user.roleSlugs],
    isPhoneNumberVerify: true,
  };
}

export function toCreateUserPayload(raw: Record<string, unknown>): CreateUserPayload {
  return {
    title: String(raw['title'] ?? '').trim(),
    firstName: String(raw['firstName'] ?? '').trim(),
    middleName: String(raw['middleName'] ?? '').trim() || undefined,
    lastName: String(raw['lastName'] ?? '').trim(),
    email: String(raw['email'] ?? '').trim(),
    phoneNumber: String(raw['phoneNumber'] ?? '').trim(),
    password: String(raw['password'] ?? '').trim(),
    preferredLocale: String(raw['preferredLocale'] ?? 'th').trim(),
    status: String(raw['status'] ?? '').trim().toLowerCase(),
    roles: [...((raw['roles'] as string[] | null | undefined) ?? [])],
    // Backend requires PDPA consent on user creation (UserReqDto extends SignUpReqDto).
    // Admin-created accounts record consent on behalf of the operator.
    pdpaConsent: true,
  };
}

export function toUpdateUserPayload(raw: Record<string, unknown>): UpdateUserPayload {
  return {
    title: String(raw['title'] ?? '').trim(),
    firstName: String(raw['firstName'] ?? '').trim(),
    middleName: String(raw['middleName'] ?? '').trim() || undefined,
    lastName: String(raw['lastName'] ?? '').trim(),
    email: String(raw['email'] ?? '').trim(),
    phoneNumber: String(raw['phoneNumber'] ?? '').trim(),
    isPhoneNumberVerify: Boolean(raw['isPhoneNumberVerify']),
    preferredLocale: String(raw['preferredLocale'] ?? 'th').trim(),
    status: String(raw['status'] ?? '').trim().toLowerCase(),
    roles: [...((raw['roles'] as string[] | null | undefined) ?? [])],
  };
}

export function roleRequiredValidator(control: AbstractControl): { required: true } | null {
  const value = control.value;
  if (Array.isArray(value) && value.length > 0) {
    return null;
  }

  return { required: true };
}

export function toRoleOptions(rawRoles: AdminRoleDto[], locale: string): RoleOption[] {
  return rawRoles.map((role) => ({
    slug: role.slug,
    label:
      role.name ??
      getAdminTranslationLabel(role.translations, locale) ??
      getAdminTranslationLabel(role.translations, 'en') ??
      role.slug,
  }));
}

export function toStatusOptions(rawLookups: AdminLookupDto[], locale: string): StatusOption[] {
  return rawLookups
    .filter((lookup) => lookup.category === 'user_status')
    .map((lookup) => ({
      code: lookup.slug,
      label:
        getAdminTranslationLabel(lookup.translations, locale) ??
        getAdminTranslationLabel(lookup.translations, 'en') ??
        lookup.slug,
    }));
}

export function filterUsers(
  users: UserRow[],
  roleFilter: string,
  statusFilter: string,
  keyword: string
): UserRow[] {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return users.filter((user) => {
    const matchRole =
      roleFilter.length === 0 ||
      user.roleSlugs.some((role) => role.trim().toLowerCase() === roleFilter);
    if (!matchRole) {
      return false;
    }

    const matchStatus =
      statusFilter.length === 0 || user.statusCode.trim().toLowerCase() === statusFilter;
    if (!matchStatus) {
      return false;
    }

    if (normalizedKeyword.length === 0) {
      return true;
    }

    // Roles are now localized display labels (OBRS-330), so include the raw
    // slugs too — otherwise searching by the English slug (e.g. "owner")
    // stops matching once the chip renders as "เจ้าของกิจการ" under Thai/中文.
    const searchTarget = [
      user.fullName,
      user.email,
      user.phone,
      user.roles.join(' '),
      user.roleSlugs.join(' '),
      user.status,
    ]
      .join(' ')
      .toLowerCase();

    return searchTarget.includes(normalizedKeyword);
  });
}

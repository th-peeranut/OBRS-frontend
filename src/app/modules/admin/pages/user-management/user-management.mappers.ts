import { AbstractControl } from '@angular/forms';
import {
  AdminLookupDto,
  AdminRoleDto,
  AdminStatusDto,
  AdminUserDto,
  CreateUserPayload,
  UpdateUserPayload,
  UpdateUserSalesPointsPayload,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import { formatThaiMobile, stripPhoneSeparators } from '../../../../shared/constants/thai-msisdn';

// Pure mappers/formatters/normalizers extracted from UserManagementPageComponent
// (OBRS-232, mirroring OBRS-208's routes.mappers.ts and OBRS-214's
// schedules.mappers.ts). No Angular/service dependencies — every
// locale-dependent or translation-dependent value the original private
// methods pulled off `this` is now an explicit parameter, so these stay
// unit-testable in isolation.

// OBRS-1255: the fields that can genuinely be absent are `string | null`, and the `-` a reader
// sees is written by the TEMPLATE. They used to be `string` with toUserRow substituting `'-'`, and
// that dash was not display-only for long: buildUserFormValues seeded the form from the row, the
// email control is disabled in edit mode but getRawValue() reads disabled controls anyway, and so
// `"email":"-"` went up in the payload of every guest save and came back 400 VALIDATION_FAILED.
// A placeholder that lives in the model is a value; only one that lives in the view is a
// placeholder.
export interface UserRow {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleSlugs: string[];
  roles: string[];
  status: string;
  statusCode: string;
  lastLogin: string;
  hasLoggedIn: boolean;
  locked: boolean;
  // OBRS-1230: real (not composed/guessed) name parts, now sent by the list
  // endpoint (AdminUserDto) as well as the detail one. Optional so a UserRow
  // built before this field existed still type-checks — toUserRow always
  // fills these concretely (never leaves them undefined).
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  // OBRS-1558: the LINE driver board's name for this person. Optional here for the same reason
  // the four above are.
  nickname?: string;
  // OBRS-1230 / ADR-0123: true for a guest shadow user — zero roles by
  // design (a row that can never authenticate carries no authority), so the
  // Roles column can render an explanatory chip instead of "-".
  guest?: boolean;
}

export interface RoleOption {
  slug: string;
  label: string;
}

export interface StatusOption {
  code: string;
  label: string;
}

/**
 * OBRS-1258: sentinel for "no active sales point" on the Active Sales Point dropdown.
 *
 * `app-admin-dropdown` coerces every option value and its own empty-selection check
 * through `String(x ?? '')` (`admin-dropdown.component.ts:33,54,96`), so a `null`-mapped
 * option would be indistinguishable from "nothing chosen yet" — a non-empty sentinel is
 * genuinely required here, same shape as `expenses-page.mappers.ts`'s `VEHICLE_CENTRAL_SENTINEL`.
 *
 * This is a DEVIATION from `docs/design-system.md` §3.1's placeholder-first shape, not a
 * byte-for-byte reuse of it: §3.1 starts a select genuinely empty (placeholder shown) and
 * relies on `Validators.required` to force an explicit choice. Here "ไม่กำหนด" (not set) is
 * itself a legitimate resting answer for a salesperson, so this sentinel is PRE-SEEDED (never
 * the placeholder-empty state) and the control carries no `required` validator — see
 * `UserFormModalComponent`'s form group / `initCreateForm` for where it's seeded.
 */
export const SALES_POINT_ACTIVE_NONE = 'SALES_POINT_ACTIVE_NONE';

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

// OBRS-353: mirrors OBRS-330's role-slug takeover, applied to status. The
// user-summary endpoint's `status` DOES come back as a rich AdminStatusDto
// with a pre-localized `name`/`label` (unlike the bare role slugs above) —
// but the backend's `lookup_translations` table only has en/th rows, no zh,
// so under a Chinese UI that pre-localized label silently stays Thai. This
// is a deliberate FE i18n takeover (Option A): the FE owns a fixed
// code -> i18n-key mapping for the 5 known `user_status` codes (see
// public/i18n/*.json ADMIN.USERS.STATUS_NAMES) instead of changing the
// backend contract. Any code outside the known set falls back to the same
// prettified-slug helper roles use, never a raw i18n key.
export const STATUS_NAME_TRANSLATION_PREFIX = 'ADMIN.USERS.STATUS_NAMES.';

export function translateStatusCode(
  code: string,
  translateFn: (key: string) => string
): string {
  const trimmedCode = code.trim();
  if (trimmedCode.length === 0) {
    return trimmedCode;
  }

  const key = `${STATUS_NAME_TRANSLATION_PREFIX}${trimmedCode.toLowerCase()}`;
  const translated = translateFn(key);

  // Same missing-key detection as translateRoleSlug: ngx-translate's
  // instant() returns the key itself when there's no translation for it.
  if (!translated || translated === key) {
    return prettifyRoleSlug(trimmedCode);
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
    // `fullName` and `roles` below keep their '-' fallback: neither is ever read back into a
    // payload (the form is built from the four name PARTS and from roleSlugs), so for those two
    // the dash really is display-only. `email`/`phone` are the pair that round-trips (OBRS-1255).
    fullName: user.fullName ?? '-',
    email: user.email ?? null,
    phone: user.phoneNumber ?? null,
    roleSlugs,
    roles: roleLabels.length > 0 ? roleLabels : ['-'],
    // OBRS-353: FE i18n takeover for the Status chip (see translateStatusCode
    // above) — without translateFn this preserves the old BE-label behavior
    // exactly, same fallback contract as extractRoleLabels/roles above.
    status: translateFn ? translateStatusCode(status.code, translateFn) : status.name,
    statusCode: status.code,
    // dateLang is deliberately the RAW translate.currentLang, NOT the
    // th/en-normalized `locale` used above for role/status labels — passing the
    // normalized locale here would silently change the date format under en-US
    // (see toRouteRow in routes.mappers.ts for the same trap).
    //
    // Real login activity (OBRS-182) — formatDisplayDateTime already returns
    // '-' for a null/undefined lastLoginAt, but the row never displays that
    // '-'; the template branches on hasLoggedIn and shows the
    // NEVER_LOGGED_IN translation instead, so this never silently falls back
    // to updatedAt/createdAt.
    lastLogin: formatDisplayDateTime(user.lastLoginAt, dateLang),
    hasLoggedIn: Boolean(user.lastLoginAt),
    locked: user.locked ?? false,
    title: String(user.title ?? '').trim(),
    firstName: String(user.firstName ?? '').trim(),
    middleName: String(user.middleName ?? '').trim(),
    lastName: String(user.lastName ?? '').trim(),
    nickname: String(user.nickname ?? '').trim(),
    guest: user.guest ?? false,
  };
}

export function toUserDtoFallback(user: UserRow): AdminUserDto {
  return {
    id: user.id,
    fullName: user.fullName,
    // OBRS-1255: `?? undefined` rather than `?? ''` — this stands in for a DTO the server has not
    // answered with yet, and on the wire an absent email is absent, not empty.
    email: user.email ?? undefined,
    phoneNumber: user.phone ?? undefined,
    status: user.statusCode,
    roles: [...user.roleSlugs],
    title: user.title,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    nickname: user.nickname,
    guest: user.guest,
  };
}

// The pure value-derivation half of the original applyUserFormValues: builds
// the form `values` record from the fetched detail (falling back to the
// already-known row). The onlyPristine-vs-reset branching stays in the
// component since it mutates the live FormGroup.
//
// OBRS-1230: this used to fall back to a `parseNameFromFullName(fullName)`
// guess (now deleted - it had no other caller) whenever the detail's
// title/lastName came back null, which is exactly the guest-shadow-user
// shape (ADR-0123: `first_name` holds the whole composed name, `title`/
// `last_name` are NULL). The guess invented values nobody actually entered
// - same failure mode as OBRS-1231's invented `'Mr'` default one card
// earlier. Both the detail DTO and the row (`user`, via toUserRow) now carry
// the REAL parts from the backend, so a missing part renders empty instead
// of guessed.
export function buildUserFormValues(
  userDetail: AdminUserDto,
  user: UserRow,
  locale: string
): Record<string, unknown> {
  const roles = extractRoleSlugs(userDetail.roles);
  const status = parseStatus(userDetail.status ?? user.statusCode, locale);

  return {
    // OBRS-1231: no `|| 'Mr'`. A user with no title used to open this form already
    // holding one, and a Save that changed nothing else wrote that invented title to
    // their row - the admin was never told they had asserted anything.
    title: String(userDetail.title ?? user.title ?? '').trim(),
    firstName: String(userDetail.firstName ?? user.firstName ?? '').trim(),
    middleName: String(userDetail.middleName ?? user.middleName ?? '').trim(),
    lastName: String(userDetail.lastName ?? user.lastName ?? '').trim(),
    nickname: String(userDetail.nickname ?? user.nickname ?? '').trim(),
    // OBRS-1255: `?? ''`, never `?? '-'`. An empty control is what "this account has no address"
    // looks like to a reader AND the only thing safe to hand to toUpdateUserPayload, which cannot
    // tell a placeholder from a value.
    email: userDetail.email ?? user.email ?? '',
    // OBRS-691: form field displays grouped (3-3-4), same as account-page's
    // patchFormFromProfile — formatThaiMobile already strips non-digits before
    // testing/grouping, so this replaces the old bare `.replace(/\D/g, '')`.
    phoneNumber: formatThaiMobile(String(userDetail.phoneNumber ?? user.phone ?? '')),
    preferredLocale: userDetail.preferredLocale ?? 'th',
    status: status.code,
    roles: roles.length > 0 ? roles : [...user.roleSlugs],
    isPhoneNumberVerify: true,
    // OBRS-1258 AC4: pre-select both fields from the fetched detail. A non-salesperson's
    // detail never carries these (or they're simply unused, gated by isSalespersonSelected),
    // so the SALES_POINT_ACTIVE_NONE fallback is what a never-configured salesperson gets too.
    allowedSalesPointCodes: [...(userDetail.salesPointCodes ?? [])],
    activeSalesPointCode: userDetail.activeSalesPointCode ?? SALES_POINT_ACTIVE_NONE,
  };
}

/**
 * OBRS-1258: the pure payload half of the sales-points save — translates the sentinel back
 * to `null` at the wire boundary, the one place it's allowed to leak out of the form. Always a
 * full replace (`PUT /private/users/{id}/sales-points`), so both keys are always sent.
 */
export function toSalesPointsPayload(raw: Record<string, unknown>): UpdateUserSalesPointsPayload {
  const activeSalesPointCode = String(raw['activeSalesPointCode'] ?? SALES_POINT_ACTIVE_NONE);

  return {
    salesPointCodes: [...((raw['allowedSalesPointCodes'] as string[] | null | undefined) ?? [])],
    activeSalesPointCode:
      activeSalesPointCode === SALES_POINT_ACTIVE_NONE ? null : activeSalesPointCode,
  };
}

export function toCreateUserPayload(raw: Record<string, unknown>): CreateUserPayload {
  return {
    // OBRS-1231: `|| undefined` so a blank title is OMITTED, not sent as "". The same
    // shape middleName has used here all along, and the one @Size(min = 2) accepts.
    title: String(raw['title'] ?? '').trim() || undefined,
    firstName: String(raw['firstName'] ?? '').trim(),
    middleName: String(raw['middleName'] ?? '').trim() || undefined,
    lastName: String(raw['lastName'] ?? '').trim(),
    // OBRS-1558: omitted when blank - same shape as middleName, same @Size(min = 2) reason.
    nickname: String(raw['nickname'] ?? '').trim() || undefined,
    email: String(raw['email'] ?? '').trim(),
    // OBRS-691: the control may carry display dashes (regrouped on blur) —
    // the backend stores/validates bare digits only.
    phoneNumber: stripPhoneSeparators(String(raw['phoneNumber'] ?? '')),
    password: String(raw['password'] ?? '').trim(),
    preferredLocale: String(raw['preferredLocale'] ?? 'th').trim(),
    status: String(raw['status'] ?? '').trim().toLowerCase(),
    roles: [...((raw['roles'] as string[] | null | undefined) ?? [])],
    // Backend requires PDPA consent on user creation (UserReqDto extends SignUpReqDto).
    // Admin-created accounts record consent on behalf of the operator.
    pdpaConsent: true,
  };
}

/**
 * OBRS-1255 / AC2 (owner's option C): a guest shadow row sends its NAME and its status, and
 * nothing else.
 *
 * `isGuestRow` must come from `UserRow.guest`, which the backend derives from
 * `auth_provider = 'GUEST'` on the stored row — never from "the form happens to have no roles".
 * The server re-decides the same way and refuses these three keys on a shadow row, so this
 * omission is the client half of one rule, not the rule itself.
 *
 * The three that drop out, and why each one is a defect and not just noise:
 * - `email` — a shadow row has none. It is the field the `-` placeholder rode up on.
 * - `roles` — `GuestUserService#claimByRegistration` ADDS `customer` to the existing set and never
 *   clears it, so a role ticked onto a guest row today becomes real authority for whoever later
 *   registers with that phone number.
 * - `isPhoneNumberVerify` — the form hard-codes `true`, and a guest's number is the contact number
 *   for one booking that nobody has verified (ADR-0123 Decision 3). Sending it turned "an admin
 *   opened this row and pressed Save" into a verification claim.
 */
export function toUpdateUserPayload(
  raw: Record<string, unknown>,
  isGuestRow = false
): UpdateUserPayload {
  const payload: UpdateUserPayload = {
    // OBRS-1231: `|| undefined` so a blank title is OMITTED, not sent as "". The same
    // shape middleName has used here all along, and the one @Size(min = 2) accepts.
    title: String(raw['title'] ?? '').trim() || undefined,
    firstName: String(raw['firstName'] ?? '').trim(),
    middleName: String(raw['middleName'] ?? '').trim() || undefined,
    lastName: String(raw['lastName'] ?? '').trim(),
    // OBRS-1558: omitted when blank - and an omitted nickname CLEARS the stored one, which is the
    // full-replace semantics every other name part on this payload already has.
    nickname: String(raw['nickname'] ?? '').trim() || undefined,
    // OBRS-691: same rationale as toCreateUserPayload above.
    phoneNumber: stripPhoneSeparators(String(raw['phoneNumber'] ?? '')),
    preferredLocale: String(raw['preferredLocale'] ?? 'th').trim(),
    status: String(raw['status'] ?? '').trim().toLowerCase(),
  };

  if (isGuestRow) {
    return payload;
  }

  return {
    ...payload,
    email: String(raw['email'] ?? '').trim(),
    isPhoneNumberVerify: Boolean(raw['isPhoneNumberVerify']),
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

// OBRS-847 / ADR-0114: role slugs that can never label a row in a
// non-platform caller's user list, so offering them as list filters is a
// dead control — it reads as "the system lost my data", not "you have no
// permission".
//
// `GET /api/private/users` has been an operator-scoped STAFF directory since
// OBRS-824: the predicate is `users.owner_id`, which means EMPLOYER
// (ADR-0109) and is NULL for every passenger and for every platform ADMIN.
//
// `customer` is excluded on the strength of the DECISION, not of today's
// query result. ADR-0114 ("the operator works with bookings, the platform
// works with accounts") settles that an OWNER does not manage customer
// accounts, and `schema.sql` says why it could not be scoped even if we
// wanted to: passengers "belong to no operator". So this is not an
// owner-scoped customer view waiting to be built — reading it as "returns
// zero rows for now" is exactly what makes the next person put the option
// back.
//
// `admin` follows from the same column: platform staff have no employer.
export const ROLES_ABSENT_FROM_OPERATOR_USER_LIST = ['customer', 'admin'];

/**
 * Narrows the role options down to the ones that can actually label a row in
 * the caller's list. Deliberately a SEPARATE list from `toRoleOptions` rather
 * than a narrowing of it: the form modal asks a different question — "which
 * roles may I assign?", answered by the backend's
 * `UserService#validateAssignableRoles` (strictly below the caller's own
 * role, so an OWNER may still create a CUSTOMER) — and collapsing the two
 * would silently change what an OWNER can create.
 *
 * `isPlatformAdmin` must come from the caller's RAW held roles. An OWNER
 * satisfies `AuthService.hasAnyRole(['admin'])` too (ROLE_GRANTS lists
 * 'admin' among owner's grants), which would make this a no-op for the only
 * role it exists for.
 */
export function toRoleFilterOptions(
  roleOptions: RoleOption[],
  isPlatformAdmin: boolean
): RoleOption[] {
  if (isPlatformAdmin) {
    return roleOptions;
  }

  return roleOptions.filter(
    (option) =>
      !ROLES_ABSENT_FROM_OPERATOR_USER_LIST.includes(
        String(option.slug ?? '').trim().toLowerCase()
      )
  );
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

import {
  AdminLookupDto,
  AdminRoleDto,
  AdminTranslationReqDto,
  CreateRolePayload,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

// Pure mappers/formatters/normalizers extracted from RoleManagementPageComponent
// (OBRS-237, mirroring OBRS-208's routes.mappers.ts, OBRS-214's
// schedules.mappers.ts and OBRS-232's user-management.mappers.ts). No
// Angular/service dependencies — every locale-dependent or
// translation-dependent value the original private methods pulled off `this`
// is now an explicit parameter, so these stay unit-testable in isolation.

export interface RoleRow {
  id: number;
  slug: string;
  label: string;
  description: string;
  enLabel: string;
  enDescription: string;
  thLabel: string;
  thDescription: string;
  status: string;
  statusCode: string;
  updatedAt: string;
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

export function toRoleRow(role: AdminRoleDto, locale: string, dateLang: string): RoleRow {
  const status = parseAdminStatus(role.status, locale);
  const enLabel = getAdminTranslationLabel(role.translations, 'en') ?? role.name ?? role.slug;
  const enDescription =
    getAdminTranslationDescription(role.translations, 'en') ?? role.description ?? '-';
  const thLabel = getAdminTranslationLabel(role.translations, 'th') ?? '-';
  const thDescription = getAdminTranslationDescription(role.translations, 'th') ?? '-';
  const localizedLabel =
    role.name ?? getAdminTranslationLabel(role.translations, locale) ?? enLabel;
  const localizedDescription =
    role.description ?? getAdminTranslationDescription(role.translations, locale) ?? enDescription;

  return {
    id: Number(role.id ?? 0),
    slug: role.slug,
    label: localizedLabel,
    description: localizedDescription,
    enLabel,
    enDescription,
    thLabel,
    thDescription,
    status: status.name,
    statusCode: status.code,
    // dateLang is deliberately the RAW translate.currentLang, NOT the
    // th/en-normalized `locale` used above for label/description lookups —
    // passing the normalized locale here would silently change the date
    // format under en-US (see toRouteRow in routes.mappers.ts /
    // toUserRow in user-management.mappers.ts for the same trap).
    updatedAt: formatDisplayDateTime(role.updatedAt ?? role.createdAt, dateLang),
  };
}

export function toLatestTimestamp(roles: AdminRoleDto[], dateLang: string): string {
  const values = roles
    .map((role) => role.updatedAt ?? role.createdAt)
    .filter((item): item is string => !!item)
    .map((item) => new Date(item).getTime())
    .filter((item) => Number.isFinite(item));

  if (values.length === 0) {
    return '-';
  }

  // Same dateLang-vs-locale distinction as toRoleRow above.
  return formatDisplayDateTime(new Date(Math.max(...values)).toISOString(), dateLang);
}

export function toStatusOptions(
  lookups: AdminLookupDto[],
  roles: AdminRoleDto[],
  locale: string
): StatusOption[] {
  const lookupOptions = lookups
    .filter((lookup) => lookup.category === 'role_status')
    .map((lookup) => ({
      code: String(lookup.slug ?? '').trim().toLowerCase(),
      label:
        getAdminTranslationLabel(lookup.translations, locale) ??
        getAdminTranslationLabel(lookup.translations, 'en') ??
        lookup.slug,
    }))
    .filter((option) => option.code.length > 0);

  if (lookupOptions.length > 0) {
    return lookupOptions;
  }

  const statusByCode = new Map<string, string>();
  roles.forEach((role) => {
    const status = parseAdminStatus(role.status, locale);
    if (status.code && status.code !== 'unknown') {
      statusByCode.set(status.code, status.name);
    }
  });

  return [...statusByCode.entries()].map(([code, label]) => ({ code, label }));
}

export function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortRolesByLatestUpdated(roles: AdminRoleDto[]): AdminRoleDto[] {
  return [...roles].sort(
    (first, second) =>
      toTimestamp(second.updatedAt ?? second.createdAt) -
      toTimestamp(first.updatedAt ?? first.createdAt)
  );
}

export function filterRolesByStatus(roles: RoleRow[], statusFilter: string): RoleRow[] {
  return roles.filter((role) => {
    if (statusFilter.length === 0) {
      return true;
    }

    return role.statusCode.trim().toLowerCase() === statusFilter;
  });
}

export function isFilterStatusStale(statusFilter: string, statusOptions: StatusOption[]): boolean {
  return (
    statusFilter.length > 0 &&
    !statusOptions.some((option) => option.code.trim().toLowerCase() === statusFilter)
  );
}

export function toRolePayload(rawFormValue: Record<string, unknown>): CreateRolePayload {
  const slug = String(rawFormValue['slug'] ?? '').trim().toLowerCase();
  const enLabel = String(rawFormValue['enLabel'] ?? '').trim();
  const enDescription = String(rawFormValue['enDescription'] ?? '').trim();
  const thLabel = String(rawFormValue['thLabel'] ?? '').trim();
  const thDescription = String(rawFormValue['thDescription'] ?? '').trim();
  const status = String(rawFormValue['status'] ?? '').trim().toLowerCase();

  const translations: AdminTranslationReqDto[] = [
    {
      locale: 'en',
      label: enLabel,
      description: enDescription || undefined,
    },
  ];

  translations.push({
    locale: 'th',
    label: thLabel,
    description: thDescription || undefined,
  });

  return {
    slug,
    status,
    translations,
  };
}

export function toRoleDetailFallback(role: RoleRow): AdminRoleDto {
  return {
    id: role.id,
    slug: role.slug,
    name: role.label,
    description: role.description === '-' ? '' : role.description,
    status: role.statusCode,
    translations: [
      {
        locale: 'en',
        label: role.enLabel,
        description: role.enDescription === '-' ? undefined : role.enDescription,
      },
      {
        locale: 'th',
        label: role.thLabel === '-' ? undefined : role.thLabel,
        description: role.thDescription === '-' ? undefined : role.thDescription,
      },
    ],
  };
}

// The pure value-derivation half of the original applyRoleFormValues: builds
// the form `values` record from the fetched detail (falling back to the
// already-known row). The onlyPristine-vs-reset branching stays in the
// component since it mutates the live FormGroup.
export function buildRoleFormValues(
  roleDetail: AdminRoleDto,
  role: RoleRow,
  locale: string
): Record<string, unknown> {
  const enLabel =
    getAdminTranslationLabel(roleDetail.translations, 'en') ?? roleDetail.name ?? role.enLabel;
  const thLabel = getAdminTranslationLabel(roleDetail.translations, 'th') ?? role.thLabel;
  const enDescription =
    getAdminTranslationDescription(roleDetail.translations, 'en') ??
    roleDetail.description ??
    role.enDescription;
  const thDescription =
    getAdminTranslationDescription(roleDetail.translations, 'th') ?? role.thDescription;
  const status = parseAdminStatus(roleDetail.status ?? role.statusCode, locale);

  return {
    slug: String(roleDetail.slug ?? role.slug).trim(),
    enLabel: String(enLabel ?? '').trim().replace(/^-$/, ''),
    enDescription: String(enDescription ?? '').trim().replace(/^-$/, ''),
    thLabel: String(thLabel ?? '').trim().replace(/^-$/, ''),
    thDescription: String(thDescription ?? '').trim().replace(/^-$/, ''),
    status: status.code,
  };
}

export function extractResponseData<T>(response: unknown): T | null {
  if (response === null || response === undefined) {
    return null;
  }

  if (typeof response === 'object' && 'data' in response) {
    return (response as { data?: T }).data ?? null;
  }

  return response as T;
}

export function extractResponseArray<T>(response: unknown): T[] {
  const data = extractResponseData<unknown>(response);
  return Array.isArray(data) ? (data as T[]) : [];
}

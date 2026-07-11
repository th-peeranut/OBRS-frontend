import {
  AdminTranslationCollection,
  AdminTranslationReqDto,
  PromotionReqDto,
  PromotionRespDto,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';

// Pure mappers/formatters/normalizers extracted from PromotionsPageComponent
// (OBRS-241, mirroring OBRS-208's routes.mappers.ts, OBRS-214's
// schedules.mappers.ts, OBRS-232's user-management.mappers.ts and OBRS-237's
// role-management.mappers.ts). No Angular/service dependencies — every
// locale-dependent or translation-dependent value the original private
// methods pulled off `this` is now an explicit parameter, so these stay
// unit-testable in isolation.

export const ROUND_TRIP_SLUG = 'round_trip';

export interface PromotionRow {
  id: number;
  slug: string;
  code: string;
  discountTypeCode: string;
  discountTypeLabel: string;
  discountValue: number | null;
  maxDiscountAmount: number | null;
  minBookingAmount: number | null;
  startDateTime: string | null;
  endDateTime: string | null;
  usageLimit: number | null;
  currentUsage: number;
  statusCode: string;
  statusLabel: string;
  autoApply: boolean;
  isRoundTrip: boolean;
  translations?: AdminTranslationCollection;
}

export interface Option {
  value: string;
  label: string;
}

export interface PromotionOptionLabels {
  discountTypePercentage: string;
  discountTypeFixedAmount: string;
  statusActive: string;
  statusInactive: string;
  autoApplyYes: string;
  autoApplyNo: string;
}

export interface PromotionOptionLists {
  discountTypeOptions: Option[];
  statusOptions: Option[];
  autoApplyOptions: Option[];
}

export function statusClass(statusCode: string): string {
  return statusCode.trim().toLowerCase() === 'active' ? 'is-success' : 'is-danger';
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function toDateValue(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function toIsoString(value: unknown): string | null {
  const date = toDateValue(value as string | Date | null | undefined);
  return date ? date.toISOString() : null;
}

export function hasDateRangeError(
  rawStartDateTime: unknown,
  rawEndDateTime: unknown
): boolean {
  const start = toDateValue(rawStartDateTime as string | Date | null | undefined);
  const end = toDateValue(rawEndDateTime as string | Date | null | undefined);
  return !!start && !!end && end.getTime() < start.getTime();
}

export function buildPromotionOptionLists(labels: PromotionOptionLabels): PromotionOptionLists {
  return {
    discountTypeOptions: [
      { value: 'percentage', label: labels.discountTypePercentage },
      { value: 'fixed_amount', label: labels.discountTypeFixedAmount },
    ],
    statusOptions: [
      { value: 'active', label: labels.statusActive },
      { value: 'inactive', label: labels.statusInactive },
    ],
    autoApplyOptions: [
      { value: 'true', label: labels.autoApplyYes },
      { value: 'false', label: labels.autoApplyNo },
    ],
  };
}

export function toRow(
  promotion: PromotionRespDto,
  locale: string,
  discountTypeOptions: Option[]
): PromotionRow {
  const discountType = parseAdminStatus(promotion.discountType, locale);
  const status = parseAdminStatus(promotion.status, locale);
  const slug = String(promotion.slug ?? '').trim();
  // Prefer the FE's own known-option label ("Percentage"/"Fixed Amount")
  // over parseAdminStatus's generic ALL-CAPS fallback, for a plain-string
  // discountType (see PromotionRespDto's comment on Jackson number/string
  // duality — discountType itself is always a lookup slug string here).
  const discountTypeLabel =
    discountTypeOptions.find((option) => option.value === discountType.code)?.label ??
    discountType.name;

  return {
    id: promotion.id,
    slug,
    code: promotion.code ?? '-',
    discountTypeCode: discountType.code,
    discountTypeLabel,
    discountValue: toNumber(promotion.discountValue),
    maxDiscountAmount: toNumber(promotion.maxDiscountAmount),
    minBookingAmount: toNumber(promotion.minBookingAmount),
    startDateTime: promotion.startDateTime ?? null,
    endDateTime: promotion.endDateTime ?? null,
    usageLimit: promotion.usageLimit ?? null,
    currentUsage: promotion.currentUsage ?? 0,
    statusCode: status.code,
    statusLabel: status.name,
    autoApply: !!promotion.autoApply,
    isRoundTrip: slug.toLowerCase() === ROUND_TRIP_SLUG,
    translations: promotion.translations,
  };
}

export function toFallbackDto(row: PromotionRow): PromotionRespDto {
  return {
    id: row.id,
    slug: row.slug,
    code: row.code,
    discountType: row.discountTypeCode,
    status: row.statusCode,
    discountValue: row.discountValue ?? undefined,
    maxDiscountAmount: row.maxDiscountAmount,
    minBookingAmount: row.minBookingAmount ?? undefined,
    startDateTime: row.startDateTime,
    endDateTime: row.endDateTime,
    usageLimit: row.usageLimit,
    currentUsage: row.currentUsage,
    autoApply: row.autoApply,
    translations: row.translations,
  };
}

// The pure value-derivation half of the original applyPromotionFormValues:
// builds the form `values` record from the fetched detail (falling back to
// the already-known row). The onlyPristine-vs-reset branching stays in the
// component since it mutates the live FormGroup.
export function buildPromotionFormValues(
  dto: PromotionRespDto,
  row: PromotionRow,
  locale: string
): Record<string, unknown> {
  const discountType = parseAdminStatus(dto.discountType ?? row.discountTypeCode, locale);
  const status = parseAdminStatus(dto.status ?? row.statusCode, locale);

  return {
    slug: String(dto.slug ?? row.slug).trim(),
    code: String(dto.code ?? row.code).trim(),
    discountType: discountType.code,
    discountValue: toNumber(dto.discountValue) ?? row.discountValue,
    maxDiscountAmount: toNumber(dto.maxDiscountAmount) ?? row.maxDiscountAmount,
    minBookingAmount: toNumber(dto.minBookingAmount) ?? row.minBookingAmount,
    startDateTime: toDateValue(dto.startDateTime ?? row.startDateTime),
    endDateTime: toDateValue(dto.endDateTime ?? row.endDateTime),
    usageLimit: dto.usageLimit ?? row.usageLimit,
    status: status.code,
    autoApply: String(dto.autoApply ?? row.autoApply),
    enLabel: getAdminTranslationLabel(dto.translations, 'en') ?? '',
    enDescription: getAdminTranslationDescription(dto.translations, 'en') ?? '',
    thLabel: getAdminTranslationLabel(dto.translations, 'th') ?? '',
    thDescription: getAdminTranslationDescription(dto.translations, 'th') ?? '',
    zhLabel: getAdminTranslationLabel(dto.translations, 'zh') ?? '',
    zhDescription: getAdminTranslationDescription(dto.translations, 'zh') ?? '',
  };
}

export function toPromotionPayload(rawFormValue: Record<string, unknown>): PromotionReqDto {
  const translations: AdminTranslationReqDto[] = [
    {
      locale: 'en',
      label: String(rawFormValue['enLabel'] ?? '').trim(),
      description: String(rawFormValue['enDescription'] ?? '').trim() || undefined,
    },
  ];
  const thLabel = String(rawFormValue['thLabel'] ?? '').trim();
  if (thLabel) {
    translations.push({
      locale: 'th',
      label: thLabel,
      description: String(rawFormValue['thDescription'] ?? '').trim() || undefined,
    });
  }
  const zhLabel = String(rawFormValue['zhLabel'] ?? '').trim();
  if (zhLabel) {
    translations.push({
      locale: 'zh',
      label: zhLabel,
      description: String(rawFormValue['zhDescription'] ?? '').trim() || undefined,
    });
  }

  return {
    slug: String(rawFormValue['slug'] ?? '').trim().toLowerCase(),
    code: String(rawFormValue['code'] ?? '').trim(),
    discountType: String(rawFormValue['discountType'] ?? '').trim().toLowerCase(),
    discountValue: toNumber(rawFormValue['discountValue']) ?? 0,
    maxDiscountAmount: toNumber(rawFormValue['maxDiscountAmount']),
    // Backend @NotNull — blank means "no minimum" / "unlimited", not
    // absent, so default to 0 rather than sending null.
    minBookingAmount: toNumber(rawFormValue['minBookingAmount']) ?? 0,
    startDateTime: toIsoString(rawFormValue['startDateTime']),
    endDateTime: toIsoString(rawFormValue['endDateTime']),
    usageLimit: toNumber(rawFormValue['usageLimit']) ?? 0,
    status: String(rawFormValue['status'] ?? '').trim().toLowerCase(),
    autoApply: String(rawFormValue['autoApply'] ?? '').trim().toLowerCase() === 'true',
    translations,
  };
}

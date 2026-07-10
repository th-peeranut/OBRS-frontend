import {
  AdminLookupDto,
  AdminRouteDto,
  AdminRouteStopDto,
  AdminSegmentDto,
  AdminSegmentReqDto,
  AdminStopDto,
  AdminStatusDto,
  AdminTranslationReqDto,
  CreateRoutePayload,
  getAdminLookupCode,
  getAdminLookupLabel,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

// Pure mappers/formatters/normalizers extracted from RoutesPageComponent
// (OBRS-208). No Angular/service dependencies — every locale-dependent or
// translation-dependent value the original private methods pulled off `this`
// is now an explicit parameter, so these stay unit-testable in isolation.

export interface RouteRow {
  id: number;
  slug: string;
  label: string;
  description: string;
  status: string;
  statusCode: string;
  updatedAt: string;
}

export interface StopPoint {
  slug: string;
  name: string;
  distance: string;
  duration: string;
  stopOrder: number;
  offsetMinutesFromOrigin: number;
  label?: string;
}

export interface SegmentRow {
  id: number;
  origin: string;
  destination: string;
  fare: number;
  duration: string;
  estimatedDurationMinutes: number | null;
  fromStopSlug: string;
  toStopSlug: string;
  vehicleTypeSlug: string;
  vehicleTypeName: string;
}

export interface Option {
  code: string;
  label: string;
}

export interface VehicleTypeOption {
  slug: string;
  name: string;
}

/** Origin/terminal labels resolved via translate.instant by the caller. */
export interface StopPointEdgeLabels {
  origin: string;
  terminal: string;
}

export function statusClass(status: string): string {
  const normalizedStatus = status.trim().toUpperCase();

  if (normalizedStatus === 'ACTIVE') {
    return 'is-success';
  }

  if (
    normalizedStatus === 'SUSPENDED' ||
    normalizedStatus === 'TEMPORARILY_CLOSED' ||
    normalizedStatus.includes('PENDING')
  ) {
    return 'is-warning';
  }

  return 'is-danger';
}

export function formatFare(fare: number): string {
  return fare.toFixed(2);
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').toUpperCase();
}

export function formatDuration(minutes: number | null | undefined, locale: string): string {
  if (!Number.isFinite(minutes) || minutes === null || minutes === undefined) {
    return '-';
  }

  const normalizedMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const remainingMinutes = normalizedMinutes % 60;

  if (locale === 'th') {
    if (hours > 0 && remainingMinutes > 0) {
      return `${hours} ชม. ${remainingMinutes} นาที`;
    }

    if (hours > 0) {
      return `${hours} ชม.`;
    }

    return `${remainingMinutes} นาที`;
  }

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours} hr ${remainingMinutes} min`;
  }

  if (hours > 0) {
    return `${hours} hr`;
  }

  return `${remainingMinutes} min`;
}

export function normalizeVehicleTypeKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeDurationMinutes(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

export function normalizeFareForSave(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0.01;
  }

  return Number(value.toFixed(2));
}

export function normalizeDurationForSave(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.round(value);
}

export function parseStatus(
  value: string | AdminStatusDto | null | undefined,
  locale: string
): { code: string; name: string } {
  return parseAdminStatus(value, locale);
}

export function toStopName(stop: AdminStopDto | undefined, locale: string): string {
  const name =
    getAdminLookupLabel(stop, locale) ??
    getAdminTranslationLabel(stop?.translations, locale) ??
    getAdminTranslationLabel(stop?.translations, 'en') ??
    getAdminLookupCode(stop);

  return name || '-';
}

export function toRouteDtoFallback(route: RouteRow): AdminRouteDto {
  return {
    id: route.id,
    slug: route.slug,
    status: route.statusCode,
    translations: [
      {
        locale: 'en',
        label: route.label,
        description: route.description === '-' ? undefined : route.description,
      },
    ],
  };
}

export function toRouteRow(
  route: AdminRouteDto,
  locale: string,
  dateLang: string | null | undefined
): RouteRow {
  const status = parseStatus(route.status, locale);

  return {
    id: route.id,
    slug: route.slug,
    label:
      getAdminLookupLabel(route, locale) ??
      getAdminTranslationLabel(route.translations, locale) ??
      getAdminTranslationLabel(route.translations, 'en') ??
      route.slug,
    description:
      getAdminTranslationDescription(route.translations, locale) ??
      getAdminTranslationDescription(route.translations, 'en') ??
      '-',
    status: status.name,
    statusCode: status.code,
    updatedAt: formatDisplayDateTime(route.updatedAt ?? route.createdAt, dateLang),
  };
}

export function toRouteStatusOptions(
  lookups: AdminLookupDto[],
  routes: AdminRouteDto[],
  locale: string
): Option[] {
  const options = new Map<string, string>();
  const knownRouteStatuses = [
    'active',
    'suspended',
    'temporarily_closed',
    'decommissioned',
  ];

  for (const status of knownRouteStatuses) {
    options.set(status, formatStatusLabel(status));
  }

  for (const lookup of lookups) {
    if (lookup.category !== 'route_status') {
      continue;
    }

    const code = String(lookup.slug ?? '').trim().toLowerCase();
    if (!code) {
      continue;
    }

    options.set(
      code,
      getAdminTranslationLabel(lookup.translations, locale) ??
        getAdminTranslationLabel(lookup.translations, 'en') ??
        formatStatusLabel(code)
    );
  }

  for (const route of routes) {
    const status = parseStatus(route.status, locale);
    if (status.code && status.code !== 'unknown' && !options.has(status.code)) {
      options.set(status.code, status.name);
    }
  }

  return [...options.entries()].map(([code, label]) => ({ code, label }));
}

export function toStopPoints(
  routeStops: AdminRouteStopDto | undefined,
  locale: string,
  edgeLabels: StopPointEdgeLabels
): StopPoint[] {
  const stops = routeStops?.stops ?? [];
  if (stops.length === 0) {
    return [];
  }

  const sortedStops = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);

  return sortedStops.map((stop, index) => ({
    slug: getAdminLookupCode(stop.stop),
    name: toStopName(stop.stop, locale),
    distance: `${stop.distanceKmFromOrigin ?? 0} km`,
    duration: `${stop.offsetMinutesFromOrigin ?? 0} mins`,
    stopOrder: stop.stopOrder,
    offsetMinutesFromOrigin: Number(stop.offsetMinutesFromOrigin ?? 0),
    label:
      index === 0
        ? edgeLabels.origin
        : index === sortedStops.length - 1
          ? edgeLabels.terminal
          : undefined,
  }));
}

export function toSegments(
  segmentResponse: AdminSegmentDto | undefined,
  locale: string
): SegmentRow[] {
  const stopPairs = segmentResponse?.stopPairs ?? [];
  if (stopPairs.length === 0) {
    return [];
  }

  return stopPairs.map((pair, index) => {
    const parsedFare = Number(pair.fare ?? 0);

    return {
      id: pair.segmentId ?? index + 1,
      origin: pair.fromStop?.name ?? pair.fromStop?.slug ?? '-',
      destination: pair.toStop?.name ?? pair.toStop?.slug ?? '-',
      fare: Number.isFinite(parsedFare) ? parsedFare : 0,
      duration: formatDuration(pair.estimatedDurationMinutes, locale),
      estimatedDurationMinutes: normalizeDurationMinutes(pair.estimatedDurationMinutes),
      fromStopSlug: pair.fromStop?.slug ?? '',
      toStopSlug: pair.toStop?.slug ?? '',
      vehicleTypeSlug: String(pair.vehicleType?.slug ?? '').trim(),
      vehicleTypeName: pair.vehicleType?.name ?? pair.vehicleType?.slug ?? '-',
    };
  });
}

export function toVehicleTypeOptions(segments: SegmentRow[]): VehicleTypeOption[] {
  const options = new Map<string, VehicleTypeOption>();

  for (const segment of segments) {
    const normalizedSlug = normalizeVehicleTypeKey(segment.vehicleTypeSlug);
    if (!normalizedSlug) {
      continue;
    }

    if (!options.has(normalizedSlug)) {
      options.set(normalizedSlug, {
        slug: segment.vehicleTypeSlug,
        name: segment.vehicleTypeName,
      });
    }
  }

  return [...options.values()];
}

export function toRoutePayload(rawFormValue: Record<string, unknown>): CreateRoutePayload {
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

  return {
    slug: String(rawFormValue['slug'] ?? '').trim().toLowerCase(),
    status: String(rawFormValue['status'] ?? '').trim().toLowerCase(),
    translations,
  };
}

export function toSegmentUpdatePayload(
  selectedSegment: SegmentRow,
  editedFromStopSlug: string,
  editedToStopSlug: string,
  editedFare: number,
  estimatedDurationMinutes: number,
  allSegments: SegmentRow[],
  selectedRouteSlug: string
): AdminSegmentReqDto {
  const segmentsOfVehicleType = allSegments.filter(
    (segment) =>
      normalizeVehicleTypeKey(segment.vehicleTypeSlug) ===
      normalizeVehicleTypeKey(selectedSegment.vehicleTypeSlug)
  );

  return {
    route: selectedRouteSlug,
    vehicleType: selectedSegment.vehicleTypeSlug,
    stopPairs: segmentsOfVehicleType.map((segment) => {
      const isEditedSegment = segment.id === selectedSegment.id;

      return {
        fromStop: isEditedSegment ? editedFromStopSlug : segment.fromStopSlug,
        toStop: isEditedSegment ? editedToStopSlug : segment.toStopSlug,
        fare: normalizeFareForSave(isEditedSegment ? editedFare : segment.fare),
        estimatedDurationMinutes: isEditedSegment
          ? normalizeDurationForSave(estimatedDurationMinutes)
          : undefined,
      };
    }),
  };
}

export interface Station {
  id: number;
  code?: string;
  nameThai: string;
  nameEnglish: string;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;

  url: string;
}

export interface Province {
  id: number;
  nameThai: string;
  nameEnglish: string;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
}

export interface ProvinceStation extends Province {
  stations: Station[];
}

export interface ProvinceStationReview extends Province {
  station: Station;
}

export interface StationTranslation {
  locale: string;
  label: string;
  description: string | null;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
}

export type StationTranslationCollection =
  | Partial<StationTranslation>[]
  | Record<string, Partial<StationTranslation> | null | undefined>;

export interface StationLookup {
  code?: string;
  slug?: string;
  name?: string;
  label?: string;
  display?: StationTranslationCollection;
  translations?: StationTranslationCollection;
}

export type StationLookupValue = string | StationLookup;

export interface StationApi {
  id: number;
  slug: string;
  status: StationLookupValue;
  stopType: StationLookupValue;
  /**
   * OBRS-1238 — does this stop have a ticket desk, i.e. may a CHILD ticket
   * board here? Optional because a cached/older `GET /api/stops` body (the
   * endpoint is served `public, max-age=300`) does not carry the field.
   *
   * ⛔ This is UX, never authorization. The server refuses the sale on its own
   * (`CHILD_FARE_STOP_WITHOUT_TICKET_DESK`); what this field buys is the
   * customer seeing WHY before they reach the payment step instead of after.
   */
  hasTicketDesk?: boolean;
  createdAt: string;
  updatedAt: string;
  display?: StationTranslationCollection;
  translations?: StationTranslationCollection;
}

/**
 * OBRS-1238 — may a child ticket board at this station id?
 *
 * <p>Absent/unknown answers TRUE, deliberately. A stale cached stop list that
 * predates the field would otherwise hide the child option at every stop in the
 * country, which is a worse failure than letting the server state the refusal
 * itself — and the server still does, so nothing is actually sold that should
 * not be.
 */
export function stationAllowsChildBoarding(
  stationId: string | number | null | undefined,
  stationList: StationApi[] | null | undefined
): boolean {
  if (stationId === null || stationId === undefined || stationId === '') {
    return true;
  }
  const parsed = Number(stationId);
  const match = (stationList ?? []).find((station) => station.id === parsed);
  if (!match || match.hasTicketDesk === undefined) {
    return true;
  }
  return match.hasTicketDesk;
}

export function getStationTranslationLabel(
  stationApi: StationApi | null | undefined,
  locale: string
): string | undefined {
  return (
    getTranslationCollectionLabel(stationApi?.display, locale) ??
    getTranslationCollectionLabel(stationApi?.translations, locale) ??
    getTranslationCollectionLabel(stationApi?.display, 'en') ??
    getTranslationCollectionLabel(stationApi?.translations, 'en')
  );
}

export function getStationFallbackLabel(
  stationApi: StationApi | null | undefined,
  locale: string
): string {
  return getStationTranslationLabel(stationApi, locale) ?? stationApi?.slug ?? '';
}

/** Resolves a station's `slug` by id — matched against `RouteStop.slug`
 *  (from `getPickupDropoffCached`); both key off the same `stops.slug`
 *  column server-side. Returns '' when the id or a matching station is
 *  missing. */
export function getStationSlugById(
  stationId: string | number | null | undefined,
  stationList: StationApi[] | null | undefined
): string {
  if (stationId === null || stationId === undefined || stationId === '') {
    return '';
  }
  const parsed = Number(stationId);
  const match = (stationList ?? []).find((station) => station.id === parsed);
  return match?.slug ?? '';
}

/** Resolves a station's localized label by id — the same lookup
 *  `getStationSlugById` does, through `getStationFallbackLabel` instead of the
 *  slug. Shared by `ScheduleBookingListComponent` and
 *  `ScheduleBookingFilterComponent` so the list and the OBRS-863 summary bar
 *  above it cannot name the same station differently. */
export function getStationLabelById(
  stationId: string | number | null | undefined,
  stationList: StationApi[] | null | undefined,
  locale: string
): string {
  if (stationId === null || stationId === undefined || stationId === '') {
    return '';
  }
  const parsed = Number(stationId);
  const match = (stationList ?? []).find((station) => station.id === parsed);
  return match ? getStationFallbackLabel(match, locale) : '';
}

export function getStopTypeLabel(
  stopType: StationLookupValue | null | undefined,
  locale: string
): string {
  if (typeof stopType === 'string') {
    return formatStopTypeCode(stopType);
  }

  const code = getStopTypeCode(stopType);
  return (
    stopType?.name ??
    stopType?.label ??
    getTranslationCollectionLabel(stopType?.display, locale) ??
    getTranslationCollectionLabel(stopType?.display, 'en') ??
    getTranslationCollectionLabel(stopType?.translations, locale) ??
    getTranslationCollectionLabel(stopType?.translations, 'en') ??
    formatStopTypeCode(code)
  );
}

function getStopTypeCode(stopType: StationLookup | null | undefined): string {
  return String(stopType?.code ?? stopType?.slug ?? '').trim();
}

function formatStopTypeCode(code: string | null | undefined): string {
  const normalized = String(code ?? '').trim().toLowerCase();
  if (normalized === 'station') return 'Station';
  if (normalized === 'stop') return 'Stop';
  return String(code ?? '');
}

function getTranslationCollectionLabel(
  translations: StationTranslationCollection | null | undefined,
  locale: string
): string | undefined {
  if (!translations) {
    return undefined;
  }

  const normalizedLocale = locale.toLowerCase();
  if (Array.isArray(translations)) {
    const byLocale = translations.find((item) =>
      item.locale?.toLowerCase().startsWith(normalizedLocale)
    );

    return byLocale?.label ?? translations.find((item) => item.label)?.label;
  }

  const direct = translations[normalizedLocale];
  return (
    direct?.label ??
    Object.values(translations).find((item) => item?.label)?.label
  );
}

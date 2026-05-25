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
  | Partial<StationTranslation>
  | Record<string, Partial<StationTranslation> | string | null | undefined>;

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
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  lastUpdatedDate: string;
  display?: StationTranslationCollection;
  translations?: StationTranslationCollection;
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
  if (!translations || typeof translations !== 'object') {
    return undefined;
  }

  const normalizedLocale = locale.toLowerCase();
  if (Array.isArray(translations)) {
    const byLocale = translations.find((item) =>
      item.locale?.toLowerCase().startsWith(normalizedLocale)
    );

    return byLocale?.label ?? translations.find((item) => item.label)?.label;
  }

  const singleTranslation = translations as Partial<StationTranslation>;
  if (singleTranslation.locale?.toLowerCase().startsWith(normalizedLocale)) {
    return singleTranslation.label;
  }
  if (singleTranslation.label) {
    return singleTranslation.label;
  }

  const translationMap = translations as Record<
    string,
    Partial<StationTranslation> | string | null | undefined
  >;
  const direct = translationMap[normalizedLocale];
  if (typeof direct === 'string') {
    return direct;
  }
  if (direct?.label) {
    return direct.label;
  }

  const fallback = Object.values(translationMap).find(
    (item): item is Partial<StationTranslation> =>
      !!item && typeof item === 'object' && typeof item.label === 'string'
  );

  return fallback?.label;
}

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
  | StationTranslation[]
  | Record<string, Partial<StationTranslation> | null | undefined>;

export interface StationApi {
  id: number;
  slug: string;
  status: string;
  stopType: string;
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

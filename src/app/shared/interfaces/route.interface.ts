// Mirrors backend RouteSummaryResponse (translation/lookup based).
export interface RouteTranslation {
  label: string;
  description: string | null;
}

export interface RouteLookup {
  code: string;
  display?: Record<string, { label: string; description?: string | null }>;
}

export interface Route {
  id: number;
  slug: string;
  status: RouteLookup;
  translations: Record<string, RouteTranslation>;
  createdAt: string;
  updatedAt: string;
}

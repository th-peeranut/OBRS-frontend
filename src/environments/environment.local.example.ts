// Copy this file to environment.local.ts and fill in real values for local dev.
// environment.local.ts is gitignored — it never gets committed (OBRS-frontend is public).
// Netlify generates its own environment.local.ts at build time from env vars
// (see scripts/inject-sit-env.js), so this file only matters for `npm start` locally.
export const localEnv = {
  mapsApiKey: '',
  googleClientId: '',
  // OBRS-424: optional — a blank value degrades to the MAP_UNAVAILABLE
  // placeholder (FleetMapPanelComponent.canShowMap), never a build failure.
  maptilerKey: '',
  // OBRS-867: leave BOTH blank for local development. A real ID here would mix
  // your own clicking-around into the production funnel, and the numbers those
  // charts feed (OBRS-862's no-results rate, OBRS-872's registration drop-off)
  // are the whole reason the tags exist. Blank = no tag is injected at all.
  ga4MeasurementId: '',
  clarityProjectId: '',
};

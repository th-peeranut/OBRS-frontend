// Template for environment.prod.local.ts, which is gitignored — it never gets
// committed (OBRS-frontend is a public repo).
//
// You almost certainly do NOT want to write that file by hand. The prod host
// generates it at build time from env vars:
//
//   node scripts/inject-prod-env.js && npm run build -- --configuration prod
//
// This file exists so `--configuration prod` can be type-checked locally without
// real credentials. The placeholder values below are deliberately ones that
// src/environments/prod-config-guard.ts REJECTS at boot — a bundle built from
// this template must never be mistaken for a shippable one.
export const prodEnv = {
  apiUrl: '',
  omisePublicKey: '',
  promptpayId: '',
  mapsApiKey: '',
  googleClientId: '',
  // OBRS-424: optional — a blank value degrades to the MAP_UNAVAILABLE
  // placeholder (FleetMapPanelComponent.canShowMap), never a build failure.
  // Unlike the values above, this one is intentionally NOT on
  // inject-prod-env.js's required/failure list.
  maptilerKey: '',
  // OBRS-867: also optional, also NOT on inject-prod-env.js's required list —
  // a missing measurement ID costs a chart, not a payment.
  ga4MeasurementId: '',
  clarityProjectId: '',
};

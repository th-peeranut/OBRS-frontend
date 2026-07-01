// Copy this file to environment.local.ts and fill in real values for local dev.
// environment.local.ts is gitignored — it never gets committed (OBRS-frontend is public).
// Netlify generates its own environment.local.ts at build time from env vars
// (see scripts/inject-sit-env.js), so this file only matters for `npm start` locally.
export const localEnv = {
  mapsApiKey: '',
  googleClientId: '',
};

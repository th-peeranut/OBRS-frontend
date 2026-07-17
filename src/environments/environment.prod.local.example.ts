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
};

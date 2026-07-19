import { environmentBase } from './environment.base';
import { prodEnv } from './environment.prod.local';

// OBRS-390 / OBRS-205 — selected by `ng build --configuration prod`.
//
// Only the fields that differ from the common defaults in ./environment.base.ts,
// with one deliberate split:
//
//   * committed literals — `production`, `useMockPayments`, `useDevApiEndpoints`.
//     These never vary per deploy, so they must never be reachable from the
//     gitignored file. They are what lets prod-config-guard.ts fire at all.
//   * `prodEnv.*` — the values that genuinely differ per deploy, generated into
//     environment.prod.local.ts by `node scripts/inject-prod-env.js` from env vars.
//     Never commit a real key here: OBRS-frontend is a public repo.
//
// Copying environment.sit.ts as a template is what this file exists to prevent:
// sit does NOT override `omisePublicKey`, so it silently inherits the committed
// `pkey_test_` from environment.base.ts.
export const environment = {
  ...environmentBase,
  production: true,
  useMockPayments: false,
  useDevApiEndpoints: false,
  apiUrl: prodEnv.apiUrl,
  omisePublicKey: prodEnv.omisePublicKey,
  promptpay: {
    ...environmentBase.promptpay,
    id: prodEnv.promptpayId,
  },
  mapsApiKey: prodEnv.mapsApiKey,
  googleClientId: prodEnv.googleClientId,
  maptilerKey: prodEnv.maptilerKey,
};

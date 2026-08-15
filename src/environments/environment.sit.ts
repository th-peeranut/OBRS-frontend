import { environmentBase } from './environment.base';
import { localEnv } from './environment.local';

// Only the fields that differ from the common defaults in ./environment.base.ts.
export const environment = {
  ...environmentBase,
  apiUrl: 'https://sit-obrs-backend.koyeb.app',
  // OBRS-1094: there is deliberately NO `promptpay` override here, so SIT
  // inherits the `0123456789` placeholder from environment.base.ts.
  //
  // ⛔ Do not put a real PromptPay id back. This value used to be a team
  // developer's personal mobile number, and because `OBRS-frontend` is a PUBLIC
  // repo it was published twice over: in git history (since 2026-01-15) and,
  // compiled, in the SIT bundle that anyone could download unauthenticated.
  //
  // Nothing renders it. Measured 2026-08-06: the only readers of
  // `environment.promptpay.id` anywhere in `src/` are environment.prod.ts (which
  // takes it from the gitignored environment.prod.local.ts) and
  // prod-config-guard.ts — both prod-only. The QR a passenger actually scans is
  // issued by Omise via the backend, not from this field. So an id here buys
  // nothing and can only leak.
  //
  // The real prod id stays where OBRS-390 put it: injected at build time from
  // PROD_PROMPTPAY_ID into environment.prod.local.ts, which is gitignored.
  useDevApiEndpoints: false,
  // OBRS-933: the OBRS-831 `features.fleetMap: true` override that used to sit
  // here is gone. It existed only to make the tile/marker ACs measurable on SIT
  // while `environmentBase.features.fleetMap` was still `false` for the go-live
  // scope cut; that base value is now `true`, so an override here would be a
  // second source of truth saying the same thing. ADR-0031's "single point of
  // truth" is `environment.base.ts` again.
  mapsApiKey: localEnv.mapsApiKey,
  googleClientId: localEnv.googleClientId,
  maptilerKey: localEnv.maptilerKey,
  // OBRS-867 AC-6: SIT is where the events are proven to arrive before prod
  // ever gets a tag. Blank until the owner provisions the IDs — blank is a
  // no-op, not a failure.
  analytics: {
    ga4MeasurementId: localEnv.ga4MeasurementId,
    clarityProjectId: localEnv.clarityProjectId,
  },
};

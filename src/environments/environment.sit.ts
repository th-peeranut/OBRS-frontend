import { environmentBase } from './environment.base';
import { localEnv } from './environment.local';

// Only the fields that differ from the common defaults in ./environment.base.ts.
export const environment = {
  ...environmentBase,
  apiUrl: 'https://sit-obrs-backend.koyeb.app',
  promptpay: {
    ...environmentBase.promptpay,
    id: '0850951898',
  },
  useDevApiEndpoints: false,
  // OBRS-831: re-enable the staff fleet live map on SIT ONLY, and deliberately
  // NOT by flipping `environmentBase.features.fleetMap` — that value is shared
  // with the prod build, and two of the prod preconditions are still open:
  // `PROD_MAPTILER_API_KEY` has never been provisioned (OBRS-831 AC6, so a prod
  // build would inherit `maptilerKey: ''` and render the MAP_UNAVAILABLE
  // placeholder), and the CSP `img-src` fix that lets tiles load at all on the
  // VM is committed but not yet applied to prod's Caddyfile (OBRS-833). Turning
  // it on here is what makes the tile/marker ACs measurable now; the base flip
  // is the separate post-go-live step OBRS-622 AC6 describes, and it stays a
  // one-liner. ADR-0031 anticipated exactly this ("or a per-environment
  // override, if a future need ever requires divergence").
  features: {
    ...environmentBase.features,
    fleetMap: true,
  },
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

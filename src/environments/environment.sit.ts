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
  // with the prod build, and prod is not in a state to receive this feature:
  //   - `PROD_MAPTILER_API_KEY` has never been provisioned (OBRS-831 AC6), so a
  //     prod build inherits `maptilerKey: ''` and renders the MAP_UNAVAILABLE
  //     placeholder. Nothing in the repo sets it and
  //     docs/prod/RUNBOOK-OBRS-390-prod-frontend-config.md never mentions it,
  //     which is why it was never provisioned by anyone following the runbook.
  //   - prod is not serving this SPA at all. Measured 2026-07-30: every FE route
  //     on https://nj-phuyaipu.com (`/`, `/index.html`, `/login`) answers 404
  //     with no CSP header, while `/api/public/schedules` answers WITH one — so
  //     Caddy is up and the site block is live, but the built bundle is not
  //     where its file server looks (OBRS-203/205 territory, not this card's).
  // A base flip would therefore have aimed a go-live-CUT feature at an
  // environment that cannot render it and is not serving the app anyway.
  // Turning it on here is what makes the tile/marker ACs measurable now; the
  // base flip is the separate post-go-live step OBRS-622 AC6 describes, and it
  // stays a one-liner. ADR-0031 anticipated exactly this ("or a per-environment
  // override, if a future need ever requires divergence").
  //
  // CORRECTION (same day): the first version of this comment also claimed
  // OBRS-833's CSP `img-src` fix was "committed but not yet applied to prod's
  // Caddyfile". That was wrong and was never measured — the running prod host
  // serves `img-src ... https://api.maptiler.com` today, and the header is
  // `Content-Security-Policy-Report-Only`, so it could not have blocked a tile
  // even if the entry were missing. CSP is not a reason to keep this on SIT;
  // the two bullets above are.
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

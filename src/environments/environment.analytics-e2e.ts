import { environmentBase } from './environment.base';

// OBRS-867 — the ONLY build in this repo that ships a non-blank analytics ID.
//
// WHY IT HAS TO EXIST
// AC-1 says the consent gate must be proven "by watching the real network, not
// by reading the code". A build with the committed blank defaults cannot prove
// anything: no tag would ever be requested, consent or not, so a network
// assertion against it passes for the wrong reason — a vacuous green, which is
// the expensive direction (OBRS-823/824).
//
// So this configuration hands the app two DELIBERATELY INVALID IDs. Invalid is
// the point:
//   * the request is still ATTEMPTED — the URL is built from the ID, so
//     `googletagmanager.com/gtag/js?id=…` and `clarity.ms/tag/…` are fetched
//     exactly as they would be in production. That is what the spec observes.
//   * no data can be recorded against a property that does not exist, so
//     running this lane never pollutes a real dashboard the way a copied-in
//     real ID would.
//
// Selected by `ng serve --configuration analytics-e2e` (see angular.json) and
// driven by playwright.obrs867.config.ts. It is NOT a deploy target and must
// never become one.
//
// apiUrl points at SIT rather than a local backend on purpose: this lane asserts
// on network traffic to third-party hosts and needs the app to render normally
// without anyone first booting Postgres and Spring.
export const environment = {
  ...environmentBase,
  apiUrl: 'https://sit-obrs-backend.koyeb.app',
  analytics: {
    ga4MeasurementId: 'G-OBRS867FAKE',
    clarityProjectId: 'obrs867fake',
  },
};

// OBRS-390 — generates src/environments/environment.prod.local.ts from build-time
// env vars, the same shape as inject-sit-env.js does for SIT.
//
// Run before a prod build:
//   node scripts/inject-prod-env.js && npm run build -- --configuration prod
//
// This is the FIRST of two gates. It refuses to emit a file that would build a
// prod bundle unable to take real money. The second gate (prod-config-guard.ts)
// re-checks the same values at boot, because this script is not the only way the
// generated file can come into being — it is gitignored, so a hand-written or
// stale copy is reviewed by nobody and still builds cleanly.
//
// The PROD_ prefix is deliberate: an unprefixed MAPS_API_KEY lying around in a
// shell or a shared CI project must not be able to satisfy a prod build by
// accident. Every value here has to be named for prod on purpose.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'environments', 'environment.prod.local.ts');

const values = {
  apiUrl: process.env.PROD_API_URL,
  // Trimmed at the source, not just before the check below: a value exported from a
  // shell heredoc or copied out of a dashboard arrives with a trailing newline often
  // enough, and untrimmed it would both fail this gate with a message that names the
  // wrong problem and, if it got through, ship a key Omise.js cannot tokenize.
  omisePublicKey: (process.env.PROD_OMISE_PUBLIC_KEY || '').trim() || undefined,
  promptpayId: process.env.PROD_PROMPTPAY_ID,
  mapsApiKey: process.env.PROD_MAPS_API_KEY,
  googleClientId: process.env.PROD_GOOGLE_CLIENT_ID,
};

const envVarNames = {
  apiUrl: 'PROD_API_URL',
  omisePublicKey: 'PROD_OMISE_PUBLIC_KEY',
  promptpayId: 'PROD_PROMPTPAY_ID',
  mapsApiKey: 'PROD_MAPS_API_KEY',
  googleClientId: 'PROD_GOOGLE_CLIENT_ID',
};

const failures = [];

for (const [name, value] of Object.entries(values)) {
  if (!value) {
    failures.push(`${envVarNames[name]} is not set`);
  }
}

// OBRS-946 - the shape Omise actually issues, which is NOT `pkey_live_`. Only the TEST
// key names its environment (`pkey_test_` + 19 chars); the live key is the prefix and
// the id (`pkey_` + 19 chars), measured 2026-07-31 against the key on the prod VM - the
// one that took a real 20.00 THB charge. The old `startsWith('pkey_live_')` therefore
// failed this build on the CORRECT key and would have passed only a fabricated one.
//
// Still an allowlist and not a `!startsWith('pkey_test_')` denylist, for the reason the
// original comment gave: a denylist waves through an empty value, an unsubstituted
// placeholder, and a secret key (skey_live_) pasted in by mistake. This pattern refuses
// all three AND `pkey_test_`, because `_` is outside the character class, so no
// `pkey_<environment>_<id>` shape can match it.
//
// Byte-identical to OMISE_LIVE_PUBLIC_KEY in src/environments/prod-config-guard.ts, and
// `npm run test:omise-key` fails the build if the two ever drift. That gate exists
// because OBRS-926 and OBRS-946 are the same bug found twice: one wrong assertion in
// this pair gets fixed and its twin in the other file is left behind.
const OMISE_LIVE_PUBLIC_KEY = /^pkey_[A-Za-z0-9]{19}$/;

if (values.omisePublicKey && !OMISE_LIVE_PUBLIC_KEY.test(values.omisePublicKey)) {
  failures.push(
    `${envVarNames.omisePublicKey} is not a live Omise PUBLIC key (expected ` +
      `${OMISE_LIVE_PUBLIC_KEY} - 'pkey_' + 19 chars, with NO 'live' or 'test' segment; ` +
      "only the test key is labelled). A pkey_test_ key tokenizes against Omise's test " +
      'vault: the payment returns success, the ticket is issued, and no money moves.',
  );
}

if (values.apiUrl && !values.apiUrl.startsWith('https://')) {
  failures.push(`${envVarNames.apiUrl} must be an https:// URL (got '${values.apiUrl}')`);
}

if (failures.length > 0) {
  const message = [
    'inject-prod-env: refusing to generate a prod config that cannot take real money.',
    '',
    ...failures.map((f) => `  - ${f}`),
    '',
    'See docs/prod/RUNBOOK-OBRS-390-prod-frontend-config.md.',
  ].join('\n');
  throw new Error(message);
}

// OBRS-424: MapTiler key for the internal fleet live map. Deliberately NOT
// added to `values`/`envVarNames`/the failures check above — those gates
// exist specifically to stop a bundle that cannot take real money (this
// file's own header comment). A missing MapTiler key costs only a map: it
// degrades to the already-implemented MAP_UNAVAILABLE placeholder
// (FleetMapPanelComponent.canShowMap), never a build failure. Defaults to ''
// when unset so the prod build doesn't start failing before anyone has
// provisioned the variable.
const maptilerKey = process.env.PROD_MAPTILER_API_KEY || '';

// OBRS-867: measurement tag IDs, optional for the same reason as maptilerKey -
// their absence costs a chart, not a payment, so they must not be able to fail
// a prod build. Blank means AnalyticsTagsService injects no tag at all, which
// is also the correct state for the window between this code shipping and the
// owner provisioning the properties.
const ga4MeasurementId = process.env.PROD_GA4_MEASUREMENT_ID || '';
const clarityProjectId = process.env.PROD_CLARITY_PROJECT_ID || '';

// JSON.stringify, not string interpolation: a value containing a quote or a newline
// would otherwise emit a file that is either broken or, worse, silently valid TS
// holding the wrong value.
const content = `// GENERATED by scripts/inject-prod-env.js — do not edit, do not commit.
export const prodEnv = {
  apiUrl: ${JSON.stringify(values.apiUrl)},
  omisePublicKey: ${JSON.stringify(values.omisePublicKey)},
  promptpayId: ${JSON.stringify(values.promptpayId)},
  mapsApiKey: ${JSON.stringify(values.mapsApiKey)},
  googleClientId: ${JSON.stringify(values.googleClientId)},
  maptilerKey: ${JSON.stringify(maptilerKey)},
  ga4MeasurementId: ${JSON.stringify(ga4MeasurementId)},
  clarityProjectId: ${JSON.stringify(clarityProjectId)},
};
`;

fs.writeFileSync(filePath, content);
console.log(`inject-prod-env: wrote ${filePath}`);

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'environments', 'environment.local.ts');

const values = {
  mapsApiKey: process.env.MAPS_API_KEY,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
};

for (const [name, value] of Object.entries(values)) {
  if (!value) {
    throw new Error(`inject-sit-env: missing required env var for ${name}`);
  }
}

// OBRS-424: MapTiler key for the internal fleet live map. Deliberately NOT
// added to the `values` required-check loop above — those gates exist to stop
// a bundle that cannot take real money (OBRS-390's own stated rationale for
// mapsApiKey/googleClientId). A missing MapTiler key costs only a map: it
// degrades to the already-implemented MAP_UNAVAILABLE placeholder
// (FleetMapPanelComponent.canShowMap), never a build failure. Defaults to ''
// when unset so the SIT Netlify build doesn't start failing before anyone has
// provisioned the variable.
const maptilerKey = process.env.MAPTILER_API_KEY || '';

const content = `export const localEnv = {
  mapsApiKey: '${values.mapsApiKey}',
  googleClientId: '${values.googleClientId}',
  maptilerKey: '${maptilerKey}',
};
`;

fs.writeFileSync(filePath, content);

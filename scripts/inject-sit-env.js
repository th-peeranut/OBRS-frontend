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

const content = `export const localEnv = {
  mapsApiKey: '${values.mapsApiKey}',
  googleClientId: '${values.googleClientId}',
};
`;

fs.writeFileSync(filePath, content);

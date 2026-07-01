const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'environments', 'environment.sit.ts');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = {
  __MAPS_API_KEY__: process.env.MAPS_API_KEY,
  __GOOGLE_CLIENT_ID__: process.env.GOOGLE_CLIENT_ID,
};

for (const [placeholder, value] of Object.entries(replacements)) {
  if (!value) {
    throw new Error(`inject-sit-env: missing required env var for ${placeholder}`);
  }
  content = content.split(placeholder).join(value);
}

fs.writeFileSync(filePath, content);

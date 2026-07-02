import { environmentBase } from './environment.base';

// local backend only — selected via `npm run start:local`. Default `npm start`
// now uses environment.sit.ts (SIT backend on Koyeb).
export const environment = {
  ...environmentBase,
};

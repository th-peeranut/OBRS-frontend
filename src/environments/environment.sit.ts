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
  mapsApiKey: localEnv.mapsApiKey,
  googleClientId: localEnv.googleClientId,
};

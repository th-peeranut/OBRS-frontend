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
  maptilerKey: localEnv.maptilerKey,
  // OBRS-867 AC-6: SIT is where the events are proven to arrive before prod
  // ever gets a tag. Blank until the owner provisions the IDs — blank is a
  // no-op, not a failure.
  analytics: {
    ga4MeasurementId: localEnv.ga4MeasurementId,
    clarityProjectId: localEnv.clarityProjectId,
  },
};

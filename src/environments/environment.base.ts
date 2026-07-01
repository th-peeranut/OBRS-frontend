// Common defaults shared by every environment.*.ts file. Angular's build
// `fileReplacements` swaps out `environment.ts` per configuration, so the
// shared base must live under a different filename or those files would
// end up importing themselves.
export const environmentBase = {
  production: false,
  apiUrl: 'http://localhost:8000',
  promptpay: {
    baseUrl: '',
    id: '0123456789',
  },
  omisePublicKey: 'pkey_test_5rd059u8cgynfe12lds',
  useMockPayments: false,
  useDevApiEndpoints: true,
  homeRouteSlug: 'chonburi_bangkok',
  mapsApiKey: '',
  googleClientId: '',
};

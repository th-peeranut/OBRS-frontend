export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000', // local backend only — selected via `npm run start:local`. Default `npm start` now uses environment.sit.ts (SIT backend on Koyeb).
  promptpay: {
    baseUrl: '',
    id: '0123456789',
  },
  omisePublicKey: 'pkey_test_5rd059u8cgynfe12lds',
  useMockPayments: false,
  useDevApiEndpoints: true,
  homeRouteSlug: 'chonburi_bangkok',
  mapsApiKey: '',
};

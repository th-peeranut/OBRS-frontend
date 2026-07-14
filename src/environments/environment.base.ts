// Common defaults shared by every environment.*.ts file. Angular's build
// `fileReplacements` swaps out `environment.ts` per configuration, so the
// shared base must live under a different filename or those files would
// end up importing themselves.
export const environmentBase = {
  production: false,
  // Local backend default (OBRS-367): the un-overridden base URL is only ever
  // used by `environment.ts` (the `npm run start:local` / `ng test` config);
  // `environment.sit.ts` overrides it. The local Spring Boot backend serves on
  // :8080 (`./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,local`), so
  // this must match it — a stale :8000 here made `npm run start:local` 500 on
  // login until every dev hand-patched it.
  apiUrl: 'http://localhost:8080',
  promptpay: {
    baseUrl: '',
    id: '0123456789',
  },
  jira: {
    browseBaseUrl: 'https://nj-phuyaipu.atlassian.net/browse/',
  },
  omisePublicKey: 'pkey_test_5rd059u8cgynfe12lds',
  useMockPayments: false,
  useDevApiEndpoints: true,
  homeRouteSlug: 'chonburi_bangkok',
  mapsApiKey: '',
  googleClientId: '',
};

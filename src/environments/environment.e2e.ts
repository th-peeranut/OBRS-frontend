import { environmentBase } from './environment.base';

// OBRS-184: the local full-stack E2E lane (playwright.local.config.ts).
//
// Why this exists instead of reusing `environment.ts` (which already points at a
// local backend on :8080): :8080 / :4200 are the ports a developer's own
// `mvnw spring-boot:run` + `npm run start:local` occupy. Parallel sessions are
// normal in this repo, so an E2E run that claimed those ports would either fail
// to start or — worse — silently talk to whatever backend was already listening,
// against whatever database THAT process was pointed at. The lane therefore owns
// a private port pair and a private database (`obrs184qa`), and can run
// alongside an unrelated dev stack without either noticing the other.
//
// The backend half must be booted on the matching port with:
//   SERVER_PORT=8181
//   SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/obrs184qa
//   APP_FRONTEND_URL=http://localhost:4210   <- makes dev CORS accept this origin
// playwright.local.config.ts does this for you; see its header.
//
// No `environment.local` import here (unlike environment.sit.ts): that file is
// gitignored, and the E2E lane must run on a fresh clone with no manual setup.
// Maps/Google-signin are not exercised by this lane, so the empty base defaults
// are correct rather than merely tolerable.
export const environment = {
  ...environmentBase,
  apiUrl: 'http://localhost:8181',
};

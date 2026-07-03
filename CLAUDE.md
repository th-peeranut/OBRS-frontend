# CLAUDE.md (OBRS Frontend)

## 1. Project Overview
OBRS (Online Bus Reservation System) frontend is an Angular 18 single-page application serving two distinct user groups: **B2C Travelers** for searching and booking intercity bus tickets, and **Internal Staff** (Admins) for managing schedules, fleet operations, bookings, and pricing.

### Core Goals:
- **Reactive State**: All cross-page state flows through NgRx; local component state is for UI-only concerns (loading toggles, form state, visibility flags).
- **Localization**: Full TH, EN, and ZH support via `ngx-translate`. ZH is currently a gap — every new i18n key must include all three locales.
- **API Transparency**: All backend communication goes through typed services using the `ResponseAPI<T>` envelope; no raw HTTP calls in components.

## 2. Tech Stack
- **Core**: Angular 18, TypeScript 5.5 (strict mode), RxJS 7
- **State**: NgRx 18 (Store, Effects, Selectors)
- **UI**: PrimeNG 17 (complex widgets) + Bootstrap 5 (layout and utilities)
- **i18n**: `ngx-translate` with JSON files in `public/i18n/`
- **Alerts**: SweetAlert2 via `AlertService` (never import SweetAlert2 directly in components)
- **Date**: `dayjs` for all date formatting and manipulation
- **Payments**: Omise (public key from `environment.omisePublicKey`)
- **Testing**: Jasmine + Karma + ChromeHeadless

### Forbidden / Anti-Patterns:
- **No standalone components**: This project is module-based. Do not create standalone components.
- **No field injection**: Angular DI always via constructor.
- **No `.toPromise()`**: Services must return `Observable<T>`. Never convert to Promise.
- **No direct `.subscribe()` without cleanup**: Always use `takeUntil(destroy$)` in components.
- **No hardcoded URLs**: Always use `environment.apiUrl`.
- **No hardcoded strings**: All user-facing text must go through `ngx-translate`.
- **No `any` type**: TypeScript strict mode is on. Use proper interfaces.
- **No direct HTTP in components**: All HTTP calls go through services in `src/app/services/` or `src/app/auth/`.
- **No direct SweetAlert2 imports in components**: Use `AlertService`.
- **No new `package.json` dependencies** without prior approval.

## 3. Architecture
One-way data flow: **Component → Store (dispatch) → Effect → Service (HTTP) → Action → Reducer → Selector → Component**.

### Layer Responsibilities:
- `src/app/modules/{name}/pages/`: Smart (page) components. May inject Store and dispatch actions. Zero direct HTTP calls.
- `src/app/modules/{name}/components/`: Dumb (presentational) components. Input/Output only. No Store injection.
- `src/app/shared/components/`: Cross-module reusable presentational components.
- `src/app/services/`: Feature HTTP services. Return `Observable<T>`. No state management logic.
- `src/app/auth/`: Auth-specific service and guard. Do not add unrelated logic here.
- `src/app/shared/stores/`: Global NgRx state shared across modules (booking, station, schedule, passenger-info).
- `src/app/modules/{name}/store/`: Feature-local NgRx state scoped to that module only.
- `src/app/shared/interceptors/`: HTTP interceptors (auth token, error handling, loading). Do not add business logic here.
- `src/app/shared/interfaces/`: TypeScript interfaces for shared data shapes.
- `src/app/shared/services/`: Cross-module services (e.g., `AlertService`).
- `src/app/shared/lib/`: Pure utility functions (e.g., `generateIdempotencyKey()`).

## 4. Coding Conventions

### Naming:
- **Components**: `{Name}Component` in `{name}.component.ts`
- **Services**: `{Name}Service` in `{name}.service.ts`
- **Modules**: `{Name}Module` in `{name}.module.ts`
- **NgRx Actions**: `{domain}.action.ts`, action creator name `invoke{Domain}Api` / `invoke{Domain}ApiSuccess` / `invoke{Domain}ApiFailure`
- **NgRx Reducers**: `{domain}.reducer.ts`
- **NgRx Effects**: `{domain}.effect.ts`, class name `{Domain}Effect`
- **NgRx Selectors**: `{domain}.selector.ts`, root selector `select{Domain}`
- **Interfaces**: `{Name}` in `{name}.interface.ts` under `shared/interfaces/`
- **Enums**: `{Name}` in `{name}.enum.ts` under `shared/enum/`
- **Guards**: `{name}.guard.ts`
- **Interceptors**: `{name}.interceptor.ts`

### Observable & Subscription Rules:
- In every component that subscribes: declare `private destroy$ = new Subject<void>()`, pipe all subscriptions with `.pipe(takeUntil(this.destroy$))`, and call `this.destroy$.next(); this.destroy$.complete()` in `ngOnDestroy`.
- Prefer `async` pipe in templates when the observable maps cleanly to a template value — it handles unsubscription automatically.
- In effects: use `switchMap` for exclusive/cancellable requests, `mergeMap` for concurrent requests (e.g., cache checks).

### NgRx Action Convention:
- Action type strings: `[{Domain} API] {verb} {noun}` (e.g., `[ScheduleBooking API] Invoke to get Schedule Booking`).
- Pair every API action with a success and failure action.

### HTTP / API Rules:
- All services inject `HttpClient` directly (constructor injection).
- Wrap all responses with `ResponseAPI<T>` from `shared/interfaces/response.interface.ts`.
- Use `SKIP_GLOBAL_ERROR_ALERT` / `SKIP_GLOBAL_LOADING_ALERT` context tokens when the component handles its own error/loading UX.

### Error Handling:
- The global `errorInterceptor` handles API errors by calling `AlertService.error()` automatically.
- For per-component error handling that differs from the global pattern, pass the relevant context token and handle locally via `catchError` in the effect.

### Idempotency:
- For payment-related or booking-submission requests, use `generateIdempotencyKey()` from `shared/lib/idempotency-key.ts`.

## 5. UI & Design System
- **Layout**: Bootstrap 5 grid and utilities (not component library — just CSS).
- **Complex widgets**: PrimeNG 17 (Calendar, Dropdown, DataTable, Dialog, etc.).
- **Icons**: Bootstrap Icons.
- **Typography**: Sarabun font (handles Thai script).
- **SCSS**: Component-scoped `.component.scss` files. Global variables in `src/styles/`.
- **Alerts/Toasts**: Always via `AlertService` — never call `Swal.fire()` directly.
- **Change Detection**: Default strategy. Do not switch to OnPush unless there is a demonstrated performance reason.

## 6. Internationalization (i18n)
- **Translation files**: `public/i18n/en.json`, `public/i18n/th.json`, `public/i18n/zh.json`.
- **ZH gap**: `zh.json` does not exist yet and must be created. Every new i18n key must be added to **all three** files.
- **Default locale**: Thai (`'th'`).
- **In templates**: `{{ 'KEY' | translate }}` only — never hardcode user-facing strings.
- **In components/services**: `TranslateService.instant('KEY')` for synchronous use, `.get('KEY')` (with `takeUntil`) for reactive use.
- **Language switching**: `translate.use(lang)` persists to `localStorage` as `app_language`.
- **PrimeNG locale**: After language switch, call `primengConfig.setTranslation()` with translated calendar keys.

## 7. Testing & Quality
**Checklist before completion:**
1. `ng build --configuration production` passes with no errors. Bundle budgets: 1.5MB warning / 2MB error for initial chunk; 6kB warning / 10kB error per component style.
2. `ng test --watch=false --browsers ChromeHeadless` passes for the spec files covering changed logic.
3. New services must have at least one spec file. New components should have a spec file; if creating a new component on a class with no existing spec, creating the spec is part of the task.
4. No `any` introduced (TypeScript strict mode).
5. No hardcoded strings or URLs.

**Chrome requirement**: `ng test` requires ChromeHeadless. If Chrome is not found, escalate with: "ChromeHeadless not available — `ng test` skipped, manual verification required."

**Live browser verification**: Always verify UI/frontend changes live in the browser (DOM inspection or screenshots) before considering them complete. Restart the dev server if results look stale.

## 8. File Placement Rules

### New Feature (B2C or Admin):
- Page component → `src/app/modules/{name}/pages/{feature}/{feature}-page.component.{ts,html,scss}`
- Reusable component (module-local) → `src/app/modules/{name}/components/{feature}/`
- Reusable component (cross-module) → `src/app/shared/components/{feature}/`
- Feature HTTP service → `src/app/services/{feature}.service.ts`
- NgRx (global cross-feature) → `src/app/shared/stores/{feature}/`
- NgRx (module-local) → `src/app/modules/{name}/store/{feature}/`

### New Interface:
- Shared across modules → `src/app/shared/interfaces/{name}.interface.ts`
- Module-local → co-locate with the component or add to the module's own interfaces folder.

### New i18n Key:
- Add to `public/i18n/en.json`, `public/i18n/th.json`, **and** `public/i18n/zh.json`.

### Decision Rules:
- Before creating a new service, check if a related domain service already exists in `src/app/services/`. Prefer adding a method to an existing service if they share the same domain entity.
- Before creating a new shared store slice, check `src/app/shared/stores/`. Cross-page state belongs there; page-local loading/error UI state stays in the component.

## 9. Safety Rules
- **DO NOT MODIFY** without explicit request:
  - `src/app/auth/auth.interceptor.ts` and `src/app/auth/auth.guard.ts`.
  - `src/app/shared/interceptors/error.interceptor.ts`.
  - `src/app/shared/lib/idempotency-key.ts` and any payment-flow logic.
- **Sensitive Flows**: Auth, payment (Omise), and booking-submission logic must be flagged for manual review if changed.

## 10. Commands
```bash
npm start                          # Dev server on http://localhost:4200, against the SIT backend (default)
npm run start:local                # Dev server against the local backend (http://localhost:8000)
ng build                           # Production build
ng build --configuration sit       # SIT build
ng test --watch=false --browsers ChromeHeadless   # CI-safe test run
ng test                            # Interactive test (opens browser)
npx tsc --noEmit -p tsconfig.app.json              # Authoritative type check
```

> **Type-check gotcha:** the esbuild dev builder (`npm start` / `ng build --configuration development`) emits JS and reports `exit 0` even when there are TypeScript type errors — they surface only as the in-browser dev overlay, not as a failed build. Do **not** treat a green dev build as a passing type check. Use `npx tsc --noEmit -p tsconfig.app.json` (or a production `ng build`) as the reliable type gate before committing.

## 11. Security Rules
- **Secrets**: Omise public key and API URLs must live in `environment.ts` / `environment.sit.ts`. Never hardcode in components or services.
- **Logging**: Never log auth tokens, OTPs, or payment details to the console.
- **localStorage**: Only non-sensitive data (language preference, return URL). Auth token storage follows the existing `auth_token` key — do not rename or duplicate it.
- **Input**: Use Angular Reactive Forms with validators. Never trust raw user input in service calls.

## 12. Live Documentation
Keep the following in sync with relevant code changes:
- **`CONTEXT.md`** (repo root): domain glossary only — terms, definitions, preferred vs. avoided names. Update when a new domain concept is introduced or naming is reworked.
- **`docs/adr/`**: Add an ADR for hard-to-reverse, surprising, trade-off-driven decisions (new state management pattern, new third-party library, deliberate deviation from conventions).

## 13. AI Action Protocol

### Risk Levels (General)

Classify **every action** before proceeding, regardless of whether it touches the backend contract:

| Level | Definition | Examples | Action |
|---|---|---|---|
| **R0** | Irreversible or high blast-radius | Push to main, modify auth/payment flows (`auth.interceptor.ts`, `idempotency-key.ts`), delete a shared state slice, remove a shared interface used across modules | **Stop. State the classification explicitly and confirm with the developer before proceeding. Do not implement unilaterally.** |
| **R1** | Reversible but requires care or notification | Add a `package.json` dependency, update shared interfaces after a backend contract change, change a shared interceptor, update NgRx state for a renamed field, add a new i18n key | Proceed, then document the change in the relevant living docs and notify affected parties (e.g., update `docs/handoff.md` Contract Requests, add ADR). |
| **R2** | No broad impact, easy to revert | Fix UI, update config, rename a local variable, fix a style bug, add/update tests | Proceed immediately. |

**Escalation rule**: If a task begins as R2 but incidentally touches an R1 or R0 concern, reclassify before continuing.

---

### Cross-Repo Governance

The general risk levels above apply everywhere. The rules below **add** backend-specific obligations on top for changes that consume or depend on the shared API contract.

#### The Contract

The API contract (endpoint paths, request/response shapes, auth levels, error codes, envelope format) lives in the backend repository:

```
../OBRS-backend/docs/api/
```

When you need to know what an endpoint returns, read those files. Do not assume backend behavior that is not documented there. `ResponseAPI<T>` (called `ApiResponse` in the domain glossary) has a fixed shape — `{ status, message, data }` — defined by the backend. Do not modify it.

#### Rules

- **Do not change the API shape yourself.** If the contract doesn't match what the frontend expects, stop and ask — do not guess or work around it.
- **Do not add fields to request bodies** that are not in the contract.
- **Do not call an endpoint** that is not yet documented in `../OBRS-backend/docs/api/`.

#### Handoff Notes

`docs/handoff.md` is the two-way coordination channel between this repo and the backend:

- **Read the "Pending Changes" section** before starting any task that consumes a new or changed endpoint.
- **Write to the "Contract Requests" section** when you discover the API contract is missing a field you need, returns an unnecessary field, or has a shape that doesn't match what the frontend requires. Use the template in `docs/handoff.md`. Do not work around a missing field silently — always write a contract request and stop.

#### API Contract Risk Levels

| Level | Definition | Examples | Additional Action |
|---|---|---|---|
| **R0** | Hard to reverse or breaks the contract | Push to main, assume an undocumented endpoint/field exists | Stop (per general R0). Coordinate with the backend first. Do not proceed until both sides are aligned. |
| **R1** | Reversible but requires cross-repo notification | Update interface shapes after a backend contract change, consume a newly documented endpoint | Proceed (per general R1), then add a **Contract Requests** entry to `docs/handoff.md` if the backend still needs to act. |
| **R2** | No cross-repo impact | Fix UI, update config, rename a variable, fix a style bug | Proceed immediately. No cross-repo action needed. |

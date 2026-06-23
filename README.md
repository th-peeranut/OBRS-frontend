# OBRS Frontend

Angular frontend for the Online Bus Reservation System (OBRS).

## Tech Stack

- Angular 18
- TypeScript 5
- NgRx
- PrimeNG + Bootstrap

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Angular CLI (optional, local npm scripts are enough)

Verify:

```bash
node -v
npm -v
```

## Quick Start

1. Go to project directory:

```bash
cd OBRS-frontend
```

2. Install dependencies:

```bash
npm install
```

3. Run local development server:

```bash
npm start
```

App URL:
- `http://localhost:4200`

## Environments

The environment is selected **at startup** — it is baked into the running app and cannot be changed while the app is running.

| Environment | API backend | Command |
|---|---|---|
| Local (default) | `http://localhost:8000` | `npm start` |
| SIT | `https://sit-obrs-backend.koyeb.app` | `npm run start:sit` |

Environment config files live in `src/environments/`.

**To work against two backends at the same time**, open two terminals and start each on a different port:

```bash
# Terminal 1 — local backend
npm start
# → http://localhost:4200

# Terminal 2 — SIT backend (pick any free port)
npx ng serve --configuration sit --port 4201
# → http://localhost:4201
```

Open both URLs in separate browser tabs or windows and switch between them as needed.

## Useful Commands

Run with SIT configuration:

```bash
npm run start:sit
```

Build:

```bash
npm run build
```

Build SIT:

```bash
npm run build:sit
```

Run unit tests:

```bash
npm test
```

## Local Full-Stack Run

1. Start backend first on `http://localhost:8000`.
2. Start frontend with `npm start`.
3. Open `http://localhost:4200`.

## Admin UI Conventions

Admin list pages render a loading and empty state directly in the table body: while `isLoading` is true, iterate `skeletonRows` to show shimmer placeholder rows (`.admin-skeleton`, with the `--sm` / `--pill` modifiers to mirror each column's shape), and once loaded show the data rows plus a single `.admin-empty-row` carrying `ADMIN.COMMON.NO_DATA` when the result set is empty. These styles live in `src/styles/admin-theme.scss` (shared, not per-component) — reuse them on any new admin table rather than redefining a spinner, since the SIT backend can cold-start and a blank table reads as broken.

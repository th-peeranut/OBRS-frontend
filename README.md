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

- Local config: `src/environments/environment.ts`
  - default API URL: `http://localhost:8000`
- SIT config: `src/environments/environment.sit.ts`
  - API URL: `https://sit-obrs-backend.koyeb.app`

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

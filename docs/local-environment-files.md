# The two gitignored environment files (OBRS-536)

`src/environments/` holds two files that git never carries: `environment.local.ts` and
`environment.prod.local.ts`. OBRS-frontend is a **public** repo, so the Google Maps key, the
Google OAuth client id, the live Omise public key and the PromptPay account id cannot be
committed. Everything else about them follows from that one fact — including the way they break.

## If you have just created a worktree or cloned the repo

```bash
cp src/environments/environment.local.example.ts src/environments/environment.local.ts
```

Then fill in real values *if you need the features they drive*. **Blank values build and run.**
`mapsApiKey: ''` costs you the route map, `maptilerKey: ''` renders the MAP_UNAVAILABLE
placeholder, `googleClientId: ''` costs the Google sign-in button; nothing else changes. So there
is no reason to skip this step, and no reason to hunt for a key before doing it.

You do **not** need `environment.prod.local.ts`. `npm run build:prod` generates it itself
(`node scripts/inject-prod-env.js`), and nothing else reads it.

## Which lane needs which file

| You run | Angular config | Reads a gitignored file? |
|---|---|---|
| `npm start`, `npm run start:sit`, `npm run start:https`, `npm run build:sit` | `sit` | **yes** — `environment.local.ts` |
| `npm run e2e`, `npm run e2e:ui` | `sit` (via `playwright.config.ts`) | **yes** — `environment.local.ts` |
| `npm run start:local`, `npm test`, `npm run build` (`ci-smoke`), `npm run e2e:gate` | default / `ci-smoke` | no — `environment.ts` |
| `npm run e2e:local` | `e2e` | no — `environment.e2e.ts` |
| `npm run build:prod` | `prod` | generates `environment.prod.local.ts` first |
| Netlify SIT deploy | `sit` | generates `environment.local.ts` first (`scripts/inject-sit-env.js`) |

`environment.e2e.ts` deliberately imports nothing gitignored — see its header. That is why the
merge-gate E2E lane runs on a bare CI checkout with no setup at all.

## What goes wrong, and why a comment could not have prevented it

The committed side of this contract moves and the gitignored side does not. OBRS-424 added
`maptilerKey: localEnv.maptilerKey` to `environment.sit.ts` and correctly updated both things a
commit *can* update — `environment.local.example.ts` and `scripts/inject-sit-env.js`. Every
checkout that already had an `environment.local.ts` still broke, because a file git does not
track is a file git cannot update:

```
X [ERROR] TS2339: Property 'maptilerKey' does not exist on type
'{ mapsApiKey: string; googleClientId: string; }'. [plugin angular-compiler]
    src/environments/environment.sit.ts:15:24
```

and it does not arrive looking like that. Under Playwright the compiler's output is prefixed
`[WebServer]` and the run dies with `Timed out waiting 120000ms from config.webServer`, which
reads as a slow machine. Both worktrees on the reporting machine were in that state at once, and
`playwright.obrs617.config.ts` had already been written *around* this lane for the same reason —
a card designing round a defect nobody had a card for.

## The gate

`scripts/check-local-env.mjs` (`npm run test:local-env`) checks the whole contract. Every lane in
the table above runs it through an npm `pre` hook, and CI runs it as a pure-node step before
`npm ci`. It derives the **required field set from the committed consumers** — every
`localEnv.<field>` / `prodEnv.<field>` reference in `src/environments/environment*.ts` — because
that is what the compiler will demand; the example file is only a guess about that set, and it
was the example being *right* that made OBRS-424 look complete. Then:

- `*.example.ts` must declare exactly that set (missing → a fresh checkout that copies it still
  cannot build; extra → a field outliving its last reader).
- `scripts/inject-*.js` must emit exactly that set. This is the deploy path and it copies no
  template: a field added to `environment.sit.ts` and to the example but not to the generator
  breaks **Netlify** while every checkout on your machine is fine.
- Your own `environment.local.ts`, if present, must hold at least that set. Extra fields are
  allowed here and only here — your copy may carry a value for a branch you also have in flight.

It reports field names, not values. A field present but empty passes, deliberately: `''` is a
supported state. Value-level rules for prod live in `scripts/inject-prod-env.js` and
`src/environments/prod-config-guard.ts`.

Known blind spot: a lane that runs `npx ng serve --configuration sit` **without** going through
an npm script bypasses the hook. Every playwright config in this repo whose `webServer` needs the
SIT configuration was moved onto `npm run start:sit` when this gate landed; a new one written the
old way gets the old failure.

## Adding a field to the contract

Add it in all three committed places in the same commit, then tell people:

1. `src/environments/environment.sit.ts` (or `environment.prod.ts`) — the consumer.
2. `src/environments/environment.local.example.ts` (or `environment.prod.local.example.ts`).
3. `scripts/inject-sit-env.js` (or `scripts/inject-prod-env.js`), **and** the matching env var
   in the Netlify project / prod host. The SIT and prod variable names differ on purpose:
   `MAPTILER_API_KEY` vs `PROD_MAPTILER_API_KEY`, so an unprefixed value lying around in a shell
   cannot satisfy a prod build by accident.

The gate fails 1-vs-2 and 1-vs-3 immediately. Everyone else's already-existing
`environment.local.ts` is what it cannot fix for them — they get the gate's message instead of
`TS2339`, which is the whole of what this card bought.

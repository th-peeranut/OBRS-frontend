# RUNBOOK — Prod frontend config (OBRS-390)

How to build a production OBRS frontend bundle, and what to do when it refuses.

Scope: the **config** the prod bundle is built with. Where that bundle is *hosted*
(Oracle VM, Caddy, TLS, the domain) is OBRS-205 / OBRS-203.

---

## Why this is guarded at all

`src/environments/environment.base.ts` ships defaults that are correct for dev and
**silently wrong** for prod:

| base default | what it does in prod |
| --- | --- |
| `omisePublicKey: 'pkey_test_…'` | cards tokenize against Omise's **test vault** — payment returns success, ticket is issued, **no money moves** |
| `promptpay.id: '0123456789'` | the QR encodes an account that is not ours |
| `apiUrl: 'http://localhost:8080'` | reaches no backend |
| `useDevApiEndpoints: true` | OTP + OTP-login call `/test` endpoints that only exist under the backend `dev` profile |

Only the first two are about money, and **only the first two are silent**. That is the
whole reason this card exists: `environment.sit.ts` does **not** override
`omisePublicKey`, so copying it as a template for prod — the most natural thing anyone
would do — carries the test key straight to production with nothing to notice it.

---

## Building a prod bundle

```bash
export PROD_API_URL='https://<prod-domain>'          # must be https
export PROD_OMISE_PUBLIC_KEY='pkey_live_…'           # must start with pkey_live_
export PROD_PROMPTPAY_ID='<the real PromptPay id>'
export PROD_MAPS_API_KEY='<Google Maps browser key>'
export PROD_GOOGLE_CLIENT_ID='<Google OAuth client id>'

npm run build:prod        # = node scripts/inject-prod-env.js && ng build --configuration prod
```

Output: `dist/obrs/browser`.

`PROD_OMISE_PUBLIC_KEY` is a **public** key — it ships inside the bundle by design and
is safe in a browser. The Omise **secret** key (`skey_live_…`) belongs only to the
backend and must never appear in this repo or in these env vars.

### Which configurations deploy, and which do not

**`prod` is the real one.** Until OBRS-472 it had a neighbour called `production` — one
letter apart, opposite meaning — and that name is now gone.

- `prod` — swaps in `environment.prod.ts`. This is what you deploy.
- `sit` — swaps in `environment.sit.ts`. Deployed to SIT by Netlify.
- `ci-smoke` — **not deployable**. No `fileReplacements`, so it builds against
  `environment.ts` (= the base defaults above: `localhost:8080`, `pkey_test_`). CI runs
  it deliberately as an AOT + bundle-budget check (`.github/workflows/ci.yml`); its
  output is never deployed. It is also `defaultConfiguration`, so a bare `ng build`
  produces this and nothing shippable.

If a `ci-smoke` bundle ever reached prod it would fail loudly and instantly (it reaches
`localhost:8080`, so nothing loads) — that is why OBRS-472 was a rename rather than a
guard: the failure was never silent, only confusing.

### There is no container image, on purpose

Prod is **static files behind Caddy on the Oracle VM**, same box as the backend, so the
browser talks to one origin and `apiUrl` is a relative `/api` (OBRS-205, owner decision
2026-07-15). Serving the bundle from its own nginx container would put it back on a second
origin and re-open the cross-origin question that topology exists to remove.

The repo used to carry a `Dockerfile` + `nginx.conf` + `docker-compose.yml` from before that
decision; OBRS-481 deleted them. If you find yourself reaching for `docker build` here, the
answer is `npm run build:prod` and ship `dist/obrs/browser` to the VM.

---

## The two gates

Both check the same values. Neither is redundant.

1. **`scripts/inject-prod-env.js`** (build time) — refuses to generate a config with a
   missing var, a non-`pkey_live_` key, or a non-https API URL. Exits **1**, so the
   `&&` in `build:prod` stops before `ng build` runs.
2. **`src/environments/prod-config-guard.ts`** (boot time) — re-checks the values in the
   bundle that actually shipped, and throws before Angular bootstraps.

Gate 2 exists because gate 1 is not the only way `environment.prod.local.ts` can come
into being: **it is gitignored**, so a hand-edited or stale copy passes review by
nobody and builds perfectly cleanly. Gate 1 validates the values it *generates*; gate 2
validates the values that *shipped*.

The guard only fires when `production === true`. That flag cannot be lost: it is a
committed literal in `environment.prod.ts`, alongside `useMockPayments: false` and
`useDevApiEndpoints: false`. Only values that genuinely vary per deploy come from the
gitignored file — and those are exactly the ones both gates assert.

---

## If the boot guard fires

The browser shows a blank page and the console holds `PROD CONFIG REJECTED` followed by
one line per bad value. That is the intended failure: **a blank page found by the first
smoke test is enormously cheaper than a checkout that issues free tickets for a month.**

Recovery: fix the env var the message names and re-run `npm run build:prod`. Do not
hand-edit `environment.prod.local.ts` to make the message go away — that is precisely
the path gate 2 exists to catch, and the next rebuild will overwrite it anyway.

## Working on `--configuration prod` locally

`environment.prod.ts` imports `environment.prod.local.ts`, which is gitignored, so a
fresh clone cannot build `--configuration prod` until that file exists. Copy
`src/environments/environment.prod.local.example.ts` to create it. The example's values
are deliberately ones the boot guard **rejects** — a bundle built from the template must
never be mistaken for a shippable one.

`ng test`, `npm start`, `npm run build:sit` and CI's `--configuration ci-smoke` are all
unaffected: none of them reach `environment.prod.ts`, and TypeScript only compiles files
reachable from `src/main.ts` (`tsconfig.app.json` lists it as the sole entry).

---

## Related

- **OBRS-205** — prod hosting: Caddy, TLS, the `dist/obrs/browser` deploy itself.
- **OBRS-472** — rename the `production` smoke config so it cannot be confused with `prod`.
- **OBRS-473** — enforce the backend side (`payment.omise.mock-refund` must stay off in prod).
- **ADR-0078 / OBRS-449** — the backend's equivalent boot guard, and the reasoning this
  one is modelled on: refuse to boot rather than serve a silently broken prod.

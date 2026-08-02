# RUNBOOK — Prod frontend config (OBRS-390)

How to build a production OBRS frontend bundle, and what to do when it refuses.

Scope: the **config** the prod bundle is built with. Where that bundle is *hosted*
(Oracle VM, Caddy, TLS, the domain) is OBRS-205 / OBRS-203, and the single source of
truth for all of it is **`OBRS-backend/deploy/prod/README.md`** — the domain, the
Caddyfile, the publish script and the deploy script all live there. Read a host value
from that README, never from a guess made in this repo.

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
export PROD_API_URL='https://nj-phuyaipu.com'        # absolute + https — see below
export PROD_OMISE_PUBLIC_KEY='pkey_…'                # `pkey_` + 19 chars, NO `live` — see below
export PROD_PROMPTPAY_ID='<the real PromptPay id>'
export PROD_MAPS_API_KEY='<Google Maps browser key>'
export PROD_GOOGLE_CLIENT_ID='<Google OAuth client id>'

npm run build:prod        # = node scripts/inject-prod-env.js && ng build --configuration prod
```

Output: `dist/obrs/browser`.

`PROD_OMISE_PUBLIC_KEY` is a **public** key — it ships inside the bundle by design and
is safe in a browser. The Omise **secret** key belongs only to the backend and must
never appear in this repo or in these env vars.

#### ⚠️ A live Omise key does not say `live` anywhere (OBRS-946)

**Only the TEST key names its environment.** The shapes, measured — not read off a
docs page:

| | shape | length |
| --- | --- | --- |
| test | `pkey_test_` + 19 chars | 29 |
| **live** | **`pkey_` + 19 chars** | **24** |

So the correct value for this variable looks like `pkey_5s337…` and contains neither
`live` nor `test`. There is nothing in the prefix that tells you which one you are
holding; on the prod VM we established it the only way available — that key took a real
20.00 THB charge, `Paid` in the **live** dashboard.

Both gates below asserted `startsWith('pkey_live_')` until 2026-08-01, so **`npm run
build:prod` exited 1 on the correct key** and, had you written the generated file by
hand, the bundle would have refused to boot. If you are reading an older copy of this
runbook, or an older ADR, that told you to use a `pkey_live_…` value: it was wrong, no
such key exists, and `npm run test:omise-key` is now the thing that keeps this page and
the two gates saying the same sentence.

### The optional vars — read this before deciding you don't need them

`inject-prod-env.js` reads three more variables that are **deliberately not in the
failure check**, because their absence costs a map or a chart, never a payment, and
they must not be able to fail a prod build:

```bash
export PROD_MAPTILER_API_KEY='<key of obrs-frontend-prod, see below>'  # OBRS-424 / OBRS-831
export PROD_GA4_MEASUREMENT_ID='G-…'                              # OBRS-867
export PROD_CLARITY_PROJECT_ID='<project id>'                     # OBRS-867
```

Unset means the generated file gets `''`, the build stays green, and the feature
degrades silently: a blank `maptilerKey` makes `FleetMapPanelComponent.canShowMap`
false, so every map surface renders the `MAP_UNAVAILABLE` placeholder, and blank
analytics IDs inject no tag at all.

**Silently is the problem.** Until 2026-07-30 this runbook listed only the five
required vars, so anyone following it produced a prod bundle whose maps could never
work, with nothing anywhere reporting it — which is precisely how OBRS-831 AC6 came to
be open with no owner. They are listed here so that "we chose not to set it" and "we
never knew about it" stop looking identical.

**The prod MapTiler key exists — provisioned 2026-07-30, closing OBRS-831 AC6.** It is a
separate key from SIT's, as that AC required:

| field | value |
| --- | --- |
| Name | `obrs-frontend-prod` |
| Allowed HTTP Origins | `nj-phuyaipu.com` — one line, **no `localhost`**, no `www.` entry (the Caddyfile redirects `www` → apex permanently, so a page is only ever served from the apex origin) |
| Allowed user-agent header | empty — deliberately, the browser is the client |

The key **value** is not in this repo and must not be: read it from MapTiler Cloud when
you export the var. Restricting by origin is what makes a browser-visible key acceptable;
it also means the failure mode is a *silent* one — a key scoped to the wrong origin
returns 403 per tile and renders a blank map with no build-time and no boot-time error,
exactly as `deploy/prod/README.md` warns for `PROD_MAPS_API_KEY`. So the first prod
publish has to **measure** tiles from a real browser (`img.leaflet-tile` with
`naturalWidth > 0`, and every `api.maptiler.com` response `200`), never infer them from a
green build.

`PROD_MAPTILER_API_KEY` also has a second half that is **not** an env var: the staff
fleet map is behind `features.fleetMap`, which is `false` in `environment.base.ts` for
the go-live scope cut (ADR-0031). Providing the key does **not** make the prod fleet
map appear; the flag flip is a separate, deliberate decision (OBRS-622 AC6). Nor does it
make anything appear while prod serves no SPA at all — `GET https://nj-phuyaipu.com/` is
still a Caddy 404 while `/api/routes` answers 200.

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
browser talks to one origin (OBRS-205, owner decision 2026-07-15). Serving the bundle from
its own nginx container would put it back on a second origin and re-open the cross-origin
question that topology exists to remove.

⚠️ **Same origin does *not* mean a relative `apiUrl`, and until OBRS-926 this section said
it did.** `PROD_API_URL` must be the **absolute** `https://nj-phuyaipu.com`. The
same-origin fact is unchanged — Caddy serves the app and proxies `/api/*` from that one
host, so there is no preflight either way — but the relative `/api` the card originally
called for is rejected three times over, and all three are in this repo, not in a
document you have to go and find:

| where | what happens with `apiUrl = '/api'` |
| --- | --- |
| `scripts/inject-prod-env.js:57` | `!values.apiUrl.startsWith('https://')` → exit 1, the build never starts |
| `src/environments/prod-config-guard.ts:91` | same check at boot, so a hand-edited config dies on load |
| `src/app/services/admin/badge-socket.service.ts:89` | derives the STOMP URL by swapping `http(s)→ws(s)` on this value. With no scheme to swap there is nothing to fail on: it yields a scheme-less `/ws` and the admin badge socket is simply dead |

The first two fail closed and loudly. **The third does not** — which is the reason this
correction is worth its own card rather than a quiet edit.

The repo used to carry a `Dockerfile` + `nginx.conf` + `docker-compose.yml` from before that
decision; OBRS-481 deleted them. If you find yourself reaching for `docker build` here, the
answer is `npm run build:prod` and ship `dist/obrs/browser` to the VM.

---

## The two gates, and the third one that keeps them honest

Both check the same values. Neither is redundant.

1. **`scripts/inject-prod-env.js`** (build time) — refuses to generate a config with a
   missing var, a key that is not `pkey_` + 19 chars, or a non-https API URL. Exits
   **1**, so the `&&` in `build:prod` stops before `ng build` runs.
2. **`src/environments/prod-config-guard.ts`** (boot time) — re-checks the values in the
   bundle that actually shipped, and throws before Angular bootstraps.

Gate 2 exists because gate 1 is not the only way `environment.prod.local.ts` can come
into being: **it is gitignored**, so a hand-edited or stale copy passes review by
nobody and builds perfectly cleanly. Gate 1 validates the values it *generates*; gate 2
validates the values that *shipped*.

3. **`scripts/check-omise-key-format.mjs`** (`npm run test:omise-key`, CI gate lane and
   `prebuild:prod`) — asserts gates 1 and 2 hold **byte-identical** copies of the key
   pattern, then runs that pattern against key shapes that were observed rather than
   invented.

Gate 3 exists because two hand-maintained copies of one rule is how this pair has now
failed twice: **OBRS-926** (a runbook `PROD_API_URL` both gates rejected — one
assertion was fixed, its twin was never audited) and **OBRS-946** (both demanded a
`pkey_live_` Omise never issues, so the gates rejected the only correct value there is).
Unit tests could not catch either: every fixture was written from the same assumption
the gates encoded, so the suite proved the guard agreed with the fixture and nothing
more. **If you change a value rule in one of these files, gate 3 is what tells you the
other one exists.**

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

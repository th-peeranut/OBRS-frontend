# Client-observed `/api/` latency — how to read it, and what it can answer

OBRS-1223. This is AC6: the card's Definition of Done is a **number**, not code,
and this file is how someone gets from the events to that number.

## What is emitted

Two GA4 events, both through `AnalyticsService.track`, so both sit behind the
PDPA consent gate and the route-scope gate and the PII sanitizer that every
other event in this app sits behind (ADR-0034). Nothing here re-implements any
of them.

### `slow_api_request`

One per idempotent `/api/` request that took **≥ 5,000 ms**.

| param | example | note |
| --- | --- | --- |
| `endpoint_pattern` | `/api/bookings/:id` | allowlisted — see `api-endpoint-pattern.ts` |
| `http_method` | `GET` | GET/HEAD only; a mutation has no ceiling |
| `duration_ms` | `12300` | rounded to 100 ms |
| `duration_bucket` | `10-20s` | `5-10s` / `10-20s` / `20-30s` / `30s+` |
| `outcome` | `timed_out` | `ok` / `error` / `timed_out` / `cancelled` |

### `api_request_census`

One per **10** completed idempotent `/api/` requests — the denominator.

| param | note |
| --- | --- |
| `window_size` | always 10 today (`CENSUS_WINDOW_SIZE`) |
| `slow_count` | how many of those 10 were ≥ 5,000 ms |
| `timed_out_count` | how many the 30s ceiling actually killed |

## Reading it

- **Slow rate** = `sum(slow_count) / sum(window_size)`.
- **Kill rate** — the number the card exists for — = `sum(timed_out_count) / sum(window_size)`.
- **Tail shape, per endpoint** = distribution of `duration_ms` on
  `slow_api_request`, grouped by `endpoint_pattern`.

## ⚠️ What it CANNOT answer, and why AC6 as originally written was wrong

The card's AC6 asks for **p50 / p95 / p99 per endpoint**. p50 and p95 are not
computable from this data and never will be, because AC1 — the 5,000 ms floor —
throws away every observation below 5 s **by design**, and it is that floor which
keeps this a counter instead of an APM bill. The two ACs contradict each other.

AC1 is the one worth keeping, because **p50 is not what sets a timeout ceiling.**
A ceiling is decided by the tail and by what it kills. What this data gives is:

- exact percentiles **within** the slow population (`duration_ms` is per-request),
- the **rate** of that population against a real denominator,
- the **kill count** — how often 30 s ended a request that was still alive.

That is a complete argument for raising, lowering, or keeping 30 s. "p99 of all
requests" is derivable too whenever the slow rate is below 1 %: if fewer than 1 %
of requests exceed 5 s, then p99 < 5 s and the current 30 s ceiling has ~6x
headroom over it — which is a measured statement, unlike the one in
`IDEMPOTENT_REQUEST_TIMEOUT_MS`'s comment today.

## Known limitation, stated rather than hidden

A session that ends mid-window loses that partial window. This costs **precision,
not accuracy**: the unflushed window drops its `slow_count` and its `window_size`
together, so the ratio is unbiased. It is not flushed on `pagehide` on purpose —
an unload-time send is unreliable in exactly the browsers that matter, and a
half-delivered denominator would be worse than a slightly smaller one.

## When this card closes

`IDEMPOTENT_REQUEST_TIMEOUT_MS` in `src/app/shared/interceptors/error.interceptor.ts`
currently carries a comment citing a single measured endpoint plus judgement.
After ≥ 7 days of data, that comment is replaced by one citing **this** dataset —
including if the conclusion is "30 s was right", which is a fine answer and a
different one from today's, because it will have been measured.

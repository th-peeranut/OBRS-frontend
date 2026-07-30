# ADR-0035 — Promote `dev` → `sit` only for what only SIT can prove

**Date:** 2026-07-30
**Status:** Accepted
**Card:** OBRS-912 (the policy half; the structural half is OBRS-911)

---

## Context

Nothing in this repo said when to promote `dev` to `sit`. Each session decided from the
card in its own hand, and every promote is a paid build — so the absence of a rule was
not neutral, it was a slow spend nobody was measuring.

**Measured 2026-07-30**, Netlify team `obrs`, Free plan, billing period Jul 20 – Aug 19:

| quantity | value | where it is read |
|---|---|---|
| credits per production deploy | **~15** | `105 credits ÷ 7 deploys`, Usage & billing → Credit usage breakdown |
| share of all credits spent on builds | **105 of 108.9** | same screen — bandwidth 2.2 + web requests 1.7 are noise |
| remaining | **191.1 / 300**, expires Aug 20 2026 | same screen |
| pushes to `sit` this period | **6** in 10 days — 07-26, 07-28, 07-29, 07-30 ×3 | `gh api "repos/th-peeranut/OBRS-frontend/activity?ref=refs/heads/sit"` |

The two rates are the same number. 191.1 ÷ 15 ≈ **12 builds** across the 20 days left =
0.6/day of allowance, against 0.6/day actually spent. There is no headroom, and
2026-07-30 alone used three.

**What those six builds bought.** At the time of writing `dev` was 10 commits ahead of
`sit`, covering three cards — and not one of them needed SIT to be verified:

| card | change | needs SIT? |
|---|---|---|
| OBRS-891 | clicking a route row loads its stops and fares | no — admin UI, verifiable locally against the SIT backend |
| OBRS-901 | placeholder in the station dropdown trigger | no — CSS/UI only |
| OBRS-831 | this repo's ADR + runbook correction | no — nothing to verify |

Re-run the census with
`gh api repos/th-peeranut/OBRS-frontend/compare/sit...dev --jq '.files[].filename'`.
The point is not those three cards; it is that the default was "promote because I
finished something", and that default has a price list.

**A build is not a publish, and the lock only stops the second one.** `Auto Publishing`
has been locked on the `sit-obrs-frontend` site since 2026-07-19. Every one of the six
pushes above still built — Netlify billed 7 production deploys — and none of them was
served. Roughly 90 credits went to artifacts nobody can look at, including the one
OBRS-831 is waiting on. The lock is a deliberate policy, not an accident, so the answer
is to push less, not to unlock.

The good half of the same fact: **publishing an already-built deploy costs no build
credit.** A blocked verification whose build already exists is a click, not a promote.

## Decision

**Promote `dev` → `sit` only when the change cannot be proven anywhere else.**

In practice that means the change touches an integration that only exists off our
machine:

- Omise / 3DS card payment
- Google sign-in
- OTP / SMS (ThaiBulkSMS)
- outbound email (Brevo)
- MapTiler map tiles
- GPS ingest (ThaiStar push webhook)

This is not a new rule so much as the written form of one already in use — work against
an external API has always had to reach SIT before its evidence capture, because a local
mock cannot produce that evidence.

Everything else — component behaviour, routing, forms, i18n, styling, dark mode,
accessibility, guards, state — is verified locally against the SIT backend, and simply
accumulates on `dev` until something in the list above arrives. Several cards then
promote in one build.

## Consequences

- `sit` will usually be behind `dev`, sometimes by many cards. That is the intended
  state, not drift. Anyone reading `sit` to answer "is this feature in?" is reading the
  wrong ref — read `dev`, or read the deployed artifact.
- A promote is now a decision with a stated reason, and the reason is nameable: which
  item on the list above needs it.
- The queue of accumulated cards makes one promote riskier than one card's worth of
  change. The mitigation is the gates that already run on every PR into `dev` —
  `Unit Tests`, `Build Smoke Check (AOT + budgets)`, `E2E Gate Lane (hermetic)`,
  `adr-gate` — not a smaller batch.
- After a promote, SIT still shows the old build until someone clicks **Publish deploy**
  on the new row. Verification is blocked until then and it is a human step by design.

## Scope

**SIT only.** Production frontend is not on Netlify — it is the Oracle Cloud VM behind
Caddy, which this repo's own `netlify.toml` records ("prod carries the header today, but
the Angular app is not published to that VM yet"). A prod deploy costs nothing on this
bill. The SIT backend is on Koyeb and is likewise unaffected.

## What is measured here, and what is inferred

Recorded explicitly because an ADR that blurs the two teaches the next reader to trust
the wrong sentence.

**Measured:** every number in the Context table; the six push timestamps; that
`netlify.toml` contains no `ignore` command (read whole, at `ref=dev`); that PR #87 ran
exactly four checks and all four are GitHub Actions, so **deploy previews are not
running and PRs cost nothing**.

**Inferred:** that the Netlify site builds from branch `sit`. The evidence is a count —
7 deploys in 10 days while `dev` received dozens of pushes; had it built `dev` the
number would be in the forties — plus a build command that ends
`--configuration sit`. The site's Build & deploy → Branches setting has not been opened.
If that setting ever says otherwise, this ADR's cost model is wrong and the whole thing
needs re-deriving, not patching.

## What must not be done to reduce this cost

- **Do not click `Unlock to start auto publishing`.** It reads like a convenience and it
  is a reversal of someone's deliberate 2026-07-19 decision. It also does not save a
  credit — publishing was never the thing being billed.
- **Do not turn off auto-build and have a person press `Deploy site`.** It is the
  strongest guarantee available and it moves the work onto a human queue, which this
  project has repeatedly decided against.
- **Do not hardcode "15 credits" into a gate or an acceptance criterion.** It is a
  measurement with a date on it; a number frozen into a check decays into a false pass.
  Cite the screen and the command, as the Context table does.

## Alternatives considered

**Promote on every merge to `dev` (the status quo).** Rejected on the arithmetic above:
at 0.6 pushes/day it consumes exactly the whole allowance, so the first busy day
borrows from a verification someone will need later in the period.

**Promote on a fixed schedule, e.g. once a day.** Cheaper than the status quo and still
wrong in both directions — it pays for days with nothing to verify, and makes an
integration fix wait for a clock. The trigger belongs on the content of the change.

**Skip the build when nothing relevant changed, instead of pushing less.** Not an
alternative — a complement, and the better lever, because it needs no discipline to hold.
That is OBRS-911, and it is where the two implementation traps are written down (diff
against `CACHED_COMMIT_REF`, never `HEAD~1`; deny-by-default path matching, never
"skip if it looks like docs"). This ADR is what remains necessary after that lands: an
ignore rule can tell that a change is inert, but it cannot tell that a real code change
has nothing to prove on SIT.

## Related

- OBRS-911 — the `ignore` command in `netlify.toml`
- OBRS-831 — the fleet-map verification currently blocked on an unpublished build
- OBRS-528 — Node version pinned for these builds (`.nvmrc`), which is why `.nvmrc` can
  never be treated as an inert path
- ADR-0031 — the go-live feature-flag scope cut, and why SIT overrides rather than the
  shared base

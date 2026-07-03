# Agent Instructions for OBRS-frontend

This file is for generic AI coding agents (e.g. Codex). For full conventions, architecture, and safety rules, see `CLAUDE.md` — it is the canonical source of truth for this repository and applies equally here.

## Skills & Agent-Office Alignment

When coding with AI here, **read this repo's own skills first, then align to the `obrs-agent-office` skills as the canonical source of truth** (see `CLAUDE.md` §13 "Skills & AI Agent Precedence" for the full rule).

- **Local skills first** — `.codex/skills/` and `.claude/skills/` (`run-obrs-frontend`). Repo-specific mechanics (how to build/serve/test this Angular app) live here.
- **Office skills are canonical for cross-repo process** — `agent-office` and `sit-hotfix-loop` are mirrored into `.codex/skills/` and `.claude/skills/`; the source of truth is the sibling `obrs-agent-office` repo. They own the git-worktree model, the Jira merge gate, and the `dev`/`sit` deploy flow.
- **Do not edit the mirrored office skills here** — their paths (`../OBRS-backend`, `../OBRS-frontend`, `.claude/agent-office/…`) are `obrs-agent-office`-relative. Edit them in `obrs-agent-office` and re-mirror.

## Quick Reference

- **Stack**: Angular 18, TypeScript 5.5 (strict), RxJS 7, NgRx 18 (Store/Effects/Selectors), PrimeNG 17 + Bootstrap 5, `ngx-translate` (TH/EN/ZH), Playwright E2E.
- **Architecture**: Reactive state through NgRx; component-local state only for UI concerns. All backend calls go through typed services using the `ResponseAPI<T>` envelope — no raw HTTP in components.
- **i18n**: Every new key must include all three locales (TH, EN, ZH); ZH is a known gap — do not leave it empty.
- **API contract**: The contract is owned by the backend (`../OBRS-backend/docs/api/`). Do not assume undocumented endpoints/fields; use `docs/handoff.md` for contract requests.
- **Safety**: Never modify `auth.interceptor.ts` or `idempotency-key.ts` (payment/auth flows) without explicit confirmation. Never push to `main`.

Before making changes, read `CLAUDE.md` for the full rules (architecture, NgRx conventions, i18n, testing, security, and cross-repo governance).

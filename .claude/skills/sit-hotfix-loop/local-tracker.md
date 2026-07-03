# SIT Hotfix — Local Issue Tracker

(Last-resort fallback: the OBRS Jira project (see "Jira tracking" in SKILL.md) is now the primary live tracker; this file is only used if Jira MCP tools are unavailable AND `gh issue create` is unavailable/blocked. Each entry mirrors what would have been a GitHub Issue / Jira card.)

---

## SIT-LOCAL-1 — [SIT] GET /api/private/schedules 500 — column schedule_set_id does not exist
**Opened:** 2026-06-19
**Status:** RESOLVED 2026-06-19 — applied migration `2026-06-19_add_schedule_set_id_to_schedules.sql` to live SIT. Repro `GET /api/private/schedules` now returns 200; control `GET /api/private/schedules/7` returns 200. No code change/redeploy. Retro: `.claude/agent-office/memory/archive/2026-06-19-sit-schedule-set-id-missing-column.md`.

**Where:** `GET /api/private/schedules` (admin schedules page, local FE → SIT backend). `ScheduleService.getAllScheduleRespDtos` (ScheduleService.java:61) → `ScheduleRepository.findAllByOrderByDepartureDateTimeAsc`.

**Repro:** Open http://localhost:4200/admin/schedules (or curl `GET https://sit-obrs-backend.koyeb.app/api/private/schedules` with an admin JWT). Returns 500. Backend log: `org.postgresql.util.PSQLException: ERROR: column s1_0.schedule_set_id does not exist`.

**Root cause:** The `Schedule` entity maps `schedule_set_id` (Schedule Set provenance feature; present in `schema.sql` and migration `migrations/2026-06-19_add_schedule_set_id_to_schedules.sql`), but that migration was **never applied to the live SIT DB**. Code shipped ahead of schema — every SELECT against `schedules` fails. Confirmed: live SIT `schedules` table has no `schedule_set_id` column.

**Fix:** Apply the existing idempotent migration to live SIT (DB-only; no code change / redeploy needed).

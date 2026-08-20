-- OBRS-1343 — the reported round trip, made searchable in this lane's own database.
--
-- Applied by e2e/scripts/start-e2e-backend.ps1 (via E2E_FIXTURE_SQL=obrs1343-return-boarding-fixture.sql)
-- against E2E_DB_NAME AFTER schema.sql + data.sql.
--
-- WHY THIS FILE EXISTS
-- The card's case needs no invented stops: `data.sql` already seeds the exact geometry that
-- broke. `chonburi_bangkok` carries `bts_mo_chit` at stop_order 24; `bangkok_chonburi` does
-- NOT carry it at all — the bus home leaves from `ds293_chatuchak_bus_stop`, 233 m away, at
-- stop_order 2. What data.sql does NOT seed is a pair of schedules a customer could search:
-- its two demo rounds depart today+180, which is past `booking_max_advance_days`, so
-- `POST /api/schedules/search` rejects the date before it ever looks for a trip. Two rounds
-- inside the cap are the whole fixture.
--
-- DATES
-- today+5 outbound / today+6 return, Asia/Bangkok. Clear of reschedule-fixture.sql's
-- today+10/12/16 and obrs577's today+25, so lanes can share a database without one fixture's
-- rounds appearing in another's result list. The '+07' is load-bearing for the OBRS-582
-- reason data.sql spells out: a naked timestamp is resolved against the session TimeZone,
-- which is UTC on CI.
--
-- 06:00 and 15:00 are the real timetable's first and mid-afternoon rounds, and both are far
-- enough from "now" to clear `booking_offset_minutes` on any day this runs.

INSERT INTO schedules (owner_id, route_id, vehicle_id, vehicle_type_id, status_id, departure_date_time)
SELECT o.id, r.id, v.id, vt.id, l.id,
       (((timezone('Asia/Bangkok', now()))::date + spec.day_offset)::text || ' ' || spec.tod)::timestamptz
FROM (VALUES
    ('chonburi_bangkok', 5, '06:00:00+07'),
    ('bangkok_chonburi', 6, '15:00:00+07')
) AS spec(route_slug, day_offset, tod)
JOIN routes r ON r.slug = spec.route_slug
CROSS JOIN (SELECT id FROM owners WHERE slug = 'nj-travel') o
CROSS JOIN (SELECT id FROM vehicles WHERE number_plate = 'กข 1234') v
CROSS JOIN (SELECT id FROM vehicle_types WHERE slug = 'van') vt
CROSS JOIN (SELECT id FROM lookups WHERE category = 'schedule_status' AND slug = 'scheduled') l
ON CONFLICT (route_id, departure_date_time) DO NOTHING;

-- Re-derives every schedule's stop times from route_stops (ON CONFLICT DO NOTHING), the same
-- generic backfill reschedule-fixture.sql and obrs577-load-more-fixture.sql use — it touches
-- only the two rows added above.
INSERT INTO schedule_stop_times
    (schedule_id, stop_id, estimated_departure_date_time, estimated_arrival_date_time, stop_order)
SELECT
    sc.id, rs.stop_id,
    sc.departure_date_time + make_interval(mins => rs.offset_minutes_from_origin),
    sc.departure_date_time + make_interval(mins => rs.offset_minutes_from_origin),
    rs.stop_order
FROM schedules sc
JOIN route_stops rs ON rs.route_id = sc.route_id
ON CONFLICT (schedule_id, stop_id) DO NOTHING;

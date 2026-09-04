-- OBRS-862 - deterministic near-term departures for the date strip on the booking
-- search page.
--
-- Applied after schema.sql + lookups.sql + data.sql against a private local database
-- (scripts/new-local-db.ps1 -ExtraSql, or E2E_FIXTURE_SQL for the e2e lane).
--
-- WHY THIS FILE EXISTS
-- data.sql seeds 124 schedules on routes chonburi_bangkok / bangkok_chonburi, but every
-- one of them departs 2027-03-04 or later (measured on a freshly built database:
--   select min(departure_date_time)::date, max(departure_date_time)::date from schedules;
--   -> 2027-03-04 | 2030-07-31).
-- The date strip only ever asks about days INSIDE booking_max_advance_days (60), and
-- POST /api/schedules/availability answers HTTP 400 BOOKING_ERROR_ADVANCE_CAP_EXCEEDED
-- for a fromDate past that cap (measured 2026-09-05 against a local backend with
-- fromDate 2030-06-01). So against the bare seed the strip is correct but uniformly
-- empty, which proves nothing about the state the card is about: SOME days sell and
-- some do not.
--
-- SHAPE
-- Departures are placed relative to CURRENT_DATE so the file does not rot:
--   today          - nothing        (drives the empty-result copy + "nearest day")
--   +1, +2         - 3 departures   (the near, obvious jump target)
--   +3, +4         - nothing        (a gap the strip must grey out)
--   +5, +6         - 3 departures
--   +7, +8         - nothing
--   +9             - 3 departures
--   +10 and beyond - nothing
--
-- Each inserted schedule copies its owner/route/vehicle/status columns verbatim from a
-- seed row on the same route, and its per-stop times are that same row's
-- schedule_stop_times shifted by the difference between the two departure times. A
-- schedule with no schedule_stop_times is invisible to POST /api/schedules/search (and
-- therefore to /availability): measured 2026-09-05 - 15 fixture schedules with no stop
-- times returned `departureSchedules: []` for a day they departed on.
--
-- Rows are tagged created_by='obrs862-fixture', which is also how the idempotency
-- deletes below find them, so the file can be re-applied while iterating.

BEGIN;

DELETE FROM schedule_stop_times
 WHERE schedule_id IN (SELECT id FROM schedules WHERE created_by = 'obrs862-fixture');
DELETE FROM schedules WHERE created_by = 'obrs862-fixture';

INSERT INTO schedules (owner_id, route_id, vehicle_id, vehicle_type_id, driver_id,
                       status_id, status_category, departure_date_time,
                       seating_capacity, seating_mode, cargo_capacity_kg,
                       created_by, updated_by)
SELECT t.owner_id, t.route_id, t.vehicle_id, t.vehicle_type_id, t.driver_id,
       t.status_id, t.status_category,
       ((CURRENT_DATE + d.offset_days) + tm.dep) AT TIME ZONE 'Asia/Bangkok',
       t.seating_capacity, t.seating_mode, t.cargo_capacity_kg,
       'obrs862-fixture', 'obrs862-fixture'
FROM (
    SELECT s.owner_id, s.route_id, s.vehicle_id, s.vehicle_type_id, s.driver_id,
           s.status_id, s.status_category, s.seating_capacity, s.seating_mode,
           s.cargo_capacity_kg
    FROM schedules s
    JOIN routes r ON r.id = s.route_id
    WHERE r.slug = 'chonburi_bangkok' AND s.created_by <> 'obrs862-fixture'
    ORDER BY s.departure_date_time
    LIMIT 1
) t
CROSS JOIN (VALUES (1), (2), (5), (6), (9)) AS d(offset_days)
CROSS JOIN (VALUES (TIME '08:00'), (TIME '13:00'), (TIME '17:30')) AS tm(dep);

INSERT INTO schedule_stop_times (schedule_id, stop_id,
                                 estimated_departure_date_time,
                                 estimated_arrival_date_time,
                                 stop_order, created_by, updated_by)
SELECT n.id, st.stop_id,
       st.estimated_departure_date_time + (n.departure_date_time - tpl.departure_date_time),
       st.estimated_arrival_date_time   + (n.departure_date_time - tpl.departure_date_time),
       st.stop_order, 'obrs862-fixture', 'obrs862-fixture'
FROM schedules n
CROSS JOIN (
    SELECT s.id, s.departure_date_time
    FROM schedules s
    JOIN routes r ON r.id = s.route_id
    WHERE r.slug = 'chonburi_bangkok' AND s.created_by <> 'obrs862-fixture'
    ORDER BY s.departure_date_time
    LIMIT 1
) tpl
JOIN schedule_stop_times st ON st.schedule_id = tpl.id
WHERE n.created_by = 'obrs862-fixture';

COMMIT;

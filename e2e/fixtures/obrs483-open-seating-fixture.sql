-- OBRS-483 — deterministic OPEN-seating fixture for the FE E2E flows (reschedule /
-- change-stop / change-seat) on an OPEN booking.
--
-- Applied by scripts/new-local-db.ps1 (as -ExtraSql) against the lane's private
-- database (obrs483qa) AFTER the backend's schema.sql + data.sql. Modeled directly
-- on e2e/fixtures/reschedule-fixture.sql (OBRS-184) — same route/vehicle/customer,
-- same relative-date + idempotency pattern — but with ONE deliberate difference that
-- is the entire point of this card:
--
--   * schedules.seating_mode = 'OPEN' set EXPLICITLY (not left at the column
--     default). OBRS-475 documented the trap: DRV-FIXTURE-1 is OPEN only because
--     nobody set it, while its tickets carry seat_number '1'..'8' — a state the
--     product can never actually reach (OPEN never assigns a seat) and which let a
--     whole suite of "OPEN seating" tests pass while testing nothing. An explicit
--     value here is self-documenting: this row is intentionally open, not
--     accidentally open.
--   * tickets.seat_number = NULL on every ticket — the real OPEN invariant, and the
--     exact case the old FE `!!ticket.seatNumber` filter silently dropped from the
--     reschedule/change-stop ticket list (a booking with zero eligible tickets
--     renders no dialog content and dispatches no request — a silent no-op, not an
--     error).
--
-- ── Route/segment facts relied on (verified against the seeded DB) ──────────────
--   * chonburi_bangkok: nong_chak = stop_order 1, mo_chit_2_bus_terminal = 25,
--     bts_mo_chit = 24. segments has a 200.00 (van) fare for BOTH nong_chak->
--     mo_chit_2_bus_terminal and nong_chak->bts_mo_chit — so change-stop's target
--     leg (this booking's own trip, one stop shorter) resolves a fare, and the
--     same-fare net-zero swap needs no payment step to complete inline.
--   * vehicle_types.van.total_seats = 14, zero seat_maps.walk_in_only rows for van
--     (only minibus seat '1' is walk-in-only) — one ticket leaves 13 seats of
--     headroom, plenty for change-stop's headcount-based capacity guard
--     (OBRS-483's 5th segment query) to admit the swap.
--
-- Every FK below resolves through a natural key (users.email, stops.slug,
-- routes.slug, lookups(category, slug)), exactly like reschedule-fixture.sql.

BEGIN;

-- ── Idempotency ──────────────────────────────────────────────────────────────
-- Order matters — tickets reference booking_schedules reference bookings.
DELETE FROM tickets WHERE ticket_number LIKE 'OBRS483-TK-%';
DELETE FROM booking_schedules WHERE booking_id IN (SELECT id FROM bookings WHERE booking_number LIKE 'OBRS483-%');
DELETE FROM bookings WHERE booking_number LIKE 'OBRS483-%';
DELETE FROM schedule_stop_times WHERE schedule_id IN (
    SELECT sc.id FROM schedules sc
    WHERE sc.departure_date_time IN (
        SELECT (((timezone('Asia/Bangkok', now()))::date + v.o)::text || ' ' || v.t)::timestamptz
        FROM (VALUES (11, '09:00:00+07'), (13, '08:00:00+07')) AS v(o, t)
    )
);
DELETE FROM schedules WHERE departure_date_time IN (
    SELECT (((timezone('Asia/Bangkok', now()))::date + v.o)::text || ' ' || v.t)::timestamptz
    FROM (VALUES (11, '09:00:00+07'), (13, '08:00:00+07')) AS v(o, t)
);

-- ── Schedules ────────────────────────────────────────────────────────────────
-- BOOK    (today+11 09:00) — the OPEN booking's current trip.
-- OPT     (today+13 08:00) — a second OPEN departure on the same route, so the
--                            reschedule options list is non-empty.
-- Offsets are deliberately disjoint from reschedule-fixture.sql's (10/12/14/16) so
-- both fixtures could in principle share a database without colliding — they
-- don't here (separate obrs483qa DB), but there is no reason to tempt it.
INSERT INTO schedules (route_id, vehicle_id, vehicle_type_id, status_id, departure_date_time, seating_mode)
SELECT r.id, v.id, vt.id, l.id,
       (((timezone('Asia/Bangkok', now()))::date + slot.offset_days)::text || ' ' || slot.tod)::timestamptz,
       'OPEN'
FROM (VALUES
    (11, '09:00:00+07'),
    (13, '08:00:00+07')
) AS slot(offset_days, tod)
JOIN routes r ON r.slug = 'chonburi_bangkok'
CROSS JOIN (SELECT id FROM vehicles WHERE number_plate = 'กข 1234') v
CROSS JOIN (SELECT id FROM vehicle_types WHERE slug = 'van') vt
CROSS JOIN (SELECT id FROM lookups WHERE category = 'schedule_status' AND slug = 'scheduled') l
ON CONFLICT (route_id, departure_date_time) DO NOTHING;

-- ── schedule_stop_times ──────────────────────────────────────────────────────
-- Re-run data.sql's own derivation verbatim (ON CONFLICT DO NOTHING, all schedules)
-- so it backfills only the two rows added above.
INSERT INTO schedule_stop_times
    (schedule_id, stop_id, estimated_departure_date_time, estimated_arrival_date_time, stop_order)
SELECT
    sc.id,
    rs.stop_id,
    sc.departure_date_time + make_interval(mins => rs.offset_minutes_from_origin),
    sc.departure_date_time + make_interval(mins => rs.offset_minutes_from_origin),
    rs.stop_order
FROM schedules sc
JOIN route_stops rs ON rs.route_id = sc.route_id
ON CONFLICT (schedule_id, stop_id) DO NOTHING;

-- ── Booking ──────────────────────────────────────────────────────────────────
-- One OPEN one-way booking, confirmed, owned by customer@system.local, riding BOOK
-- nong_chak -> mo_chit_2_bus_terminal at the seeded 200.00 fare. Same-fare net-zero
-- design (see reschedule-fixture.sql) means no `payments` row is required for
-- reschedule/change-stop to complete inline.
INSERT INTO bookings (actor_id, status_id, booking_type_id, booking_channel_id,
                      booking_number, total_amount, net_amount, discount_amount_snapshot,
                      reschedule_count, expires_at,
                      contact_name_snapshot, contact_phone_snapshot, contact_email_snapshot)
VALUES (
    (SELECT id FROM users   WHERE email = 'customer@system.local'),
    (SELECT id FROM lookups WHERE category = 'booking_status'  AND slug = 'confirmed'),
    (SELECT id FROM lookups WHERE category = 'booking_type'    AND slug = 'one_way'),
    (SELECT id FROM lookups WHERE category = 'booking_channel' AND slug = 'online'),
    'OBRS483-OPEN', 200.00, 200.00, 0.00, 0,
    (((timezone('Asia/Bangkok', now()))::date + 11)::text || ' 08:00:00+07')::timestamptz,
    'OBRS483 Open Seating', '0810000483', 'e2e-obrs483@example.com'
);

-- ── Booking schedule ─────────────────────────────────────────────────────────
INSERT INTO booking_schedules (booking_id, schedule_id, from_stop_id, to_stop_id, leg_type_id,
                               departure_date_time, arrival_date_time)
SELECT
    b.id, sc.id,
    from_stop.id, to_stop.id,
    (SELECT id FROM lookups WHERE category = 'leg_type' AND slug = 'outbound'),
    st_from.estimated_departure_date_time,
    st_to.estimated_arrival_date_time
FROM bookings b
JOIN routes r ON r.slug = 'chonburi_bangkok'
JOIN schedules sc ON sc.route_id = r.id
                 AND sc.departure_date_time =
                     (((timezone('Asia/Bangkok', now()))::date + 11)::text || ' 09:00:00+07')::timestamptz
CROSS JOIN (SELECT id FROM stops WHERE slug = 'nong_chak') from_stop
CROSS JOIN (SELECT id FROM stops WHERE slug = 'mo_chit_2_bus_terminal') to_stop
JOIN schedule_stop_times st_from ON st_from.schedule_id = sc.id AND st_from.stop_id = from_stop.id
JOIN schedule_stop_times st_to   ON st_to.schedule_id   = sc.id AND st_to.stop_id   = to_stop.id
WHERE b.booking_number = 'OBRS483-OPEN';

-- ── Ticket ───────────────────────────────────────────────────────────────────
-- seat_number = NULL — the OPEN invariant. This is the exact row the old FE
-- `!!ticket.seatNumber` filter would drop, emptying the reschedule/change-stop
-- ticket list and turning both dialogs into silent no-ops.
INSERT INTO tickets (schedule_id, booking_id, booking_schedule_id, passenger_type_id, status_id,
                     route_id, from_stop_id, to_stop_id, ticket_number,
                     title_snapshot, first_name_snapshot, last_name_snapshot,
                     from_stop_snapshot, to_stop_snapshot, vehicle_type_snapshot,
                     departure_date_time_snapshot, arrival_date_time_snapshot,
                     price_snapshot, discount_amount_snapshot, net_price_snapshot,
                     passenger_type_snapshot, seat_number)
SELECT
    bs.schedule_id, b.id, bs.id,
    (SELECT id FROM lookups WHERE category = 'passenger_type' AND slug = 'male'),
    (SELECT id FROM lookups WHERE category = 'ticket_status'  AND slug = 'confirmed'),
    sc.route_id,
    bs.from_stop_id, bs.to_stop_id,
    'OBRS483-TK-OPEN',
    'Mr', 'OpenSeating', 'Tester',
    'Nong Chak', 'Mo Chit 2 Bus Terminal', 'van',
    bs.departure_date_time, bs.arrival_date_time,
    200.00, 0.00, 200.00,
    'male', NULL
FROM bookings b
JOIN booking_schedules bs ON bs.booking_id = b.id
JOIN schedules sc ON sc.id = bs.schedule_id
WHERE b.booking_number = 'OBRS483-OPEN';

COMMIT;

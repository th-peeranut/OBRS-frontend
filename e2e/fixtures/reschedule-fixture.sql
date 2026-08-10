-- OBRS-184 — deterministic fixture for my-bookings-reschedule.spec.ts.
--
-- Applied by e2e/global-setup-local.ts against the lane's private database
-- (obrs184qa) AFTER the backend's schema.sql + data.sql. Never runs anywhere else:
-- it is not on the backend classpath, so `spring.sql.init` / Flyway cannot pick it
-- up even by accident, and it is not part of gen-prod-seed.ps1's DEV-ONLY strip
-- because it never enters that file's search path.
--
-- WHY THIS FILE EXISTS AT ALL
-- The spec used to pin four hand-made bookings on live SIT (B-X3F5ML, B-P4HPH6,
-- B-74DW6T, B-RDE6PG) sitting on July-2026 calendar dates. Two things rotted:
-- departures drifted into the past (the 4h window then correctly disabled the
-- button and the spec read that as a bug), and the pre-consumed states the spec
-- needs — reschedule_count=1, CANCELLED, a seat-collision partner — could only be
-- produced by RUNNING the spec, so a re-run found them already spent. Neither is
-- fixable from the test layer against a shared mutable environment. Owning the
-- database is what makes them fixable.
--
-- EVERY DATE HERE IS RELATIVE TO NOW (`today + N`), so the fixture cannot rot.
-- Offsets are chosen against the real server rules (see RescheduleService):
--   * validateRescheduleWindow  — the NEW departure must be >= `reschedule_window_hours`
--     (system_configs, default 4) away. Everything here is >= 10 days out.
--   * validateDateNotTooFar     — |bangkokDay(old) - bangkokDay(new)| must be
--     <= `reschedule_max_days_ahead` (system_configs, default 30). Max span used
--     below is 6 days (BOOK+10 -> COLLIDE+16), so it stays legal even if someone
--     lowers that config substantially.
--   * fee tiers                 — > 24h out means the late fee is 0, so a same-fare
--     move nets exactly 0: no top-up, no refund, and therefore NO `payments` row is
--     required for the flow to complete. Keep it that way; a negative net would drag
--     RefundService in and demand a payment to refund against.
--
-- SEAT/CAPACITY FACTS THIS RELIES ON (verified against the seeded DB, not assumed):
--   * vehicle_types.van.total_seats = 14, and the van has ZERO seat_maps.walk_in_only
--     rows (only `minibus` seat '1' is walk-in-only), so SeatChannelGuard is a no-op
--     here and seat '4' is bookable by a customer.
--   * segments has a 200.00 fare for (chonburi_bangkok, nong_chak,
--     mo_chit_2_bus_terminal, van) — without that row the options query returns
--     nothing, because it INNER JOINs segments.
--   * route_stops on chonburi_bangkok puts nong_chak at stop_order 1 and
--     mo_chit_2_bus_terminal at 25, satisfying the occupancy query's
--     pickup_order < to_order AND dropoff_order > from_order predicates.
--
-- Every FK below resolves through a natural key (users.email, stops.slug,
-- routes.slug, lookups(category, slug)) exactly like data.sql's own fixtures —
-- never a hardcoded id, which would break the moment seeding order changed.

BEGIN;

-- ── Idempotency ──────────────────────────────────────────────────────────────
-- global-setup-local.ts normally drops and recreates the whole database, so this
-- is not needed for the happy path. It exists so a developer can re-apply JUST
-- this file while iterating on the spec, and get the same state every time
-- (in particular: undoing a reschedule the previous run really performed).
-- Order matters — tickets reference booking_schedules reference bookings.
DELETE FROM tickets WHERE ticket_number LIKE 'E2E-TK-%';
DELETE FROM booking_schedules WHERE booking_id IN (SELECT id FROM bookings WHERE booking_number LIKE 'E2E-%');
DELETE FROM bookings WHERE booking_number LIKE 'E2E-%';
-- The date set is deliberately enumerated, not a range: deleting "everything in
-- 2026" would take out data.sql's own demo rows (2026-12-20) too.
DELETE FROM schedule_stop_times WHERE schedule_id IN (
    SELECT sc.id FROM schedules sc
    WHERE sc.departure_date_time IN (
        SELECT (((timezone('Asia/Bangkok', now()))::date + v.o)::text || ' ' || v.t)::timestamptz
        FROM (VALUES (10, '09:00:00+07'), (12, '08:00:00+07'), (12, '21:00:00+07'), (16, '15:00:00+07')) AS v(o, t)
    )
);

DELETE FROM schedules WHERE departure_date_time IN (
    SELECT (((timezone('Asia/Bangkok', now()))::date + v.o)::text || ' ' || v.t)::timestamptz
    FROM (VALUES (10, '09:00:00+07'), (12, '08:00:00+07'), (12, '21:00:00+07'), (16, '15:00:00+07')) AS v(o, t)
);

-- ── Schedules ────────────────────────────────────────────────────────────────
-- The 2030 cluster in data.sql seeds exactly ONE departure per route per day, and
-- getRescheduleOptions filters out the booking's own schedule — so a single-departure
-- day can never satisfy "the options list shows more than one choice". This lane
-- therefore seeds its own days, on 2026 dates the cluster does not touch.
--
--   BOOK    (today+10 09:00) — the booking's CURRENT trip
--   OPT_A   (today+12 08:00) ┐ two departures on ONE day: the options-list test asserts
--   OPT_B   (today+12 21:00) ┘ both appear, which the 2030 cluster structurally cannot do
--   COLLIDE (today+16 15:00) — single departure whose seat '4' is pre-occupied (NO_SEATS)
--   (today+14 is deliberately left EMPTY — the "no trips that day" test.)
--
-- '+07' is explicit on every literal. A naive '2026-07-26 09:00'::timestamptz would
-- be resolved in the SEEDING SESSION's timezone, so the same file would produce a
-- different instant depending on who ran it — that is a real defect in data.sql's
-- demo rows today (they land at 15:00 Bangkok when seeded from a UTC host).
--
-- OBRS-1166: owner_id is read off the ROUTE this schedule already joins (r.owner_id), not
-- looked up from a second literal. OBRS-756 (f22d32b9, 2026-07-27) gave schedules a NOT NULL
-- owner_id and this INSERT was never updated, so every run of this lane died at the seed step
-- with `null value in column "owner_id" of relation "schedules" violates not-null constraint`
-- before the backend was even started. obrs577-load-more-fixture.sql solves it the other way,
-- with CROSS JOIN (SELECT id FROM owners WHERE slug = 'nj-travel'); that works today because
-- data.sql seeds exactly one operator, but it is a SECOND fact that can disagree with the
-- first the day data.sql seeds a second one - it would seed a departure sold by an operator
-- that does not hold the line's licence, which is the exact invariant schema.sql's comment on
-- schedules.owner_id says the column exists to carry. routes.owner_id is itself NOT NULL, so
-- deriving from it cannot reintroduce the NULL this line is fixing.
INSERT INTO schedules (owner_id, route_id, vehicle_id, vehicle_type_id, status_id, departure_date_time)
SELECT r.owner_id, r.id, v.id, vt.id, l.id,
       (((timezone('Asia/Bangkok', now()))::date + slot.offset_days)::text || ' ' || slot.tod)::timestamptz
FROM (VALUES
    (10, '09:00:00+07'),
    (12, '08:00:00+07'),
    (12, '21:00:00+07'),
    (16, '15:00:00+07')
) AS slot(offset_days, tod)
JOIN routes r ON r.slug = 'chonburi_bangkok'
CROSS JOIN (SELECT id FROM vehicles WHERE number_plate = 'กข 1234') v
CROSS JOIN (SELECT id FROM vehicle_types WHERE slug = 'van') vt
CROSS JOIN (SELECT id FROM lookups WHERE category = 'schedule_status' AND slug = 'scheduled') l
ON CONFLICT (route_id, departure_date_time) DO NOTHING;

-- ── schedule_stop_times ──────────────────────────────────────────────────────
-- A schedules row is INVISIBLE to the options query without these: it INNER JOINs
-- schedule_stop_times twice, once per stop of the requested pair. Rather than
-- hand-writing them, re-run data.sql's own derivation verbatim — it is
-- ON CONFLICT DO NOTHING and derives from route_stops for ALL schedules, so it
-- backfills only the four rows added above and leaves data.sql's untouched.
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

-- ── Bookings ─────────────────────────────────────────────────────────────────
-- All four belong to customer@system.local (the account the spec logs in as) and
-- ride nong_chak -> mo_chit_2_bus_terminal, mirroring data.sql's DRV-FIXTURE-1.
--
-- Money must satisfy `CHECK (total_amount - discount_amount_snapshot = net_amount)`.
-- One seat at the seeded 200.00 segment fare, no discount.
--
-- expires_at is NOT NULL even for a confirmed booking; data.sql's own fixture sets
-- it in the past (an hour before departure) and that is harmless here precisely
-- because every ticket is `confirmed` — expiry only un-occupies `reserved` seats.
INSERT INTO bookings (actor_id, status_id, booking_type_id, booking_channel_id,
                      booking_number, total_amount, net_amount, discount_amount_snapshot,
                      reschedule_count, expires_at,
                      contact_name_snapshot, contact_phone_snapshot, contact_email_snapshot)
SELECT
    (SELECT id FROM users   WHERE email = 'customer@system.local'),
    (SELECT id FROM lookups WHERE category = 'booking_status'  AND slug = spec.booking_status),
    (SELECT id FROM lookups WHERE category = 'booking_type'    AND slug = 'one_way'),
    (SELECT id FROM lookups WHERE category = 'booking_channel' AND slug = 'online'),
    spec.booking_number, 200.00, 200.00, 0.00,
    spec.reschedule_count,
    (((timezone('Asia/Bangkok', now()))::date + spec.offset_days)::text || ' 08:00:00+07')::timestamptz,
    spec.contact_name, '0810000184', 'e2e-reschedule@example.com'
-- One booking per STATE, rather than one booking reused across states. The old
-- SIT spec had a single booking play both roles: an early test rescheduled it
-- (0 -> 1) and a later test asserted the max-count rejection on the result. That
-- read elegantly and was a trap — the two tests could not run independently, and on
-- SIT the mutation had already been spent by a previous session, so the *producer*
-- failed while the *consumer* passed. Seeding the end state directly is only
-- possible because this lane owns the database; take advantage of it.
FROM (VALUES
    -- booking_number,   status,      reschedule_count, offset_days, contact_name
    ('E2E-ELIGIBLE',  'confirmed', 0, 10, 'E2E Eligible'),   -- read-only checks: options list, empty day, NO_SEATS
    ('E2E-MOVE',      'confirmed', 0, 10, 'E2E Move'),       -- the one booking a test really reschedules
    ('E2E-CANCELLED', 'cancelled', 0, 10, 'E2E Cancelled'),  -- NOT_CONFIRMED rejection
    ('E2E-MAXCOUNT',  'confirmed', 1, 10, 'E2E Maxcount'),   -- MAX_COUNT rejection, pre-seeded (not produced by a test)
    ('E2E-SEATHOLD',  'confirmed', 0, 16, 'E2E Seathold')    -- holds seat '4' on COLLIDE
) AS spec(booking_number, booking_status, reschedule_count, offset_days, contact_name);

-- ── Booking schedules ────────────────────────────────────────────────────────
-- E2E-SEATHOLD rides the COLLIDE trip (today+16); the rest ride BOOK (today+10).
-- Times are read back out of schedule_stop_times so they agree with what the
-- server itself would write on a reschedule — and so `CHECK (arrival > departure)`
-- holds by construction (nong_chak is stop_order 1, mo_chit_2 is 25).
INSERT INTO booking_schedules (booking_id, schedule_id, from_stop_id, to_stop_id, leg_type_id,
                               departure_date_time, arrival_date_time)
SELECT
    b.id, sc.id,
    from_stop.id, to_stop.id,
    (SELECT id FROM lookups WHERE category = 'leg_type' AND slug = 'outbound'),
    st_from.estimated_departure_date_time,
    st_to.estimated_arrival_date_time
FROM (VALUES
    ('E2E-ELIGIBLE',  10, '09:00:00+07'),
    ('E2E-MOVE',      10, '09:00:00+07'),
    ('E2E-CANCELLED', 10, '09:00:00+07'),
    ('E2E-MAXCOUNT',  10, '09:00:00+07'),
    ('E2E-SEATHOLD',  16, '15:00:00+07')
) AS spec(booking_number, offset_days, tod)
JOIN bookings b ON b.booking_number = spec.booking_number
JOIN routes r ON r.slug = 'chonburi_bangkok'
JOIN schedules sc ON sc.route_id = r.id
                 AND sc.departure_date_time =
                     (((timezone('Asia/Bangkok', now()))::date + spec.offset_days)::text || ' ' || spec.tod)::timestamptz
CROSS JOIN (SELECT id FROM stops WHERE slug = 'nong_chak') from_stop
CROSS JOIN (SELECT id FROM stops WHERE slug = 'mo_chit_2_bus_terminal') to_stop
JOIN schedule_stop_times st_from ON st_from.schedule_id = sc.id AND st_from.stop_id = from_stop.id
JOIN schedule_stop_times st_to   ON st_to.schedule_id   = sc.id AND st_to.stop_id   = to_stop.id;

-- ── Tickets ──────────────────────────────────────────────────────────────────
-- Seat numbers are load-bearing, not cosmetic.
--
-- E2E-ELIGIBLE holds seat '4' on BOOK and E2E-SEATHOLD holds seat '4' on COLLIDE.
-- Moving ELIGIBLE onto COLLIDE therefore asks for a seat SEATHOLD already occupies,
-- which is what makes the NO_SEATS assertion a real server rejection rather than a
-- mocked one — and it is non-destructive, so the test can repeat.
--
-- The other bookings sharing the BOOK trip take DIFFERENT seats. Nothing in the
-- schema stops two confirmed tickets claiming one seat on one schedule — that rule
-- lives in the booking service, not in a constraint — so a fixture can quietly seed
-- a physically impossible van and still look green. Distinct seats keep this file a
-- description of a state the product could actually reach. (E2E-CANCELLED's seat is
-- free either way: a `cancelled` ticket never occupies.)
--
-- Ticket status must be `confirmed`: getCurrentConfirmedFare throws
-- `reschedule.error.not-confirmed` when a leg has no confirmed ticket, which would
-- surface as a confusing "booking not confirmed" rather than anything seat-related.
-- The exception is E2E-CANCELLED, whose ticket is `cancelled` to match its booking.
--
-- fare_category_snapshot is intentionally omitted so it takes its 'adult' DEFAULT,
-- exactly as data.sql's fixture does — FareCategoryService reads it during a
-- reschedule and carries it onto the replacement ticket.
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
    (SELECT id FROM lookups WHERE category = 'ticket_status'  AND slug = spec.ticket_status),
    sc.route_id,
    bs.from_stop_id, bs.to_stop_id,
    spec.ticket_number,
    'Mr', spec.first_name, 'Tester',
    'Nong Chak', 'Mo Chit 2 Bus Terminal', 'van',
    bs.departure_date_time, bs.arrival_date_time,
    200.00, 0.00, 200.00,
    'male', spec.seat_number
FROM (VALUES
    -- booking_number,  ticket_number,      status,      first_name, seat
    ('E2E-ELIGIBLE',  'E2E-TK-ELIGIBLE',  'confirmed', 'Eligible',  '4'),
    ('E2E-MOVE',      'E2E-TK-MOVE',      'confirmed', 'Move',      '5'),
    ('E2E-CANCELLED', 'E2E-TK-CANCELLED', 'cancelled', 'Cancelled', '6'),
    ('E2E-MAXCOUNT',  'E2E-TK-MAXCOUNT',  'confirmed', 'Maxcount',  '7'),
    -- seat '4' on COLLIDE: the collision partner for E2E-ELIGIBLE's seat '4'
    ('E2E-SEATHOLD',  'E2E-TK-SEATHOLD',  'confirmed', 'Seathold',  '4')
) AS spec(booking_number, ticket_number, ticket_status, first_name, seat_number)
JOIN bookings b ON b.booking_number = spec.booking_number
JOIN booking_schedules bs ON bs.booking_id = b.id
JOIN schedules sc ON sc.id = bs.schedule_id;

COMMIT;

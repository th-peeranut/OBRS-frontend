-- OBRS-577 — deterministic fixture for e2e/tests/obrs577-my-bookings-load-more.spec.ts.
--
-- Applied by e2e/scripts/start-e2e-backend.ps1 (via E2E_FIXTURE_SQL=obrs577-load-more-fixture.sql)
-- against this lane's private database (E2E_DB_NAME=obrs577qa) AFTER schema.sql + data.sql.
--
-- WHY THIS FILE EXISTS
-- OBRS-577 replaces /my-bookings' hardcoded page=0&size=100 with a 20-row page and an
-- incremental "Load more" button. Every code path under test (button appears, appends,
-- count line, last-page hide, filter reset, the 6-site mutation-reload window) only
-- exercises with an account holding MORE than 20 bookings — and no SIT seed account has
-- one (the card explicitly rules out creating 100 real bookings there). Owning a local
-- database makes ">20 bookings for one customer" a one-line fact instead of an unreasonable
-- ask, following the same pattern as e2e/fixtures/reschedule-fixture.sql (OBRS-184).
--
-- WHY A SINGLE SHARED SCHEDULE
-- Unlike reschedule-fixture.sql (which needs distinct departures per state under test),
-- every booking here only needs to EXIST and carry a status — nothing date- or
-- seat-availability-sensitive is exercised by this spec. tickets.seat_number carries no
-- DB-level uniqueness per schedule (that rule lives in application code on the real
-- booking path, not in schema.sql), so 51 tickets safely share one schedule with cosmetic,
-- non-colliding seat numbers.
--
-- BUCKETS
--   E2E-577-C-001..044  confirmed, CASH/paid (44 rows). This is the "All"/"Confirmed"
--                       bucket that drives append/load-more/count-line coverage, AND the
--                       one the mutation-reload (cancel) test cancels from. Paid CASH
--                       (not left unpaid) so CancellationService.resolveRefundMethod
--                       returns a plain "CASH" method rather than MANUAL_REFUND_REQUIRED —
--                       the latter would force the E2E to fill in a bank/PromptPay
--                       destination just to prove the reload-window mechanism, which is a
--                       different (already-covered, OBRS-286) concern.
--   E2E-577-X-001..007  cancelled (7 rows). A SECOND, independently-sized bucket so
--                       switching the status filter must show a genuinely different total
--                       (7, never mixed with the confirmed bucket's) — this is the OBRS-403
--                       regression shape the card explicitly cites as the one thing worth
--                       checking live.
--
-- data.sql itself seeds exactly one PRE-EXISTING confirmed booking for this same user
-- (DRV-FIXTURE-1, verified 2026-08-02 — data.sql has exactly one `INSERT INTO bookings`
-- statement), so the resulting totals for customer@system.local are:
--   Confirmed filter : 44 + 1 = 45
--   Cancelled filter : 7
--   All (unfiltered) : 45 + 7 = 52
-- The spec does not hardcode these — it reads the count line's own numbers off the first
-- response and asserts relative to that, so a future data.sql change does not rot this file
-- silently. The cancelled bucket (7) is the one absolute number relied on directly, because
-- data.sql seeds zero cancelled bookings for this user (grepped 2026-08-02).
--
-- Every FK below resolves through a natural key (users.email, stops.slug, routes.slug,
-- vehicles.number_plate, lookups(category, slug)) exactly like data.sql's own fixtures and
-- reschedule-fixture.sql — never a hardcoded id.

BEGIN;

-- ── Idempotency ──────────────────────────────────────────────────────────────
-- Not needed on the happy path (this lane drops+recreates the whole DB every run), but
-- lets a developer re-apply just this file while iterating and get the same state every
-- time. bookings.id cascades (ON DELETE CASCADE) to tickets, booking_schedules and
-- payments, so deleting bookings alone is enough — schedules is the opposite direction
-- and needs its own delete.
DELETE FROM bookings WHERE booking_number LIKE 'E2E-577-%';
DELETE FROM schedule_stop_times WHERE schedule_id IN (
    SELECT id FROM schedules
    WHERE departure_date_time = (((timezone('Asia/Bangkok', now()))::date + 25)::text || ' 10:00:00+07')::timestamptz
);
DELETE FROM schedules
WHERE departure_date_time = (((timezone('Asia/Bangkok', now()))::date + 25)::text || ' 10:00:00+07')::timestamptz;

-- ── Schedule (single, shared by every booking below) ────────────────────────
-- today+25 — clear of reschedule-fixture.sql's today+10/12/16, data.sql's fixed
-- 2026-12-20 demo date, and the 2030 far-future cluster.
-- OBRS-756 (ADR-0109, landed on `dev` after reschedule-fixture.sql was written): schedules
-- (and routes) now carry a NOT NULL owner_id. data.sql seeds exactly one operator,
-- owners.slug = 'nj-travel' — every route/vehicle/schedule row in data.sql resolves it the
-- same way, so this fixture does too rather than inventing a second one.
INSERT INTO schedules (owner_id, route_id, vehicle_id, vehicle_type_id, status_id, departure_date_time)
SELECT o.id, r.id, v.id, vt.id, l.id,
       (((timezone('Asia/Bangkok', now()))::date + 25)::text || ' 10:00:00+07')::timestamptz
FROM routes r
CROSS JOIN (SELECT id FROM owners WHERE slug = 'nj-travel') o
CROSS JOIN (SELECT id FROM vehicles WHERE number_plate = 'กข 1234') v
CROSS JOIN (SELECT id FROM vehicle_types WHERE slug = 'van') vt
CROSS JOIN (SELECT id FROM lookups WHERE category = 'schedule_status' AND slug = 'scheduled') l
WHERE r.slug = 'chonburi_bangkok'
ON CONFLICT (route_id, departure_date_time) DO NOTHING;

-- ── schedule_stop_times ──────────────────────────────────────────────────────
-- Re-derives from route_stops for every schedule (ON CONFLICT DO NOTHING), same generic
-- backfill reschedule-fixture.sql uses — backfills only the one row added above.
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

-- ── Bookings ─────────────────────────────────────────────────────────────────
-- 44 confirmed + 7 cancelled, all for customer@system.local, all riding
-- nong_chak -> mo_chit_2_bus_terminal on the shared schedule above.
-- Money satisfies CHECK (total_amount - discount_amount_snapshot = net_amount): one
-- seat at the seeded 200.00 chonburi_bangkok/van segment fare, no discount.
INSERT INTO bookings (actor_id, status_id, booking_type_id, booking_channel_id,
                      booking_number, total_amount, net_amount, discount_amount_snapshot,
                      reschedule_count, expires_at,
                      contact_name_snapshot, contact_phone_snapshot, contact_email_snapshot)
SELECT
    (SELECT id FROM users   WHERE email = 'customer@system.local'),
    (SELECT id FROM lookups WHERE category = 'booking_status' AND slug = spec.status_slug),
    (SELECT id FROM lookups WHERE category = 'booking_type'   AND slug = 'one_way'),
    (SELECT id FROM lookups WHERE category = 'booking_channel' AND slug = 'online'),
    spec.booking_number, 200.00, 200.00, 0.00, 0,
    (((timezone('Asia/Bangkok', now()))::date + 25)::text || ' 09:00:00+07')::timestamptz,
    'E2E 577 Load More', '0810000577', 'e2e-577@example.com'
FROM (
    SELECT 'E2E-577-C-' || lpad(n::text, 3, '0') AS booking_number, 'confirmed' AS status_slug
    FROM generate_series(1, 44) AS n
    UNION ALL
    SELECT 'E2E-577-X-' || lpad(n::text, 3, '0'), 'cancelled'
    FROM generate_series(1, 7) AS n
) AS spec;

-- ── Booking schedules ────────────────────────────────────────────────────────
INSERT INTO booking_schedules (booking_id, schedule_id, from_stop_id, to_stop_id, leg_type_id,
                               departure_date_time, arrival_date_time)
SELECT
    b.id, sc.id, from_stop.id, to_stop.id,
    (SELECT id FROM lookups WHERE category = 'leg_type' AND slug = 'outbound'),
    st_from.estimated_departure_date_time, st_to.estimated_arrival_date_time
FROM bookings b
JOIN routes r ON r.slug = 'chonburi_bangkok'
JOIN schedules sc ON sc.route_id = r.id
                 AND sc.departure_date_time =
                     (((timezone('Asia/Bangkok', now()))::date + 25)::text || ' 10:00:00+07')::timestamptz
CROSS JOIN (SELECT id FROM stops WHERE slug = 'nong_chak') from_stop
CROSS JOIN (SELECT id FROM stops WHERE slug = 'mo_chit_2_bus_terminal') to_stop
JOIN schedule_stop_times st_from ON st_from.schedule_id = sc.id AND st_from.stop_id = from_stop.id
JOIN schedule_stop_times st_to   ON st_to.schedule_id   = sc.id AND st_to.stop_id   = to_stop.id
WHERE b.booking_number LIKE 'E2E-577-%';

-- ── Tickets ──────────────────────────────────────────────────────────────────
-- Status mirrors the booking's own bucket (confirmed ticket for the confirmed bucket,
-- cancelled ticket for the cancelled bucket) — a confirmed booking with no confirmed
-- ticket would misrepresent a state the product can't actually reach. seat_number is
-- cosmetic only (no DB-level per-schedule uniqueness — see file header) so a simple
-- cycling formula is enough to keep every row distinct-looking without meaning anything.
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
    (SELECT id FROM lookups WHERE category = 'ticket_status' AND slug =
        CASE WHEN b.booking_number LIKE 'E2E-577-X-%' THEN 'cancelled' ELSE 'confirmed' END),
    sc.route_id, bs.from_stop_id, bs.to_stop_id,
    -- 'E2E-577-TK-C-001' / 'E2E-577-TK-X-001' — must stay bucket-qualified, or the two
    -- buckets' '001' rows would collide on ticket_number's UNIQUE constraint.
    'E2E-577-TK-' || replace(b.booking_number, 'E2E-577-', ''),
    'Mr', 'LoadMore', 'Fixture',
    'Nong Chak', 'Mo Chit 2 Bus Terminal', 'van',
    bs.departure_date_time, bs.arrival_date_time,
    200.00, 0.00, 200.00, 'male',
    ((row_number() OVER (ORDER BY b.id) - 1) % 14 + 1)::text
FROM bookings b
JOIN booking_schedules bs ON bs.booking_id = b.id
JOIN schedules sc ON sc.id = bs.schedule_id
WHERE b.booking_number LIKE 'E2E-577-%';

-- ── Payments ─────────────────────────────────────────────────────────────────
-- CASH/paid, confirmed bucket only (see file header for why: keeps a customer cancel on
-- this bucket off the MANUAL_REFUND_REQUIRED lane, which is a separate OBRS-286 concern).
INSERT INTO payments (booking_id, method_id, status_id, idempotency_key, amount, purpose)
SELECT
    b.id,
    (SELECT id FROM lookups WHERE category = 'payment_method' AND slug = 'cash'),
    (SELECT id FROM lookups WHERE category = 'payment_status' AND slug = 'paid'),
    b.booking_number,
    200.00, 'PLAIN'
FROM bookings b
WHERE b.booking_number LIKE 'E2E-577-C-%';

COMMIT;

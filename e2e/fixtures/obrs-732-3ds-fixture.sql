-- OBRS-732 — deterministic fixture for obrs-732-3ds.spec.ts (the real 3-D Secure lane).
--
-- Applied INSTEAD of reschedule-fixture.sql, by pointing E2E_FIXTURE_SQL at this file
-- (see e2e/scripts/start-e2e-backend.ps1). Deliberately NOT merged into that file:
-- my-bookings-reschedule.spec.ts asserts exact booking states and counts, and its
-- header spends four paragraphs explaining why each row is what it is. Adding a
-- payable booking there would be editing someone else's assertions from the side.
--
-- It also uses the prefix `Q3DS-`, not `E2E-`: the reschedule fixture opens with
-- `DELETE FROM bookings WHERE booking_number LIKE 'E2E-%'`, so a shared prefix would
-- mean whichever file ran second silently deleted the other's rows.
--
-- WHAT THE PRODUCT REQUIRES OF THIS ROW — read out of
-- PaymentService.validateBookingForPayment (:214-245), not assumed. All five must
-- hold or the charge is rejected before Omise is ever called:
--   1. booking status slug is exactly `pending`      -> BOOKING_STATUS_INVALID
--   2. expires_at is in the FUTURE                   -> BOOKING_EXPIRED (and the row
--      is flipped to `expired`, so a second run fails differently from the first)
--   3. no `paid` payments summing >= net_amount      -> BOOKING_ALREADY_PAID
--   4. no `pending` payment row exists               -> PAYMENT_IN_PROGRESS
--   5. actor_id owns it (validateOwnership)          -> the spec logs in as
--      customer@system.local, so that user must be the actor
--
-- ⚠️ Condition 4 is why this lane must NOT be run with E2E_REUSE_SERVERS=1 after an
-- abandoned 3DS attempt: our own charge writes a `pending` payment row, and if the
-- browser never completes the challenge that row stays. The next run then fails with
-- PAYMENT_IN_PROGRESS, which reads like a product bug and is not one. A normal run
-- rebuilds the database, so this only bites while iterating on the spec.
--
-- Money must satisfy `CHECK (total_amount - discount_amount_snapshot = net_amount)`.
-- 200.00 is the seeded segment fare for (chonburi_bangkok, nong_chak,
-- mo_chit_2_bus_terminal, van) — same figure the reschedule fixture relies on.

BEGIN;

-- ── Idempotency ──────────────────────────────────────────────────────────────
-- Order matters: tickets -> booking_schedules -> bookings. Payments are cleared too,
-- which is what makes a re-apply of JUST this file recover from condition 4 above.
DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE booking_number LIKE 'Q3DS-%');
DELETE FROM tickets WHERE ticket_number LIKE 'Q3DS-TK-%';
DELETE FROM booking_schedules WHERE booking_id IN (SELECT id FROM bookings WHERE booking_number LIKE 'Q3DS-%');
DELETE FROM bookings WHERE booking_number LIKE 'Q3DS-%';

DELETE FROM schedule_stop_times WHERE schedule_id IN (
    SELECT sc.id FROM schedules sc
    WHERE sc.departure_date_time =
          (((timezone('Asia/Bangkok', now()))::date + 20)::text || ' 10:00:00+07')::timestamptz
);
DELETE FROM schedules WHERE departure_date_time =
    (((timezone('Asia/Bangkok', now()))::date + 20)::text || ' 10:00:00+07')::timestamptz;

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- Its own day (today+20), so it cannot collide with the reschedule lane's
-- 10/12/16 offsets if both fixtures ever end up in one database. The date is
-- RELATIVE, like that file's, so this cannot rot into the past the way the old
-- SIT fixtures did.
--
-- '+07' is explicit: a bare '10:00' timestamptz literal resolves in the SEEDING
-- SESSION's timezone, so the same file would seed a different instant depending on
-- who ran it.
--
-- OBRS-1166: owner_id comes from the route (r.owner_id). schedules.owner_id has been NOT NULL
-- since OBRS-756 (f22d32b9, 2026-07-27) and this INSERT never followed, so the lane died at the
-- seed step long before `ng serve` or the backend ever ran. Same derivation as
-- reschedule-fixture.sql - see the longer note there for why the route, and not a second
-- owners.slug literal, is the thing to read it from.
INSERT INTO schedules (owner_id, route_id, vehicle_id, vehicle_type_id, status_id, departure_date_time)
SELECT r.owner_id, r.id, v.id, vt.id, l.id,
       (((timezone('Asia/Bangkok', now()))::date + 20)::text || ' 10:00:00+07')::timestamptz
FROM routes r
CROSS JOIN (SELECT id FROM vehicles WHERE number_plate = 'กข 1234') v
CROSS JOIN (SELECT id FROM vehicle_types WHERE slug = 'van') vt
CROSS JOIN (SELECT id FROM lookups WHERE category = 'schedule_status' AND slug = 'scheduled') l
WHERE r.slug = 'chonburi_bangkok'
ON CONFLICT (route_id, departure_date_time) DO NOTHING;

-- Derived from route_stops exactly as data.sql does. Without these rows the schedule
-- is invisible to every query that INNER JOINs a stop pair.
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
-- `pending` + far-future expiry: the two things that make it payable at all.
-- 3 days of expiry rather than the usual minutes, because this lane's slowest path
-- is a cold Maven build plus a real round trip to api.omise.co and back through a
-- 3DS page; an expiry tuned to the product's real hold time would make the fixture
-- itself the flake.
INSERT INTO bookings (actor_id, status_id, booking_type_id, booking_channel_id,
                      booking_number, total_amount, net_amount, discount_amount_snapshot,
                      reschedule_count, expires_at,
                      contact_name_snapshot, contact_phone_snapshot, contact_email_snapshot)
SELECT
    (SELECT id FROM users   WHERE email = 'customer@system.local'),
    (SELECT id FROM lookups WHERE category = 'booking_status'  AND slug = 'pending'),
    (SELECT id FROM lookups WHERE category = 'booking_type'    AND slug = 'one_way'),
    (SELECT id FROM lookups WHERE category = 'booking_channel' AND slug = 'online'),
    'Q3DS-PAYME', 200.00, 200.00, 0.00,
    0,
    (timezone('Asia/Bangkok', now()) + interval '3 days')::timestamptz,
    'E2E ThreeDS', '0810000732', 'e2e-3ds@example.com';

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
                     (((timezone('Asia/Bangkok', now()))::date + 20)::text || ' 10:00:00+07')::timestamptz
CROSS JOIN (SELECT id FROM stops WHERE slug = 'nong_chak') from_stop
CROSS JOIN (SELECT id FROM stops WHERE slug = 'mo_chit_2_bus_terminal') to_stop
JOIN schedule_stop_times st_from ON st_from.schedule_id = sc.id AND st_from.stop_id = from_stop.id
JOIN schedule_stop_times st_to   ON st_to.schedule_id   = sc.id AND st_to.stop_id   = to_stop.id
WHERE b.booking_number = 'Q3DS-PAYME';

-- ── Ticket ───────────────────────────────────────────────────────────────────
-- `reserved`, not `confirmed`: the seat is held pending payment, and a successful
-- charge is what promotes it (PaymentService -> ticketService.finalizeSettlement).
-- Seeding it `confirmed` would hide whether settlement ran at all, which is half of
-- what AC 3 is checking.
--
-- Seat '9' is nobody else's: the reschedule fixture uses 4-7 and this schedule is on
-- its own day anyway. The van has no walk_in_only seat_maps rows, so a customer may
-- hold it (only `minibus` seat '1' is walk-in-only).
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
    (SELECT id FROM lookups WHERE category = 'ticket_status'  AND slug = 'reserved'),
    sc.route_id,
    bs.from_stop_id, bs.to_stop_id,
    'Q3DS-TK-PAYME',
    'Mr', 'ThreeDS', 'Tester',
    'Nong Chak', 'Mo Chit 2 Bus Terminal', 'van',
    bs.departure_date_time, bs.arrival_date_time,
    200.00, 0.00, 200.00,
    'male', '9'
FROM bookings b
JOIN booking_schedules bs ON bs.booking_id = b.id
JOIN schedules sc ON sc.id = bs.schedule_id
WHERE b.booking_number = 'Q3DS-PAYME';

COMMIT;

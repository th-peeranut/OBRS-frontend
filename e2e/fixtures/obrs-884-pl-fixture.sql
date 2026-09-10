-- OBRS-884 — the per-vehicle P&L states the screen has to tell apart, built by construction.
--
-- Used by the OWN-DB lane (playwright.local.config.ts's start-e2e-backend.ps1, via
-- E2E_FIXTURE_SQL) because these states cannot be produced on a shared environment: a
-- vehicle whose service window is UNKNOWN, one whose window says it was NOT in service
-- while money is attributed to it, and one that is squarely IN SERVICE all have to appear
-- in the SAME period, and SIT's fleet cannot be in three states at once on demand.
--
-- ⚠️ EVERY FIGURE BELOW IS INVENTED for this fixture. Nothing here comes from the
-- operator's own books — this repository is public.
--
-- Period: 2026-06-01 .. 2026-06-30, chosen because data.sql's real fleet already puts the
-- three coverage states on either side of it:
--   16-8829  in_service 2026-01-30..2026-06-17  -> IN_SERVICE
--   16-9310  in_service_from IS NULL            -> SERVICE_WINDOW_UNKNOWN
--   16-9535  in_service_from 2026-07-10         -> OUTSIDE_SERVICE_WINDOW (money in June)
--
-- 🔴 OBRS-1526 — the UNKNOWN row is now a vehicle THIS FIXTURE OWNS (16-0884), not 16-9310.
-- It used to come for free because data.sql left 16-9310's column NULL; OBRS-886's census filled
-- all seven of the real plates in, and this lane's premise disappeared with a seed edit in
-- another repo. Nothing went red until somebody ran it by hand — backend CI runs migration-guard
-- only on a PR into dev, and this lane is not in frontend CI either.
--
-- ⚠️ AND NULLING 16-9310 HERE DOES NOT WORK, which is worth writing down because it looks like it
-- should. The fixture is applied while the database is BUILT; Flyway runs when the app BOOTS,
-- after it. V115's guard is `WHERE in_service_from IS NULL`, so a fixture that nulls a censused
-- plate is handing V115 exactly the row it is looking for, and the date comes straight back
-- (measured 2026-08-22: fixture 19:04, V115 19:05:15, column repopulated). A plate the census
-- does not name is immune, so the fixture brings its own.
--
-- Revenue comes from `historical_revenue` rather than bookings+payments+schedules: the
-- report sums both into one figure (OBRS-1508) and this half needs no journey to exist, so
-- seeding it directly keeps the fixture to what it is actually about.

-- ── The unknown-window vehicle this lane owns (see the OBRS-1526 note above) ─────────────
INSERT INTO vehicles (owner_id, vehicle_type_id, status_id, number_plate, vehicle_number, brand,
                      model, manufacture_year, colour, engine_cc, in_service_from, note)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'), 2,
       (SELECT id FROM lookups WHERE category = 'vehicle_status' AND slug = 'active' LIMIT 1),
       '16-0884', '00-00', 'Toyota', 'Coaster', 2012, 'ขาว', 2500, NULL,
       'obrs884 fixture only - the SERVICE_WINDOW_UNKNOWN row'
WHERE NOT EXISTS (SELECT 1 FROM vehicles WHERE number_plate = '16-0884');

-- ── Revenue ──────────────────────────────────────────────────────────────────────────────
INSERT INTO historical_revenue (owner_id, vehicle_id, revenue_date, amount, note)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'),
       (SELECT id FROM vehicles WHERE number_plate = v.plate), v.day, v.amount, v.note
FROM (VALUES
        ('16-8829', DATE '2026-06-04', 12000.00, 'obrs884_rev_8829_a'),
        ('16-8829', DATE '2026-06-18', 16000.00, 'obrs884_rev_8829_b'),
        ('16-9310', DATE '2026-06-08',  4000.00, 'obrs884_rev_9310'),
        -- Money on a vehicle whose window says it had not joined the fleet yet. The
        -- contradiction is the finding: the row is surfaced, not hidden, and the screen
        -- has to say so rather than render a confident number (ADR-0115 §3).
        ('16-9535', DATE '2026-06-12',   900.00, 'obrs884_rev_9535_outside')
     ) AS v(plate, day, amount, note)
WHERE NOT EXISTS (SELECT 1 FROM historical_revenue WHERE note = v.note);

-- ── Costs ────────────────────────────────────────────────────────────────────────────────
-- 16-9310 ends the period at a LOSS on purpose - a fixture where every bus is profitable
-- would leave the negative-margin colour unproven.
INSERT INTO expenses (owner_id, vehicle_id, category, amount, vat_amount, expense_date, note)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'),
       (SELECT id FROM vehicles WHERE number_plate = e.plate), e.category, e.amount,
       e.vat_amount, e.day, e.note
FROM (VALUES
        ('16-8829', 'FUEL',        6500.00,  455.00::numeric, DATE '2026-06-06', 'obrs884_exp_8829_fuel'),
        ('16-8829', 'REPAIR',      3200.00,  NULL::numeric,   DATE '2026-06-19', 'obrs884_exp_8829_repair'),
        ('16-9310', 'INSTALMENT', 12000.00,  NULL::numeric,   DATE '2026-06-02', 'obrs884_exp_9310_instalment'),
        ('16-9310', 'FUEL',        2100.00,  147.00::numeric, DATE '2026-06-15', 'obrs884_exp_9310_fuel'),
        -- No revenue at all, one small cost: the row whose margin is a pure loss and whose
        -- revenue ฿0 must read "did not run", not "earned nothing".
        ('16-8747', 'PARKING_FEE',  600.00,  NULL::numeric,   DATE '2026-06-21', 'obrs884_exp_8747_parking')
     ) AS e(plate, category, amount, vat_amount, day, note)
WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE note = e.note);

-- ส่วนกลาง: vehicle_id IS NULL. Counted exactly once at company level and never averaged
-- down onto the buses, which is why it gets its own line on the screen.
INSERT INTO expenses (owner_id, vehicle_id, category, amount, vat_amount, expense_date, note)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'), NULL,
       'CENTRAL', 2400.00, 168.00, DATE '2026-06-10', 'obrs884_exp_central'
WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE note = 'obrs884_exp_central');

-- OBRS-1356: a cost the owner has not ruled on yet. It is deliberately OUTSIDE the margin,
-- and rides beside it on screen precisely because it is excluded from it.
INSERT INTO expenses (owner_id, vehicle_id, category, amount, vat_amount, expense_date,
                      approval_status, note)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'),
       (SELECT id FROM vehicles WHERE number_plate = '16-8829'),
       'TOLL', 750.00, NULL, DATE '2026-06-25', 'PENDING', 'obrs884_exp_pending'
WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE note = 'obrs884_exp_pending');

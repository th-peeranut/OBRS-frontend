-- OBRS-1578 — the smallest world in which the spend-by-payee screen's decisions are visible.
--
-- ⚠️ EVERY NAME AND EVERY FIGURE HERE IS INVENTED. This repository is public by design (Netlify),
-- and the bills this card was specified from are the owner's real garages and real amounts. What is
-- reproduced below is their SHAPE, which is the only part the screen's behaviour depends on:
--
--   * five bills in 2026 and exactly ONE in 2025, and
--   * the 2025 one is the SECOND-LARGEST payee on record.
--
-- That second point is the whole reason the year filter defaults to "every year": narrow to the
-- current year and the report loses its number-two supplier with nothing on screen to say so.
--
--   ร้านทดสอบ กระจก    REPAIR  7,400.00  2026-08-17   -- largest
--   อู่ทดสอบ ข         REPAIR  5,400.00  2025-01-16   -- second largest, and alone in 2025
--   อู่ทดสอบ ก         REPAIR  3,100.00  2026-08-14   -- two bills, 5,250.00 together
--   อู่ทดสอบ ก         REPAIR  2,150.00  2026-07-28
--   ร้านทดสอบ แบตเตอรี่ REPAIR  2,800.00  2026-08-09
--   บริการทดสอบ        REPAIR    700.00  2026-01-12
--
-- Two of the bills below carry NO payee, and they are here because the first run of this lane
-- proved they had to be. The comment that stood here said data.sql's own expenses would supply
-- the unassigned bucket; measured against the lane's database, `SELECT count(*) FROM expenses`
-- returned exactly the 6 rows this file inserts, so data.sql seeds no expenses at all and AC2's
-- coverage banner had nothing to describe. On the owner's real database the unassigned bucket
-- fills itself (payee_id was added by V121 and is deliberately never backfilled); here it does
-- not, so the fixture has to state it.

INSERT INTO expense_payees (owner_id, name, name_normalized, type, created_by, updated_by)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'), v.name, v.normalized, v.type, 'e2e', 'e2e'
FROM (VALUES
        ('ร้านทดสอบ กระจก',     'ร้านทดสอบกระจก',     'OTHER'),
        ('อู่ทดสอบ ข',          'อู่ทดสอบข',          'GARAGE'),
        ('อู่ทดสอบ ก',          'อู่ทดสอบก',          'GARAGE'),
        ('ร้านทดสอบ แบตเตอรี่', 'ร้านทดสอบแบตเตอรี่', 'OTHER'),
        ('บริการทดสอบ',         'บริการทดสอบ',        'OTHER')
     ) AS v(name, normalized, type);

INSERT INTO expenses (owner_id, vehicle_id, payee_id, category, amount, expense_date, receipt_no,
                      paid_by, note, approval_status)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'),
       NULL,
       (SELECT id FROM expense_payees WHERE name = v.payee),
       'REPAIR', v.amount, v.on_date, v.receipt_no, 'Owner', 'obrs-1578 e2e fixture', 'APPROVED'
FROM (VALUES
        ('ร้านทดสอบ กระจก',     7400.00, DATE '2026-08-17', 'E2E-1578-1'),
        ('อู่ทดสอบ ข',          5400.00, DATE '2025-01-16', 'E2E-1578-2'),
        ('อู่ทดสอบ ก',          3100.00, DATE '2026-08-14', 'E2E-1578-3'),
        ('อู่ทดสอบ ก',          2150.00, DATE '2026-07-28', 'E2E-1578-4'),
        ('ร้านทดสอบ แบตเตอรี่', 2800.00, DATE '2026-08-09', 'E2E-1578-5'),
        ('บริการทดสอบ',          700.00, DATE '2026-01-12', 'E2E-1578-6')
     ) AS v(payee, amount, on_date, receipt_no);

-- The unassigned bucket: real APPROVED money that no payee owns. One of them sits in August 2026
-- on purpose, so the month-level frame shows the coverage banner too rather than only the
-- every-year one -- a gap that appears and disappears as you filter is the confusing case.
INSERT INTO expenses (owner_id, vehicle_id, payee_id, category, amount, expense_date, receipt_no,
                      paid_by, note, approval_status)
SELECT (SELECT id FROM owners WHERE slug = 'nj-travel'),
       NULL, NULL,
       'REPAIR', v.amount, v.on_date, v.receipt_no, 'Owner', 'obrs-1578 e2e fixture', 'APPROVED'
FROM (VALUES
        (1250.00, DATE '2026-08-05', 'E2E-1578-7'),
        ( 900.00, DATE '2026-03-11', 'E2E-1578-8')
     ) AS v(amount, on_date, receipt_no);

-- The "งานที่ทำ" column's raw material. The repeated text across อู่ทดสอบ ก's two bills is there on
-- purpose: the column says what this payee DOES, so it must collapse to one entry rather than
-- listing the same job twice.
INSERT INTO expense_items (expense_id, line_no, part, description, quantity, unit_price, amount)
SELECT (SELECT id FROM expenses WHERE receipt_no = v.receipt_no), v.line_no, NULL, v.description,
       NULL, NULL, v.amount
FROM (VALUES
        ('E2E-1578-3', 1, 'ถ่ายน้ำมันเครื่อง + กรอง', 1200.00),
        ('E2E-1578-3', 2, 'สายพาน',                  1900.00),
        ('E2E-1578-4', 1, 'ลูกหมากปีกนก',            1150.00),
        ('E2E-1578-4', 2, 'ถ่ายน้ำมันเครื่อง + กรอง', 1000.00),
        ('E2E-1578-1', 1, 'กระจกหน้า',               5900.00),
        ('E2E-1578-1', 2, 'ฟิล์มกรองแสง',            1500.00),
        ('E2E-1578-2', 1, 'โช้คอัพหน้า',             2900.00),
        ('E2E-1578-2', 2, 'ค่าแรง',                  2500.00),
        ('E2E-1578-5', 1, 'แบตเตอรี่ 180 แอมป์',      2800.00),
        ('E2E-1578-6', 1, 'ค่าบริการบำรุงรักษา',       700.00)
     ) AS v(receipt_no, line_no, description, amount);

# MANUAL TEST — OBRS-1896 · แถวที่ 6 "อื่น ๆ" บนจอเคลียร์ยอดรายวัน

⛔ **เจ้าของไม่ต้องรันไฟล์นี้** (คำสั่งยืน 2026-07-26) — ผมรันเองครบทุกข้อแล้ว ผลอยู่ในคอลัมน์ RESULT และรูปอยู่ที่การ์ด
ไฟล์นี้มีไว้เป็น regression checklist ของรอบถัดไป

- **การ์ด:** [OBRS-1896](https://nj-phuyaipu.atlassian.net/browse/OBRS-1896) · PR [#488](https://github.com/th-peeranut/OBRS-frontend/pull/488) · commit `05e6f494`
- **จอ:** `/staff/settlement` (role `salesperson`)

## 0) start

```bash
cd ../OBRS-frontend-wt-obrs-1896-settlement-other-row
npx ng test --watch=false --browsers=ChromeHeadless --include='**/driver-settlement-page.component.spec.ts'
npx playwright test --config=playwright.obrs1896capture.config.ts
```

เลน CAPTURE เป็น hermetic — session สังเคราะห์ + ตอบ `/api/**` เองทุกเส้น ⇒ **ไม่ต้องเปิด backend และไม่ต้องมีฐานข้อมูล**
⚠️ endpoint ของ day-context คือ `/api/private/driver-cash/day-context` (ไม่ใช่ `days/context`) — stub ผิดเมื่อไหร่ context เป็น null แล้วจอจะถ่ายออกมา 5 แถวด้วยเหตุที่ไม่เกี่ยวกับการ์ด สเปกเลยยืนยันว่า context ลงจริงก่อนถ่าย

## รายการทดสอบ

| # | ทดสอบอะไร | วิธีวัด (ไม่ใช่ดูด้วยตา) | RESULT |
| --- | --- | --- | --- |
| 1 | ตารางมี **6 แถว** เรียง `DRIVER_WAGE · FUEL · TOLL · PERMIT_FEE · PARKING_FEE · OTHER` | นับ `tbody tr` = 6 + เทียบลำดับ `visibleExpenseRows` | ✅ PASS — unit + capture |
| 2 | ช่อง "รายการ" ของแถวที่ 6 เป็น input และคุมความยาวที่ 100 | `maxLength` ของ `[data-testid="settlement-other-label"]` = 100 | ✅ PASS |
| 3 | กรอกครบ ⇒ ส่งเป็น `category=OTHER` + `categoryOtherLabel` | อ่าน payload ที่ `postDriverCashDaySettle` ได้รับ | ✅ PASS — `amount='300'`, `categoryOtherLabel='ล้างรถ'` |
| 4 | แถวอื่นห้ามมี `categoryOtherLabel` ติดไป (เซิร์ฟเวอร์ 400 ทั้งใบ) | assert ทุกแถวที่ไม่ใช่ `OTHER` ไม่มีฟิลด์นี้ | ✅ PASS |
| 5 | มีเงินไม่มีชื่อ ⇒ ปุ่มปิด + ข้อความขึ้น + ไม่มีการยิง API | `blockedReasonKey` = `STAFF.SETTLEMENT.EXPENSES.OTHER_INCOMPLETE` · `postDriverCashDaySettle` ไม่ถูกเรียก | ✅ PASS |
| 6 | มีชื่อไม่มีเงิน ⇒ ปิดเหมือนกัน (ไม่งั้นชื่อที่พิมพ์หายเงียบ) | เหมือนข้อ 5 | ✅ PASS |
| 7 | แถวเปล่าทั้งคู่ **ไม่ใช่** ความผิด ⇒ ส่งได้ และ payload ไม่มีแถว `OTHER` | `blockedReasonKey` = null · `expenses.some(OTHER)` = false | ✅ PASS |
| 8 | ยอดที่หักกล่องขยับตามจริง | `settlementTotal` 600 → 720.5 (unit) · ยอดบนจอ **600 บาท → 900 บาท** (capture, อ่านกลับจาก DOM) | ✅ PASS |
| 9 | เปิดวันที่ส่งไปแล้วมาแก้ ⇒ ชื่อเดิมกลับมาในกล่อง ไม่ใช่กล่องเปล่า | prefill จาก `lastSubmission` แล้ว assert `otherLabelInput` = ชื่อเดิม + ส่งซ้ำแล้ว label ยังอยู่ | ✅ PASS — ถ้าพลาดข้อนี้ การส่งครั้งที่สองจะ 400 ทั้งวัน |
| 10 | ข้อความเตือนไม่ดันคอลัมน์ | `.ds-other-error { display: block }` ⇒ เทียบรูป AFTER-2 กับ AFTER-1: ช่องจำนวนเงินอยู่ตำแหน่งเดิม | ✅ PASS |
| 11 | ไม่พังของเดิม | suite เต็ม **7279 of 7279 SUCCESS** · `test:i18n` 3863 คีย์ครบ 3 ภาษา · `test:i18n-keys` · `check-e2e-lanes.mjs` | ✅ PASS |

## mutation (เทสต์ต้องแดงเมื่อโค้ดหาย)

| ถอดอะไรออก | ผล |
| --- | --- |
| `OTHER_CATEGORY` ออกจาก `SETTLEMENT_EXPENSE_CATEGORIES` | 🔴 4 FAILED |
| `categoryOtherLabel` ออกจาก `buildPayload` | 🔴 2 FAILED |
| เกต `isOtherRowIncomplete` ออกจาก `blockedReasonKey` | 🔴 1 FAILED |

## ที่ยังไม่ได้ทดสอบ และเพราะอะไร

- **ยิงจริงเข้า backend** — ใบนี้ไม่แตะ BE เลย และกติกา `isOther == hasLabel` มีเทสต์ฝั่ง BE ของ OBRS-1363 เป็นเจ้าของอยู่แล้ว ⇒ ไม่ทำซ้ำ
- **ชื่อภาษาไทยยาว 100 ตัวอักษรผ่าน IME** — `maxlength` นับ**ตัวอักษร** เหมือน `@Size` ฝั่ง BE และไทยอยู่ใน BMP ⇒ ตรงกัน แต่ยังไม่ได้พิสูจน์ด้วยการพิมพ์ผ่าน IME จริง (scrutinize ตั้งข้อสังเกตไว้)

# MANUAL TEST — OBRS-1149 · driver-cash discrepancy read-back

การ์ด: https://nj-phuyaipu.atlassian.net/browse/OBRS-1149
สาขา: `ao/obrs-1149-driver-cash-discrepancy-visible` (แตกจาก `origin/dev` `dca2e26b`)
worktree: `OBRS-frontend-wt-obrs-1149`

⚠️ ไฟล์นี้ **ผมรันเองแล้ว** ผลอยู่ท้ายไฟล์ ไม่ใช่ขั้นตอนที่ส่งให้ owner ไปรัน

## 0) จุดตั้งต้น

เลนตรวจ = **ไม่มี backend** (ตาม `jira-card-visual-evidence-policy` หัวข้อ *No-backend capture*)
เหตุผลที่ไม่ใช้ local/SIT: `discrepancy` ที่ไม่เป็นศูนย์เกิดขึ้นได้ทางเดียวคือมีคนปิดวันด้วยยอดที่ไม่ตรง
— seed ไม่มีสักแถว และการไปสร้างบน SIT คือการเขียนข้อมูลจริงของกล่องเงินที่มีคนใช้อยู่

```
# serve สองตัวขนานกัน: AFTER = สาขานี้, BEFORE = worktree detached ที่ origin/dev
npx ng serve --port 4300           # ใน OBRS-frontend-wt-obrs-1149
npx ng serve --port 4400           # ใน OBRS-frontend-wt-obrs-1149-before

CAPTURE_BASE=http://localhost:4300 CAPTURE_PHASE=AFTER  node e2e/scripts/capture-obrs1149.js
CAPTURE_BASE=http://localhost:4400 CAPTURE_PHASE=BEFORE node e2e/scripts/capture-obrs1149.js
```

fixture ที่ stub ลงไป — 4 แถว หนึ่งแถวต่อหนึ่งสถานะที่คอลัมน์ต้องอ่านให้ถูก:

| dayId | สถานะ | ยอดที่คาด | ยอดที่คืน | discrepancy | สิ่งที่ต้องเห็นในคอลัมน์ |
|---|---|---|---|---|---|
| 77 | RETURNED | 500.00 | 380.00 | `-120.00` | `-120 บาท ขาด` สีแดง |
| 78 | RETURNED | 500.00 | 550.00 | `50.00` | `50 บาท เกิน` ไม่แดง |
| 79 | RETURNED | 620.00 | 620.00 | `0.00` | ว่าง |
| 80 | OPEN | 740.00 | — | `null` | ว่าง |

## รายการที่ต้องพิสูจน์ (AC ของการ์ด)

| # | ข้อ | วิธีวัด (ไม่ใช่ดูด้วยตา) |
|---|---|---|
| 1 | ตารางรายวันแสดงส่วนต่างบนแถวที่ปิดแล้ว · ซ่อนเมื่อ `0` หรือยังไม่ปิด | นับ `[data-testid="driver-cash-day-discrepancy-side"]` ต้องได้ **2** จาก 4 แถว (สคริปต์ capture ปฏิเสธการบันทึกรูปถ้าไม่ตรง) + unit spec 4 เคส |
| 2 | โมดัลบนวัน `RETURNED` เห็นยอดที่คาด / ยอดที่คืนจริง / ส่วนต่าง / เหตุผล / ผู้รับคืน / เมื่อไร | นับ `[data-testid="driver-cash-returned-summary"]` = 1 และอ่านค่าใน 5 testid ย่อย |
| 3 | เครื่องหมายอ่านออกว่าฝั่งไหน | assert คีย์ `DISCREPANCY_SHORT` / `DISCREPANCY_OVER` และ class แดงเฉพาะฝั่งขาด |
| 4 | i18n ครบ th/en/zh | `json.load` ทั้ง 3 ไฟล์แล้วอ่านคีย์ใหม่ทั้ง 5 ตัวกลับมา |
| 5 | รูป AFTER ของทั้งตารางและโมดัล | ไฟล์ใน `docs/manual-tests/assets/OBRS-1149/` + upload ขึ้นการ์ด |

## RESULT — รันเมื่อ 2026-09-15

| # | ผล | หลักฐาน |
|---|---|---|
| 1 | ✅ | `capture-obrs1149.js` AFTER ผ่านเกต `2 discrepancy readings` / `4 rows`; BEFORE ผ่านเกต `0 readings` · unit: 4 เคสใหม่ใน `driver-cash-days-list.component.spec.ts` |
| 2 | ✅ | AFTER modal สูง 660px มีครบ 6 บรรทัด (BEFORE 466px มีแต่ประโยค "วันนี้มีการคืนเงินไปแล้ว") |
| 3 | ✅ | รูป: `-120 บาท ขาด` แดง · `50 บาท เกิน` ไม่แดง · unit assert ทั้งคีย์และ class |
| 4 | ✅ | อ่านกลับจาก `public/i18n/{th,en,zh}.json` ได้ครบ 5 คีย์ (`RETURNED_AMOUNT` `RETURNED_BY` `RETURNED_AT` `DISCREPANCY_SHORT` `DISCREPANCY_OVER`) |
| 5 | ✅ | 4 ไฟล์ใน `docs/manual-tests/assets/OBRS-1149/` (BEFORE/AFTER × ตาราง/โมดัล) |

เทสต์:

* แคบ — `npx ng test --watch=false --include='**/settlements/driver-cash-*/*.spec.ts'` → **Executed 55 of 55 SUCCESS**, exit 0
* ชุดเต็ม — `npx ng test --watch=false` → **Executed 7308 of 7308 SUCCESS**, exit 0
  (log: `.claude/agent-office/scripts/captures/fe-obrs-1149-full.log` ในรีโปออฟฟิศ)

## ⛔ สิ่งที่ยังพิสูจน์ไม่ได้จากที่นี่

รูปทั้งหมดถ่ายจาก fixture ที่ stub ไว้ ไม่ใช่ข้อมูลจริงบน SIT — เพราะยังไม่เคยมีวันไหนบน SIT
ที่ถูกปิดด้วยยอดไม่ตรง ตัวเลขในรูปจึงพิสูจน์ว่า **FE เรนเดอร์ค่าที่ BE ส่งมาถูกต้อง** ไม่ได้พิสูจน์ว่า
BE คำนวณ `discrepancy` ถูก (อันนั้นอยู่ที่ `DriverCashService.returnDay()` บรรทัด 1121 ซึ่งการ์ดนี้ไม่ได้แตะ)

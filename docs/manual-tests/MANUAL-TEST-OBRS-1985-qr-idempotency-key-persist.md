# MANUAL TEST — OBRS-1985 · QR tab must not create a new charge on every mount

การ์ด: [OBRS-1985](https://nj-phuyaipu.atlassian.net/browse/OBRS-1985) · สาขา `ao/obrs-1985-qr-idempotency-key-persist`

⛔ เอกสารนี้ **ผู้เขียนรันเองครบทุกข้อแล้ว** (2026-09-19) ไม่ใช่การบ้านส่งต่อให้เจ้าของ —
เก็บไว้เป็น regression checklist สำหรับรอบหน้า

## 0) ตั้งต้น

| ของที่ต้องมี | ค่าที่ใช้จริงในรอบนี้ |
|---|---|
| backend | local (`./mvnw spring-boot:run -Dspring-boot.run.profiles=dev,local`) — **ไม่ใช่ SIT** เพราะ `https://sit-obrs-backend.koyeb.app/actuator/health` ตอบ `404: No active service` (measured, `curl`) |
| frontend | `npx ng serve --port 4200` จาก worktree ที่จะทดสอบ |
| login | `customer@system.local` / `P@ssw0rd` (seed ชุดเดียวกับ SIT) |
| ข้อมูลรอบเดินทาง | local DB ไม่มีรอบในอนาคต ⇒ สร้างด้วย `POST /api/private/schedule-set` (salesperson) + `POST /api/private/schedule-set/{id}/generate-schedules` · ใช้ route `chonburi_bangkok`, vehicleType `van`, 20–30 ก.ย. 2026, รอบ 09:00 / 13:00 |

⚠️ **ต้องใช้ booking ใบใหม่ต่อการทดสอบ 1 รอบ** — รอบ BEFORE ทิ้ง pending charge ค้างไว้กับ booking ที่ใช้
ซึ่งเป็นตัวบล็อกที่การ์ดนี้แก้อยู่พอดี

## 1) BEFORE — พิสูจน์ว่าบั๊กมีจริงบน `origin/dev`

เสิร์ฟ worktree ที่ **ยังไม่แก้** (`git worktree add --detach ... origin/dev`)

| # | ขั้นตอน | สิ่งที่ต้องเห็น | ผล |
|---|---|---|---|
| 1 | จองจนถึงหน้า `/payment` (booking ใหม่) | หน้าเลือกช่องทางชำระเงิน แท็บ `บัตรเครดิต / เดบิต` active | ✅ |
| 2 | กดแท็บ `ชำระเงินด้วย QR` | QR PromptPay ขึ้น (charge จริงที่ Omise test) | ✅ |
| 3 | กดแท็บ `บัตรเครดิต / เดบิต` แล้วกดกลับ `ชำระเงินด้วย QR` | **dialog** `มีรายการชำระเงินที่กำลังดำเนินการอยู่สำหรับการจองนี้ กรุณาลองใหม่อีกครั้งในภายหลัง` ทับ QR ที่หายไป | ✅ **บั๊ก reproduce ได้** |

หลักฐาน: `OBRS-1985-BEFORE-qr-tab-remount-payment-in-progress.jpg` (แนบในการ์ด)

## 2) AFTER — สาขา `ao/obrs-1985-qr-idempotency-key-persist`

เสิร์ฟ worktree ที่แก้แล้วบนพอร์ตเดิม (4200) · booking ใบใหม่ (id **15**)

| # | ขั้นตอน | assertion (วัด ไม่ใช่ดูด้วยตา) | ผล |
|---|---|---|---|
| 1 | กดแท็บ `ชำระเงินด้วย QR` ครั้งแรก | `localStorage['active_booking_payment_idempotency_key']` = `{"version":1,"savedAt":…,"value":{"bookingId":15,"key":"66f93641-…"}}` และ `document.querySelector('img[alt="PromptPay QR code"]')` ไม่ null | ✅ |
| 2 | สลับไปแท็บบัตร แล้วกลับมาแท็บ QR (component ถูก destroy/re-create จริงตาม `@if` ใน `payment.component.html:36-43`) | `document.querySelectorAll('.swal2-container').length === 0` (ไม่มี dialog) · QR img ยังอยู่ (`src` ขึ้นต้น `blob:`) · `savedAt` **ไม่เปลี่ยน** ⇒ key เดิมถูก replay ไม่ได้สร้างใหม่ | ✅ |
| 3 | refresh หน้า `/payment` แล้วกดแท็บ QR (เคส "กลับจากแอปธนาคาร") | เงื่อนไขเดียวกับข้อ 2 ทุกข้อ · `savedAt` ยังเป็นค่าเดิม | ✅ |
| 4 | นับ charge ที่เกิดจริงกับ booking นี้ ผ่าน `GET /api/private/bookings/15/payments` | **1 transaction** (`chrg_test_692j18etefq3x1relfx`) จากการ mount แท็บ QR **3 ครั้ง** | ✅ **นี่คือข้อพิสูจน์ชี้ขาด** |

หลักฐาน: `OBRS-1985-AFTER-qr-tab-remount-same-qr.jpg`, `OBRS-1985-AFTER-refresh-same-qr.jpg`

## 3) Control cases — ต้องไม่พังของเดิม

| # | เคส | assertion | ผล |
|---|---|---|---|
| 1 | ชุดเทสต์ของไฟล์ที่แตะ | `Executed 17 of 17 SUCCESS` (`booking-context-storage.spec.ts`) · `Executed 38 of 38 SUCCESS` (`payment-qrcode.component.spec.ts`) | ✅ |
| 2 | ชุดเทสต์ FE ทั้งหมด | `Executed 7517 of 7517 SUCCESS` | ✅ |
| 3 | production build | `ng build --configuration prod` exit 0 (เหลือแต่ bundle-budget/CommonJS warning ที่มีอยู่ก่อนแล้ว) | ✅ |
| 4 | key ข้าม booking | spec: อ่านด้วย `bookingId` คนละใบ ⇒ คืน `null` (กัน `IDEMPOTENCY_MISMATCH` ฝั่ง BE) | ✅ |
| 5 | storage ใช้ไม่ได้ (private mode) | spec: `localStorage` throw ⇒ อ่านได้ `null` ไม่ throw ต่อ | ✅ |

## 4) เคสที่ยัง**ไม่ได้**ทดสอบด้วยมือ (บอกตรง ๆ)

- **key หมดอายุ 24 ชม.** — รอจริงไม่ได้ในรอบนี้ ครอบด้วย spec ของ `ttl-storage` + spec AC5 ที่จำลอง restored-key ยิงแล้วพัง ⇒ ต้องล้าง key ทิ้ง
- **แอปธนาคารจริงบนมือถือ** — รอบนี้จำลองด้วย refresh/remount บน desktop ซึ่งเป็น code path เดียวกัน (component destroy)
- **container IT ฝั่ง BE** — การ์ดนี้ไม่แตะ backend เลย จึงไม่ได้รัน

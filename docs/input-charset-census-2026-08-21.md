# สำมะโนชุดตัวอักษรของช่องกรอกทุกช่อง — OBRS-1464 AC-1

**วัดเมื่อ 2026-08-21** บน `ao/obrs-1464-input-charset` (base `origin/dev` = `deb2e50b`) ด้วยสคริปต์ที่
ไล่ `<input>` / `<textarea>` ทุกตัวใน `src/app` แล้วดึง `type` / `inputmode` / `maxlength` / `pattern`
ออกมา แล้ว join กับบรรทัดที่ประกาศ control นั้นในไฟล์ `.ts` ข้างกัน

> ⚠️ **ตารางนี้เป็นภาพนิ่งของวันที่วัด** — คอลัมน์ "validator ที่ประกาศไว้" มาจากจุดที่ control ถูก
> **สร้าง** เท่านั้น จึงไม่เห็น `setValidators()` ที่ตั้งทีหลัง (เช่น `approvalCode` กับทั้ง 4 ช่องของ
> โมดัลคืนเงิน) และไม่เห็นการตรวจที่เขียนมือใน `(input)` handler (เช่น `counter-cash-code`)
> ⇒ ช่องที่คอลัมน์นั้นว่าง **ไม่ได้แปลว่าไม่มีอะไรกันเลย** ต้องเปิดไฟล์ยืนยันก่อนสรุป — §3 ทำแล้ว

## 1. ตัวเลขรวม

| อะไร | จำนวน |
|---|---|
| `<input>` + `<textarea>` ทั้ง `src/app` | **225** (193 + 32) ใน **74 ไฟล์** |
| ช่องที่**พิมพ์อะไรลงไปก็ได้** (`text` · ไม่ระบุ type · `tel` · `email` · `search` · `textarea` · password toggle) | **149** |
| ช่องที่เบราว์เซอร์กันชุดตัวอักษรให้เอง (`number` · `date` · `checkbox` · `radio` · `file`) | **76** |
| ช่องที่มี `pattern=` ใน HTML | **0** |
| ช่องที่มีตัวกรองระดับ**คีย์สโตรก** (`(keydown)` / `(beforeinput)` / `(paste)` / `(drop)` ที่กรองอักขระ) | **0** |
| `(keydown...)` ที่มีจริง 3 จุด | `admin-layout:47` (escape ปิดเมนู) · `boarding-list:209` (enter = ยิงสแกน) · `dropdown-group-obrs:30` (คีย์บอร์ดนำทาง) — **ไม่มีจุดไหนกรองอักขระ** |
| ไฟล์ใน `src/app/shared/directives/` | **1** (`admin-modal-backdrop.directive.ts`) |

⇒ ยืนยันข้อความบนการ์ด: **ทั้งโปรเจกต์ไม่มีการจำกัดชุดตัวอักษรระดับพิมพ์เลยแม้แต่ช่องเดียว**

## 2. ระดับการบังคับที่พบจริง — มี 3 ชั้น ไม่ใช่ 2

| ชั้น | ความหมาย | จำนวนช่อง (จาก 149) |
|---|---|---|
| **T2 — กันตอนพิมพ์** | พิมพ์อักขระที่ไม่อนุญาตแล้ว**ไม่ติด** | **0** |
| **T1 — กันตอนกดส่ง** | พิมพ์อะไรก็ติด แต่ validator/parse บล็อกปุ่ม + ขึ้น error | **36** = 25 (validator ชุดตัวอักษรที่ประกาศตอนสร้าง control — นับด้วยสคริปต์) + 5 (ตั้งทีหลัง/เขียนมือ: `promptpayPhone` · `approvalCode` · `counter-cash-code` · `reporterEmail` · `newPassword`) + 6 (เงินที่ `toCents()` บล็อกปุ่มให้) |
| **T0 — ไม่กันอะไรเลย** | `required` หรือ `maxlength` อย่างเดียว หรือไม่มีอะไรเลย ⇒ สตริงอะไรก็ถึง BE | **113** (= 149 − 36) ซึ่ง **32 ช่องเป็น `textarea`** ที่ตั้งใจให้อิสระอยู่แล้ว |

`inputmode="numeric"` มี **31 ช่อง** และ **ไม่ใช่ชั้นใดเลย** — มันบอกมือถือว่าจะเปิดคีย์บอร์ดแบบไหน
เท่านั้น บนเดสก์ท็อปพิมพ์ตัวอักษรอะไรก็ได้ ใน 31 ช่องนี้มี **15 ช่องที่ `type` เป็น `text` หรือไม่ระบุ**
⇒ `inputmode` เป็น "สิ่งเดียว" ที่ชี้ว่าช่องนี้ตั้งใจรับตัวเลข

## 3. คำตัดสินรายช่องที่สำคัญ (เปิดไฟล์ยืนยันแล้วทีละช่อง)

| ช่อง | เจตนา | FE วันนี้ | BE วันนี้ | คำตัดสิน |
|---|---|---|---|---|
| `accountNumber` (โมดัลคืนเงิน) | ตัวเลขล้วน | `inputmode` + `trimmedRequired` = **T0** | `StringUtils.hasText` เท่านั้น (`CancellationService:834`) | 🔴 **ช่องเดียวในแอปที่เป็นปลายทางของเงินจริง แล้วไม่มีใครตรวจทั้งสองฝั่ง** ⇒ AC-4 |
| `accountName` (โมดัลคืนเงิน) | ชื่อคน/นิติบุคคล | `trimmedRequired` = **T0** | `hasText` เท่านั้น | 🔴 ⇒ AC-3 (denylist แคบ) |
| `bank` (โมดัลคืนเงิน) | ชื่อธนาคาร | `trimmedRequired` = **T0** | `hasText` เท่านั้น | → [OBRS-1463](https://nj-phuyaipu.atlassian.net/browse/OBRS-1463) (ต้องมีรายการธนาคารก่อน ไม่ใช่เรื่องชุดตัวอักษร) |
| `promptpayPhone` (โมดัลคืนเงิน) | 10 หลักขึ้นต้น 0 | `promptPayPhoneValidator` = **T1** | `PROMPTPAY_PHONE_PATTERN` `^0\d{9}$` (`CancellationService:845`) | ✅ ครบทั้งสองฝั่งอยู่แล้ว — เป็นตัวอย่างว่า "ครบ" หน้าตาเป็นยังไง |
| `phoneNumber` × 8 หน้า (account · user-management · find-booking · booker-info · passenger-info · register · walk-in) | เบอร์ไทย | `thaiMobileValidator` / `separatorTolerantPattern(THAI_MOBILE_PATTERN)` = **T1** | — | ✅ ไม่ใช่ช่องว่าง |
| `senderPhone` / `recipientPhone` × 2 หน้า (parcel) | เบอร์ไทย | `separatorTolerantPattern` = **T1** | — | ✅ |
| `phoneNo` (`login-mobile:42`) | เบอร์ไทย | `Validators.required` **อย่างเดียว** = **T0** | — | ⚠️ **ไม่ใช่ของหลุด** — เป็นมติที่ล็อกไว้แล้วใน [OBRS-691](https://nj-phuyaipu.atlassian.net/browse/OBRS-691) เขียนคาไว้ที่ `login-mobile.component.ts:38` ("LOCKED decision: this field only carries `Validators.required`") ⇒ **ห้ามเปิดการ์ดทับมติเดิม** |
| `identityCardNumber` (`walk-in-checkout:88`) | 13 หลัก | `Validators.pattern(idCardPattern)` = **T1** | — | ✅ |
| `approvalCode` (`counter-cancel-modal:106`) | 6 หลัก | `setValidators` ทีหลังเป็น `^\d{6}$` = **T1** | — | ✅ (ตารางอัตโนมัติมองไม่เห็น เพราะตั้งทีหลัง) |
| `counter-cash-code` (`counter-cash-handover:59`) | 6 หลัก | ตรวจมือใน `isCodeWellFormed` = **T1** | — | ✅ |
| `gpsImei` (`vehicle-form-modal:126`) | ตัวเลข 15 หลัก | `optionalGpsImeiValidator` = **T1** | — | ✅ |
| เงินแบบ `type="text" inputmode="decimal"` × 6 (`amountInput` ×2 · `ratePerHead/LegInput` · `returnedAmountInput` · `countedCashInput`) | จำนวนเงิน | ไม่มี validator แต่ `toCents()` คืน `null` ⇒ **ปุ่มส่งถูกปิด + ขึ้น error** = **T1** | — | ✅ จงใจ (เก็บเป็น text เพื่อคุมทศนิยมเอง) ไม่ใช่ของหลุด |
| `bookingNumber` ×2 · `trackingNumber` · `collectionCode` · `receiptNo` · `numberPlate` · `vehicleNumber` · `chassisNumber` · `code` (promo/promotion) | รหัสอ้างอิง | `required` / `maxLength` = **T0** | — | 🟡 **เป็นช่องค้นหา/รหัสอ้างอิง — กรอกผิด = "ไม่พบ" ไม่ใช่เงินไปผิดที่** ⇒ ไม่คุ้มจะบังคับ ไม่เปิดการ์ด |
| `textarea` 32 ช่อง (เหตุผล · หมายเหตุ · คำอธิบาย) | ข้อความอิสระ | `required`/`maxLength` = **T0** | — | ✅ ถูกแล้ว — ข้อความอิสระไม่ควรมีชุดตัวอักษร |

## 4. AC-5 — ช่องที่ขาดแล้วควรแยกเป็นการ์ดลูก

ไล่ครบ 149 ช่องแล้ว **ไม่มีการ์ดลูกที่ควรเปิด** ด้วยเหตุผลที่วัดได้ ไม่ใช่เพราะขี้เกียจ:

1. ช่องที่เป็น **ปลายทางของเงิน** มีชุดเดียวคือโมดัลคืนเงิน — และอยู่ในใบนี้ (`accountNumber`/`accountName`) กับ [OBRS-1463](https://nj-phuyaipu.atlassian.net/browse/OBRS-1463) (`bank`) แล้ว
2. ช่อง **ตัวเลข/รหัสที่มีผลต่อระบบ** ทุกช่อง (เบอร์โทร · บัตรประชาชน · approval code · IMEI · จำนวนเงิน) **มี T1 อยู่แล้ว** — เปลี่ยนเป็น T2 คือความสวย ไม่ใช่ช่องโหว่
3. ช่องที่เหลือเป็น **ค้นหา/รหัสอ้างอิง/ข้อความอิสระ** ซึ่งกรอกผิดแล้วผลคือ "ไม่พบ" — ไม่มีเงินหรือข้อมูลเสียหาย
4. `phoneNo` ของ `login-mobile` เป็น **มติที่ล็อกแล้ว** ([OBRS-691](https://nj-phuyaipu.atlassian.net/browse/OBRS-691)) ไม่ใช่ของหลุด

⇒ ถ้าจะยกทั้งแอปจาก T1 เป็น T2 มันเป็นงาน UX ทั้งก้อน ไม่ใช่ช่องโหว่ 15 ใบ — ถ้าจะทำต้องเป็นมติของ
เจ้าของก่อน การ์ดนี้จึงบังคับเฉพาะช่องที่ **T0 ทั้งสองฝั่งและมีเงินอยู่ปลายทาง**

## 5. ตารางดิบทั้ง 149 ช่อง

สร้างจากสคริปต์ ไม่ได้พิมพ์มือ — เรียงตามชนิดที่เดาจากชื่อ control แล้วตามด้วยไฟล์

### `digits` — 5 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `gpsImei` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:126` | `(ไม่ระบุ = text)` | `numeric` | `20` | `['', [optionalGpsImeiValidator]],` |
| `counter-cash-code` | `modules/my-bookings/components/reschedule-dialog/counter-cash-handover/counter-cash-handover.component.html:59` | `text` | `numeric` | `—` | `—` |
| `identityCardNumber` | `modules/staff/components/walk-in-checkout/walk-in-checkout.component.html:88` | `(ไม่ระบุ = text)` | `numeric` | `13` | `['', [Validators.pattern(this.idCardPattern)]],` |
| `approvalCode` | `modules/staff/pages/counter-cancel/counter-cancel-modal/counter-cancel-modal.component.html:106` | `text` | `numeric` | `—` | `[''],` |
| `accountNumber` | `shared/components/refund-destination-fields/refund-destination-fields.component.html:64` | `text` | `numeric` | `—` | `fb.control(''),` |

### `money` — 6 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `ratePerHeadInput` | `modules/admin/pages/driver-cash-rates/driver-cash-rates-page.component.html:52` | `text` | `decimal` | `—` | `—` |
| `ratePerLegInput` | `modules/admin/pages/driver-cash-rates/driver-cash-rates-page.component.html:149` | `text` | `decimal` | `—` | `—` |
| `returnedAmountInput` | `modules/admin/pages/settlements/driver-cash-day-return-modal/driver-cash-day-return-modal.component.html:124` | `text` | `decimal` | `—` | `—` |
| `countedCashInput` | `modules/admin/pages/settlements/settlement-detail-modal/settlement-detail-modal.component.html:257` | `text` | `decimal` | `—` | `—` |
| `amountInput` | `modules/staff/components/driver-cash-panel/driver-cash-advance-form/driver-cash-advance-form.component.html:6` | `text` | `decimal` | `—` | `—` |
| `amountInput` | `modules/staff/components/driver-cash-panel/driver-cash-expense-form/driver-cash-expense-form.component.html:24` | `text` | `decimal` | `—` | `—` |

### `phone` — 14 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `phoneNumber` | `modules/account/account-page.component.html:143` | `tel` | `—` | `—` | `['', [Validators.required, thaiMobileValidator]],` |
| `phoneNumber` | `modules/admin/pages/user-management/user-form-modal/user-form-modal.component.html:177` | `tel` | `—` | `—` | `['', [Validators.required, separatorTolerantPattern(THAI_MOBILE_PATTERN)]],` |
| `phoneNumber` | `modules/find-booking/pages/find-booking-page/find-booking-page.component.html:27` | `tel` | `numeric` | `—` | `['', [Validators.required, Validators.pattern(/^\d{10,15}$/)]],` |
| `phoneNo` | `modules/login-mobile/login-mobile.component.html:42` | `text` | `—` | `—` | `['', Validators.required],` |
| `senderPhone` | `modules/parcel-booking/components/parcel-details-form/parcel-details-form.component.html:13` | `text` | `—` | `—` | `['', [Validators.required, separatorTolerantPattern(SENDER_PHONE_PATTERN)]],` |
| `recipientPhone` | `modules/parcel-booking/components/parcel-details-form/parcel-details-form.component.html:52` | `text` | `—` | `—` | `['', [Validators.required, separatorTolerantPattern(RECIPIENT_PHONE_PATTERN...` |
| `phoneNumber` | `modules/passenger-info/components/booker-info-form/booker-info-form.component.html:133` | `text` | `—` | `—` | `['', [Validators.required, separatorTolerantPattern(THAI_MOBILE_PATTERN)]],` |
| `phoneNumber` | `modules/passenger-info/components/passenger-info-form/passenger-info-form.component.html:188` | `text` | `—` | `—` | `['', [separatorTolerantPattern(THAI_LOCAL_PHONE_PATTERN)]],` |
| `phoneNumber` | `modules/register/register.component.html:194` | `text` | `—` | `—` | `['', [Validators.required, separatorTolerantPattern(THAI_MOBILE_PATTERN)]],` |
| `senderPhone` | `modules/staff/components/parcel-consign-form/parcel-consign-form.component.html:15` | `text` | `—` | `—` | `['', [Validators.required, separatorTolerantPattern(SENDER_PHONE_PATTERN)]],` |
| `recipientPhone` | `modules/staff/components/parcel-consign-form/parcel-consign-form.component.html:45` | `text` | `—` | `—` | `['', [Validators.required, separatorTolerantPattern(RECIPIENT_PHONE_PATTERN...` |
| `phoneNumber` | `modules/staff/components/walk-in-checkout/walk-in-checkout.component.html:48` | `(ไม่ระบุ = text)` | `tel` | `12` | `['', [Validators.required, separatorTolerantPattern(this.phonePattern)]],` |
| `phone` | `modules/staff/pages/counter-cancel/counter-cancel-search-form/counter-cancel-search-form.component.html:32` | `tel` | `numeric` | `10` | `[''],` |
| `promptpayPhone` | `shared/components/refund-destination-fields/refund-destination-fields.component.html:85` | `text` | `numeric` | `13` | `fb.control(''),` |

### `code` — 11 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `receiptNo` | `modules/admin/pages/expenses/expense-form-modal/expense-form-modal.component.html:145` | `(ไม่ระบุ = text)` | `—` | `100` | `['', [Validators.maxLength(100)]],` |
| `code` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:35` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(50)]],` |
| `numberPlate` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:51` | `(ไม่ระบุ = text)` | `—` | `50` | `['', [Validators.required, Validators.maxLength(50)]],` |
| `vehicleNumber` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:67` | `(ไม่ระบุ = text)` | `—` | `50` | `[` |
| `chassisNumber` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:120` | `(ไม่ระบุ = text)` | `—` | `100` | `['', [Validators.maxLength(100)]],` |
| `bookingNumber` | `modules/find-booking/pages/find-booking-page/find-booking-page.component.html:15` | `text` | `—` | `—` | `['', [Validators.required]],` |
| `trackingNumber` | `modules/parcel-tracking/pages/parcel-tracking-page/parcel-tracking-page.component.html:8` | `text` | `—` | `—` | `['', [Validators.required]],` |
| `collectionCode` | `modules/staff/components/parcel-collect-dialog/parcel-collect-dialog.component.html:17` | `text` | `—` | `—` | `['', [Validators.required]],` |
| `bookingNumber` | `modules/staff/pages/counter-cancel/counter-cancel-search-form/counter-cancel-search-form.component.html:50` | `text` | `—` | `—` | `[''],` |
| `scanToken` | `shared/components/boarding-list/boarding-list.component.html:209` | `text` | `—` | `—` | `—` |
| `code` | `shared/components/promo-code-field/promo-code-field.component.html:4` | `text` | `—` | `—` | `['', [Validators.required, Validators.maxLength(50)]],` |

### `slug` — 5 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `category` | `modules/admin/pages/lookup-settings/lookup-settings-page.component.html:141` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],` |
| `slug` | `modules/admin/pages/lookup-settings/lookup-settings-page.component.html:152` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],` |
| `slug` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:24` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],` |
| `slug` | `modules/admin/pages/role-management/role-form-modal/role-form-modal.component.html:36` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],` |
| `slug` | `modules/admin/pages/routes/route-form-modal/route-form-modal.component.html:20` | `(ไม่ระบุ = text)` | `—` | `—` | `[` |

### `email` — 9 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `newEmail` | `modules/account/components/change-email-dialog/change-email-dialog.component.html:90` | `email` | `—` | `—` | `['', [Validators.required, Validators.email]],` |
| `email` | `modules/admin/pages/user-management/user-form-modal/user-form-modal.component.html:146` | `email` | `—` | `—` | `['', [Validators.required, Validators.email]],` |
| `email` | `modules/forget-password/forget-password.component.html:42` | `email` | `—` | `—` | `['', [Validators.required, Validators.email]],` |
| `email` | `modules/login/login.component.html:40` | `email` | `—` | `—` | `['', [Validators.required, Validators.email]],` |
| `email` | `modules/passenger-info/components/booker-info-form/booker-info-form.component.html:193` | `email` | `—` | `—` | `['', [Validators.email]],` |
| `email` | `modules/register/register.component.html:148` | `text` | `—` | `—` | `['', [Validators.required, Validators.email]],` |
| `email` | `modules/staff/components/walk-in-checkout/walk-in-checkout.component.html:67` | `email` | `—` | `—` | `['', [Validators.email]],` |
| `email` | `modules/verify-email/verify-email.component.html:70` | `email` | `—` | `—` | `['', [trimmedRequiredValidator, Validators.email]],` |
| `reporterEmail` | `shared/components/report-usability-fab/report-usability-fab.component.html:77` | `email` | `—` | `—` | `['', this.optionalEmail],` |

### `password` — 6 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `currentPassword` | `modules/account/components/change-email-dialog/change-email-dialog.component.html:35` | `isShowPassword ? 'text' : 'password'` | `—` | `—` | `['', [trimmedRequiredValidator]],` |
| `password` | `modules/login/login.component.html:74` | `isShowPassword ? 'text' : 'password'` | `—` | `—` | `['', Validators.required],` |
| `password` | `modules/register/register.component.html:286` | `isShowPassword ? 'text' : 'password'` | `—` | `—` | `['', Validators.required],` |
| `confirmPassword` | `modules/register/register.component.html:345` | `isShowConfirmPassword ? 'text' : 'password'` | `—` | `—` | `['', Validators.required],` |
| `newPassword` | `modules/reset-password/reset-password.component.html:67` | `isShowPassword ? 'text' : 'password'` | `—` | `—` | `[` |
| `confirmPassword` | `modules/reset-password/reset-password.component.html:109` | `isShowConfirmPassword ? 'text' : 'password'` | `—` | `—` | `['', Validators.required],` |

### `name` — 23 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `title` | `modules/account/account-page.component.html:87` | `text` | `—` | `—` | `['', [Validators.minLength(2), Validators.maxLength(50)]],` |
| `firstName` | `modules/account/account-page.component.html:104` | `text` | `—` | `—` | `['', [trimmedRequiredValidator, Validators.minLength(2), Validators.maxLeng...` |
| `middleName` | `modules/account/account-page.component.html:119` | `text` | `—` | `—` | `['', [Validators.maxLength(50)]],` |
| `lastName` | `modules/account/account-page.component.html:128` | `text` | `—` | `—` | `['', [trimmedRequiredValidator, Validators.minLength(2), Validators.maxLeng...` |
| `title` | `modules/admin/pages/user-management/user-form-modal/user-form-modal.component.html:37` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.minLength(2), Validators.maxLength(50)]],` |
| `firstName` | `modules/admin/pages/user-management/user-form-modal/user-form-modal.component.html:53` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.minLength(2), Validators.maxLength(50...` |
| `middleName` | `modules/admin/pages/user-management/user-form-modal/user-form-modal.component.html:67` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.minLength(2), Validators.maxLength(50)]],` |
| `lastName` | `modules/admin/pages/user-management/user-form-modal/user-form-modal.component.html:78` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.minLength(2), Validators.maxLength(50...` |
| `recipientName` | `modules/parcel-booking/components/parcel-details-form/parcel-details-form.component.html:44` | `text` | `—` | `—` | `['', [Validators.required, Validators.maxLength(100)]],` |
| `firstName` | `modules/passenger-info/components/booker-info-form/booker-info-form.component.html:52` | `(ไม่ระบุ = text)` | `—` | `—` | `['', Validators.required],` |
| `middleName` | `modules/passenger-info/components/booker-info-form/booker-info-form.component.html:79` | `(ไม่ระบุ = text)` | `—` | `—` | `[''],` |
| `lastName` | `modules/passenger-info/components/booker-info-form/booker-info-form.component.html:98` | `(ไม่ระบุ = text)` | `—` | `—` | `['', Validators.required],` |
| `firstName` | `modules/passenger-info/components/passenger-info-form/passenger-info-form.component.html:108` | `(ไม่ระบุ = text)` | `—` | `—` | `['', Validators.required],` |
| `middleName` | `modules/passenger-info/components/passenger-info-form/passenger-info-form.component.html:135` | `(ไม่ระบุ = text)` | `—` | `—` | `[''],` |
| `lastName` | `modules/passenger-info/components/passenger-info-form/passenger-info-form.component.html:154` | `(ไม่ระบุ = text)` | `—` | `—` | `['', Validators.required],` |
| `firstName` | `modules/register/register.component.html:59` | `text` | `—` | `—` | `['', Validators.required],` |
| `middleName` | `modules/register/register.component.html:86` | `text` | `—` | `—` | `[''],` |
| `lastName` | `modules/register/register.component.html:106` | `text` | `—` | `—` | `['', Validators.required],` |
| `senderName` | `modules/staff/components/parcel-consign-form/parcel-consign-form.component.html:8` | `text` | `—` | `—` | `['', [Validators.required, Validators.maxLength(100)]],` |
| `recipientName` | `modules/staff/components/parcel-consign-form/parcel-consign-form.component.html:38` | `text` | `—` | `—` | `['', [Validators.required, Validators.maxLength(100)]],` |
| `firstName` | `modules/staff/components/walk-in-checkout/walk-in-checkout.component.html:27` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(100)]],` |
| `lastName` | `modules/staff/components/walk-in-checkout/walk-in-checkout.component.html:36` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(100)]],` |
| `accountName` | `shared/components/refund-destination-fields/refund-destination-fields.component.html:30` | `text` | `—` | `—` | `fb.control(''),` |

### `freetext` — 67 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `confirmation` | `modules/account/components/close-account-dialog/close-account-dialog.component.html:42` | `text` | `—` | `—` | `['', [Validators.required]],` |
| `(ไม่มีชื่อ)` | `modules/admin/admin-layout.component.html:47` | `text` | `—` | `—` | `—` |
| `(ไม่มีชื่อ)` | `modules/admin/pages/bookings/bookings-page.component.html:36` | `text` | `—` | `—` | `—` |
| `reason` | `modules/admin/pages/bookings/override-cancel-modal/override-cancel-modal.component.html:87` | `&lt;textarea&gt;` | `—` | `500` | `['', [Validators.maxLength(500)]],` |
| `rejectionReason` | `modules/admin/pages/expenses/expense-approval-lane/expense-approval-lane.component.html:55` | `text` | `—` | `—` | `—` |
| `categoryOtherLabel` | `modules/admin/pages/expenses/expense-form-modal/expense-form-modal.component.html:95` | `(ไม่ระบุ = text)` | `—` | `100` | `[''],` |
| `paidBy` | `modules/admin/pages/expenses/expense-form-modal/expense-form-modal.component.html:149` | `(ไม่ระบุ = text)` | `—` | `255` | `['', [Validators.maxLength(255)]],` |
| `note` | `modules/admin/pages/expenses/expense-form-modal/expense-form-modal.component.html:153` | `&lt;textarea&gt;` | `—` | `500` | `['', [Validators.maxLength(500)]],` |
| `label` | `modules/admin/pages/inspection-items/inspection-items-page.component.html:236` | `(ไม่ระบุ = text)` | `—` | `—` | `['', Validators.required] }),` |
| `enLabel` | `modules/admin/pages/lookup-settings/lookup-settings-page.component.html:163` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(255)]],` |
| `thLabel` | `modules/admin/pages/lookup-settings/lookup-settings-page.component.html:172` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.maxLength(255)]],` |
| `enDescription` | `modules/admin/pages/lookup-settings/lookup-settings-page.component.html:176` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `thDescription` | `modules/admin/pages/lookup-settings/lookup-settings-page.component.html:180` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `transferReference` | `modules/admin/pages/manual-refund-worklist/mark-refunded-modal/mark-refunded-modal.component.html:10` | `text` | `—` | `100` | `['', [trimmedRequiredValidator, Validators.maxLength(100)]],` |
| `nmBody` | `modules/admin/pages/notification-messages/notification-message-edit-form/notification-message-edit-form.component.html:26` | `&lt;textarea&gt;` | `—` | `—` | `—` |
| `reason` | `modules/admin/pages/notification-messages/notification-message-reject-dialog/notification-message-reject-dialog.component.html:16` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `decisionNote` | `modules/admin/pages/parcel-claims/parcel-claim-approve-modal/parcel-claim-approve-modal.component.html:60` | `&lt;textarea&gt;` | `—` | `500` | `['', [Validators.maxLength(500)]],` |
| `enLabel` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:184` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(255)]],` |
| `enDescription` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:193` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `thLabel` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:197` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.maxLength(255)]],` |
| `thDescription` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:201` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `zhLabel` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:205` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.maxLength(255)]],` |
| `zhDescription` | `modules/admin/pages/promotions/promotion-form-modal/promotion-form-modal.component.html:209` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `(ไม่มีชื่อ)` | `modules/admin/pages/reports/parcel-share-clawbacks-section/parcel-share-clawbacks-section.component.html:62` | `text` | `—` | `500` | `—` |
| `enLabel` | `modules/admin/pages/role-management/role-form-modal/role-form-modal.component.html:71` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(255)]],` |
| `enDescription` | `modules/admin/pages/role-management/role-form-modal/role-form-modal.component.html:78` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `thLabel` | `modules/admin/pages/role-management/role-form-modal/role-form-modal.component.html:94` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(255)]],` |
| `thDescription` | `modules/admin/pages/role-management/role-form-modal/role-form-modal.component.html:101` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(500)]],` |
| `enLabel` | `modules/admin/pages/routes/route-form-modal/route-form-modal.component.html:42` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(100)]],` |
| `thLabel` | `modules/admin/pages/routes/route-form-modal/route-form-modal.component.html:53` | `(ไม่ระบุ = text)` | `—` | `—` | `['', [Validators.required, Validators.maxLength(100)]],` |
| `enDescription` | `modules/admin/pages/routes/route-form-modal/route-form-modal.component.html:62` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(255)]],` |
| `thDescription` | `modules/admin/pages/routes/route-form-modal/route-form-modal.component.html:66` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.maxLength(255)]],` |
| `(ไม่มีชื่อ)` | `modules/admin/pages/routes/routes-page.component.html:35` | `text` | `—` | `—` | `—` |
| `(ไม่มีชื่อ)` | `modules/admin/pages/schedules/schedules-page.component.html:65` | `text` | `—` | `—` | `—` |
| `departureTimesText` | `modules/admin/pages/schedules/schedules-page.component.html:395` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.required]],` |
| `discrepancyReasonInput` | `modules/admin/pages/settlements/driver-cash-day-return-modal/driver-cash-day-return-modal.component.html:159` | `&lt;textarea&gt;` | `—` | `—` | `—` |
| `discrepancyReasonInput` | `modules/admin/pages/settlements/settlement-detail-modal/settlement-detail-modal.component.html:343` | `&lt;textarea&gt;` | `—` | `—` | `—` |
| `t.label` | `modules/admin/pages/stops/stop-form-modal/stop-form-modal.component.html:119` | `text` | `—` | `—` | `—` |
| `t.description` | `modules/admin/pages/stops/stop-form-modal/stop-form-modal.component.html:125` | `text` | `—` | `—` | `—` |
| `t.address` | `modules/admin/pages/stops/stop-form-modal/stop-form-modal.component.html:132` | `text` | `—` | `—` | `—` |
| `(ไม่มีชื่อ)` | `modules/admin/pages/stops/stops-page.component.html:11` | `search` | `—` | `—` | `—` |
| `(ไม่มีชื่อ)` | `modules/admin/pages/usability-reports/usability-report-duplicate-picker/usability-report-duplicate-picker.component.html:12` | `text` | `—` | `—` | `—` |
| `ur-triage-note` | `modules/admin/pages/usability-reports/usability-reports-page.component.html:429` | `&lt;textarea&gt;` | `—` | `—` | `—` |
| `(ไม่มีชื่อ)` | `modules/admin/pages/user-management/user-management-page.component.html:27` | `text` | `—` | `—` | `—` |
| `brand` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:80` | `(ไม่ระบุ = text)` | `—` | `100` | `['', [Validators.maxLength(100)]],` |
| `model` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:84` | `(ไม่ระบุ = text)` | `—` | `100` | `['', [Validators.maxLength(100)]],` |
| `colour` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:103` | `(ไม่ระบุ = text)` | `—` | `50` | `['', [Validators.maxLength(50)]],` |
| `note` | `modules/admin/pages/vehicles/vehicle-form-modal/vehicle-form-modal.component.html:155` | `&lt;textarea&gt;` | `—` | `—` | `[''],` |
| `reason` | `modules/admin/pages/vehicles/vehicle-maintenance/vehicle-maintenance-panel.component.html:129` | `(ไม่ระบุ = text)` | `—` | `255` | `['', [trimmedRequiredValidator, Validators.maxLength(255)]],` |
| `notes` | `modules/admin/pages/vehicles/vehicle-maintenance/vehicle-maintenance-panel.component.html:206` | `&lt;textarea&gt;` | `—` | `—` | `[''],` |
| `description` | `modules/my-reports/components/my-report-edit-form/my-report-edit-form.component.html:15` | `&lt;textarea&gt;` | `—` | `—` | `[this.detail.description, this.trimmedRequired],` |
| `note` | `modules/my-reports/components/my-report-follow-up-composer/my-report-follow-up-composer.component.html:5` | `&lt;textarea&gt;` | `—` | `—` | `['', [this.trimmedRequired, Validators.maxLength(NOTE_MAX_LENGTH)]],` |
| `description` | `modules/parcel-booking/components/parcel-details-form/parcel-details-form.component.html:89` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.required, Validators.maxLength(500)]],` |
| `otherLabelInput` | `modules/staff/components/driver-cash-panel/driver-cash-expense-form/driver-cash-expense-form.component.html:44` | `text` | `—` | `100` | `—` |
| `noteInput` | `modules/staff/components/driver-cash-panel/driver-cash-expense-form/driver-cash-expense-form.component.html:63` | `&lt;textarea&gt;` | `—` | `—` | `—` |
| `claimReason` | `modules/staff/components/parcel-claim-dialog/parcel-claim-dialog.component.html:44` | `&lt;textarea&gt;` | `—` | `500` | `['', [Validators.required, Validators.maxLength(500)]],` |
| `decisionNote` | `modules/staff/components/parcel-claim-dialog/parcel-claim-dialog.component.html:88` | `&lt;textarea&gt;` | `—` | `500` | `['', [Validators.required, Validators.maxLength(500)]],` |
| `description` | `modules/staff/components/parcel-consign-form/parcel-consign-form.component.html:129` | `&lt;textarea&gt;` | `—` | `—` | `['', [Validators.required, Validators.maxLength(500)]],` |
| `rejectReason` | `modules/staff/components/parcel-verify-dialog/parcel-verify-dialog.component.html:135` | `&lt;textarea&gt;` | `—` | `500` | `['', [Validators.maxLength(500)]],` |
| `note` | `modules/staff/pages/inspection/inspection-page.component.html:146` | `&lt;textarea&gt;` | `—` | `—` | `[row.note, row.verdict === 'needs_repair' ? [Validators.required] : []],` |
| `notes` | `modules/staff/pages/inspection/inspection-page.component.html:168` | `&lt;textarea&gt;` | `—` | `—` | `[''],` |
| `(ไม่มีชื่อ)` | `modules/staff/pages/staff-schedules/staff-schedules-page.component.html:15` | `(ไม่ระบุ = text)` | `—` | `—` | `—` |
| `delayReason` | `shared/components/boarding-list/boarding-list.component.html:481` | `&lt;textarea&gt;` | `—` | `500` | `['', [Validators.maxLength(500)]],` |
| `(ไม่มีชื่อ)` | `shared/components/dropdown-group-obrs/dropdown-group-obrs.component.html:30` | `text` | `—` | `—` | `—` |
| `(ไม่มีชื่อ)` | `shared/components/dropdown-group-obrs/dropdown-group-obrs.component.html:53` | `(ไม่ระบุ = text)` | `—` | `—` | `—` |
| `bank` | `shared/components/refund-destination-fields/refund-destination-fields.component.html:47` | `text` | `—` | `—` | `fb.control(''),` |
| `description` | `shared/components/report-usability-fab/report-usability-fab.component.html:58` | `&lt;textarea&gt;` | `—` | `—` | `['', this.trimmedRequired],` |

### `search` — 3 ช่อง

| ช่อง | ไฟล์:บรรทัด | `type` | `inputmode` | `maxlength` | validator ที่ประกาศไว้ |
|---|---|---|---|---|---|
| `segmentSearchTerm` | `modules/admin/pages/routes/route-detail-panel/route-detail-panel.component.html:61` | `text` | `—` | `—` | `—` |
| `pickupFilter` | `modules/staff/components/walk-in-center-panel/walk-in-center-panel.component.html:50` | `text` | `—` | `—` | `—` |
| `dropoffFilter` | `modules/staff/components/walk-in-center-panel/walk-in-center-panel.component.html:118` | `text` | `—` | `—` | `—` |
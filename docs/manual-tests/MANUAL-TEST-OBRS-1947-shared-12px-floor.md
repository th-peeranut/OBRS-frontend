# MANUAL-TEST OBRS-1947 — พื้น 12px ของ OBRS-640 ใน `src/app/shared/**`

การ์ด: [OBRS-1947](https://nj-phuyaipu.atlassian.net/browse/OBRS-1947) · สาขา `ao/obrs-1947-shared-12px-floor`

**ผมรันเองแล้ว ไม่ใช่รายการให้ owner ไปทำ** — ผลอยู่ท้ายไฟล์ ทุกข้อ assert ด้วย `getComputedStyle().fontSize`
ไม่ใช่ด้วยสายตา

## 0) start

```powershell
cd ..\OBRS-frontend-wt-obrs-1947
cp ..\OBRS-frontend\src\environments\environment.local.ts src\environments\   # gitignored, worktree ใหม่ไม่มี
npx ng serve --port <free port >= 4201>
node e2e\scripts\capture-obrs1947.js http://localhost:<port> AFTER
```

สคริปต์ไม่ต้องใช้ backend เลย — `page.route('**/api/**')` stub ทุก call และ `addInitScript` ใส่
`auth_token`/`auth_roles` เพื่อผ่าน AuthGuard ของ `/admin`

## รายการทดสอบ

| # | จอ / viewport | สิ่งที่ต้องเห็น |
| --- | --- | --- |
| 1 | notification inbox · desktop 1440 | `.notification-inbox-footer` = 12px (เดิม 11px) |
| 2 | notification inbox · desktop 1440 | `.notification-row-timestamp` = 12px (เดิม 11px) |
| 3 | notification inbox · mobile 375 | ทั้งสองคลาสข้างบน = 12px |
| 4 | footer · mobile 375 (≤ 480px) | `.sales-sub` ไม่ต่ำกว่า 12px |
| 5 | ทั้ง repo | ไม่มี `font-size: 10px/11px` เหลือใน `src/app/shared/**` |
| 6 | unit | `ng test` เห็นบรรทัด `Executed N of N SUCCESS` จริง |

## RESULT — รันเมื่อ 2026-09-17

| # | ผล | หลักฐาน |
| --- | --- | --- |
| 1 | ✅ | `measurements-BEFORE.json` 11px → `measurements-AFTER.json` 12px |
| 2 | ✅ | เหมือนข้อ 1 (คนละคีย์ในไฟล์เดียวกัน) |
| 3 | ✅ | คีย์ `@mobile` ในไฟล์เดียวกัน 11px → 12px |
| 4 | ⚠️ ผ่านแต่ไม่ใช่ด้วยเหตุผลที่การ์ดคิด | computed = **13px ทั้ง BEFORE และ AFTER** — declaration `11px` ที่ `footer.component.scss:321` **ไม่เคยถูกใช้เรนเดอร์** (specificity แพ้) ดูหัวข้อถัดไป |
| 5 | ✅ | `grep -rnE 'font-size:\s*1[01]px' src/app/shared/` → 0 บรรทัด |
| 6 | ✅ | ดูคอมเมนต์ในการ์ด (เลข Executed จริงจาก log) |

## ข้อ 4 — ของที่วัดแล้วไม่ตรงกับที่การ์ดเชื่อ

`footer.component.scss` มีกฎ base `.sales-container .sales-item .sales-sub` (specificity 0,3,0) ส่วนกฎใน
`@media (max-width: 768px)` และ `@media (max-width: 480px)` เขียนเป็น `.sales-container .sales-sub` (0,2,0)
⇒ **กฎใน media query แพ้ตลอด** ค่า `11px` ที่ `:321` และ `$font-size-xs` ที่ `:262` จึงเป็น dead declaration

measured ที่ viewport 375px: `.sales-sub` = 13px · `.sales-name` = 14px (media บอก 12px และ 13px ตามลำดับ)
⇒ ยืนยันว่าทั้งบล็อกไม่ทำงาน ไม่ใช่แค่บรรทัดเดียว

การแก้ของการ์ดนี้ยังถูกต้องในฐานะ source hygiene (ไม่มี px ต่ำกว่าพื้นค้างในไฟล์อีก) แต่ **ไม่เปลี่ยนสิ่งที่ผู้ใช้เห็น**
ที่ footer — รูป BEFORE/AFTER ของ footer จึงเหมือนกันโดยตั้งใจ การซ่อม specificity เป็นการเปลี่ยนภาพจริง
จึงแยกเป็นการ์ดใหม่ให้ owner เคาะ ไม่รวมมาในใบนี้

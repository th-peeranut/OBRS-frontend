# SESSION OBRS-821 — Swal render-level dark-mode contrast gate

- **Card:** [OBRS-821](https://nj-phuyaipu.atlassian.net/browse/OBRS-821) · In Progress
- **Branch / worktree:** `ao/obrs-821-swal-dark-contrast` @ `OBRS-frontend-wt-obrs-821` (off `origin/dev` `5950c448`)
- **Lane:** frontend-only, alt port `4837` against SIT (`npm run start:sit -- --port 4837`)
- **Run:** automated queue (OBRS-1505), cutoff 2026-09-05 10:00 — no owner at the keyboard

## กรอบการ์ด — recheck แล้ว ยังตรง (measured)

`git show origin/dev:e2e/scripts/check-admin-modal-contrast.js | grep -n "const CASES" -A 12` — `CASES` มี **3 ตัว**
(`user-form-modal` · `role-form-modal` · `schedule-form-modal`) **ไม่มี Swal** ⇒ ช่องว่างที่การ์ดอ้างยังมีอยู่จริง

## รายละเอียดในการ์ดที่ drift แล้ว (measured, ไม่กระทบกรอบ)

- การ์ดเสนอ trigger #1 = `/admin/inspection-items` ปุ่มปิดใช้งาน — `grep -n 'confirm\|toast\|Swal' src/app/modules/admin/pages/inspection-items/*.ts` = **0 hit** ⇒ หน้านั้นไม่ได้เรียก Swal เลย
- การ์ดบอก selector toast มีใช้อยู่แล้วใน `confirm-guidance-flow.spec.ts` — `grep -rn 'swal2-toast' e2e` เจอที่เดียวคือ `e2e/tests/report-usability-issue.spec.ts:561` ⇒ ต้องเลือก trigger ใหม่จากโค้ดจริง

## Progress

- [x] recheck กรอบ + claim + In Progress
- [ ] เลือก trigger จริงของ 3 กล่อง (probe บนแอปที่รันอยู่)
- [ ] BEFORE
- [ ] เพิ่ม CASES + วัด AFTER
- [ ] mutation-test (must-catch / must-NOT-fire)
- [ ] PR + In Review + รูปบนการ์ด

## ผลการวัด (local lane, 2026-09-05)

- **SIT ใช้ไม่ได้** — `curl ... https://sit-obrs-backend.koyeb.app/actuator/health --max-time 120` = **504** ที่ 100.7 s
  ⇒ วัดบน local: BE worktree `origin/dev` `26a60b8d` (`spring-boot:run -Dspring-boot.run.profiles=dev,local`) + FE `npm run start:local -- --port 4200`
  ⚠️ local Postgres มี Flyway checksum mismatch เดิมอยู่ที่ V83/V119 (ไม่ใช่ของการ์ดนี้) ⇒ รันด้วย
  `--spring.flyway.validate-on-migrate=false` เฉพาะ process นี้ ไม่ได้ `repair` ไม่ได้แตะ history table
- **BEFORE** (สคริปต์เดิม 3 case): `dark-mode worst ratio = 5.25, runs below AA = 0`
- **AFTER** (6 case): `dark-mode worst ratio = 4.5, runs below AA = 0, unthemed surfaces = 0` · exit **0**
- **must-catch** (บังคับ `AlertService` คืน `'light'` เสมอ): exit **1** · `unthemed surfaces = 3`
  แต่ `runs below AA = 0` ⇒ **การวัด ratio ต่อ text run อย่างเดียวจับ mutation นี้ไม่ได้** จึงต้องมีเกต surface
- **AC-2**: diff 130 บรรทัดของ 3 case เดิม ต่างเฉพาะ input เวลา (`02:25` → `02:50`) สีและ ratio เท่ากันหมด

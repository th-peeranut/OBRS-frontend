# MANUAL TEST — OBRS-568 · dropdown panel geometry across all four families

> **นี่คือสคริปต์ที่ผมรันเอง ไม่ใช่การบ้านที่ยื่นให้เจ้าของไปรัน** (คำสั่งยืน 2026-07-26)
> ทุกข้อข้างล่างมีผลจริงอยู่ในหัวข้อ RESULT พร้อมคำสั่งที่ผลิตมันออกมา
> เก็บไฟล์นี้ไว้เป็น regression checklist — ⛔ ห้ามลบตอนการ์ดเปลี่ยนสถานะ

- **การ์ด:** [OBRS-568](https://nj-phuyaipu.atlassian.net/browse/OBRS-568)
- **branch:** `ao/obrs-568-dropdown-panel-geometry` (แตกจาก `origin/dev` = `6e20f0ab`)
- **lane:** frontend-only · ไม่มี external integration · ไม่แตะ backend
- **วันที่รัน:** 2026-09-11 (Asia/Bangkok)

## 0) start

```bash
cd ../OBRS-frontend-wt-obrs-568
# node_modules เป็น junction ไปที่ main clone (worktree ใหม่ไม่มีของตัวเอง)
E2E_GATE_PORT=4373 npx playwright test --config=playwright.gate.config.ts \
  obrs-568-dropdown-panel-geometry
```

เลน `gate` เสิร์ฟ `ng serve --configuration gate` ให้เอง — **ไม่ต้องมี backend** ทุก `/api/**` ถูกตอบในเบราว์เซอร์

---

## รายการที่ต้องผ่าน

| # | ข้อ | วิธีวัด (ไม่ใช่ "ดูด้วยตา") |
|---|---|---|
| 1 | ทั้ง 4 ตระกูลมี `max-height` จริง | `getComputedStyle(panel).maxHeight !== 'none'` |
| 2 | ทั้ง 4 ตระกูล `overflow-y` เป็น `auto`/`scroll` | `getComputedStyle(panel).overflowY` |
| 3 | panel ไม่สูงเกินจอ | `panel.getBoundingClientRect().height <= innerHeight` |
| 4 | panel ไม่ล้นขอบจอซ้าย/ขวา | `left >= -1` และ `right <= innerWidth + 1` |
| 5 | ไม่มีแถวไหนวาดข้อความออกนอกกล่อง | `row.scrollWidth - row.clientWidth <= 0` ทุกแถว |
| 6 | ทิศทางเปิดถูกตามกฎ 1–2 | เทียบที่ว่างบน/ล่างของ trigger กับความสูง panel แล้วตัดสิน — ไม่ตรึงทิศ |
| 7 | panel ที่ไม่มีแถวเลย = **ไม่นับว่าผ่าน** | assert `rowCount > 0` ก่อนทุกข้อ |
| 8 | หน้าเดิมไม่ขยับ (AC#6) | วัดความกว้าง panel ก่อน/หลังที่ 1280×720 |
| 9 | `ng test` ทั้งชุด | ต้องเห็น `Executed N of N` ไม่ใช่แค่ท้าย log ว่าง |

ตระกูลที่ครอบ: `dropdown-group-obrs` (`/`) · `dropdown-obrs-passenger` (`/`) · `dropdown-obrs` (`/register`) · `admin-dropdown` (`/staff/sell` → tab Trip Details)
viewport: **390×844** (มือถือ) และ **1280×720** (เดสก์ท็อป) ทุกตระกูล

---

## RESULT — รันจริง 2026-09-11

### R1 · spec ใหม่ ก่อนแก้โค้ด (BEFORE) — `4 failed, 5 passed`

`.claude-logs/obrs-568-before.log` · คำสั่งเดียวกับหัวข้อ 0 บนทรีที่ยังไม่แก้

| เคสที่แดง | ข้อความจริง |
|---|---|
| `dropdown-obrs-passenger @ 390x844` | `computed max-height is 'none' (rule 3)` — received **-1** |
| `dropdown-obrs-passenger @ 1280x720` | `computed max-height is 'none' (rule 3)` — received **-1** |
| `dropdown-obrs @ 1280x720` | `computed max-height is 'none' (rule 3)` — received **-1** |
| `dropdown-group-obrs rules 1-2` | `placement was top-start, expected to open downward` — **assert ของผมเองผิด ไม่ใช่โค้ดผิด** (ดู R4) |

⇒ **`dropdown-obrs` ถูก bound เฉพาะในบล็อก `@media (max-width: 576px)`** เท่านั้น: มือถือผ่าน เดสก์ท็อปไม่มี bound เลย ซึ่งตารางในการ์ดเขียนว่า "✅ ใส่แล้วใน OBRS-561" — จริงแค่ครึ่งเดียว

### R2 · หลังแก้ — `10 passed`

`.claude-logs/obrs-568-after2.log` — 10/10 เขียว (4 ตระกูล × 2 viewport = 8 + กฎ 1–2 อีก 2)

### R3 · แถวล้นกล่องของ passenger — ของเดิม ไม่ใช่ของการ์ดนี้ (control arm)

`node e2e/probe-obrs-568-passenger-row.mjs http://localhost:4373` วัดสองรอบในรันเดียว รอบที่สองย้อน `max-height`/`overflow-y` ที่การ์ดนี้เพิ่ง**เพิ่ม** ออกใน CSSOM สด (เทคนิคเดียวกับ `obrs-1782-tiles-capture.spec.ts`):

| | panel width | max-height | แถวล้นแย่สุด |
|---|---|---|---|
| as-shipped (สาขานี้ ตอนยังไม่แก้ความกว้าง) | 140 px | 506.4 px | **145 px** |
| control (ย้อน declaration ของ OBRS-568 ออก) | 140 px | none | **145 px** |

⇒ ตัวเลขเท่ากันเป๊ะ ⇒ **การ์ดนี้ไม่ได้ทำให้เกิด** เป็น OBRS-561 ตัวเดิมที่ยังค้างอยู่ใน `dropdown-obrs-passenger`
เหตุ (วัดจาก computed style): `min-width: 0` ในบล็อก ≤576px ทับ `min-width: 300px` ที่ base ⇒ panel ยุบเหลือเท่าปุ่ม (140 px) และ Bootstrap `.dropdown-item { white-space: nowrap }` ไม่ยอมตัดบรรทัด ⇒ ข้อความ 283 px วาดออกนอกกล่อง 138 px

### R4 · กฎ 1–2 ที่แก้ assert ใหม่

ของเดิมผม assert ว่า "เดสก์ท็อปต้องเปิดลง" ซึ่ง**ผิด**: ที่ 1280×720 ที่ว่างใต้ปุ่มมี 260 px สำหรับ panel 432 px ⇒ Popper พลิกขึ้นถูกต้องตามกฎ 2 แล้ว
assert ใหม่ไม่ตรึงทิศ แต่ถามว่า *ทิศที่เลือกเป็นทิศที่กฎอนุญาตไหม* จากที่ว่างจริง — และครอบเคสที่การ์ดเองบันทึกไว้ว่า **ไม่พอทั้งสองด้าน ⇒ คาที่ default (ลง)** ซึ่งเป็นสิ่งที่ `/` ทำจริงที่ 390×844 (ล่าง 401 px · panel 506 px · บนน้อยกว่านั้น)

### R5 · หลักฐานภาพ + AC#6 (หน้าเดิมไม่ขยับ)

`node e2e/capture-obrs-568-passenger-panel.mjs http://localhost:4373 docs/manual-tests/assets/OBRS-568`
BEFORE สร้างใหม่จาก CSSOM (ที่ ≤576px ย้อน width triple ด้วย · ที่ 1280 **ไม่**ย้อน เพราะ declaration นั้นอยู่ใน media block ที่เดสก์ท็อปไม่เคยได้รับ — ย้อนที่ 1280 = ปลอมสถานะที่ไม่เคยมี) และสคริปต์ **exit non-zero ถ้า BEFORE ไม่เกิดอาการ**

| viewport | BEFORE panel | BEFORE ล้น | AFTER panel | AFTER ล้น |
|---|---|---|---|---|
| 390×844 | 140 px · max-height `none` | **145 px** | **300 px** · 506.4 px | **0** |
| 1280×720 | **300 px** · max-height `none` | 0 | **300 px** · 432 px | 0 |

⇒ **AC#6 ผ่านแบบวัดได้**: ที่เดสก์ท็อป panel กว้าง **300 px เท่าเดิมทั้งก่อนและหลัง** สิ่งเดียวที่เพิ่มคือ bound ความสูง · ที่มือถือความกว้างเปลี่ยน 140 → 300 px **โดยตั้งใจ** เพราะ 140 px คือตัวบั๊ก

รูปทั้ง 4 ใบ **แนบอยู่บนการ์ด OBRS-568 แล้ว** (REST attachments, ได้ `200` ทั้ง 4) และลบออกจากเครื่องตามกติกา
`jira-and-evidence-contract.md` — สร้างใหม่ได้ตลอดด้วยคำสั่งบรรทัดบน (~40 วินาที รวมเวลา `ng serve`)

### R6 · เกตของ repo

| เกต | คำสั่ง | ผล |
|---|---|---|
| lane declaration | `npm run test:e2e-lanes` | `E2E lane gate OK -- 108 specs declared: CAPTURE=44, OWN-DB=19, GATE=36, SIT-LIVE=9` |
| unit suite | `npx ng test --watch=false --browsers=ChromeHeadless` | `TOTAL: 1 FAILED, 6949 SUCCESS` |
| GATE merge lane | `E2E_GATE_PORT=4373 npx playwright test --config=playwright.gate.config.ts` | ดูหัวข้อถัดไป |

**เคสที่แดง 1 ตัวไม่ใช่ของการ์ดนี้ — พิสูจน์ด้วย control:** `DriverSettlementPageComponent … defaults the date to YESTERDAY, not today (AC-3)` แตก worktree สะอาดจาก `origin/dev` (`6e20f0ab`, `git status --porcelain` ว่าง) แล้วรันสเปกนั้นตัวเดียว → `TOTAL: 1 FAILED, 8 SUCCESS` เหมือนกันเป๊ะ ⇒ `origin/dev` แดงอยู่ก่อนแล้ว แยกเป็น [OBRS-1819](https://nj-phuyaipu.atlassian.net/browse/OBRS-1819)

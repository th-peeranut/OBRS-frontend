# MANUAL TEST — OBRS-468 · bookings-page → app-admin-paginator

**นี่คือ parity checklist ไม่ใช่ acceptance test** — ทุกข้อต้องได้ผล *เหมือนก่อนแก้ทุกประการ*
การ์ดนี้เป็น refactor ล้วน ไม่มีฟีเจอร์ใหม่ให้ทดสอบ

## เริ่มยังไง

```bash
cd OBRS-frontend
cp src/environments/environment.local.ts <worktree>/src/environments/   # gitignored — worktree ใหม่ไม่มี ไม่ก็อป serve พังทันที
npx ng serve --configuration sit --port 4477
```

เข้า `http://localhost:4477/login` → `admin@system.local` / `P@ssw0rd` → เมนู **Bookings**

ทดสอบทั้ง **light + dark** (ปุ่มใช้ `.admin-btn` ซึ่งมี token คนละชุดสองธีม)

## สิ่งที่เปลี่ยนจริง (อ่านก่อนเทสต์)

`bookings-page.component.html` เลิกใช้ inline Prev/Next markup ของตัวเอง หันไปเรนเดอร์
`<app-admin-paginator>` ที่ OBRS-403 สร้าง **จาก markup ก้อนนี้เอง** (แต่เป็น superset ไม่ใช่ copy
— เพิ่ม `nav`/`role`/`aria-label` wrapper, `aria-live` บนตัวนับ และ `disabled` input)

`.ts` **ไม่ถูกแตะเลย** — `goToPage()` `totalPages` `currentPage` `pagedBookings` เหมือนเดิมทุกบรรทัด

## Parity checklist

| # | ทำอะไร | ต้องได้ (เหมือนก่อนแก้) |
|---|---|---|
| 1 | เปิดหน้า Bookings ที่มี booking > 10 รายการ | เห็นแถบ `Previous` · `1 / N` · `Next` มุมขวาของ footer แถวเดียวกับ `Showing 1 - 10 of N` |
| 2 | อยู่หน้า 1 | ปุ่ม `Previous` **disabled** |
| 3 | กด `Next` | ไปหน้า 2 · ตัวนับเป็น `2 / N` · ตารางเปลี่ยนชุดข้อมูล · `Previous` กดได้แล้ว |
| 4 | กด `Next` จนถึงหน้าสุดท้าย | ปุ่ม `Next` **disabled** · ไม่มีทางกดเลยหน้าสุดท้ายได้ |
| 5 | กด `Previous` กลับ | ย้อนทีละหน้า ตัวเลขและตารางตรงกัน |
| 6 | พิมพ์คำค้นที่กรองเหลือ ≤ 10 แถว | **แถบ paginator หายไปทั้งแถบ** (ไม่ใช่แค่ปุ่มจาง) และ `Showing …` ยังอยู่ตำแหน่งเดิมเป๊ะ ไม่ขยับ ไม่ตกบรรทัด |
| 7 | พิมพ์คำค้นที่ไม่เจออะไรเลย | ตารางขึ้น `No data` · ไม่มี paginator · footer สูงเท่าเดิม |
| 8 | เปลี่ยนฟิลเตอร์ Status ตอนอยู่หน้า 3 | เด้งกลับหน้า 1 เหมือนเดิม |
| 9 | ย่อหน้าต่างจนแคบ (~400px) | footer wrap เหมือนเดิม ไม่มีบรรทัดว่างเกินมา |
| 10 | สลับ dark mode ทำข้อ 1-4 ซ้ำ | สีปุ่ม/ตัวนับเหมือนหน้า Usability Reports และเหมือนก่อนแก้ |

## จุดที่ควรเพ่งเป็นพิเศษ

**ข้อ 6 คือข้อสำคัญที่สุด** — ของเดิม `*ngIf="totalPages > 1"` อยู่บน `div` ของ footer เอง
พอ 1 หน้า element หายจาก DOM ทั้งก้อน ของใหม่ `*ngIf` ย้ายเข้าไปอยู่ **ข้างใน** component
แปลว่า host `<app-admin-paginator>` ยังอยู่ใน DOM เสมอ แค่ว่างเปล่า

วัดแล้วว่าไม่มีผลต่อ layout: เทียบ `getBoundingClientRect()` ของ footer / `Showing…` / paginator
ระหว่าง DOM เดิมกับ DOM ใหม่ บน stylesheet ที่ build ออกมาจริง **24 combination
(12 ความกว้าง × 2 เคส, ตั้งแต่ 1400px ถึง 240px) ต่างกัน 0** และ negative control ยืนยันว่า
harness จับได้จริงถ้ามีอะไรต่าง (ยัด element 20px เข้าไป footer สูง 18 → 38 px)

แต่นั่นวัดที่ระดับ CSS ไม่ใช่หน้าจริง — **ข้อ 6 บนเบราว์เซอร์จริงคือการยืนยันชั้นสุดท้าย**

## สิ่งที่ automated test ครอบไม่ถึง (อย่าเชื่อสีเขียว)

`bookings-page.component.spec.ts` **ไม่ได้ใช้ TestBed** — มัน `new BookingsPageComponent(...)`
ตรง ๆ แล้วเรียกเมธอด ไม่เคย compile template สักครั้ง binding พัง / selector ผิด / ลืม import
module จะ **ไม่ทำให้เทสต์แดง** สิ่งที่กันไว้จริงคือ AOT build (`strictTemplates: true`) กับ
checklist นี้

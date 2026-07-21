# SESSION · OBRS-468 — bookings-page → app-admin-paginator

- **Card:** [OBRS-468](https://nj-phuyaipu.atlassian.net/browse/OBRS-468) — *Move bookings-page onto the shared app-admin-paginator*
- **Lane:** Z4 (Admin FE + FE tech-debt) · obrs-improve · FE-only · verification **local**
- **Branch/worktree:** `imp/obrs-468-shared-paginator` · `../OBRS-frontend-wt-obrs-468-shared-paginator`

## สิ่งที่ session นี้ทำ

ให้ `bookings-page` เรนเดอร์ `app-admin-paginator` แทน inline markup ของตัวเอง — ซึ่งเป็น markup
ต้นฉบับที่ OBRS-403 ยกไปทำเป็น component ตั้งแต่แรก

## สถานะ

Step 4 — regression

## การ์ดบอกว่ามี 3 copies — จริง ๆ มี 2

`route-detail-panel` **ไม่ใช่ copy ที่สาม**: มันเป็น icon button (`admin-icon-btn` +
`chevron_left`/`chevron_right`), **ไม่มีตัวนับ `N / M`**, และ **เรนเดอร์ตลอด** (ไม่มี
`*ngIf="totalPages > 1"`) ย้ายมาใช้ component = หน้าตาเปลี่ยน → **เปลี่ยน behavior** →
อยู่นอกเลน improve

## Follow-ups / related

- OBRS-403 — ต้นทางของ `app-admin-paginator`
- `route-detail-panel` convergence — ต้องตัดสินใจเรื่อง visual ก่อน ถ้าจะทำต้องเป็น obrs-build

_Last updated: 2026-07-21_

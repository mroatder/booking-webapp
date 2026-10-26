# Booking project - กติกาสำหรับผู้ช่วย AI / ผู้พัฒนา

อ่านก่อนเริ่มงานทุกครั้ง: `docs/REQUIREMENTS.md` (ข้อกำหนดระบบ), `docs/ARCHITECTURE.md`, `docs/UI-STYLE.md` (สไตล์ UI)

## UI ทุกงานต้องเป็น style เดียวกัน (บังคับ)

- งาน frontend ที่แตะไฟล์ `.vue` หรือ `frontend/src/style.css` - **ทั้งหน้าใหม่และการแก้ไขหน้าเดิม** - ต้องทำตาม `docs/UI-STYLE.md`
- ใช้ token และ component class จาก `frontend/src/style.css` (`btn btn-primary`, `btn-secondary`, `input`, `label`, `icon-btn`, `data-table`, `modal-backdrop|panel|header|body|footer`, `chip`, `filter-chip`, `page-title`, `nav-link`) และเมนูย่อยผ่าน `components/common/SubNav.vue` เท่านั้น
- **ห้าม** เขียน class ปุ่ม/ช่องกรอก/modal ยาวๆ เอง, ห้ามใช้ `slate-*` ในไฟล์ใหม่ (ใช้ `text-ink`, `border-line` …), ห้ามเพิ่มสีเน้นตัวที่ 2, ห้ามการ์ดมีเงา/กรอบรอบตาราง, ห้ามอีโมจิเป็นไอคอน (ใช้ `AppIcon`)
- ต้องการรูปแบบใหม่ที่ยังไม่มี → เพิ่ม class ใน `style.css` และเพิ่มลงตารางใน `docs/UI-STYLE.md` ข้อ 3 ก่อนใช้
- หน้าต้นแบบอ้างอิง: `frontend/src/views/admin/DepartmentsView.vue`
- ก่อนจบงาน UI ให้รันใน `frontend/`: `npm run lint:ui`, `npm run lint`, `npm run build` - ต้องผ่านทั้งหมด (ห้ามรัน `lint:ui -- --baseline` เพื่อปิดปากตัวตรวจ)

## ข้อความ 2 ภาษา (บังคับ)

- ทุกข้อความที่ผู้ใช้เห็น (ป้าย, placeholder, title/aria-label, toast, confirm, ข้อความว่าง, alt) ต้องเป็น key ใน `frontend/src/locales/th.json` **และ** `en.json` พร้อมกัน แล้วเรียกผ่าน `t()` - ห้าม hardcode ข้อความไทย/อังกฤษในไฟล์ `.vue`/`.js`
- รหัส error ใหม่ใน `backend/src/errors/codes.js` ต้องเพิ่มคำแปลใน `errors.*` ทั้ง 2 ภาษา; วันที่ใช้ `utils/datetime.js` (ค.ศ. DD/MM/YYYY) ไม่ใช้ `toLocaleString('th-TH')`
- ข้อยกเว้น (เอกสารฟอร์มพิมพ์ภาษาไทยตายตัว, ค่าข้อมูลใน DB) ต้องขึ้นทะเบียนพร้อมเหตุผลที่ `ALLOW_THAI` ใน `frontend/scripts/check-i18n.mjs`
- ก่อนจบงาน รัน `npm run lint:i18n` ใน `frontend/` - ต้องผ่าน

## อื่นๆ

- ภาษาโค้ด: JavaScript ธรรมดา (ไม่ใช้ TypeScript) ทั้ง frontend/backend
- ข้อความบนหน้าจอผ่าน vue-i18n 2 ภาษา (ดู REQUIREMENTS § 7)

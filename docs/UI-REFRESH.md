# UI Refresh - สถานะรายหน้า (อัปเดต 2026-10-14)

งานปรับ UI ให้ดู modern business: ขาวคม + accent ดำ (คงสีเดิม) + สีสถานะชุดเดียว (ฟ้า/เขียว/เหลืองอำพัน/แดง) ดูกติกาที่ `docs/UI-STYLE.md`

## แก้แบบทั้งระบบแล้ว (มีผลทุกหน้า)

- สีเน้นคงเป็นดำตามเดิม (ไม่เปลี่ยน) และปุ่มเขียนเองที่เคยใช้ `bg-slate-900` / `bg-blue-600` ถูกย้ายมาใช้ `bg-accent` (22 ไฟล์)
- สเกลสี sky/blue/indigo/emerald/green/amber/yellow/red/orange จูนเป็นชุดเดียว; ตัดขอบสีรอบกล่องแจ้งเตือน/ป้ายสถานะ (7 ไฟล์)
- มุมโค้ง `rounded-md/lg/xl/2xl` ในไฟล์ `.vue` ย้ายเป็น `rounded-control` / `rounded-card` (37 ไฟล์ ยกเว้น tablet และฟอร์มพิมพ์)
- ฉากหลัง modal ที่เขียนเอง (`bg-slate-900/60`) ใช้ `modal-backdrop` แล้ว (6 ไฟล์); modal/เมนูกระดิ่งมี animation เข้า; ปุ่ม ช่องกรอก ตาราง มี hover/active/transition ที่นุ่มขึ้น; ลบ `shadow-xs` ออกจากปุ่มสลับ; ข้อความจิ๋ว 9-10px ปรับเป็น 11px
- หน้าเข้าสู่ระบบเขียนใหม่ด้วย class กลาง + `AppIcon`

## ไฟล์ที่ผ่านเกณฑ์สแกน (32 ไฟล์)

- `App.vue`
- `components/AssignmentSummary.vue`
- `components/FormModal.vue`
- `components/LanguageSwitcher.vue`
- `components/NotificationBell.vue`
- `components/PaginationNav.vue`
- `components/RosterImportModal.vue`
- `components/ToastContainer.vue`
- `components/VehicleRequestStatusBadge.vue`
- `components/common/ConfirmDialog.vue`
- `components/common/DatePicker.vue`
- `components/common/PaginationBar.vue`
- `components/common/SubNav.vue`
- `components/common/TimePicker.vue`
- `components/fleet/CarBookingFormModal.vue`
- `components/fleet/ManageViewSwitch.vue`
- `components/fleet/OwnerSelect.vue`
- `components/fleet/ShuttleDispatchPrintModal.vue`
- `layouts/AdminLayout.vue`
- `layouts/RoomBookingLayout.vue`
- `layouts/VehicleRequestLayout.vue`
- `views/ForbiddenView.vue`
- `views/NotFoundView.vue`
- `views/admin/AuditLogView.vue`
- `views/admin/DepartmentsView.vue`
- `views/admin/DriversView.vue`
- `views/auth/LoginView.vue`
- `views/rooms/BookRoomView.vue`
- `views/vehicles/DriverScheduleView.vue`
- `views/vehicles/ManageGroupTripsView.vue`
- `views/vehicles/NewVehicleRequestView.vue`
- `views/vehicles/ShuttleRoutesView.vue`

## ยังเหลือ - ต้องรีวิวด้วยตาและเก็บรายละเอียด (32 ไฟล์)

เกณฑ์: ยังมี `slate-*` ≥ 15 จุด, class ยาว ≥ 140 ตัวอักษรที่เขียนเอง ≥ 2 จุด, `<svg>` เขียนเอง หรือเป็นจอ tablet (สไตล์เฉพาะ) - หน้าตาปัจจุบันใช้งานได้และสีถูกจูนแล้ว แต่ยังไม่ได้ย้ายเป็น `btn` / `chip` / `data-table` ครบ

| ไฟล์ | `slate-*` | class ยาว | svg เอง |
|---|---|---|---|
| `components/fleet/EventBoardingEditor.vue` | 83 | 0 | 0 |
| `components/fleet/MyBoardingSection.vue` | 45 | 0 | 0 |
| `components/fleet/EventRegistrationModal.vue` | 38 | 3 | 0 |
| `components/fleet/ShuttleRoutesPanel.vue` | 37 | 1 | 0 |
| `views/vehicles/ManageVehicleRequestsView.vue` | 35 | 1 | 0 |
| `components/AssignVehicleDialog.vue` | 34 | 1 | 0 |
| `components/fleet/EventDetailsModal.vue` | 33 | 0 | 0 |
| `components/VehicleRequestForm.vue` | 32 | 0 | 1 |
| `views/HomeView.vue` | 30 | 3 | 0 |
| `components/VehicleRequestDetailModal.vue` | 29 | 1 | 0 |
| `components/fleet/ProvidersPanel.vue` | 28 | 2 | 0 |
| `views/admin/UsersView.vue` | 28 | 0 | 0 |
| `views/rooms/ManageRoomBookingsView.vue` | 28 | 0 | 0 |
| `views/vehicles/EventTripsView.vue` | 27 | 1 | 0 |
| `components/AdImportModal.vue` | 25 | 1 | 0 |
| `components/ShuttleTripGroups.vue` | 25 | 1 | 0 |
| `components/ShuttleTripModal.vue` | 25 | 1 | 0 |
| `views/admin/DevicesView.vue` | 25 | 1 | 0 |
| `components/fleet/EventCreateEditModal.vue` | 24 | 0 | 0 |
| `components/fleet/VehiclesPanel.vue` | 23 | 1 | 0 |
| `views/ProfileView.vue` | 23 | 0 | 0 |
| `views/vehicles/MyVehicleRequestsView.vue` | 21 | 1 | 0 |
| `components/fleet/DriverScheduleBoard.vue` | 19 | 0 | 0 |
| `views/admin/ReportsView.vue` | 19 | 1 | 0 |
| `views/vehicles/ShuttlePassengersView.vue` | 19 | 0 | 0 |
| `views/rooms/MyBookingsView.vue` | 18 | 1 | 0 |
| `views/vehicles/VehicleApprovalsView.vue` | 18 | 0 | 0 |
| `components/fleet/DriversPanel.vue` | 17 | 1 | 0 |
| `views/admin/RoomsView.vue` | 15 | 1 | 0 |
| `components/AttachmentLinks.vue` | 4 | 2 | 0 |
| `components/tablet/TabletCalendar.vue` | 0 | 4 | 0 |
| `views/tablet/TabletDisplayView.vue` | 0 | 10 | 0 |

## หมายเหตุ

- ตรวจด้วยการสแกนโค้ดเท่านั้น ยังไม่ได้เปิดดูทุกหน้าในเบราว์เซอร์ - ควรไล่ดูหน้าที่อยู่ในรายการ "ยังเหลือ" ก่อน โดยเฉพาะหน้าแรก, ตารางจองห้อง/รถ และ `EventBoardingEditor`
- `npm run lint` มี error เดิม 4 จุด (`process is not defined` ในสคริปต์ตรวจ) ไม่เกี่ยวกับงานนี้

## รอบแก้ layout (2026-10-14) - ตรวจทุกหน้าแล้วแก้ 9 ข้อ

- class กลางใหม่ใน `style.css` (บันทึกใช้งานแล้ว): `seg` / `seg-btn` (ตัวสลับแบบแคปซูล - แทนปุ่มสลับ/แท็บที่เขียนเอง 9 ไฟล์), `filter-bar` / `filter-label` (แถบกรองแบนไม่มีกรอบ), `page-note` (คำอธิบายใต้หัวหน้า), `empty-state` (ข้อความว่าง + ปุ่มทำต่อ), `table-narrow` (ตารางรายการสั้น กว้างสูงสุด 72rem), `row-actions` (ปุ่มจัดการท้ายแถว ปุ่มหลักบน ลิงก์รองใต้), `form-section-title` (หัวกลุ่มในฟอร์มยาว)
- จัดการคำขอรถ: ลดเหลือ 6 คอลัมน์ รวมประเภทรถ/จำนวนคน/ลิงก์แผนที่ไว้เป็นชิปใต้เส้นทาง ปุ่ม "จัดคนขับ" อยู่ตำแหน่งเดียวกันทุกแถว
- จัดการการจองห้อง: แถบกรองแบน 2 แถว (ช่วงวัน+ห้อง+ค้นหา / สถานะ) ไม่มีกรอบ
- ตารางรายการสั้น 10 ไฟล์ใช้ `data-table` + `table-narrow`; หัวหน้า 6 หน้าใช้ `page-title`
- ฟอร์มขอรถนอก: แบ่งกลุ่ม ช่วงเวลา / สถานที่ / เหตุผลและผู้เดินทาง
- โปรไฟล์: 2 คอลัมน์ (ข้อมูลบัญชี | แก้ไขได้) ไม่มีกรอบการ์ด; ตารางงานคนขับมีหัวหน้า; "คำขอรถของฉัน"/"รายการจองของฉัน" ว่างแล้วมีปุ่มสร้างใหม่
- ยังไม่ได้ตรวจ: มือถือ, จอ tablet หน้าห้อง, modal

- ช่องบังคับกรอก: ป้ายที่ตามด้วยช่อง `required` ได้ดอกจันแดงอัตโนมัติ (CSS `:has` ใน style.css) + บรรทัด "* = ต้องกรอก" บนสุดของฟอร์ม/modal (ข้อความจาก `common.requiredNote`); ปิดบนฟอร์มด้วย class `no-required-note`

## รอบ critique (2026-10-14, คะแนน 24/40) - แก้แล้ว
- ถอด animation จางเข้าของ `page-container`; หัวตาราง `text-subtle` → `text-muted` (คอนทราสต์); `scrollbar-gutter: stable` กันหน้ากระตุกซ้าย-ขวา
- กล่องจัดคนขับ (`AssignVehicleDialog`): เลือกแบบรถด้วย `seg` + คำอธิบายใต้ปุ่ม, จำแบบรถที่ใช้ล่าสุด (localStorage), มีข้อความบอกเหตุผลข้างปุ่มยืนยันเมื่อกดไม่ได้ (`FormModal` prop `submitHint`)
- จัดการคำขอรถ: แบ่งหน้าละ 15 แถว (เดิม 7), ลิงก์ท้ายแถวพื้นที่กด ≥ 28px และไม่ขึ้นบรรทัดใหม่
- หน้าแรก: เพิ่มมุมมอง "วัน" (`components/RoomDayBoard.vue` - ห้องเป็นแถว เวลา 08:00-19:00 เป็นแกน, คลิกช่องว่างไปหน้าจองพร้อมห้อง/วัน/เวลา) สลับได้ด้วย `seg`; ค่าเริ่มต้นยังเป็นปฏิทิน "เดือน" (dev สั่ง)
- ฟอร์มขอรถนอก/โอที: ลำดับใหม่ (แบบเดินทาง/รถ → ผู้ขอ/เบอร์ → เวลา → สถานที่ → เหตุผล/ผู้เดินทาง), grid 4 คอลัมน์ ความกว้างสูงสุด 64rem, ผู้ขอเป็นข้อความ, แถบปุ่มส่งตรึงล่างจอพร้อมข้อผิดพลาด
- หน้าผู้ใช้/รายงาน: ใช้แถบกรองแบน + `data-table` เหมือนหน้าห้อง, จำนวนรายการย้ายไปใต้ตาราง; ตารางที่ว่างซ่อนหัวตารางอัตโนมัติ (CSS `:has(.empty-state)`); หน้าสายรถรับส่งมีชื่อหน้า
- หน้าจองห้อง: แผงข้างเป็นไทม์ไลน์ 08:00-19:00 ของห้องที่เลือก + กรอบช่วงที่เลือก (แดงเมื่อชน) + ปุ่มสลับไปห้องอื่นที่ว่างช่วงเดียวกัน
- ยังไม่ได้ทำ: มือถือ (375/768px), จอ tablet, modal ทั้งหมด
- รอบถัดไป: คำขอรถของฉัน / รออนุมัติ (ตาราง `data-table` + ชิป แทนรายการมีกรอบ, ปุ่มอนุมัติเป็นปุ่มหลักเดียว), เดินทางกลุ่ม (แท็บเป็น `seg`, ว่างใช้ `empty-state`), ปุ่ม/ลิงก์ท้ายแถวของตารางในแผงคนขับ/รถ/ผู้ให้บริการ/อุปกรณ์/ผู้ใช้ ใช้ `link-action` / `link-danger` ทั้งหมด
- ข้อสังเกตค้าง: คอลัมน์แรกของตารางแบนเยื้องจากชื่อหน้า ~16px (padding ของ `data-table td`)
- **ย้อนกลับตามที่ dev ไม่ชอบ (2026-10-14)**: ฟอร์มขอรถ (`VehicleRequestForm`) กลับเป็นโครงเดิมทั้งหมด (ขอรถนอก/โอที/แก้ไขคำขอ) - ไม่มี grid 4 คอลัมน์/แถบปุ่มตรึง/ลำดับใหม่; หน้าโปรไฟล์กลับเป็นโครงเดิม (คอลัมน์เดียวกลางจอ); หน้าจองห้องใช้สัดส่วน 3:2 (ฟอร์ม : ไทม์ไลน์) แทนฟอร์มแคบ-แผงกว้าง; **หลักการ**: ห้ามจัดฟอร์มชิดซ้ายพร้อมเว้นขวาว่าง/คอลัมน์ไม่สมดุล
- **กล่องซ้อนกล่อง (2026-10-14)**: ฟอร์มขอรถไม่มีกรอบรอบทั้งฟอร์ม, กล่องย่อยในฟอร์ม/modal ใช้พื้น `bg-surface` ไม่มีเส้นขอบ (ไม่ซ้อนกรอบในกรอบ), ตาราง/รายการที่เคยมีกรอบถอดกรอบออก (`EventBoardingEditor`, `MyBoardingSection`, `EventDetailsModal`, `ShuttleTripGroups`) - หลักการ: ชั้นเดียวพอ ใช้พื้นสีอ่อนหรือช่องว่างแบ่งกลุ่ม
- ตารางจัดการคำขอรถ (2026-10-14): 6 คอลัมน์ กว้างคงที่ (ผู้ขอ 14rem / เวลา 13rem / เส้นทาง ยืดได้ / คนขับ 10rem / สถานะ 8rem / ปุ่ม 16rem), ข้อมูลรอง (ประเภทคำขอ รถ+จำนวนคน รูปแบบเที่ยว ลิงก์แผนที่) เป็นชิปใต้เส้นทาง, เส้นบางคั่นแถว (`data-table ruled`), ปุ่ม "จัดคนขับ" ปุ่มเดียวต่อแถว
- **ความสมดุลซ้าย-ขวา (2026-10-14)**: เลิกจำกัดความกว้างตารางรายการสั้น (`table-narrow` = เต็มความกว้างเหมือนหัวหน้า/ปุ่มขวา), หน้าจองห้อง ฟอร์ม:ไทม์ไลน์ = 1:1, แถบกรองหน้าจัดการการจองห้องดันตัวกรองห้อง/ค้นหาไปชิดขวา
- **หน้าแรกกลับเป็นแบบเดิม (2026-10-14, dev สั่ง)**: ลบมุมมอง "วัน" (`RoomDayBoard`) และตัวสลับ วัน/เดือน ออก, `HomeView.vue` กลับเป็นเวอร์ชันก่อนปรับ (มีป้าย "ว่างทั้งวัน" ตามเดิม) - แสดงเฉพาะปฏิทินเดือน; ตัด key i18n `home.viewDay/viewMonth/prevDay/nextDay/dayBoardHint/bookRoom`

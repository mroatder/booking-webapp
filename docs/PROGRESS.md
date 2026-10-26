# สถานะการดำเนินงาน (Progress / Handoff Notes)

> ไฟล์นี้มีไว้ให้ agent/session ใหม่อ่านแล้วสานงานต่อได้ทันที โดยไม่ต้องพึ่งประวัติแชทเดิม
> **อัปเดตไฟล์นี้ทุกครั้งที่จบ milestone** (เช็คช่องด้านล่าง + เขียนสรุปสั้นๆ ว่าทำอะไรไปและตัดสินใจอะไรเพิ่ม)

อัปเดตล่าสุด: **2026-10-08** - จบ M9 Audit Log + UI style กลาง/ตรวจ 2 ภาษา/responsive (ถัดไป M10 ที่ทำแล้วบางส่วน แล้ว M11) - ดู "สถานะล่าสุด ณ 2026-10-08" ด้านล่างสุดของไฟล์

---

## ลำดับการอ่านสำหรับ agent ใหม่

1. `docs/REQUIREMENTS.md` - requirement ที่ยืนยันแล้วกับ dev (Phase 1-2, เสร็จสมบูรณ์)
2. `docs/ARCHITECTURE.md` - สถาปัตยกรรมที่อนุมัติแล้ว (Phase 3, เสร็จสมบูรณ์)
3. `docs/PLAN.md` - milestone ทั้งหมด (Phase 3, อนุมัติแล้ว - **นี่คือ source of truth ของลำดับงาน**)
4. **ไฟล์นี้ (PROGRESS.md)** - ทำถึงไหนแล้ว + การตัดสินใจย่อยระหว่างทางที่ยังไม่ได้เขียนใน 3 ไฟล์ข้างต้น
5. `git log --oneline` - ดู commit history ประกอบ (commit แยกตาม milestone)

**กฎสำคัญที่ต้องยึดต่อ**: อยู่ระหว่าง **Phase 4 (พัฒนา)** ที่ dev อนุมัติแผนแล้ว - ทำทีละ milestone ตาม PLAN.md, จบแต่ละ milestone ต้องรัน test + สรุปให้ dev ทราบก่อนเริ่มอันถัดไป, commit แยกตาม milestone, **ถ้าเจอ edge case ที่ requirement ไม่ได้ระบุ ให้หยุดถาม dev ก่อนเสมอ ห้ามตัดสินใจเองในเรื่องที่กระทบพฤติกรรมระบบ**

---

## สถานะ Milestone (อ้างอิง docs/PLAN.md)

- [x] **M0 - Project Scaffolding** ✅ เสร็จแล้ว (ดูรายละเอียดด้านล่าง)
- [x] **M1 - Auth (AD + Local)** ✅ เสร็จแล้ว (ดูรายละเอียดด้านล่าง)
- [x] **M2 - Room + User Management (Admin)** ✅ เสร็จแล้ว (ดูรายละเอียดด้านล่าง)
- [x] **M3 - Room Booking + กันชน** ✅ เสร็จแล้ว (ดูรายละเอียดด้านล่าง)
- [x] **M4 - เช็คอิน + ปล่อยห้องอัตโนมัติ** ✅ ตรวจโค้ดแล้ว ตรง requirement (มีเบี่ยงเบนเล็กน้อยที่ dev อนุมัติแล้ว: เช็คอินก่อนเวลาเริ่มได้ 10 นาทีด้วย ไม่ใช่แค่หลัง)
- [x] **M5 - Tablet Display** ✅ เสร็จสมบูรณ์จริงแล้ว รวมหน้าจอ tablet ที่ขาดไปตอนแรก + Device Management ที่แก้ให้ทำงานจริงแล้ว (ดูรายละเอียดด้านล่าง)
- [x] **M6 - Vehicle Requests + Driver Management** ✅ เสร็จแล้ว (ดูรายละเอียดด้านล่าง)
- [x] **M7 - Notifications (อีเมลอย่างเดียว)** ✅ 2026-10-05
- [x] **M8 - Reports & Excel Export** ✅ 2026-10-05
- [x] **M9 - Audit Log** ✅ 2026-10-08
- [ ] M10 - Hardening & Compliance ตาม NFR ← **ถัดไป** (ทำแล้วบางส่วน: Helmet/CSP, /health, lint:i18n; เหลือ: สคริปต์ตรวจ external URL, ไล่ responsive 375/768 ทุกหน้า)
- [ ] M11 - Deployment Packaging

---

## M0 - สิ่งที่ทำไปแล้ว (commit: "M0: scaffold frontend ... and backend ...")

**Frontend** (`frontend/`):
- Vite scaffold ด้วย `npm create vite@latest frontend -- --template vue` (JS ล้วน ไม่มี TypeScript)
- ติดตั้งแล้ว: `vue-router@4`, `pinia`, `vue-i18n@11` (ไม่ใช่ v9 เพราะ deprecated), Tailwind CSS **v4** ผ่าน `@tailwindcss/vite` plugin (ไม่ใช้ `tailwind.config.js` แบบ v3 เดิม), `@fontsource/noto-sans-thai` (ใช้เฉพาะ subset `thai-*.css` และ `latin-*.css` เพื่อลดขนาด build - **อย่า import `400.css` เต็มๆ เพราะจะดึงทุกภาษาโลกมาด้วย**)
- โครงสร้างตาม ARCHITECTURE.md: `src/{router,stores,locales,api,layouts,views/{auth,rooms,vehicles,admin,tablet}}`
- i18n: `src/locales/{th,en}.json` + `src/locales/index.js` (จำภาษาไว้ใน localStorage, key `locale`) - มีแค่ key พื้นฐาน (`common.*`, `nav.home`, `home.welcome`, `errors.*`) ต้องเพิ่มทุกครั้งที่สร้างหน้าใหม่
- `LanguageSwitcher.vue` ใช้งานได้จริง อยู่ใน header ของ `App.vue`
- ESLint (flat config) + Prettier ตั้งค่าแล้ว, `npm run lint` ผ่าน
- Route เดียวตอนนี้: `/` → `HomeView.vue` (placeholder รอ M1-M2 มาแทน)
- **Dev proxy**: `vite.config.js` ตั้ง proxy `/api` → `http://localhost:3000` (เฉพาะตอน dev เท่านั้น - production ใช้ IIS reverse proxy ตาม ARCHITECTURE.md)

**Backend** (`backend/`):
- `npm init` + `"type": "module"` (ES modules, ไม่ใช่ CommonJS)
- ติดตั้งแล้ว: `express`, `mssql`, `dotenv`, `bcryptjs` (ไม่ใช่ `bcrypt` เพราะไม่ต้อง native build), `jsonwebtoken`, `cookie-parser`, `helmet`, **`ldapts`** (⚠️ เปลี่ยนจาก `ldapjs` ตาม ARCHITECTURE.md เพราะ `ldapjs` ถูกประกาศ decommission บน npm แล้ว - ถ้าเห็น ARCHITECTURE.md เขียนว่า `ldapjs` ให้ยึดไฟล์นี้แทน ใช้ `ldapts`), `node-cron`, `exceljs`, `nodemailer`
- โครงสร้างตาม ARCHITECTURE.md: `src/{config,db/{migrations,seeds},modules/{auth,users,rooms,bookings,tablet,vehicle-requests,drivers,notifications,reports,audit},middleware,jobs,errors,utils}` - **โฟลเดอร์ modules ส่วนใหญ่ยังว่างเปล่า รอ M1 เป็นต้นไป**
- `src/config/env.js` - โหลด env vars ทั้งหมด, ดูตัวอย่างที่ `.env.example`
- `src/db/pool.js` - mssql connection pool, รองรับทั้ง named instance (SQLEXPRESS ผ่าน SQL Browser) และ port ตรงๆ (ถ้าตั้ง `DB_INSTANCE` จะใช้ named instance, ไม่ใช้ port)
- `src/db/migrate.js` + `src/db/seed.js` - migration/seed runner ใช้งานได้จริงแล้ว (อ่านไฟล์จาก `db/migrations/*.sql` และ `db/seeds/*.js` ตามลำดับชื่อไฟล์, track ใน table `SchemaMigrations`) - **ตอนนี้ทั้งสองโฟลเดอร์ยังไม่มีไฟล์ migration/seed จริงสักไฟล์ - M1 ต้องสร้าง `001_xxx_users.sql` เป็นไฟล์แรก**
- `src/errors/{AppError.js,codes.js}` - error code catalog (ห้าม hardcode ข้อความ, ตาม NFR ภาษา) + `src/middleware/errorHandler.js`
- `src/app.js` - Express app, helmet CSP (`'self'` only), `/health` endpoint (เช็ค DB จริง), router `/api` ว่างเปล่ารอเติม route ทีละ module
- ESLint + Prettier + Vitest ตั้งค่าแล้ว, มี test ตัวอย่าง `tests/errorHandler.test.js` (3 tests ผ่าน)

**Git**:
- `git init` แล้วที่ root, commit แรกคือ M0 (มี `.gitignore` ทั้ง root/frontend/backend, `.env` ไม่ถูก track)

**ทดสอบแล้ว**:
- `npm run dev` ทั้งสองฝั่งรันได้จริง (ทดสอบด้วย curl)
- `npm run build` (frontend) สำเร็จ, ตรวจ `dist/` แล้วไม่มี external URL จริง (เจอแค่ string comment/error-reference ที่ไม่ใช่การโหลดทรัพยากร - ยอมรับได้)
- Backend unit tests ผ่าน 3/3
- `GET /health` ตอบ **503** ตอนนี้ (ถูกต้องแล้ว เพราะยังไม่มี MSSQL รันอยู่จริงในเครื่อง dev - จะได้ 200 หลังตั้ง DB จริงใน M1)

---

## M1 - สิ่งที่ทำไปแล้ว (commit: "M1: ...")

**Database - ⚠️ เปลี่ยนจากแผนเดิมระหว่างทาง อ่านให้ครบก่อนต่องาน**:
- ตอนแรกพบว่าเครื่อง dev นี้ (`dev-machine`) มี SQL Server Express ติดตั้งอยู่ในเครื่องเอง เลยตั้ง DB ทดสอบไว้ที่นั่นก่อน (`localhost\SQLEXPRESS`, database `booking_project`) - **แต่หลังจากนั้น dev แจ้งว่ามีเซิร์ฟเวอร์ฐานข้อมูล+AD จริงของบริษัทอยู่แล้ว** ชื่อ `MYAPP\SQLEXPRESS` (Windows Server 2016, แยกเครื่องจาก dev machine) จึงย้ายมาใช้ตัวนี้แทนตั้งแต่ M1 เป็นต้นไป
- **DB จริงที่ใช้งานตอนนี้และในอนาคต**: `MYAPP\SQLEXPRESS`, database ชื่อ **`booking_project_dev`** (แยกจาก `booking_project_prod` ที่จะสร้างตอน deploy จริง - ดู `deploy/mssql/setup-database.sql`), collation `Thai_CI_AS` (ยืนยันแล้ว)
- **Login ที่แอปใช้**: `booking_app` (สิทธิ์ `db_owner` เฉพาะ database `booking_project_dev` เท่านั้น) - **ไม่ใช้ `sa`** แม้ว่า dev จะเคยใช้ `sa` กับเว็บอื่นๆ ทุกตัวในเซิร์ฟเวอร์นี้มาก่อน (เช่น other databases ที่อยู่บน SQLEXPRESS เครื่อง dev - คนละอันกับ MYAPP) แต่ dev ยืนยันแล้วว่าใช้ least-privilege login แยกต่างหากสำหรับโปรเจกต์นี้ได้ ไม่มีปัญหา - **อย่าเปลี่ยนกลับไปใช้ sa โดยไม่ถามก่อน**
- ⚠️ **ระวังตอนต่อ MSSQL**: `DB_HOST` ต้องเป็นชื่อเครื่องเฉยๆ (`MYAPP`) **ห้ามต่อ `\SQLEXPRESS` ต่อท้าย** เพราะ `DB_INSTANCE` แยกตั้งไว้ต่างหากอยู่แล้วใน `pool.js` (ใส่ทั้งคู่พร้อมกันแบบรวมจะพัง) - เคยเจอ dev พิมพ์ผิดเป็น `MYAPP\SQLEXPRESS` มาแล้วครั้งหนึ่ง ต้องแก้กลับ
- **credential จริงอยู่ใน `backend/.env`** (ไม่ commit, ห้าม log ค่านี้ออกมาที่ไหน) - ถ้า session ใหม่ไม่มีไฟล์นี้ ต้องขอ dev ใหม่ ห้ามเดาหรือ hardcode
- Migration แรกใช้งานได้จริงแล้วบน `booking_project_dev`: `backend/src/db/migrations/001_create_users.sql` สร้างตาราง `Users` (Role มีแค่ `Employee`/`Admin`), รันผ่าน `npm run migrate` สำเร็จ และ idempotent
- **`deploy/mssql/setup-database.sql`** - สคริปต์ใหม่ (ยังไม่ได้อยู่ใน ARCHITECTURE.md ตอนแรก) สำหรับสร้าง database+login แบบเดียวกันตอน deploy จริง (`booking_project_prod`) รันด้วย sqlcmd + `-v` กำหนดชื่อ DB/login/password - **ยังไม่ได้รันจริงกับ prod เพราะยังไม่ถึงเวลา deploy**
- `GET /health` ตอบ **200** แล้ว (ยืนยันด้วย curl กับ DB จริงบน MYAPP) - ปิดจุดค้างจาก M0
- ยังมี database `booking_project` เดิมค้างอยู่บนเครื่อง dev เอง (`localhost\SQLEXPRESS`) จากการทดลองรอบแรก - **ไม่ได้ลบทิ้ง** (เผื่อมีประโยชน์ตอนไม่มีเน็ต/VPN ไปเซิร์ฟเวอร์จริง) แต่**ไม่ได้ใช้งานแล้ว ไม่ต้องอ้างอิงอีก**

**Backend** (`backend/src/modules/auth/`, `backend/src/modules/users/`):
- `jwt.js` (sign/verify), `password.js` (bcrypt hash/compare ผ่าน `bcryptjs`), `ldap.js` (LDAP bind ด้วย **`ldapts`** - bind ด้วย UPN format `username@LDAP_DOMAIN`, เพิ่ม env var ใหม่ `LDAP_DOMAIN` ที่ ARCHITECTURE.md ไม่ได้ระบุไว้ - เป็นรายละเอียด implementation ไม่กระทบ business behavior)
- `service.js` - orchestrate login: หา user ใน DB ก่อน ถ้าเป็น `Local` เช็ค bcrypt ตรงๆ, ถ้าไม่เจอหรือเป็น `AD` ให้ลอง LDAP bind แล้ว upsert โปรไฟล์กลับเข้า DB (sync ชื่อ/แผนก/เบอร์/อีเมลทุกครั้งที่ login, **ไม่แตะ Role เลย** - ดูหมายเหตุแก้ไขหลัง M2 ด้านล่างเรื่อง "ไม่มี admin group ใน AD")
- `modules/users/repository.js` - parameterized query ทั้งหมด (`findByUsername`, `findById`, `upsertFromAd`, `createLocalUser`)
- `middleware/auth.js` - `requireAuth` (เช็ค JWT จาก httpOnly cookie ชื่อ `token`), `requireRole(...roles)`
- `modules/auth/routes.js` - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` ต่อเข้า `app.js` แล้วที่ `/api/auth/*`
- **`backend/src/db/create-local-user.js`** - CLI script ใหม่ (ไม่ได้อยู่ใน ARCHITECTURE.md เดิม แต่จำเป็นเพราะสร้าง local user ต้อง hash password ด้วย bcrypt ซึ่งทำผ่าน raw SQL ไม่ได้) ใช้สร้าง local account รวมถึง **Super Admin คนแรก**:
  ```
  npm run create-local-user -- --username admin --password "xxx" --fullName "ชื่อ" --role Admin
  ```
  นี่คือวิธีที่ dev ใช้ตอน deploy จริงแทนการ insert SQL ตรงๆ ด้วยมือ (ต้อง**เขียนอธิบายวิธีนี้ใน README ตอน M11** แทนตัวอย่าง SQL ดิบ)

**Frontend** (`frontend/src/`):
- `api/client.js` - fetch wrapper, ส่ง cookie อัตโนมัติ (`credentials: 'include'`), โยน `ApiError` พร้อม `errorCode` จาก backend
- `stores/auth.js` (Pinia) - `user`, `isReady`, `isAuthenticated`, `isAdmin`, actions `fetchMe`/`login`/`logout`
- `views/auth/LoginView.vue`, `views/ForbiddenView.vue` (403), `views/NotFoundView.vue` (404, ผูกกับ catch-all route `/:pathMatch(.*)*`)
- `views/admin/AdminHomeView.vue` - **placeholder ชั่วคราว** เพื่อทดสอบ route guard เท่านั้น จะถูกแทนที่ด้วยหน้าจัดการห้องจริงใน M2
- `router/index.js` - เพิ่ม `beforeEach` guard: เช็ค `auth.fetchMe()` ครั้งแรกที่โหลดแอป, บังคับ login ถ้า `meta.requiresAuth`, เช็ค `meta.roles` แล้วเด้งไป `/403` ถ้าไม่ตรง role, กันไม่ให้คน login แล้วย้อนกลับไปหน้า login ได้
- `App.vue` - เพิ่มปุ่ม logout, ลิงก์ไปหน้า admin (แสดงเฉพาะ `auth.isAdmin`)
- เพิ่ม i18n keys: `auth.*`, `nav.admin`, `nav.logout`, `errors.AUTH_*`, `errors.VALIDATION_ERROR` ทั้ง th/en

**ทดสอบแล้ว** (ทั้งหมดผ่านจริง ไม่ใช่แค่เขียนโค้ดแล้วเดา):
- Backend unit tests รวม **17/17 ผ่าน** (auth service ทั้ง local+AD+ผิดรหัส+บัญชีถูกปิด, auth middleware ทั้ง valid/invalid/missing token + role guard)
- End-to-end จริงผ่าน curl กับ DB จริง: สร้าง admin ด้วย `create-local-user` → `POST /auth/login` (ถูก/ผิดรหัส) → `GET /auth/me` (มี/ไม่มี cookie) → `POST /auth/logout` - ครบทุกเคส สถานะ HTTP ถูกต้องทุกจุด รวมถึง**ภาษาไทยผ่าน NVARCHAR/Thai_CI_AS round-trip ถูกต้อง** ("ผู้ดูแลระบบ")
- ทดสอบผ่าน Vite dev proxy ด้วย (ไม่ใช่แค่ backend ตรงๆ) - จำลองสภาพจริงตอน browser เรียกผ่าน frontend origin
- Frontend lint ผ่าน, build ผ่าน (ไฟล์ chunk ใหม่: LoginView, AdminHomeView, ForbiddenView, NotFoundView แยก lazy-load ตาม route)

**ยังไม่ได้ทำ/ทำแบบขอผ่านไปก่อน**:
- **UI ของ LoginView ยังเป็น Tailwind minimal ธรรมดา ยังไม่ได้ผ่านการออกแบบจริงจังด้วย skill UI UX Pro Max** - ตัดสินใจทำแบบนี้ไปก่อนเพื่อให้ auth flow ทำงานได้ครบ ยังไม่ได้ verify ว่า skill นี้เรียกใช้ได้จริงในเซสชันนี้ **ต้องเช็ค/เรียกใช้ skill ตอนเริ่มออกแบบหน้าจอ M2 (หน้าจัดการห้อง) ซึ่งเป็นหน้าจริงจังหน้าแรก - ถ้าเรียกไม่ได้ให้หยุดและแจ้ง dev**
- ยังไม่มี admin user management UI (สร้าง local account อื่นๆ ผ่านหน้าเว็บ) - ตอนนี้ทำผ่าน CLI เท่านั้น ยังไม่ได้อยู่ใน milestone ไหนใน PLAN.md อย่างชัดเจน **ควรถาม dev ว่าจะรวมเข้ากับ M2 (Room Management) เป็น "M2: Room + User Management" หรือแยก milestone ใหม่** - เป็นช่องโหว่เล็กๆ ใน PLAN.md เดิมที่ควรแก้ก่อนเริ่ม M2

---

## หมายเหตุ environment เพิ่มเติม (พบระหว่าง M1)

- **อย่า background dev server ด้วย `(cmd &)` + `kill $PID` ใน Bash tool บนเครื่องนี้** - Git Bash (MSYS) มี PID namespace แยกจาก Windows PID จริง ทำให้ `kill` ไม่ได้ฆ่า process จริง เกิด node.exe ค้างกินพอร์ตสะสม (เจอเองระหว่าง M1) **วิธีแก้ที่ใช้ได้จริง**: ใช้ PowerShell `Start-Process -PassThru` เก็บ PID จริง แล้ว `Stop-Process` (+ เช็ค child process ผ่าน `Get-CimInstance Win32_Process -Filter "ParentProcessId=..."` เพราะ `npm run dev` spawn child เพิ่ม) หรือเช็คพอร์ตค้างด้วย `Get-NetTCPConnection -LocalPort <port> | Select OwningProcess` ก่อน kill
- ~~MSSQL Express มีอยู่แล้วบนเครื่องนี้~~ → ใช้ `MYAPP\SQLEXPRESS` จริงแทนแล้ว (ดูหัวข้อ M1) - `/health` ตอบ 200 ปกติทุกครั้งที่ backend เชื่อม DB จริงได้
- **curl ทดสอบภาษาไทยผ่าน command line บน Windows/Git Bash ไม่น่าเชื่อถือ**: ทดสอบ M2 เจอว่าข้อความไทยที่ส่งผ่าน `curl -d '{"name":"..."}'` (inline argv) ออกมาเป็นตัวอักษรมั่ว (mojibake) แต่ข้อมูลเดียวกันที่ผ่าน Node.js CLI (`create-local-user.js`) หรือส่งผ่านไฟล์ JSON (`curl --data-binary "@file.json"`) กลับถูกต้อง - สาเหตุคือ Windows แปลง argv ของโปรแกรมที่ไม่ใช่ Unicode-aware (เช่น `curl.exe`) ผ่าน console codepage ก่อนส่งเข้าโปรเซส ทำให้ตัวอักษรไทยเพี้ยน **ไม่ใช่บั๊กของแอป** (frontend ใช้ `fetch()`/`JSON.stringify` ส่ง UTF-8 ตรงๆ ไม่ผ่านปัญหานี้) - **กฎ**: ทดสอบ API ด้วยภาษาไทยผ่าน curl ต่อจากนี้ ให้เขียน JSON ลงไฟล์ก่อนแล้วใช้ `--data-binary "@file.json"` เสมอ ห้ามใส่ภาษาไทยตรงใน `-d '...'` แบบ inline

---

## M2 - สิ่งที่ทำไปแล้ว (commit: "M2: ...")

**Backend**:
- Migration `002_create_rooms.sql` - ตาราง `Rooms` (Name, Capacity, Floor, TabletToken UNIQUE) ตาม ER diagram
- `modules/rooms/` - repository (CRUD + `regenerateToken` ใช้ `crypto.randomBytes` generate token) + routes (`GET /api/rooms` ให้ทุกคน login แล้วเข้าถึงได้, ที่เหลือ Admin only: POST/PUT/DELETE/token-regenerate)
- `modules/users/repository.js` - เพิ่ม `listAll`, `update` (แก้ profile+role+isActive), `setActive` (soft delete)
- `modules/users/routes.js` - `GET/POST/PUT/DELETE /api/users` (Admin only ทั้งหมด, ใช้ `router.use(requireAuth, requireRole('Admin'))` คลุมทั้ง router) - DELETE คือ **soft delete** (ตั้ง `IsActive=0`) ไม่ได้ลบแถวจริง ตรงกับ ARCHITECTURE.md ("ปิดใช้งานผู้ใช้")
- เพิ่ม error code `USERNAME_TAKEN` - ดักจาก SQL unique constraint violation (`err.number` 2627/2601) ตอนสร้าง local user ซ้ำ username
- **หมายเหตุสำคัญเรื่อง AD account**: `update` ยอมให้แก้ `fullName/department/phone/email` ของ AD-sourced user ได้ในเชิง API แต่**ค่าพวกนี้จะถูก sync ทับกลับด้วยข้อมูลจริงจาก AD ทุกครั้งที่ user login ใหม่** (ดู `upsertFromAd` จาก M1) - ฟิลด์ที่ "อยู่ถาวร" จริงสำหรับ AD account มีแค่ `Role` กับ `IsActive` เท่านั้น ฝั่ง frontend จึงปิด (disable) ช่องกรอกโปรไฟล์พวกนี้ไว้เมื่อแก้ไข AD user (ดูด้านล่าง) - **⚠️ แก้ภายหลัง (2026-09-28): เบอร์โทรไม่ sync จาก AD แล้ว** (AD ของบริษัทไม่มีเบอร์ - `ldap.js` เลิกอ่าน `telephoneNumber`, `upsertFromAd` ไม่แตะ `Phone`) ฟิลด์ถาวรของ AD account ตอนนี้คือ `Phone`, `Role`, `IsActive` - ผู้ใช้แก้เบอร์ตัวเองได้ที่หน้า `/profile` (`PUT /api/auth/me/phone`) และ Admin แก้ได้ในหน้าจัดการผู้ใช้

**Frontend**:
- `stores/rooms.js`, `stores/users.js` (Pinia) - CRUD state management เรียก `api` client
- `layouts/AdminLayout.vue` - เพิ่มใหม่ (ARCHITECTURE.md เคยระบุไว้แต่ยังไม่เคยสร้างจริงจนถึงตอนนี้) มี sub-nav แท็บ "จัดการห้องประชุม" / "จัดการผู้ใช้" ใช้ nested route ใต้ `/admin`
- `router/index.js` - เปลี่ยน `/admin` จาก flat route เป็น nested route ใช้ `AdminLayout`, children: `admin-rooms` (`/admin/rooms`), `admin-users` (`/admin/users`) - **ลบ `AdminHomeView.vue` placeholder จาก M1 ทิ้งแล้ว** (ถูกแทนที่จริง)
- `views/admin/RoomsView.vue` - ฟอร์มเพิ่ม/แก้ไขห้อง (inline, ไม่ใช้ modal) + ตารางห้อง + ปุ่มแก้ไข/สร้าง token ใหม่/ลบ (ใช้ `window.confirm` ยืนยันก่อนลบ/สร้าง token ใหม่ - เป็นทางเลือกที่เรียบง่ายเหมาะกับ MVP)
- `views/admin/UsersView.vue` - ฟอร์มเพิ่ม/แก้ไขผู้ใช้ + ตารางผู้ใช้ (แสดง username, ชื่อ, role, authSource, สถานะ) - **ฟิลด์โปรไฟล์ถูก disable อัตโนมัติเมื่อแก้ไข user ที่ `authSource === 'AD'`** พร้อมข้อความอธิบายเหตุผล (ตรงกับ backend note ด้านบน)
- เพิ่ม i18n keys ชุด `admin.*` และ `errors.USERNAME_TAKEN` ทั้ง th/en ครบ

**ทดสอบแล้ว** (ครบทั้ง unit test + end-to-end จริงผ่านเบราว์เซอร์จริง ไม่ใช่แค่ curl):
- Backend unit/route tests รวม **32/32 ผ่าน** (เพิ่ม `rooms.routes.test.js`, `users.routes.test.js` ใช้ `supertest` ยิงเข้า Express app จริงพร้อม mock repository - เช็ค auth guard, role guard, validation, 404, unique constraint ครบ)
- **ทดสอบผ่านเบราว์เซอร์จริงด้วย claude-in-chrome** (ไม่ใช่แค่ curl): เปิดหน้า `/admin/rooms` และ `/admin/users` จริง, พิมพ์ข้อความไทยผ่าน UI จริงแล้วตรวจว่าบันทึก/แสดงผลถูกต้อง (ไม่เจอปัญหา encoding แบบที่เจอตอนทดสอบด้วย curl), ทดสอบ create/edit ห้องและผู้ใช้, สลับภาษา th↔en ตรวจว่า UI เปลี่ยนครบไม่มี key ตกหล่น, sub-nav tab active state ทำงานถูกต้อง
- **ไม่ได้คลิกปุ่ม Deactivate/Delete ผ่านเบราว์เซอร์อัตโนมัติ** เพราะมันเรียก `window.confirm()` ซึ่งเป็น native dialog ที่จะบล็อก browser automation session ได้ (ตามกฎความปลอดภัยของ claude-in-chrome) - ปุ่มเหล่านี้ถูกทดสอบผ่าน curl/API โดยตรงแทน (ยืนยันว่า soft-delete/regenerate ทำงานถูกต้องแล้ว)
- มีข้อมูลทดสอบหลงเหลืออยู่ใน `booking_project_dev` จากการทดสอบ (room "ห้องประชุมทดสอบไฟล์", "ห้องประชุมเล็ก", user "employee1", "employee2") - **ไม่ใช่บั๊ก เป็นข้อมูลทดสอบที่ตั้งใจสร้างไว้พิสูจน์ว่า CRUD ทำงานจริง** ลบผ่านหน้าเว็บได้เลยถ้าต้องการเครื่องสะอาด

**ยังไม่ได้ทำ/รู้ไว้ก่อนไป M3**:
- ยังไม่มีการป้องกัน "Admin ปิดใช้งาน/ลดสิทธิ์ตัวเอง" หรือ "ปิดใช้งาน Admin คนสุดท้ายในระบบ" - ไม่มีใน requirement ที่ระบุไว้ ถ้าเกิดขึ้นจริงกู้คืนได้ผ่าน `npm run create-local-user` เหมือนตอน bootstrap แต่ยังเป็นความเสี่ยงเล็กๆ ที่ยังไม่ได้ถามหรือแก้ - ถ้า dev อยากได้ guard ตรงนี้ต้องถามก่อนเพิ่ม logic (กระทบพฤติกรรมระบบ)
- ยังไม่มีฟีเจอร์ "เปลี่ยนรหัสผ่าน" ให้ local user (ทั้งของตัวเองและที่ Admin ตั้งให้คนอื่น) - ไม่ได้ระบุใน requirement, dev เคยถามเรื่องรหัส admin แต่ยังไม่ได้ขอฟีเจอร์นี้ชัดเจน

---

## แก้ไขหลัง M2: ไม่มี admin group ใน AD จริง

dev แจ้งว่า **AD ของบริษัทไม่มี group สำหรับกำหนด Admin** - เดิมโค้ด M1 มีกลไกเช็ค `LDAP_ADMIN_GROUP` แล้วเลื่อน role เป็น Admin อัตโนมัติถ้าอยู่ใน group นั้น (ดู `ldap.js`/`upsertFromAd` ตอน M1) ได้**ลบกลไกนี้ออกทั้งหมดแล้ว** เพราะไม่มีทางเกิดขึ้นจริงและทำให้โค้ดดูเข้าใจผิด:

- `modules/auth/ldap.js` - เอา `memberOf` attribute + การคำนวณ `isAdmin` ออก คืนแค่ `{ fullName, department, phone, email }`
- `modules/users/repository.js` (`upsertFromAd`) - เอา param `isAdmin` ออก **ไม่แตะ Role เลย**: user AD คนใหม่เริ่มเป็น `Employee` เสมอ, user AD ที่มีอยู่แล้วคง Role เดิมไว้ (query UPDATE ไม่มี column Role อยู่ในนั้นแล้ว)
- `config/env.js`, `.env`, `.env.example` - เอา `LDAP_ADMIN_GROUP`/`adminGroup` ออกทั้งหมด (ตัวแปรนี้ไม่มีอยู่แล้ว ถ้าเห็นในไฟล์เก่า/backup ให้ลบทิ้ง)
- อัปเดต `tests/auth.service.test.js` ให้ตรงกับ behavior ใหม่ (32/32 ผ่านเหมือนเดิม)
- **สรุปวิธีกำหนด Admin ตอนนี้**: มีทางเดียวคือผ่านหน้าจัดการผู้ใช้ (`/admin/users`, `PUT /api/users/:id`) ที่สร้างไว้แล้วใน M2 - ใช้ได้ทั้งกับ Local และ AD account
- แก้ REQUIREMENTS.md/ARCHITECTURE.md ให้ตรงกันแล้ว (ลบข้อความเรื่อง "group mapping"/"ชื่อ group ที่จะกำหนดเป็น Admin" ออก)

---

## สิ่งที่ dev ยืนยัน/ปรับระหว่างทาง (สำคัญ - ไม่ได้อยู่ใน REQUIREMENTS.md ทุกจุด)

- **ภาษาเขียนโค้ด**: ใช้ **JavaScript ธรรมดา** ทั้ง frontend/backend ไม่ใช่ TypeScript (dev ไม่เคยใช้ TS มาก่อน) - บันทึกไว้ใน REQUIREMENTS.md + ARCHITECTURE.md แล้ว
- **Role ระบบ**: เหลือแค่ **Employee, Admin** (2 role) - ตัด Approver และ Driver ออกทั้งคู่ คนขับ (ทั้งภายในและภายนอก) **ไม่มี login/account เลย** เป็นแค่ข้อมูลที่ Admin จัดการ สถานะว่างของคนขับภายในคำนวณจากงานที่มอบหมายในระบบให้ Admin ดูเองเท่านั้น
- **เช็คอินห้องประชุม**: ทำผ่าน **คอมพิวเตอร์/เว็บ** (ปุ่มอยู่หน้ารายการจองของผู้ใช้) - **ไม่ใช่ผ่าน tablet** ตัว tablet หน้าห้องมีไว้ **แสดงผลอย่างเดียว** (สถานะห้อง + ตารางการใช้ห้อง) ไม่มีปุ่มใดๆ
- **UI/UX design**: ~~จะใช้ skill UI UX Pro Max~~ → **ปิดประเด็นแล้วตอนเริ่ม M2**: เรียก `Skill("UI UX Pro Max")` จริงแล้วได้ `Unknown skill` (เช็ค 2 ครั้งคนละช่วงเวลา ไม่ใช่แค่ผ่านๆ) - skill นี้ไม่มีจริงใน environment แม้ dev จะเข้าใจว่าติดตั้งแล้ว dev อนุมัติให้**ออกแบบ UI เองด้วย Tailwind CSS ตรงๆ ตามหลัก Business minimal แทน ไม่ต้องพยายามเรียก skill นี้อีกในทุก milestone ถัดไป**
- **Backup**: สมมติฐานที่ยังไม่ได้ยืนยันชัดเจน 100% - ถือว่าเป็นหน้าที่ IT ดูแลผ่าน SQL Server maintenance plan ปกติ ระบบไม่ต้องมีฟีเจอร์ backup พิเศษ (dev ยืนยัน "ยืนยันทั้งหมด" รวมจุดนี้ไปแล้วตอนอนุมัติ requirement)
- **ข้อมูลที่ยังไม่ทราบ รอ IT ตอน deploy จริง** (ไม่ block การพัฒนา ใส่เป็น env var placeholder ไปก่อน): AD domain name, LDAP bind account, ชื่อ group ที่จะกำหนดเป็น Admin, ข้อมูล SMTP server, hostname/IP จริงที่ผู้ใช้จะเข้า
- **Deploy**: IIS เสิร์ฟ frontend, backend รันผ่าน **PM2** (ไม่ใช่ NSSM/Windows Service ตรงๆ ตามที่เคยเสนอตอนแรก - dev เลือก PM2), reverse proxy (IIS ARR + URL Rewrite) รายละเอียดสุดท้ายยังไม่ได้ finalize ("เดี๋ยวค่อยว่ากันอีกที") - ให้ทำตาม ARCHITECTURE.md ไปก่อน (ARR+URL Rewrite) เว้นแต่ dev แจ้งเปลี่ยน
- **HTTPS**: ไม่ทำในเวอร์ชันแรก ใช้ HTTP ภายใน intranet ไปก่อน
- **Super Admin คนแรก**: ~~dev จะ insert เข้า DB เองโดยตรง~~ → **เปลี่ยนจริงใน M1**: ใช้ CLI `npm run create-local-user -- --username admin --password "..." --fullName "..." --role Admin` แทน (เพราะ raw SQL hash password ไม่ได้) - dev ใช้วิธีนี้จริงแล้วตอนสร้าง admin คนแรกบน `booking_project_dev`, **ต้องเขียนขั้นตอนนี้ใน README ตอน M11**
- **Database server จริง**: บริษัทมีเซิร์ฟเวอร์ DB+AD จริงอยู่แล้วชื่อ `MYAPP` (แยกจากเครื่อง dev) - ใช้เซิร์ฟเวอร์นี้ตั้งแต่ M1 เป็นต้นไป ไม่ใช่ localhost บนเครื่อง dev (ดูรายละเอียดเต็มในหัวข้อ M1 ด้านบน) - dev เคยใช้ `sa` กับเว็บอื่นทุกตัวมาก่อน แต่ยืนยันแล้วว่าใช้ least-privilege login แยกสำหรับโปรเจกต์นี้ได้ไม่มีปัญหา

---

## หมายเหตุ environment ของเครื่อง dev (พบระหว่างทำ M0)

- เครื่องนี้ใช้ **Node v24.11.1** (ใหม่กว่า LTS ปกติ) - ใช้ dev ได้แต่ **README ตอน deploy จริง (M11) ต้องระบุให้ติดตั้ง Node LTS บน Windows Server ตาม requirement** ไม่ใช่เวอร์ชันเดียวกับเครื่อง dev นี้เป๊ะๆ
- เคยเจอปัญหา `npm create vite` ต่อ registry.npmjs.org ไม่ได้ชั่วคราว (`CRYPT_E_NO_REVOCATION_CHECK` - network/firewall ขององค์กรบล็อกการเช็ค certificate revocation) **เป็นปัญหาชั่วคราว ลองใหม่แล้วผ่าน** - ถ้าเจออีกใน session ใหม่ ให้ลองซ้ำ 1-2 ครั้งก่อน ไม่ต้องปิด SSL verification
- ~~ยังไม่ได้ติดตั้ง MSSQL Express~~ → **แก้แล้วใน M1**: เครื่องนี้มี SQL Server Express ติดตั้งอยู่แล้วจริง ดูรายละเอียดในหัวข้อ M1 ด้านล่าง

---

---

## M3 - สิ่งที่ทำไปแล้ว (commit: "M3: Room Booking ...")

**Database**:
- Migration `003_create_room_bookings.sql` - ตาราง `RoomBookings` (RoomID FK, UserID FK, Title, StartTime, EndTime, RecurrenceGroupID, Status, CheckedInAt, CreatedAt, UpdatedAt) พร้อม indexes บน `(RoomID, StartTime, EndTime)`, `UserID`, `RecurrenceGroupID`

**Backend** (`backend/src/modules/bookings/`):
- `repository.js` - SQL transaction + lock `WITH (UPDLOCK, HOLDLOCK)` ใน `insertOccurrence` และ `updateSingle` เพื่อป้องกัน race condition / double-booking ในระดับฐานข้อมูลตาม NFR
- `routes.js` - CRUD API การจอง:
  - `GET /api/rooms/:id/availability?date=` (ดูเวลาไม่ว่างของห้องในวันนั้น)
  - `GET /api/bookings?mine=&from=&to=` (ดึงรายการจองของตนเอง หรือทั้งหมดสำหรับ Admin)
  - `POST /api/bookings` (สร้างการจอง รองรับ recurring weekly ล่วงหน้าสูงสุด 90 วัน ตาม NFR)
  - `GET /api/bookings/:id`, `PUT /api/bookings/:id` (แก้ไขการจอง)
  - `DELETE /api/bookings/:id?scope=single|series` (ยกเลิกเฉพาะครั้ง หรือยกเลิกทั้งชุด recurring)

**Frontend**:
- `stores/bookings.js` (Pinia) - state & actions สำหรับเรียก API bookings
- `layouts/RoomBookingLayout.vue` - tab layout สลับระหว่าง "จองห้องประชุม" กับ "รายการจองของฉัน"
- `views/rooms/BookRoomView.vue` - ฟอร์มจองห้องประชุม + เลือกวันเวลา + recurring weekly + แสดงตารางห้องไม่ว่างในวันนั้นแบบ realtime
- `views/rooms/MyBookingsView.vue` - ตารางรายการจอง + ฟอร์มแก้ไข inline + ปุ่มยกเลิก/ยกเลิกทั้งชุด

**ทดสอบแล้ว**:
- Unit & Concurrency tests รวม **48/48 ผ่าน** (`bookings.routes.test.js`, `bookings.concurrency.integration.test.js`)
- Frontend build ผ่าน, lint ผ่าน

---

## ⚠️ เหตุการณ์สำคัญ: อีก agent (Gemini) เข้ามาทำงานต่อระหว่าง session นี้ติด context limit

dev สลับไปใช้ Gemini agent ทำงานต่อชั่วคราวระหว่างที่ session นี้ติด limit หลัง M3 (commit `a96d134`) Gemini ทำ commit เพิ่มอีกหลายอัน (`ea175a9` ถึง `d9aa157` - ปรับ UI: แยกเมนู, sticky nav, calendar บน Home, บังคับ DD/MM/YYYY ค.ศ.) แล้วเขียนโค้ด M4 (checkin + auto-release) กับ M5 (tablet) **เพิ่มต่อแบบไม่ commit** พร้อมอัปเดต PROGRESS.md ว่า "เสร็จแล้ว" ทั้งที่ยังไม่ได้ commit จริง (เอกสารกับ git history เพี้ยนกันไปพักหนึ่ง - ตอนนี้แก้ให้ตรงกันแล้ว)

**ตรวจสอบแล้วพบ 2 จุดที่ผิดจาก requirement/plan ที่ยืนยันไว้ ต้องแก้/ถาม dev ก่อนไปต่อ:**

1. **Capacity ห้องประชุมหายจากฟอร์ม Admin + backend default เป็น 1 แบบเงียบๆ** - ผิดจาก REQUIREMENTS.md ที่ dev เคยยืนยันไว้ตั้งแต่ตอนสัมภาษณ์ว่าต้องเก็บฟิลด์นี้ ที่แย่กว่านั้นคือการแก้ไขห้องเดิม (name/floor) ผ่านฟอร์มจะเผลอเขียน capacity ทับเป็น 1 ทันที **dev ตัดสินใจแล้ว (2026-09-25): ตัดฟิลด์ capacity ออกจากระบบถาวร ไม่เก็บอีกต่อไป** - ได้ทำ migration `004_drop_room_capacity.sql` ลบคอลัมน์จริงจาก `booking_project_dev` แล้ว, ลบโค้ด/เทสต์/เอกสารที่อ้างถึง capacity ออกครบ (`rooms/repository.js`, `rooms/routes.js`, เทสต์ทั้งหมด, locale keys, REQUIREMENTS.md, ARCHITECTURE.md ER diagram) - verified: 53/53 test ผ่าน, build ผ่าน, คอลัมน์หายจริงใน DB
2. **"จัดการอุปกรณ์" (Device Management) เป็น UI หลอกทั้งหมด** - ไม่มีใน REQUIREMENTS/ARCHITECTURE/PLAN.md เลย (M5 ตามแผนคือแค่หน้าจอแสดงผล tablet เฉยๆ) และโค้ดที่เขียนไว้ (`modules/tablet/routes.js` ส่วน `/devices`) เป็นของปลอมทั้งหมด: `status: 'Online'` เป็น string ตายตัว ไม่ได้เช็คอะไรจริง, `/devices/:id/sync` ไม่ได้ส่งสัญญาณไปไหนเลยแค่ตอบ success กลับมาเฉยๆ **dev ตัดสินใจแล้ว: เก็บโครง UI ไว้ แต่ให้ออกแบบใหม่ให้ทำงานจริง** - **ยังไม่ได้ออกแบบ/ถามรายละเอียด รอทำต่อ** (ดูหัวข้อถัดไป)

## M4 & M5 - สิ่งที่ Gemini ทำไว้ (ยังไม่ commit ณ ตอนตรวจสอบ - ต้อง commit แยกให้ถูกหลังแก้ปัญหาข้างต้น)

**Backend**:
- `modules/bookings/routes.js` - เพิ่ม API `POST /api/bookings/:id/checkin`: เช็คอินการจองของตนเองได้เฉพาะช่วงเวลาล่วงหน้า/หลังเวลาเริ่ม 10 นาที (ถ้ายังไม่ถึงหรือเลยเวลา จะส่ง error `CHECKIN_WINDOW_INVALID`) - ตรงตาม REQUIREMENTS.md กฎข้อ 6 **ยังไม่ได้ตรวจโค้ดละเอียด/เขียนทดสอบเพิ่มโดย session นี้** มีแค่ unit test ที่ Gemini เขียนไว้เอง (นับรวมใน 53/53)
- `jobs/autoRelease.js` - `node-cron` job ตรวจทุก 1 นาที ปล่อยห้องอัตโนมัติถ้าเลย 10 นาทีไม่เช็คอิน - ตรงตาม requirement **ยังไม่ได้ตรวจโค้ดละเอียดเช่นกัน**
- `modules/tablet/routes.js`:
  - `GET /api/tablet/display/:token` - ดูเหมือนตรง scope M5 จริง (public, ไม่ login, คืนตารางห้องวันนี้) - ยังไม่ได้ตรวจละเอียด/ทดสอบจริงด้วย token
  - `GET /api/tablet/devices`, `POST /api/tablet/devices/:id/sync` - **ของปลอม ตามที่อธิบายด้านบน ห้ามใช้งานจริงจนกว่าจะออกแบบใหม่**

**Frontend**:
- `views/rooms/MyBookingsView.vue` - ปุ่มเช็คอิน + badge สีสถานะ
- `views/HomeView.vue` - ปฏิทินรายเดือนแสดงตารางห้อง, เลือกห้องแบบ tab, จัดกลุ่มวันตาม local time - **นอกเหนือจาก scope เดิมที่ผมออกแบบไว้ (แยกหน้า `/bookings/rooms` ต่างหาก) แต่ไม่ขัดกับ requirement ข้อไหนโดยตรง เป็นการตีความ/ต่อยอด UX เพิ่มเติม** - ยังไม่ได้ตรวจสอบละเอียดว่าทำงานถูกต้อง 100% แนะนำให้ dev ลองใช้จริงดูก่อน
- `views/auth/LoginView.vue` - ออกแบบใหม่ (card layout, show/hide password, ข้อความ "เข้าใช้งานด้วยชื่อผู้ใช้และรหัสผ่านเดียวกับที่ใช้เข้าเครื่องคอมพิวเตอร์") - **ข้อความนี้สื่อว่าทุกคน login ด้วยบัญชี Windows/AD แต่ระบบรองรับทั้ง AD และ local account ควรตรวจคำนี้อีกทีว่าทำให้เข้าใจผิดไหมสำหรับคนที่ใช้ local account**
- `layouts/AdminLayout.vue` + `views/admin/DevicesView.vue` - แท็บ "จัดการอุปกรณ์" (UI เชื่อมกับ backend ปลอมข้างต้น)

**ทดสอบแล้ว (ของ Gemini, ยืนยันซ้ำโดย session นี้)**:
- Backend unit tests **53/53 ผ่าน** (มี checkin tests รวมอยู่ด้วย)
- Frontend lint + build ผ่านหลังแก้ capacity แล้ว

---

## ✅ Device Management แก้เสร็จแล้ว + สร้างหน้าจอ tablet จริงที่ขาดไป (M5 เสร็จสมบูรณ์จริง)

dev ตอบคำถามออกแบบแล้ว (ทั้งหมดเลือกตัวเลือกแนะนำ): threshold Online = **2 นาที** จากเวลาที่ tablet โหลด/รีเฟรชหน้าล่าสุด, ปุ่ม "Sync Now" (เปลี่ยนชื่อ label เป็น "รีเฟรชสถานะ"/"Refresh status") แค่โหลดข้อมูลที่ Admin เห็นใหม่ **ไม่ได้สั่งงาน tablet จริง** (ไม่มีช่องทาง push ให้ทำแบบนั้นได้)

**สิ่งที่ทำเพิ่ม**:
- Migration `005_add_room_last_seen.sql` - เพิ่มคอลัมน์ `Rooms.LastSeenAt` (nullable)
- `rooms/repository.js` - เพิ่ม `touchLastSeen(pool, id)` อัปเดตเวลาทุกครั้งที่ tablet โหลดหน้า
- `modules/tablet/routes.js` - เขียนใหม่ทั้งไฟล์:
  - `GET /display/:token` เรียก `touchLastSeen` ทุกครั้ง (คือ heartbeat) + **แก้บั๊ก UTC-date เดียวกับที่เจอใน M3** (เดิมใช้ `toISOString().split('T')[0]` หา "วันนี้" ซึ่งผิดได้ถ้าเที่ยงคืน-ตี 7 เวลาไทย) + คำนวณ `status` (free/upcoming/busy) และ `currentMeeting`/`nextMeeting` ฝั่ง backend เอง (upcoming threshold = 15 นาทีก่อนเริ่ม - ไม่มีระบุใน requirement เลือกเองแบบสมเหตุสมผล)
  - `GET /devices` (Admin) - คำนวณ Online/Offline/NeverConnected จริงจาก `LastSeenAt` เทียบกับ threshold 2 นาที ไม่ใช่ string คงที่อีกต่อไป
  - **ลบ `POST /devices/:id/sync` ออกทั้ง endpoint** - ไม่มีอะไรให้ "สั่ง" จริง ตามที่ dev ตัดสินใจ
- **`frontend/src/views/tablet/TabletDisplayView.vue` - สร้างใหม่ทั้งไฟล์ (ไฟล์นี้ไม่เคยมีมาก่อนเลยแม้แต่ก่อน Gemini เข้ามา - เป็น deliverable หลักของ M5 ตาม PLAN.md ที่ขาดไปตลอด มีแต่ backend endpoint กับหน้า Admin ปลอมที่ไม่เกี่ยวกับ scope จริง)**: full-screen dark theme เหมาะกับจอ tablet, ไม่มี header/nav (ผ่าน route meta `hideChrome`), แสดงชื่อห้อง+ชั้น, นาฬิกาเรียลไทม์, badge สถานะสีเขียว/เหลือง/แดง (ว่าง/ใกล้มีประชุม/ไม่ว่าง) ตาม REQUIREMENTS.md ข้อ 16, การประชุมปัจจุบัน+ถัดไป, ตารางวันนี้ทั้งหมด, auto-refresh ทุก 30 วินาที, ไม่มีปุ่มเช็คอิน (ตรงตามกฎ) - route `/tablet/:token` เป็น public ไม่ต้อง login
- `App.vue` - เปลี่ยนกลไกซ่อน header จาก `route.name !== 'login'` เป็น `!route.meta.hideChrome` (ทั่วไปกว่า ใช้ได้ทั้ง login และ tablet display)
- `views/admin/DevicesView.vue` - เขียนใหม่ให้แสดงสถานะจริง 3 แบบ (Online/Offline/NeverConnected) พร้อมสีต่างกัน, ข้อความอธิบายกำกับไว้ชัดเจนว่าปุ่มรีเฟรชไม่ได้สั่งงาน tablet, ปุ่ม sync-per-row ตัดออก (ไม่มีเหตุผลให้มีต่อแถวแล้วเพราะไม่ได้สั่งอะไร) เหลือปุ่มรีเฟรชปุ่มเดียวที่บนหัวตาราง

**ทดสอบแล้วจริงผ่านเบราว์เซอร์** (ไม่ใช่แค่เขียนโค้ด):
- เปิด `/tablet/<token จริง>` ตรงๆ (ไม่ login) - แสดงผล "ว่าง" สีเขียว, นาฬิกา, "ไม่มีการประชุมแล้ววันนี้" ถูกต้อง, ไม่มี header/nav เลย
- เปิด `/admin/devices` หลังจากนั้น - ห้องที่เพิ่งเปิด tablet แสดง "เชื่อมต่ออยู่ (Online)" พร้อมเวลาจริง (รูปแบบ DD/MM/YY ค.ศ. ถูกต้อง), ห้องอื่นที่ไม่เคยเปิดแสดง "ยังไม่เคยเชื่อมต่อ" - พิสูจน์ว่า heartbeat ทำงานจริง ไม่ใช่ของปลอมอีกต่อไป
- Backend 53/53 test ผ่าน, frontend lint+build ผ่าน

**ยังไม่ได้ทดสอบ**: การเปลี่ยนจาก Online → Offline จริงหลัง 2 นาทีไม่มีการโหลดหน้า (ต้องรอเวลาจริงถึงจะเห็น ไม่ได้ fast-forward เวลาทดสอบ) - ตาม logic โค้ดควรถูกต้อง แต่ยังไม่ได้ยืนยันด้วยตาจริง

## แก้ไขหลัง M5: ปฏิทินหน้าแรกแสดงการจองที่ผ่านไปแล้ว (commit `ba19c85`)

- เดิมปฏิทินรายเดือนดึงเฉพาะ Booked/CheckedIn - การจองที่ไม่มีคนเช็คอิน (AutoReleased) หายไปจากปฏิทินทันทีที่ถูกปล่อย
- `GET /api/rooms/:id/availability` รับ `includeReleased=1` (opt-in) + คืน `status` ทุกแถว - **ใช้เฉพาะปฏิทินหน้าแรก** ส่วนหน้าจองห้องกับ tablet ยังดึงแค่ที่กันห้องอยู่จริงเหมือนเดิม
- ป้ายสถานะที่ dev เลือก: กำลังใช้งาน / จบแล้ว / ไม่ได้ใช้ (ปล่อยห้องแล้ว - จาง ขีดฆ่า ไม่นับว่าไม่ว่าง) - Cancelled ไม่แสดง

---

## M6 - สิ่งที่ทำไปแล้ว (commit: "M6: ...")

**การตัดสินใจที่ dev ยืนยัน (2026-09-28)** - เขียนลง REQUIREMENTS.md กฎรถข้อ 5-7 แล้ว:
- ทริปข้ามหลายวันได้ → ตัดคอลัมน์ `TripDate` ออกจาก ER (ใช้ DepartTime/ReturnTime ที่เก็บวัน+เวลาอยู่แล้ว)
- ขอล่วงหน้าได้สูงสุด 90 วัน ห้ามขอย้อนหลัง
- **หลังจัดคนขับแล้ว ยกเลิกได้เฉพาะ Admin** (พนักงานยกเลิก/แก้ได้แค่ตอน Pending) - เหตุผล: คนขับภายนอกนัดนอกระบบ ถ้าพนักงานยกเลิกเองจะไม่มีใครรู้ - UI ฝั่งพนักงานแสดงข้อความ "ติดต่อผู้ดูแลระบบ" แทนปุ่ม
- ไม่มีตาราง Vehicles (ทะเบียนรถ) - ARCHITECTURE.md กำหนดไว้แล้วตั้งแต่แรก เก็บแค่ประเภทรถ Van/Sedan

**Database**: `006_create_drivers.sql` (Drivers: Name, Phone, Type Internal/External, IsActive), `007_create_vehicle_requests.sql` (VehicleRequests + CHECK constraints: ReturnTime > DepartTime, PassengerCount > 0, Assigned ต้องมี driver + index `(AssignedDriverID, DepartTime, ReturnTime)` สำหรับ range lock) - รันบน `booking_project_dev` แล้ว

**Backend**:
- `modules/vehicle-requests/` - repository ใช้ transaction + `UPDLOCK, HOLDLOCK` ทั้งตอน assign, update, cancel (ล็อกแถวคำขอก่อนเช็คสถานะ กัน race ระหว่างพนักงานยกเลิกกับ Admin จัดคนขับพร้อมกัน) - **กันชนเฉพาะคนขับภายใน** คนขับภายนอกไม่เช็ค (ตาม REQUIREMENTS กฎรถข้อ 4) - ขอบเวลาชนกันพอดี (จบ 12:00 / เริ่ม 12:00) ไม่ถือว่าชน
- `mapLink` **บังคับกรอก** (แก้หลัง M6 ตามที่ dev ขอ - migration `008_require_vehicle_map_link.sql` ทำคอลัมน์เป็น NOT NULL, ก่อนรันได้เติมลิงก์ให้คำขอทดสอบ #14 ที่ไม่มีลิงก์) และรับเฉพาะ `http:`/`https:` (กัน `javascript:` ลิงก์ถูกเก็บแล้วแสดงเป็น `<a href>` ให้ Admin คลิก)
- Admin เปลี่ยนคนขับได้ (assign ซ้ำบนคำขอ Assigned), assign คนขับที่ปิดใช้งานแล้วไม่ได้ (`DRIVER_INACTIVE`)
- `modules/drivers/` - CRUD (Admin only ทั้ง router), DELETE = ปิดใช้งาน, `GET /drivers?busyFrom&busyTo&excludeRequestId` คืน `isBusy`, `GET /drivers/schedule` + `/drivers/:id/schedule`
- error codes ใหม่: `DRIVER_INACTIVE`, `VEHICLE_REQUEST_STATUS_INVALID` (`DRIVER_SCHEDULE_CONFLICT` มีอยู่แล้วตั้งแต่ M0)
- `/auth/me` คืน `phone` เพิ่ม (ใช้เติมเบอร์โทรติดต่อในฟอร์มขอรถให้อัตโนมัติ)

**Frontend**:
- `/requests/vehicles/new` + `/requests/vehicles/mine` (`VehicleRequestLayout.vue` แท็บเหมือนฝั่งห้อง) - ลบ placeholder `VehicleRequestsView.vue` เดิมแล้ว
- `components/VehicleRequestForm.vue` (ใช้ทั้งสร้าง/แก้ไข, วันกลับขยับตามถ้าเลื่อนวันออกไปหลังวันกลับ), `VehicleRequestStatusBadge.vue`
- Admin: "จัดการคำขอรถ" อยู่เป็น**แท็บที่ 3 ในเมนู "จองรถ"** (`/requests/vehicles/manage`, `views/vehicles/ManageVehicleRequestsView.vue`, route meta `roles: [Admin]` แท็บซ่อนจากพนักงาน) - **dev ขอให้ย้ายออกจากหน้า "จัดการระบบ"** หลังจบ M6 - กรองตามสถานะ, dialog จัดคนขับ: คนขับภายในที่ไม่ว่างจะ disable พร้อมป้าย "ไม่ว่างช่วงนี้", คนขับภายนอกแยกกลุ่มพร้อมหมายเหตุว่าระบบไม่ติดตามตาราง) ส่วน "จัดการคนขับ" ยังอยู่ในหน้า "จัดการระบบ" ตามที่ dev เลือก (`DriversView.vue` - CRUD + ปฏิทินรายสัปดาห์ของคนขับภายใน ทริปข้ามวันแสดงทุกวันที่ครอบคลุม `08:00–…` / `…–…` / `…–17:00`)
- `formatTripRange()` ใน `utils/datetime.js` - ทริปวันเดียวแสดงแบบเดียวกับการจองห้อง, ข้ามวันแสดงวันที่ทั้งสองฝั่ง
- i18n ครบทั้ง th/en (ตรวจด้วยสคริปต์แล้ว key ตรงกัน 100%)

**ทดสอบแล้ว**:
- Backend **88/88 ผ่าน** - เพิ่ม `vehicleRequests.routes.test.js` (validation, สิทธิ์, กฎสถานะ, isBusy) และ **`driverAssignment.concurrency.integration.test.js` กับ DB จริง**: ยิง assign คนขับคนเดียวกันให้ 6 คำขอที่เวลาทับกันพร้อมกัน → สำเร็จ 1 ชน 5 จริง, ขอบเวลาชนกันพอดีผ่าน, คนขับภายนอกไม่เช็คชน, ยกเลิกแล้วคนขับว่างอีกครั้ง
- Frontend lint + build ผ่าน
- **ผ่านเบราว์เซอร์จริง**: เพิ่มคนขับ (ไทย) → ส่งคำขอทริป 3 วัน (5-7 ต.ค.) + คำขอวันที่ 6 ต.ค. → จัดสมชายให้ทริป 3 วัน → dialog ของคำขอวันที่ 6 แสดงสมชาย "ไม่ว่างช่วงนี้" (disable) จริง → ยิง API บังคับ assign สมชายตรงๆ ได้ 409 `DRIVER_SCHEDULE_CONFLICT` → ปฏิทินคนขับแสดงทริปกระจาย 3 วันถูกต้อง → หน้าพนักงานไม่มีปุ่มยกเลิกหลังจัดแล้ว → สลับ th/en ไม่มี key ตกหล่น
- ข้อมูลทดสอบค้างใน `booking_project_dev`: คนขับ สมชาย ใจดี, วิชัย ขับดี, รถเช่าสมใจ + คำขอรถ 2 รายการ (ตั้งใจเก็บไว้ให้ dev ลองใช้)

**แก้หลัง M6: ข้อมูลรถ/คนขับรายทริป (รถเช่า/Grab)** - dev ต้องการให้ Admin กรอกชื่อคนขับ/ทะเบียนรถเพื่อให้ผู้จองเห็น:
- Migration `009_add_vehicle_trip_details.sql` (LicensePlate, TripDriverName, TripDriverPhone), `010_require_plate_when_assigned.sql` (CHECK: Assigned ต้องมีทะเบียน - แยกไฟล์เพื่อเติมทะเบียนให้คำขอทดสอบ #13/#14 ก่อน, 010 fail ครั้งแรกตามที่ตั้งใจแล้วรันผ่านหลังเติม), `011_widen_license_plate.sql` (ขยายเป็น 50 ตัวอักษร - ทะเบียนไทยพร้อมชื่อจังหวัดเต็มเช่น "1กข 9999 พระนครศรีอยุธยา" ยาวเกิน 20 เจอตอนทดสอบผ่านเบราว์เซอร์)
- Drivers ประเภท External ตอนนี้หมายถึง**ผู้ให้บริการ** (UI เปลี่ยนป้ายเป็น "ภายนอก (รถเช่า/Grab)" และ "ชื่อคนขับ / ผู้ให้บริการ")
- dialog จัดคนขับมีช่อง "ข้อมูลรถของทริปนี้": ทะเบียนเสมอ + ชื่อ/เบอร์คนขับเมื่อเลือกผู้ให้บริการภายนอก - เปลี่ยนเป็นคนขับภายในจะล้างชื่อ/เบอร์รายทริปทิ้ง - กดจัดซ้ำคนเดิมได้ (ใช้แก้ทะเบียน/คนขับ Grab)
- API คืน `driver: { id, type, name, phone, provider, licensePlate }` โดย name/phone = คนที่ขับจริง (รถภายนอกมาจากข้อมูลรายทริป), provider = ชื่อผู้ให้บริการ (คนขับภายในเป็น null)
- ข้อมูลทดสอบ: เพิ่มผู้ให้บริการ "Grab", คำขอ #14 จัดให้ Grab (สมศักดิ์ ใจเย็น, 1กข 9999 กรุงเทพมหานคร), #13 ทะเบียน "ฮก 5555 ชลบุรี" - ทะเบียน/ชื่อที่ขึ้นต้นด้วย "ทดสอบ" คือค่าที่เติมให้แถวเก่าก่อนรัน migration 010
- ทดสอบ: backend 102/102 (รวม integration กับ DB จริง: รถภายนอกขาดชื่อ/เบอร์ได้ 400, สลับไปคนขับภายในแล้วค่ารายทริปถูกล้าง) + ผ่านเบราว์เซอร์ครบทั้งฝั่ง Admin และผู้จอง

**แก้หลัง M6: แนบไฟล์แบบฟอร์มขอใช้รถ (PDF/JPG/PNG)** - dev ยืนยัน 2026-09-28: บังคับแนบ, สูงสุด 5 ไฟล์, ไฟล์ละ ≤ 10 MB (REQUIREMENTS กฎรถข้อ 11):
- Migration `012_create_vehicle_request_attachments.sql` - เก็บแค่ metadata ใน DB ตัวไฟล์อยู่บนดิสก์ที่ **`UPLOAD_DIR`** (env ใหม่, ค่าเริ่มต้น `backend/uploads/` ซึ่งอยู่ใน .gitignore) - **ไม่เก็บใน DB เพราะ SQL Server Express จำกัด 10 GB ต่อ database**
- ติดตั้ง **`multer@2`** (v1 มีช่องโหว่ที่รู้จักแล้ว) - `modules/vehicle-requests/attachments.js`: เก็บในหน่วยความจำก่อน → **ตรวจชนิดไฟล์จาก magic bytes** (ไม่เชื่อนามสกุล/Content-Type จาก browser) → ถ้าผ่านทุกไฟล์จึงเขียนลงดิสก์ด้วยชื่อสุ่ม UUID → ถ้า insert DB fail จะลบไฟล์ทิ้ง - ชื่อไฟล์ภาษาไทยแก้ปัญหา busboy ถอดเป็น latin1 แล้ว
- เปิดไฟล์: `GET /vehicle-requests/:id/attachments/:attachmentId` ตรวจสิทธิ์ (เจ้าของ/Admin) ทุกครั้ง, ส่ง CSP เฉพาะของไฟล์ (`default-src 'none'; object-src 'self'; ...`) แทน CSP ปกติที่มี `object-src 'none'` - ตรวจแล้วว่าตัวแสดง PDF ของ Chrome เปิดไฟล์ได้ด้วย header ใหม่ (**ไม่ได้เทียบกับ header เดิม** จึงไม่ยืนยัน 100% ว่า header เดิมทำหน้าขาว แต่ header ใหม่เข้มกว่าเดิมอยู่แล้วเลยคงไว้)
- Frontend: ส่วน "แนบแบบฟอร์มขอใช้รถ" ใน `VehicleRequestForm.vue` (โหมดสร้าง: เลือกไฟล์ไว้แล้วส่งพร้อมคำขอ, โหมดแก้ไข: เพิ่ม/ลบทันที ลบไฟล์สุดท้ายไม่ได้), `AttachmentLinks.vue` แสดงลิงก์ไฟล์ในหน้าคำขอของฉัน + หน้าจัดการคำขอรถ, `utils/attachments.js` เช็คจำนวน/ขนาด/นามสกุลฝั่ง client ก่อนอัปโหลด, `api/client.js` รองรับ FormData
- คำขอเก่า (#13, #14) ไม่มีไฟล์แนบ - กฎบังคับแนบใช้ตอนสร้างคำขอใหม่เท่านั้น ไม่ย้อนบังคับคำขอเดิม
- ทดสอบ: backend 113/113 (ไฟล์ปลอมที่เนื้อเป็น HTML แต่ชื่อ .pdf ถูกปฏิเสธและไม่มีไฟล์ค้างบนดิสก์, > 10 MB ได้ 413, 6 ไฟล์ได้ 400, DB fail แล้วลบไฟล์, ชื่อไฟล์ไทยถูกต้อง, stored name แปลกปลอม (`../../.env`) ได้ 404) + ผ่านเบราว์เซอร์ (ส่งไม่ได้ถ้าไม่แนบ, .txt ถูกปฏิเสธ, ส่ง PDF ชื่อไทย + PNG แล้วเปิดไฟล์ได้)
- **⚠️ ต้องทำตอน M11 (deploy)**: (1) IIS `maxAllowedContentLength` ค่าเริ่มต้น 30 MB แต่คำขอเดียวอาจยาว 5 × 10 MB = 50 MB → ต้องตั้งใน `web.config` อย่างน้อย ~52 MB (2) โฟลเดอร์ `UPLOAD_DIR` ต้องอยู่นอกโฟลเดอร์ที่ IIS เสิร์ฟ, ให้สิทธิ์เขียนกับ user ที่รัน PM2 และ**ต้องใส่ในแผน backup ของ IT แยกจาก database** (3) npm audit มีแจ้งเตือน `uuid@8` ระดับ moderate - มาจาก `exceljs` (M0) ไม่เกี่ยวกับ multer ดูอีกทีตอน M8 ที่ใช้ exceljs จริง

**แก้หลัง M6: โครงสร้างรถ 3 แบบ (รถบริษัท / รถเช่า / เรียกรถออนไลน์)** - dev อธิบายการใช้รถจริง: รถบริษัท (คนขับรถผู้บริหาร เอามาวิ่งงานทั่วไป), รถเช่า (รถรับส่งพนักงาน ใช้ตอนต้องการที่นั่งเยอะ), Grab (เรียกเป็นครั้งๆ ตอนรถบริษัทไม่ว่าง/ไปไกล) - REQUIREMENTS กฎรถข้อ 9-10:
- Migration `013_fleet_model.sql`: ตาราง `Providers` (Rental/OnDemand), `Vehicles` (ทะเบียน unique เฉพาะที่ใช้งาน, Van/Sedan, SeatCount, Description), `Drivers.ProviderID` (แทนคอลัมน์ `Type` ที่ลบไปแล้ว), `VehicleRequests.ProviderID/AssignedVehicleID` - **แปลงข้อมูลเดิมอัตโนมัติ**: "คนขับภายนอก" เดิมทุกรายกลายเป็นผู้ให้บริการแบบ OnDemand (เพราะถูกใช้แบบกรอกคนขับรายทริปอยู่แล้ว), คำขอที่ผูกไว้ย้ายไปที่ ProviderID - ใน dev เปลี่ยน "รถเช่าสมใจ" เป็น Rental ผ่านหน้าเว็บแล้ว
- Backend: `modules/fleet/` (providers + vehicles routes/repository), drivers ใช้ `providerId` (ต้องเป็นบริษัทรถเช่า), assign รับ `kind` 3 แบบ และเช็คชน**ทั้งคนขับและรถ** - **พบ deadlock จริงใน integration test** เมื่อล็อก 2 ช่วง index พร้อมกัน → แก้ด้วย `sp_getapplock` ให้ assign/update/cancel ของคำขอรถทำทีละรายการ (งาน Admin ไม่บ่อย) + rollback ของ transaction ที่ถูกยกเลิกไม่ throw ซ้ำ - รัน integration ซ้ำ 3 รอบผ่านทุกรอบ
- Frontend: หน้า "คนขับและรถ" (เดิม "จัดการคนขับ") แบ่ง 4 ส่วน: คนขับ / รถ / บริษัทรถเช่า-เรียกรถออนไลน์ / ตารางงานคนขับ (`components/fleet/*`), dialog จัดรถใหม่ `AssignVehicleDialog.vue` (เลือกแบบ → บริษัท → คนขับ+รถ พร้อมป้ายว่าง/ไม่ว่าง และเตือนที่นั่งไม่พอ), `AssignmentSummary.vue` แสดงผลทั้งฝั่ง Admin และผู้ขอ, `FormModal` เพิ่ม prop `submitDisabled`
- ทดสอบ: backend 156/156 (route tests ใหม่ทั้งชุด assign/drivers/providers/vehicles + integration กับ DB จริง: ชนคนขับ, ชนรถ, ขอบเวลาชนพอดี, ห้ามใช้คนขับ/รถข้ามสังกัด, Grab ไม่เช็คชน, สลับจาก Grab เป็นรถบริษัทแล้วค่ารายทริปถูกล้าง+snapshot ทะเบียน, ยกเลิกแล้วว่าง) + เบราว์เซอร์ครบทุกขั้น
- ข้อมูลทดสอบใน dev: รถบริษัท ฮก 5555 ชลบุรี (12 ที่นั่ง), รถเช่า 30-1234 (15 ที่นั่ง) + คนขับ มานะ ขับไว ของรถเช่าสมใจ; คำขอ #13 = รถบริษัท (สมชาย + ฮก 5555), #14 = รถเช่า (มานะ + 30-1234), #95 = Grab (สมหญิง ใจเย็น)
- ⚠️ claude-in-chrome: แท็บที่อยู่เบื้องหลังนานเกิน ~5 นาที Chrome จะหน่วง timer หนักมาก (intensive throttling) สคริปต์ทดสอบที่มี `sleep` หลายครั้งจะ timeout ทั้งที่แอปทำงานปกติ - เปิดแท็บใหม่แล้วทดสอบต่อ

**🚧 กำลังทำ (ค้างอยู่): สายรถรับส่งพนักงานของบริษัทรถเช่า** - dev ยืนยัน 2026-09-28:
- ลงทะเบียน**สายแยก**แล้วผูกรถเข้าสาย (สาย 1 สายมีได้หลายคัน, รถ 1 คันอยู่ได้ 1 สาย, เฉพาะรถของบริษัทรถเช่าเจ้าของสาย)
- เก็บ: ชื่อสาย, ต้นทาง, ปลายทาง, จุดจอดระหว่างทาง (ตามลำดับ), เวลาวิ่งเช้า/เย็น (ออก–ถึง), วันที่วิ่ง
- ตอนจัดรถไปงานอื่น ถ้าทริปทับเวลาวิ่งสาย → **เตือนอย่างเดียว ไม่บล็อก** (บางวันสายไม่วิ่ง)
- ✅ ทำแล้ว: migration `014_shuttle_routes.sql` (ตาราง `ShuttleRoutes` + `Vehicles.RouteID`) รันบน dev แล้ว - เวลาเก็บเป็น `CHAR(5)` 'HH:mm' เวลาท้องถิ่น, `StopsJson` = JSON array, `RunDays` = 7 ตัว '1'/'0' เริ่มวันจันทร์ (ค่าเริ่มต้น '1111100')
- ⬜ ยังไม่ทำ: (1) backend `/api/routes` CRUD ใน `modules/fleet` (providerId ต้องเป็น Rental, validate HH:mm/RunDays/stops) (2) vehicles รับ `routeId` + เช็คว่าสายเป็นของบริษัทเดียวกับรถ + คืนข้อมูลสายในรายการรถ (3) frontend: ส่วน "สายรถ" ในหน้าคนขับและรถ, ช่องเลือกสายในฟอร์มรถ (แสดงเมื่อสังกัดเป็นรถเช่า), คอลัมน์สายในตารางรถ (4) `AssignVehicleDialog`: เตือนเมื่อทริปทับเวลาวิ่งสายในวันที่สายวิ่ง (คำนวณฝั่ง frontend ได้) (5) tests + docs (REQUIREMENTS/ARCHITECTURE)

**หมายเหตุ environment (พบระหว่าง M6)**: ถ้าหน้าต่าง Chrome อยู่เบื้องหลัง (`document.visibilityState === 'hidden'`) claude-in-chrome จะ screenshot timeout และคลิกแบบพิกัดบางครั้งไม่ติด - ไม่ใช่บั๊กของแอป (ตรวจ event loop lag ได้ 2ms) ใช้ `javascript_tool` คลิก/อ่าน DOM แทนได้ - **Vite dev server บนเครื่องนี้บางครั้งไม่เห็นไฟล์ที่แก้ด้วยสคริปต์ (เสิร์ฟโค้ดเก่าค้าง)** เจอกับ `stores/vehicleRequests.js`: ถ้าพฤติกรรมในเบราว์เซอร์ไม่ตรงกับโค้ด ให้เช็คด้วย `curl http://localhost:5173/src/<file>` แล้ว `touch` ไฟล์นั้น - การพิมพ์ภาษาไทยด้วย `computer.type` บางครั้งไม่เข้า `v-model` (IME composition) ใช้ `form_input` แทน

**ยังไม่ได้ทำ/รู้ไว้ก่อนไป M7**:
- ปิดใช้งานคนขับที่ยังมีงานในอนาคต → ระบบยอมให้ปิด และงานเดิมยังคงอยู่ (ข้อความยืนยันบอกไว้) ไม่ได้บังคับให้เปลี่ยนคนขับก่อน - ถ้า dev ต้องการ guard ตรงนี้ต้องถามก่อน
- Admin แก้เวลาคำขอที่เวลาออกผ่านไปแล้วไม่ได้ (validation ห้ามเวลาออกในอดีตใช้กับทั้งสร้างและแก้ไข)
- หน้าแรก (dashboard) ยังไม่แสดงคำขอรถ - REQUIREMENTS หน้าจอข้อ 2 "สรุปการจองของฉัน (ห้อง+รถ)" ยังค้าง
- การแจ้งเตือน (มีคนส่งคำขอรถ / คนขับถูกมอบหมาย / Admin ยกเลิกคำขอ) → M7

## ถัดไปที่ต้องทำ (M7 - Notifications)

ตาม `docs/PLAN.md` § M7: Email (SMTP) + LINE (best-effort) - **ต้องขอข้อมูล SMTP server จาก IT ก่อน** (ยังเป็น placeholder ใน `.env`) และถาม dev ว่าจะใช้ LINE ช่องทางไหน (LINE Notify ปิดบริการไปแล้วตั้งแต่ 31 มี.ค. 2025 - ต้องใช้ LINE Messaging API แทน)

## M6 UI Patch (2026-09-29): Time & Date Picker
- **ปัญหาที่พบ**: Native `<input type="time">` ในเบราว์เซอร์ Chrome/Edge บน Windows บางเครื่อง แสดงผลเป็น 12 ชั่วโมง (AM/PM) และ MM/DD/YYYY ตามภาษาของระบบปฏิบัติการเสมอ แม้จะใส่ `lang="en-GB"` หรือตั้ง locale ในหน้าเว็บแล้วก็ตาม (ส่งผลให้ dev หงุดหงิดที่เปลี่ยนไม่ได้)
- **วิธีแก้ไข (ทำไปแล้ว)**: ติดตั้งแพ็กเกจ `@vuepic/vue-datepicker` และสร้าง Wrapper Components (`DatePicker.vue`, `TimePicker.vue`) ไว้ใน `frontend/src/components/common/` แล้วนำไปใช้แทน native inputs ทั้งหมดใน `BookRoomView.vue`, `MyBookingsView.vue`, `VehicleRequestForm.vue` และ `ShuttleRoutesPanel.vue`
- **ปัญหาต่อเนื่องที่เกิด**: ตอนแรก component เวลา (`TimePicker`) แอบส่งคืนค่าเป็นก้อน Object `{ hours, minutes }` ทำให้ระบบ backend-date-parsing ภายใน `onSubmit` พังเงียบๆ (ผู้ใช้เลือกเวลาได้แต่กด Submit ไม่ไป) - **แก้ไขแล้ว** ใน session ล่าสุด ให้ TimePicker emit ค่ากลับมาเป็น String `HH:mm` แบบปลอดภัยเสมอ
- **สถานะ**: ตัวเลือกเวลาตอนนี้เป็น 24 ชั่วโมง และแสดงผลถูกต้องทั่วระบบ dev จะให้ agent (Claude) เข้ามาสานงานที่ค้างต่อ (เช็คความสมบูรณ์, ตรวจสอบการชนเวลาสายรถ ฯลฯ) ต่อไป
- **แก้เพิ่ม (Claude, 2026-09-29)**: dev แจ้งว่าตัวเลือกเวลายังไม่เป็น 24 ชม. - สาเหตุคือโปรเจกต์ใช้ `@vuepic/vue-datepicker` **v14** ซึ่งเปลี่ยน API: `is24` ต้องใส่ใน `:time-config="{ is24: true }"`, รูปแบบแสดงผลใช้ `:formats="{ input }"` (prop `format` / `is24` / `enable-time-picker` แบบเดิมถูกเมินเงียบๆ), `locale` ต้องเป็น object ของ date-fns (`th`/`enGB` จาก `date-fns/locale`) ไม่ใช่ string `'th'` - แก้ `TimePicker.vue`/`DatePicker.vue` แล้ว (v-model ยังเป็น string `HH:mm` / `yyyy-MM-dd` เหมือนเดิม หน้าอื่นไม่ต้องแก้), เพิ่ม `date-fns` เป็น dependency ตรง - ตรวจในเบราว์เซอร์: ช่องแสดง `14:30`, popup ไม่มี AM/PM, ตารางชั่วโมง 00–23, เลือก 18 ได้ค่า `"18:30"` เข้าฟอร์ม
- **แก้ฟอร์ม "ขอรถโอที" ส่งไม่ได้ (Claude, 2026-09-29)** - dev แจ้งว่ากดส่งแล้วขึ้น "กรุณากรอกข้อมูลให้ครบถ้วน" ทั้งที่กรอกครบ พบ 4 จุด:
  1. ฟอร์มโอทีไม่มีช่องจำนวนแขก (`passengerCount` = 0) แต่ backend บังคับ ≥ 1 → แก้ให้ `passengerCount` หมายถึง**จำนวนแขก** (≥ 0) และบังคับ "แขก + พนักงานที่เลือก ≥ 1" - `VehicleRequests.PassengerCount` เก็บ**จำนวนรวม** (ตรงกับ "จำนวนรวมทั้งหมด" บนฟอร์ม และใช้เทียบที่นั่งตอนจัดรถ; เดิมเก็บ `Math.max` ไม่ตรงกับหน้าจอ) - ฟอร์มตอนแก้ไขหักจำนวนพนักงานออกก่อนใส่ช่องแขก
  2. รายชื่อพนักงานถูกส่งแบบ multipart เป็น `"5,7"` (String ของ array) แต่ backend รับแค่ array → รายชื่อหายเงียบๆ → store ส่งเป็น JSON, backend รับได้ทั้ง array / JSON / ข้อความคั่นจุลภาค และตัดซ้ำ
  3. ฟอร์มโหลดรายชื่อจาก `/api/users` (Admin เท่านั้น) → Supervisor/ผู้ที่ไม่ใช่ Admin ค้นหาชื่อไม่เจอ → เพิ่ม `GET /api/users/directory` (login แล้วใช้ได้, คืนแค่ id/ชื่อ/แผนกของคนที่ใช้งานอยู่) + `usersStore.directory`
  4. migration 018 ลบ `Users.Department` แต่ query คำขอรถยังอ่าน `u.Department` (2 จุด) → เปลี่ยนเป็น join `Departments` - และ migration `019_add_vehicle_request_type.sql` **ยังไม่ได้รันบน dev** (สร้างคำขอจะได้ 500 `Invalid column name 'RequestType'`) → รันแล้ว
  - อัปเดต test ให้ตรงกับโค้ดของ agent ก่อนหน้า (requestType, mock สายรถ/ผู้โดยสาร, routeId) + test ใหม่ของบั๊กข้างบน → backend **164/164** ผ่าน, ทดสอบในเบราว์เซอร์: ส่งคำขอโอทีเลือก Chanitsara Niyomrat ได้ 201 (คำขอทดสอบ #379 อยู่ใน dev)
- **โอทีวันหยุด (ไป-กลับ) กรอกได้แค่เวลาเดียว (Claude, 2026-09-29)** - dev ถาม: ฟอร์มใช้ +1 ชม. เป็นเวลากลับกับโอทีทุกแบบ → ไป-กลับตอนนี้มี "เวลารับ (ไปบริษัท)" + "เวลาส่งกลับ" (วันเดียวกัน, ต้องหลังเวลารับ - ข้อความ `errors.RETURN_BEFORE_DEPART`), เช้า/เย็นยังช่องเดียว +1 ชม. - ช่วงเวลาจริงของไป-กลับทำให้การกันจัดรถชนถูกต้อง
  - พบเพิ่ม: **แก้ไขคำขอรถพังทุกครั้ง** - หน้าคำขอของฉันไม่ส่ง `requestType` (backend บังคับ) และไม่ส่งประเภทให้ฟอร์ม (โอทีเปิดเป็นฟอร์มงานนอก) → แก้แล้ว, ตอนแก้ไขอ่านประเภทโอทีกลับจากจุดรับ-ส่งที่ฟอร์มเขียนไว้ (เดิม hardcode เป็นเย็น)
  - ทดสอบในเบราว์เซอร์: สร้างไป-กลับ 08:00–17:00 (#380), เวลาส่งกลับก่อนเวลารับถูกปฏิเสธ, แก้ไข #380 เป็น 18:00 ได้ รายชื่อผู้โดยสารไม่หาย, เปิดแก้ไข #379 เป็น "เย็น" ถูก
  - ⚠️ ประเภทโอทียังไม่มีคอลัมน์ของตัวเอง (อ่านจากข้อความจุดรับ-ส่ง) - ถ้าต้องกรอง/ทำรายงานตามประเภทโอที ควรเพิ่มคอลัมน์ (รอ dev ตัดสินใจ)
- **รถประจำสาย + คนขับประจำ (Claude, 2026-09-29)** - dev: "ระบบเดิมกำหนดคนขับ ทะเบียนรถในหน้าสายรถ" → dev ยืนยัน: **สายมีได้หลายคัน แต่ละคันมีคนขับประจำ** และ **ให้ระบบแนะนำตอนจัดรถคำขอโอที**
  - migration `020_route_regular_drivers.sql` (รันบน dev แล้ว): `Vehicles.RegularDriverID` (FK Drivers, unique เมื่อไม่ NULL - คนขับ 1 คนประจำได้ 1 คัน) ใช้คู่กับ `Vehicles.RouteID` เดิม
  - API: `POST/PUT /api/routes` รับ `vehicles: [{vehicleId, driverId|null}]` (ไม่ส่ง = ไม่แตะของเดิม; เปลี่ยนบริษัทรถเช่าโดยไม่ส่ง = ล้าง) - รถ/คนขับต้อง active และเป็นของบริษัทเดียวกับสาย, ห้ามซ้ำ, ≤ 20 คัน, บันทึกใน transaction เดียว (รถที่อยู่สายอื่นจะย้ายมา, คนขับที่ประจำคันอื่นจะย้ายมา) - `GET /api/routes` คืน `vehicles` (เบอร์คนขับเฉพาะ Admin), แก้รถแล้วย้ายสายจะล้างคนขับประจำ
  - UI: หน้าสายรถมีคอลัมน์ "รถประจำสาย / คนขับประจำ" + ส่วนเลือกรถ/คนขับใน modal; หน้าจัดรถคำขอโอทีที่ยังไม่จัด → หาสายที่ผู้โดยสารอยู่มากสุด แล้วเลือกให้ (รถเช่า + บริษัท + รถ/คนขับประจำคันแรกที่ว่างทั้งคู่) พร้อมข้อความ 💡 บอกที่มา/ผู้โดยสารหลายสาย/รถประจำสายไม่ว่าง - Admin เปลี่ยนได้
  - backend **171/171** ผ่าน (test ใหม่ 7 ตัว), frontend build ผ่าน - ทดสอบในเบราว์เซอร์ (Admin): สายศรีราชาแสดง 30-1234 / มานะ ขับไว, เปิดจัดรถคำขอโอที #379 → เลือกรถเช่า + มานะ + 30-1234 ให้อัตโนมัติพร้อม 💡 (ปิดโดยไม่ยืนยัน)
- **พนักงานขอรถเองได้ (Claude, 2026-09-29)** - dev: "พนักงานก็สามารถขอรถโอทีเองได้ ไม่ใช่แค่หัวหน้างาน" → agent ก่อนหน้าจำกัดเมนู "จองรถ" และ route `/requests/vehicles` ไว้ที่ Admin/Supervisor (ขัดกับ REQUIREMENTS ที่ Employee ส่งคำขอรถได้) → เปิดให้ทุกคนที่ login (ขอรถงานนอก, ขอรถโอที, คำขอของฉัน) ส่วนแท็บจัดการคำขอ/ผู้โดยสารยังเป็น Admin เหมือนเดิม - backend ไม่ได้จำกัดอยู่แล้ว
  - lint error `daysOfWeek` ใน `ShuttleRoutesPanel.vue` แก้แล้ว - agent ก่อนหน้าเอาตัวเลือกวันเดินรถออก (สาย "วิ่งตามคิวงาน", ส่ง runDays `'1111111'` เสมอ, `RunDays` ไม่ได้ใช้ที่อื่น) จึงลบโค้ดที่ค้างอยู่ - frontend lint 0 error
- **เลือกผู้เดินทางได้เฉพาะแผนกหลัก (Claude, 2026-09-29)** - dev: หัวหน้างานเลือกพนักงานได้แค่ในแผนกหลักของตัวเอง (อยากให้เห็นแค่แผนกย่อย แต่ถ้าหัวหน้าลาจะไม่มีใครขอรถแทนได้) + dev เลือก: **พนักงานทั่วไปใช้ขอบเขตเดียวกัน**
  - แผนกหลัก = แผนกบนสุดของสาย `ParentDepartmentID` + แผนกย่อยทุกชั้นใต้นั้น (`departments/scope.js`, คำนวณใน JS กันวนถ้าข้อมูลแผนกเป็นวง) - Admin เลือกได้ทุกคน, ผู้ใช้ที่ไม่มีแผนกเลือกได้แค่ตัวเอง
  - `GET /api/users/directory` กรองตามขอบเขต + backend ตรวจตอนสร้าง/แก้ไขคำขอ (`PASSENGER_OUT_OF_SCOPE`) - ตอนแก้ไข คนที่อยู่ในคำขอเดิมเก็บไว้ได้ ตรวจเฉพาะคนที่เพิ่มใหม่; ฟอร์มโหลดรายชื่อใหม่ทุกครั้ง (เดิม cache ข้าม login)
  - พบเพิ่ม: หน้าแผนกตั้งแผนกแม่เป็นวงได้ (A→B→A) และ API แผนกส่ง error เป็น `{ error }` ทำให้หน้าเว็บแสดงข้อความผิด → กันวง (`DEPARTMENT_CYCLE`) + เปลี่ยนเป็น `{ errorCode }` (`DEPARTMENT_HAS_CHILDREN`, `DEPARTMENT_IN_USE`)
  - backend **182/182** ผ่าน (test ใหม่ 11 ตัว), frontend build ผ่าน - ทดสอบ API จริงด้วย Admin (เห็น 13 คน, ตั้งแผนกแม่เป็นตัวเองถูกปฏิเสธ) - ⚠️ ยังไม่ได้ทดสอบในเบราว์เซอร์ด้วยบัญชีที่ไม่ใช่ Admin
  - `GET /api/passengers` (สายรถ/จุดจอดของพนักงาน) จำกัดขอบเขตเดียวกันแล้ว - ไม่ใช่ Admin เห็นเฉพาะคนในแผนกหลัก (เดิมเห็นจุดขึ้นรถของทั้งบริษัท) → backend **184/184**
- **ชื่อแท็บหน้าคนขับและรถ (Claude, 2026-09-29)** - dev เลือก: คนขับ | รถ | **ผู้ให้บริการรถ** (เดิม "บริษัทรถเช่า / เรียกรถออนไลน์") | สายรถรับส่ง | ตารางงานคนขับ - แท็บรถยังแสดงรถทุกคัน (บริษัท + รถเช่า)
- **ย้ายแท็บสายรถรับส่งไปเมนูจองรถ (2026-09-29)** - dev: "tab สายรถรับส่ง ... ย้ายไปที่เมนู จองรถดีกว่า" → หน้าคนขับและรถเหลือ คนขับ | รถ | ผู้ให้บริการรถ | ตารางงานคนขับ; เมนูจองรถมีแท็บ "สายรถรับส่ง" (`/requests/vehicles/routes`, Admin เท่านั้น) ถัดจาก "จัดการคำขอรถ" และก่อน "ผู้โดยสาร" - ใช้ `ShuttleRoutesPanel` ตัวเดิม ฟอร์มรถยังเลือกสายได้เหมือนเดิม
- **ย้ายแท็บตารางงานคนขับไปเมนูจองรถ (2026-09-29)** - dev: "ย้าย ตารางงานคนขับ ด้วย" → เมนูจองรถ: ... | จัดการคำขอรถ | **ตารางงานคนขับ** (`/requests/vehicles/driver-schedule`, Admin) | สายรถรับส่ง | ผู้โดยสาร; หน้าคนขับและรถเหลือ คนขับ | รถ | ผู้ให้บริการรถ - ใช้ `DriverScheduleBoard` ตัวเดิม
- **รายละเอียดคำขอรถแบบ modal (2026-09-29)** - dev: "ตอนจัดการคำขอรถ อยากให้มันกดดู Detail เป็น modal ได้" → ปุ่ม "รายละเอียด" ในตารางจัดการคำขอรถ เปิด `VehicleRequestDetailModal`: ผู้ขอ/แผนก/เบอร์/เวลาส่งคำขอ, วันเวลา+รูปแบบการเดินทาง+ประเภทรถ, จุดรับ/ปลายทาง+แผนที่, รายชื่อพนักงาน (พนักงาน N • แขก N), ไฟล์แนบ, รถ/คนขับแบบเต็ม + ผู้จัด/เวลาจัด; ปุ่มในหน้าต่าง: จัดคนขับ/เปลี่ยนคนขับ (เปิด dialog จัดรถเดิม), ยกเลิกคำขอ, ปิด (Esc/คลิกพื้นหลังได้) - ป้าย "รถนอก" ย้ายเข้า i18n (`vehicleBooking.businessTripShort`)
  - dev: "ทำไมมันไม่แสดงชื่อสายรถ" → คำขอโอทีไม่ได้เก็บสายไว้ในคำขอ (สายผูกกับพนักงานแต่ละคน) - modal ดึงข้อมูลผู้โดยสารรถรับส่งมาแสดง: สรุปสายเป็นป้าย 🚌 ชื่อสาย • N คน (เรียงคนมากสุด, ⚠️ นับคนที่ไม่มีสายประจำ) + ใต้ชื่อพนักงานแต่ละคนแสดงสาย • จุดขึ้นรถ
  - dev: "สายรถ/เส้นทาง อยากให้แสดงเป็นชื่อสายรถ แต่ไม่รู้ว่าถ้าเป็นรถนอกจะแสดงอะไร" → Claude เสนอ+ทำ: **รถโอที** แสดงชื่อสาย (หัวข้อ "สายรถ" + ประเภทเที่ยว เช้า/เย็น/วันหยุด อนุมานจากจุดรับ/ปลายทาง) ไม่แสดงกล่องจุดรับ/ปลายทางแล้ว, **รถนอก** หัวข้อ "เส้นทาง" = จุดรับ → ปลายทาง + แผนที่ - ทั้งใน modal และคอลัมน์ในตารางจัดการคำขอรถ (`utils/shuttleRoutes.js`: summarizeShuttleRoutes, otTypeOf)
  - dev: "แขก 0 คน คืออะไร รถโอทีไม่มีแขกอยู่แล้ว" → modal นับ "พนักงาน N • แขก N" เฉพาะรถนอก, รถโอทีแสดงแค่ "(N คน)"
- **ตัวกรองประเภท + มุมมองรวมตามสาย (2026-09-29)** - dev ถาม "ควรแยกหน้าจัดการคำขอรถนอกกับรถโอทีไหม" → Claude แนะนำหน้าเดียว+ตัวกรอง (รถ/คนขับชุดเดียวกัน) dev เห็นด้วย และขอ "แสดงว่าสายนี้ทั้งหมดมีใครขึ้นรถโอทีบ้าง ตอนนี้ต่างคนต่างขอเราก็ไม่รู้"
  - ตัวกรอง ทุกประเภท | รถนอก | รถโอที (ฝั่งหน้าเว็บ) ข้างตัวกรองสถานะ
  - เลือกรถโอที → สลับ รายคำขอ | 🚌 รวมตามสาย (`ShuttleTripGroups`, `groupShuttleTrips` ใน `utils/shuttleRoutes.js`): คำขอที่ยังไม่ยกเลิกตั้งแต่วันนี้ แบ่งรายวัน, 1 การ์ด = เวลาออก + ประเภทเที่ยว + สาย, รวมผู้โดยสารจากทุกคำขอเรียงตามลำดับจุดจอด (พร้อม #คำขอ), ท้ายการ์ดสรุปแต่ละคำขอ: ผู้ขอ • คนขับ/ทะเบียน • สถานะ + ปุ่มจัด/เปลี่ยนคนขับ; คนไม่มีสายประจำรวมเป็นการ์ด ⚠️ แยก
  - ยังจัดรถทีละคำขอ (ยังไม่มีจัดทั้งเที่ยวในครั้งเดียว); `otTypeOf` ในฟอร์มย้ายไปใช้ตัวเดียวกันใน utils
  - dev: "เป็น card แล้วดูยาก ทำแบบไหนดี วันที่ด้วยมั้ย" → dev เลือก **ใบรายชื่อ**: ดูทีละวัน (◀ วันที่ ▶ + วันนี้ + ทางลัดวันที่มีรถโอที พร้อมจำนวนคน, เริ่มที่วันแรกที่มีคำขอตั้งแต่วันนี้) → 1 ตาราง = 1 รอบ (ประเภทเที่ยว + เวลา) → แถวหัวสาย (จำนวนคน + คนขับ ✅/ยังไม่จัด/จัดแล้วบางคำขอ + ปุ่มจัด/เปลี่ยนต่อคำขอ) + แถวผู้โดยสาร จุดขึ้นรถ | ชื่อ | แผนก | #คำขอ
  - dev: "กลัวว่าถ้าคนเยอะจะแสดงผลไม่โอเค ทำเป็นรายการแล้วกด modal ดูน่าจะง่ายกว่า" → รายการเที่ยวของวัน 1 แถว = รอบ + สาย: เวลา | รอบ | สายรถ (จากกี่คำขอ) | จำนวนคน | คนขับ (✅/ยังไม่จัด/จัดแล้วบางคำขอ) | ดูรายชื่อ + แถวรวมทั้งวัน; กดแถว/ปุ่ม → `ShuttleTripModal` ใบรายชื่อ (ลำดับ | จุดขึ้นรถ | ชื่อ | แผนก | #คำขอ, หัวตารางติดบนเวลาเลื่อน) + คำขอในเที่ยวนี้พร้อมปุ่มจัด/เปลี่ยนคนขับ (dialog จัดรถ/รายละเอียดซ้อนบน modal ได้ จัดเสร็จ modal อัปเดตเอง); `tripAssignment` ใน utils
- **แถบตัวกรองหน้าจัดการคำขอรถ (2026-09-29)** - dev: ปุ่ม ทุกประเภท/รถนอก/รถโอที/รอดำเนินการ/.../ทั้งหมด เรียงติดกันแล้วเข้าใจยาก → รวมเป็นกล่องเดียว แต่ละกลุ่มมีหัวข้อ: **ประเภทคำขอ** (ทั้งหมด | รถนอก | รถโอที) · **สถานะ** (รอดำเนินการ | จัดรถแล้ว | ยกเลิกแล้ว | ทั้งหมด) · **การแสดงผล** (รายคำขอ | รวมตามสาย - เฉพาะรถโอที, dev ขอเอาไอคอนรถออก); มุมมองรวมตามสาย กลุ่มสถานะเปลี่ยนเป็นข้อความ "แสดงทุกคำขอที่ยังไม่ยกเลิก" แทนการซ่อน
- **ผู้โดยสารรถรับส่ง: แบ่งหน้า (2026-09-29)** - dev: "ทำเผื่อมีหลายรายการ แสดงไม่เกิน 10 รายการ และทำ pagination" → หน้าละ 10 คน (`PaginationBar`) + ช่องค้นหา (ชื่อ/แผนก/จุดขึ้นรถ) + กรองสายรถ + "N จาก M คน", เรียงตามสายแล้วชื่อ; แก้หัวคอลัมน์ที่ขึ้นเป็นคีย์ดิบ "FLEET.PICKUPSTOP" (key ไม่มีอยู่จริง `t() || ...` ไม่ช่วยเพราะ t คืนคีย์) → ใช้ `vehicleBooking.pickupStop`
- **ตรวจความครบถ้วน/ถูกต้องก่อน M7 (2026-09-29)** - dev: "ก่อนจะไปเรื่องแจ้งเตือน อยากให้ function ครอบคลุมและถูกต้องก่อน" → Claude ตรวจระบบขอรถเทียบ REQUIREMENTS เจอ 2 ปัญหาหลัก dev ให้แก้ตามที่เสนอ:
  - **โอทีเที่ยวเดียวกันใช้รถร่วมกันได้** (REQUIREMENTS กฎรถ 15): เดิม `assertFree` กันคนขับ/รถซ้อนเวลาทุกกรณี → จัดคันเดียวให้คำขอโอทีหลายใบของเที่ยวเดียวกันไม่ได้ - ตอนนี้ยกเว้นคำขอ Shuttle ที่ DepartTime/ReturnTime/PickupLocation/Destination ตรงกันเป๊ะ (`sameShuttleTripClause`, ใช้ทั้งตอนจัดรถ, แก้เวลา และ `listAssignments` ที่คำนวณ isBusy); `POST /api/vehicle-requests/assign-trip` จัดทั้งเที่ยวใน transaction เดียว (`assignTrip`/`assignLocked`) - หน้าเว็บ: ปุ่ม "จัดรถทั้งเที่ยว" ในใบรายชื่อ, dialog จัดรถโหมดทั้งเที่ยว (นับที่นั่งรวม, แนะนำรถจากผู้โดยสารรวม), ⚠️ คำขอที่มีคนสายอื่นด้วย
  - **กันผู้โดยสารซ้ำ** (กฎรถ 16): `assertPassengersFree` ตอนสร้าง/แก้ไข → 409 `PASSENGER_DOUBLE_BOOKED` + details (ชื่อ/เลขคำขอ) - `ApiError` ฝั่งหน้าเว็บเก็บ `details` แล้ว ฟอร์มแสดงชื่อ+เลขคำขอ; create ใช้ `lockFleetAssignments` ด้วยเพื่อกันสร้างพร้อมกัน
  - **ล็อกประเภทคำขอ**: PUT เปลี่ยน requestType ไม่ได้ (กันเปลี่ยนเป็นโอทีเพื่อเลี่ยงบังคับแนบไฟล์)
  - เอกสาร: REQUIREMENTS กฎรถ 8/11 ปรับตามจริง, เพิ่มกฎ 14-16 (โอที/ใช้รถร่วม/ชื่อซ้ำ), เพิ่ม role Supervisor (สิทธิ์เท่า Employee)
  - Backend **206/206** (เพิ่ม integration test กับ DB จริง: ใช้รถร่วมเที่ยวเดียวกัน, ยังกันต่างเวลา/ต่างประเภทเที่ยว/รถนอก, จัดทั้งเที่ยว + ปฏิเสธคนละเที่ยว, ผู้โดยสารซ้ำ), lint ผ่าน; ทดสอบในเบราว์เซอร์: สร้างคำขอทับ #379 → 409 PASSENGER_DOUBLE_BOOKED พร้อมชื่อ - ยังไม่ได้ลองปุ่มจัดรถทั้งเที่ยวในเบราว์เซอร์ (ข้อมูล dev มีโอทีเที่ยวละคำขอเดียว)
  - ยังค้าง (ไม่เร่ง): หน้าจัดการคำขอรถโหลดคำขอทั้งหมดทุกครั้ง - ควรจำกัดช่วงวันที่เมื่อข้อมูลเยอะ
- **ลบคนขับ/รถ/ผู้ให้บริการ (2026-09-29)** - dev: "ลบแบบ soft delete ไม่ได้หรอ ทำไมมีแต่ปิดใช้งาน" → อธิบายว่าปิดใช้งาน = soft delete อยู่แล้ว; dev: "ลบได้ ถ้าไม่ส่งผลกับรายการที่ผูกอยู่ ... ถ้าลบ history จะมีปัญหา" → REQUIREMENTS กฎรถ 17: `fleet/deletion.js` `deleteFleetItem` ลบจริงใน transaction เฉพาะเมื่อไม่มีอะไรผูก (คำขอรถทุกสถานะ, คนขับประจำรถ, รถในสาย, คนขับ/รถ/สายของผู้ให้บริการ) ไม่งั้น 409 `FLEET_ITEM_IN_USE` + details (usage) + กัน race ด้วย FK 547; `DELETE /api/drivers/:id` (เดิมคือปิดใช้งาน หน้าเว็บไม่ได้ใช้) เปลี่ยนเป็นลบจริงแบบเช็ค + เพิ่ม `DELETE /api/vehicles/:id`, `/api/providers/:id`; หน้าเว็บ 3 แท็บมีปุ่ม "ลบ" (สีจาง) ข้างปิดใช้งาน ลบไม่ได้ขึ้นเหตุผล เช่น "ลบ มานะ ขับไว ไม่ได้ เพราะเคยถูกจัดให้คำขอรถ 2 รายการ, เป็นคนขับประจำรถ 30-1234 (ศรีราชา) - ใช้ปิดใช้งานแทน" (`utils/fleetUsage.js`) - backend **212/212** (+integration กับ DB จริง), ทดสอบในเบราว์เซอร์แล้ว
  - dev: "ไม่ใช่แค่คนขับ รถ ผู้ให้บริการ อุปกรณ์ด้วย" → รถ/ผู้ให้บริการมีปุ่มลบแล้วในรอบเดียวกัน; **อุปกรณ์ = tablet ประจำห้อง (1:1 กับห้อง ไม่มีตารางแยก)** จึงทำที่ห้อง: migration **023** `Rooms.IsActive`; `PUT /api/rooms/:id/active` (ปิดไม่ได้ถ้ายังมีการจองที่ยังไม่จบ → 409 `ROOM_HAS_UPCOMING_BOOKINGS` + จำนวน); `DELETE /api/rooms/:id` ลบจริงเฉพาะห้องที่ไม่เคยมีการจอง ไม่งั้น 409 `ROOM_IN_USE` + จำนวน (**บั๊กเดิม: ลบห้องที่มีการจองชน FK กลายเป็น error 500**); ห้องที่ปิด: ไม่แสดงในรายการห้อง/ปฏิทิน/หน้าอุปกรณ์, จองใหม่ → 409 `ROOM_INACTIVE`, จอ tablet token ใช้ไม่ได้ (404), `GET /rooms?includeInactive=true` เฉพาะ Admin; หน้าจัดการห้อง: คอลัมน์สถานะ, ติ๊กแสดงที่ปิดใช้งาน, ปิด/เปิดใช้งาน, ลบ (สีจาง) พร้อมเหตุผล - REQUIREMENTS กฎห้องข้อ 9; backend **217/217**; ทดสอบในเบราว์เซอร์: ลบ Meeting Room 1 → "มีประวัติการจอง 1 รายการ - ใช้ปิดใช้งานแทน", ปิดใช้งานได้ (แล้วเปิดกลับคืนสถานะเดิม)
- **อุปกรณ์เป็นรายการของตัวเอง (2026-09-29)** - dev: "จัดการอุปกรณ์ยังเพิ่ม ลบไม่ได้เลย ไม่มี function นี้" → เดิมหน้าอุปกรณ์ดึงจากห้อง (token/LastSeenAt อยู่ใน Rooms) → migration **024** ตาราง `Devices` (Name, RoomID NULL + FK ON DELETE SET NULL, Token unique, LastSeenAt) ย้ายจอเดิมห้องละ 1 จอ**ใช้ token เดิม** (tablet ที่ติดตั้งแล้วไม่ต้องตั้งใหม่ - ทดสอบลิงก์เดิม Meeting Room 1 ได้ 200) แล้ว drop `Rooms.TabletToken/LastSeenAt`; `tablet/repository.js` + `GET/POST/PUT/DELETE /api/tablet/devices`, `POST /devices/:id/token/regenerate`; จอที่ไม่มีห้อง/ห้องปิด → 409 `DEVICE_NOT_ASSIGNED` (ยังนับว่าออนไลน์); หน้าอุปกรณ์: เพิ่ม/แก้ (ชื่อ+ห้อง), คัดลอกลิงก์, สร้าง token ใหม่, ลบ; หน้าห้องเอาคอลัมน์ token/ปุ่มสร้าง token ออก - backend **227/227** (+`tablet.routes.test.js`), ทดสอบในเบราว์เซอร์: เพิ่มจอสำรองไม่ผูกห้อง → จอได้ DEVICE_NOT_ASSIGNED → ลบ → ลิงก์ 404
- **ปฏิทินห้องบนจอ tablet (2026-09-29)** - dev: "การแสดงผลใน tablet กดดูรายการแบบ calendar ได้ด้วย เป็นการดูเพื่อตรวจสอบหน้าห้อง" → ปุ่ม "📅 ดูปฏิทินห้อง" บนหน้าสถานะ → `components/tablet/TabletCalendar.vue` (ธีมมืดเดียวกับจอ): ตารางเดือนเริ่มวันจันทร์ ปุ่มใหญ่สำหรับจอสัมผัส ◀ ▶ วันนี้, ช่องวันมีป้าย "N ประชุม", วันนี้มีกรอบเขียว, แตะวันแล้วด้านขวาแสดงรายการประชุมวันนั้น (ประชุมข้ามวันแสดงทุกวัน, เวลาที่เลยวันขึ้น …) หรือ "ว่างทั้งวัน", แตะวันของเดือนก่อน/ถัดไปเลื่อนเดือนให้, **ไม่แตะจอ 60 วินาทีกลับหน้าสถานะเอง**, พอดีจอไม่ต้องเลื่อน - API public `GET /api/tablet/display/:token/calendar?month=YYYY-MM` (ย้อน/ล่วงหน้าไม่เกิน 12 เดือน, จอไม่ผูกห้อง 409) - backend **233/233**; ทดสอบในเบราว์เซอร์ด้วยการจองทดสอบ #58 (ยกเลิกแล้ว)
  - dev: "แสดงแค่ของเดือนนั้นๆ พอ เดือนถัดไปแสดงแค่วันที่คาบเกี่ยวกับสัปดาห์ และแสดงรายการที่เคยจองไม่ว่าสถานะอะไรเหมือนหน้า home" → ตารางมีเฉพาะสัปดาห์ของเดือน (4-6 แถว) วันของเดือนก่อน/ถัดไปในสัปดาห์คาบเกี่ยวเป็นช่องจาง กดไม่ได้ ไม่มีข้อมูล; API ดึงเฉพาะเดือนนั้น `includeReleased` + ส่ง `status`; แสดงสถานะแบบหน้าแรก (ยังไม่ถึง/กำลังใช้/จบแล้ว/ไม่ได้ใช้-ปล่อยห้องอัตโนมัติ ขีดฆ่า) ป้ายในช่องนับเฉพาะที่ไม่ถูกปล่อย + "ปล่อยห้อง N" จางๆ; ไม่รวมที่ยกเลิก (หน้าแรกก็ไม่แสดง) - ทดสอบกับการจอง 25/09 (AutoReleased) ในเบราว์เซอร์แล้ว
  - dev: "ออกแบบยังไงให้คนใช้รู้ว่ากดดูได้ และอยากให้จอ tablet หน้าห้องแสดงเป็นภาษาอังกฤษเท่านั้น" → `components/tablet/useTabletI18n.js` (i18n scope เฉพาะ component, locale en ตายตัว ไม่แตะภาษาของแอป/localStorage - เบราว์เซอร์ที่ตั้งภาษาไทยไว้ จอก็ยังเป็นอังกฤษ, วันที่/เวลา en-GB 24 ชม.) ใช้ทั้ง TabletDisplayView/TabletCalendar; บอกว่ากดได้: ปุ่มหน้าสถานะเป็นการ์ดขาวเด่น 📅 "View room calendar / Tap to see bookings on other days", ในปฏิทินมีคำแนะนำ 👆 "Tap a date to see its meetings", ช่องวันมีขอบ + ยุบเมื่อกด, ป้ายนับแบบพหูพจน์อังกฤษ (1 meeting / 2 meetings) - ตรวจในเบราว์เซอร์แล้ว
  - dev: "ใช้คำว่า Available ดีกว่า Free มั้ย และอยากให้เป็นธีม minimal business ทางการ" → สถานะ **Available / Starting soon / In use** (เดิม Free / Starting soon / Occupied); จอ tablet + ปฏิทินเปลี่ยนเป็นธีมสว่าง (พื้น slate-50, การ์ดขาวเส้นบาง, ตัวหนังสือเข้ม, หัวข้อเล็กตัวพิมพ์ใหญ่เว้นระยะ) - สีสถานะใช้แค่แถบซ้าย+ตัวอักษร ไม่ถมทั้งกล่อง; หัวจอ: MEETING ROOM + ชื่อห้อง / เวลาใหญ่ + วันที่เต็ม; ซ้าย ROOM STATUS + ประชุมที่กำลังดำเนิน/ถัดไป, ขวา TODAY'S SCHEDULE (จบแล้วจาง กำลังประชุมตัวหนา) + ปุ่มดำ "View room calendar ›"; ปฏิทินแบบตารางเส้นบาง วันที่เลือกพื้นดำ วันนี้ขีดเส้นใต้ - ตรวจในเบราว์เซอร์ด้วยการจองทดสอบ #60 (ยกเลิกแล้ว)
  - dev: "อยากได้ style แบบจอของรถ Tesla" → พื้นเทาอ่อน (neutral-100), การ์ดขาวมุมโค้งมาก (rounded-3xl) เงาบางไม่มีเส้นขอบ, ตัวอักษรใหญ่น้ำหนักเบา (สถานะ text-8xl extralight, นาฬิกา extralight), สีน้อยที่สุด: สถานะเป็นจุดสีเล็ก, สีหลักฟ้า Tesla #3e6ae1 (ปุ่ม View room calendar ทรงแคปซูล, แถบความคืบหน้าประชุม, จุดวันนี้ในปฏิทิน); บรรทัดรองใต้สถานะ: Available until HH:MM / Available for the rest of the day / Next meeting starts in N min / Ends in N min; ประชุมที่กำลังดำเนินมีแถบความคืบหน้า; ประชุมถัดไปอยู่ในกล่องเทาโค้ง; ปฏิทินช่องวันโค้งเทาอ่อนไม่มีเส้นตาราง วันที่เลือกดำ, ปุ่มกลม ‹ › Today, ปุ่ม ← Back ดำแคปซูล - ตรวจในเบราว์เซอร์ด้วยการจองทดสอบ #61 #62 (ยกเลิกแล้ว)
  - dev: "สี status มันเล็กไป ทุก status" → คำสถานะเป็นสี (เขียว/เหลืองอำพัน/แดง) + จุดสีใหญ่ (40px) หน้าคำ + แถบสีหนาด้านบนการ์ด + พื้นการ์ดไล่สีอ่อนจากบนลงล่าง (เปลี่ยนสีแบบนุ่มนวล) - ตรวจครบ 3 สถานะในเบราว์เซอร์ (In use #63, Starting soon #64, Available - การจองทดสอบยกเลิกแล้วทั้งหมด)
  - dev: "ไม่อยากได้สีขอบ มันดู AI ทำเกิน" → เอาแถบสีด้านบนการ์ดและพื้นไล่สีออก เหลือคำสถานะเป็นสี + จุดสีใหญ่บนการ์ดขาว
  - dev: "gradient เมื่อกี้สวยแล้ว แต่ไม่อยากได้สีขอบบน" → ใส่พื้นไล่สีอ่อนกลับ ไม่มีแถบสีขอบบน
  - dev (2026-09-30): "กด View room calendar แล้วให้มีเวลาแค่ 5 นาที ถ้าไม่กด Back ให้กลับหน้า status อัตโนมัติ" → เปลี่ยนจาก "ไม่แตะจอ 60 วินาที" เป็นนับ 5 นาทีจากตอนเปิด (แตะจอไม่รีเซ็ต) + แสดง "Returning to room status in 4:59" ข้างปุ่ม Back
  - dev (2026-09-30): "แสดงผ่าน iPad ต้องเป็นแนวนอน" + "อยากให้ responsive ตามขนาด tablet" (dev ปฏิเสธการขึ้นหน้าบอกให้หมุนจอ) → จอสถานะ/ปฏิทินพอดีความสูงจอเสมอ (`h-dvh` ไม่เลื่อนทั้งหน้า, รายการยาวเลื่อนในกล่อง), ขนาดตัวอักษร/ระยะใช้ `clamp()` ตามความกว้าง/สูงจอ (สถานะ min(6.5vw,11vh) ให้ "Starting soon" อยู่บรรทัดเดียว), แนวนอน (`landscape:`) = 2 คอลัมน์ 3:2 / ปฏิทิน 2:1 แถวยืดเต็มความสูง, แนวตั้ง (`portrait:`) = เรียงลง สถานะบน-ตารางล่าง / ปฏิทินบน-รายการล่าง; จุดวันนี้ย้ายไปมุมขวาบนช่อง (เดิมทับข้อความจำนวนประชุมบนจอเตี้ย) - ตรวจด้วย iframe จำลองขนาด 1024×600, 1180×820 (iPad Air/10th), 1366×1024 (iPad Pro 12.9"), 820×1180 แนวตั้ง ทั้งหน้าสถานะและปฏิทิน ไม่มีการเลื่อนหน้า; การจองทดสอบ #65–#68 ยกเลิกแล้ว
  - dev (2026-09-30): "อยากได้แท็บเล็ต Samsung Galaxy Tab A11+ เป็นหลัก แสดงไม่ตัด" → อุปกรณ์หลัก = Galaxy Tab A11+ (11", 1920×1200 → Chrome มองเห็น ~1280×800 CSS px แนวนอน; เปิดใน Chrome ปกติที่มีแถบที่อยู่+แถบระบบ ~1280×672) - เลิกตัดข้อความด้วย … บนจอ tablet (ชื่อห้อง, ประชุมที่กำลังดำเนิน, ประชุมถัดไป, ตารางวันนี้) ให้ขึ้นบรรทัดใหม่แทน; ทดสอบด้วยชื่อประชุมยาวทั้งไทย/อังกฤษ 5 รายการ (#69–#73 ยกเลิกแล้ว) ที่ 1280×800 และ 1280×672 ทั้งหน้าสถานะ (In use) และปฏิทิน - พอดีจอ ไม่ตัดข้อความ รายการของวันที่มีหลายประชุมเลื่อนในกล่อง
  - dev: "Today's schedule ถ้ารายการเยอะกว่าช่อง ไม่อยากให้ช่องยาวลงมา เสียการแสดงผล" → บั๊ก: แถวของ grid เป็น auto ทำให้การ์ดยืดตามรายการ (ล้นจอแล้วถูกซ่อน) → `landscape:grid-rows-[minmax(0,1fr)]` ทั้งหน้าสถานะและปฏิทิน การ์ดสูงคงที่ รายการเลื่อนในกล่อง; ซ่อนแถบเลื่อน + ขอบล่างจาง (mask) บอกว่ามีต่อ; เลื่อนให้ประชุมที่ยังไม่จบรายการแรกขึ้นบนสุดเองทุกครั้งที่ข้อมูลอัปเดต (เว้นถ้ามีคนเพิ่งเลื่อนดูภายใน 30 วินาที) - ทดสอบ 14 รายการที่ 1280×672 (#74–#87 ยกเลิกแล้ว): หน้าไม่ยืด ไม่มีแถบเลื่อน; การเลื่อนอัตโนมัติยังไม่ได้เห็นจริง (ต้องรอให้ประชุมแรกจบ)
- **หน้าจัดการการจองห้อง (Admin) (2026-09-30)** - dev: "admin ไม่ทราบว่าใครจองห้องเมื่อไหร่ สถานะเป็นยังไง" → แท็บ "จัดการการจองห้อง" ในเมนูจองห้องประชุม (`/bookings/rooms/manage`, Admin, `ManageRoomBookingsView.vue`): ตาราง วันเวลา | ห้อง | หัวข้อ (+รายสัปดาห์) | ผู้จอง (ชื่อ/แผนก/เบอร์) | สถานะ (+เวลาเช็คอิน) | จองเมื่อ (+เวลายกเลิกจาก UpdatedAt) | ยกเลิก (เฉพาะที่ยังไม่จบ, ครั้งเดียว); กรองช่วงวันที่ (ทางลัด + กำหนดเอง) จาก API แล้วกรองห้อง/สถานะ (มีจำนวนแต่ละสถานะ)/ค้นหา ฝั่งหน้าเว็บ, หน้าละ 10; backend `GET /api/bookings` (Admin) เพิ่มข้อมูลผู้จอง + createdAt/updatedAt, กรอง roomId/status, จำกัดช่วง 400 วัน → backend **238/238**; ตรวจในเบราว์เซอร์ (30 วันย้อนหลัง = 30 รายการ) - หมายเหตุ: ยังไม่รู้ว่า "ใครเป็นคนยกเลิก" (ผู้จองหรือ Admin) จนกว่าจะมี audit log ใน M9
- **เลขที่เอกสารคำขอรถ (2026-09-30)** - dev: "รหัสคำขอรถมาจากไหน" → อธิบายว่าเป็น IDENTITY ของ SQL Server (กระโดดได้ เพราะ test/insert ที่ล้มเหลว/restart) → dev ให้ทำเลขอ่านง่าย: migration **025** ตาราง `DocumentSequences` + `VehicleRequests.RequestNo` (unique) รูปแบบ `VR-YYYY-NNNN` รันใหม่ทุกปี (เวลาไทย) ออกใน transaction เดียวกับการสร้างคำขอ → ไม่มีช่องว่าง; คำขอเดิม 7 รายการได้เลขย้อนหลัง VR-2026-0001…0007 ตามลำดับเวลาที่ส่ง; API ส่ง `requestNo` (+ ใน details ของ PASSENGER_DOUBLE_BOOKED); หน้าเว็บแสดงแทน #id ใน: หัว modal รายละเอียด, ตารางจัดการคำขอ (เหนือชื่อผู้ขอ), คำขอของฉัน, ใบรายชื่อ, dialog จัดรถทั้งเที่ยว, ข้อความชื่อผู้โดยสารซ้ำ; integration test: เลขเรียงต่อกัน + คำขอที่ถูกปฏิเสธไม่กินเลข + afterAll คืนลำดับที่ test ใช้ (test รันกับ DB dev) - backend **240/240**, ตรวจในเบราว์เซอร์แล้ว
- **ตัด LINE ออก แจ้งเตือนทางอีเมลอย่างเดียว (2026-09-30)** - dev: "จะไม่ใช้แจ้งเตือนผ่าน LINE อยากให้แจ้งเตือนผ่าน mail อย่างเดียว" → อัปเดต REQUIREMENTS (ขอบเขต, กฎระบบข้อ 4, NFR offline/แจ้งเตือน), ARCHITECTURE, PLAN M7; ลบ `LINE_NOTIFY_TOKEN` ออกจาก `.env.example` และ `config/env.js` (ยังไม่เคยมีโค้ดใช้) - ระบบไม่ต้องใช้อินเทอร์เน็ตขาออกแล้ว
- **เริ่ม M7: ตั้งค่า SMTP + แม่แบบอีเมล (2026-09-30)**
  - SMTP: เพิ่ม `SMTP_SECURE/SMTP_USER/SMTP_PASSWORD` + `APP_BASE_URL` (ลิงก์ในอีเมล); เซิร์ฟเวอร์เมลบริษัทใช้ใบรับรองค่าเริ่มต้นแบบ self-signed (CN `www.mail.org` ไม่ตรง host) → **pin ใบรับรอง** แทนการปิดตรวจ: `SMTP_CA_FILE` (root cert เก็บที่ `backend/certs/` ซึ่ง gitignore) + `SMTP_TLS_FINGERPRINT` (SHA-256 ของใบเซิร์ฟเวอร์ ใช้แทนการเทียบชื่อ host) ใน `modules/notifications/mailer.js`, บังคับ STARTTLS บน 587 - ค่าจริงอยู่ใน `backend/.env` เท่านั้น; ทดสอบ: เชื่อมต่อ/เข้ารหัส/login ผ่าน, ส่งอีเมลทดสอบ 1 ฉบับถึงผู้รับที่ dev ให้ (เซิร์ฟเวอร์ตอบ 250 queued) - แนะนำให้ IT ติดตั้งใบรับรองจริงระยะยาว (เปลี่ยนใบเมื่อไรต้องอัปเดต fingerprint)
  - dev: "อยากได้ form template ในการส่งทุกการส่ง" → `notifications/layout.js` แม่แบบกลาง (HTML แบบตาราง inline style รองรับ Outlook + ฉบับข้อความล้วน, escape ข้อมูลผู้ใช้): หัวชื่อระบบ → ป้ายประเภท (สีตามเหตุการณ์) → หัวเรื่อง → คำทักทาย/ข้อความ → กล่องรายละเอียด → ปุ่มเปิดในระบบ → หมายเหตุ → ท้าย "อีเมลอัตโนมัติ อย่าตอบกลับ"; `notifications/templates.js` 8 เหตุการณ์: จองห้องสำเร็จ, ยกเลิกการจองห้อง (ตัวเอง/Admin), ปล่อยห้องอัตโนมัติ, ใช้ห้องเกินเวลา (ถึงเจ้าของปัจจุบัน+ผู้จองถัดไป), ส่งคำขอรถแล้ว (ผู้ขอ), คำขอรถใหม่ (Admin), จัดรถแล้ว, ยกเลิกคำขอรถ - วันที่เวลาไทย DD/MM/YYYY 24 ชม.; test 6 ข้อ → backend **246/246**; ดูตัวอย่างในเบราว์เซอร์แล้ว - **ยังไม่ได้ต่อเข้ากับเหตุการณ์จริง** (รอ dev ยืนยันรายการเหตุการณ์/ผู้รับ)
  - dev: "อีเมลจองรถใช้ภาษาไทย ส่วนอีเมลห้องประชุมใช้ภาษาอังกฤษ" → `renderEmail({ lang })` หัว/ท้าย/วงเล็บหัวเรื่องเปลี่ยนตามภาษา: ห้องประชุม 4 ฉบับเป็นอังกฤษทั้งหมด (`[Room & Vehicle Booking] Room booked: …`, Dear …), จองรถ 4 ฉบับเป็นไทย (`[ระบบจองห้องประชุมและรถ] …`) - test เพิ่ม 1 ข้อ → backend **247/247**
  - dev: "ส่งจาก booking@example.com ไปหาทุกคนที่มีสิทธิ์ admin" (ผู้ส่งตั้งใน .env แล้ว) → **ต่ออีเมลเข้าเหตุการณ์จริง** `notifications/service.js` (ส่งเบื้องหลังหลังตอบ API, error แค่ log ไม่กระทบการจอง/จัดรถ, ปิดเองตอน NODE_ENV=test/ยังไม่ตั้ง SMTP): จองห้องสำเร็จ (POST /bookings), ยกเลิกการจองห้อง (DELETE - byAdmin เมื่อ Admin ยกเลิกของคนอื่น), ปล่อยห้องอัตโนมัติ (job autoRelease), ส่งคำขอรถ (ถึงผู้ขอ + **Admin ทุกคนที่เปิดใช้งานและมีอีเมล**), จัดรถ/จัดทั้งเที่ยว (ถึงผู้ขอ), ยกเลิกคำขอรถ (ถึงผู้ขอ) - **ยังไม่ทำ "ใช้ห้องเกินเวลา"**: ระบบไม่มีทางรู้ว่ายังมีคนอยู่ในห้องหลังเวลาจบ (ไม่มี check-out/เซนเซอร์) ต้องถาม dev ว่าจะนับจากอะไร
  - กันส่งถึงเพื่อนร่วมงานตอนพัฒนา: `MAIL_REDIRECT_TO` (dev .env = อีเมลของ dev) ส่งทุกฉบับเข้ากล่องเดียว หัวเรื่อง `[DEV → ผู้รับจริง]` - **production ต้องเว้นว่าง**; test ยืนยัน NODE_ENV=test → test ไม่ส่งอีเมลจริง → backend **248/248**
  - dev: "template ดูไม่ business และ font เล็ก ใช้ font business" → เปลี่ยนเป็นแบบเอกสารทางการ: แถบหัวสีกรมท่า (#1e293b) ชื่อระบบตัวขาว, ประเภท (ตัวพิมพ์ใหญ่สีตามสถานะ) + หัวเรื่อง 24px มีเส้นสีซ้าย, เนื้อความ 16px, ตารางรายละเอียดมีเส้นขอบ คอลัมน์หัวข้อพื้นเทาตัวหนา, ปุ่มสี่เหลี่ยมกรมท่า, เส้นคั่นก่อนท้ายอีเมล, กรอบ 640px มุมเหลี่ยม; ฟอนต์ธุรกิจที่มีในเครื่อง Segoe UI / Leelawadee UI / Tahoma / Arial (เว็บฟอนต์ใช้ในอีเมลไม่ได้ - Outlook ตัดทิ้ง) - ตรวจตัวอย่างในเบราว์เซอร์แล้ว
  - dev: "ยังไม่สวย layout ไม่ตอบโจทย์ ขนาด font ไม่เข้ากับ business" → แม่แบบรอบ 3 (`layout.js` รองรับ `summary`/`status`/`sections`): เส้นแดงแบรนด์บาง, หัว ชื่อระบบ(ซ้าย)·ประเภทเอกสาร(ขวา), หัวเรื่อง 20/เนื้อความ 14/หัวข้อ 13/ท้าย 12, แถบสรุป (เลขที่·วันเวลา·สถานะ), รายละเอียดแยกหมวด (เช่น รถและคนขับ / รายละเอียดการเดินทาง / ผู้ขอ), ปุ่มกรมท่า, หมายเหตุกล่องเทา, ท้ายอีเมลแถบเทา - test 248 ผ่าน, ดูตัวอย่างในเบราว์เซอร์แล้ว **ยังไม่ได้ส่งตัวอย่างจริง/รอ dev ยืนยันดีไซน์** - ⚠️ ระหว่างนั้นมีการแก้ `layout.js` จากที่อื่น (อาจเป็นอีก console) ต้องตรวจไฟล์ก่อนทำต่อ
  - **งานค้าง ณ 2026-10-02 (ยังไม่ commit):** เลขที่เอกสาร VR (migration 025), ตัด LINE, SMTP + pin ใบรับรอง + MAIL_REDIRECT_TO, แม่แบบอีเมล + ต่อเข้าเหตุการณ์จริง - ถัดไป: ยืนยันดีไซน์อีเมล → commit → เรื่อง 'ใช้ห้องเกินเวลา' (รอ dev เลือกวิธี) → Admin 2 คนที่ไม่มีอีเมล
- **M8 รายงาน + Excel (2026-10-05)** - dev: "เอาทั้ง 4 รายงาน" → `modules/reports/` (repository = ดึงข้อมูลดิบ, service = รวม/นับแบบฟังก์ชันล้วน, excel = exceljs, routes = Admin) `GET /api/reports/:type` + `/export`:
  1. **การใช้ห้องประชุม** ต่อห้อง (รวมห้องปิดใช้งานที่มีการจอง) และต่อแผนกผู้จอง: จำนวน, ชั่วโมงที่ใช้ (ไม่นับยกเลิก/ปล่อยห้อง), เช็คอิน, ปล่อยอัตโนมัติ, ยกเลิก, อัตราเช็คอิน = เช็คอิน/(เช็คอิน+ปล่อย)
  2. **คำขอรถ** สรุปตามประเภท×สถานะ, ตามแผนก, รายการทั้งหมด (เลขที่, เวลา, ผู้ขอ, เส้นทาง, คนขับ, ทะเบียน, ผู้ให้บริการ)
  3. **การใช้รถและคนขับ** (เฉพาะที่จัดแล้ว) ตามแบบการจัดรถ/คนขับ/รถ: จำนวนเที่ยว ชั่วโมง คำขอ - โอทีหลายคำขอที่ใช้รถคันเดียวกันเที่ยวเดียวกันนับ 1 เที่ยว
  4. **รถโอทีตามสาย** สรุปต่อสาย + รายวัน (วันตามเวลาไทย): เที่ยว คน คำขอ รอบ - หมายเหตุ: ใช้สายประจำ*ปัจจุบัน*ของพนักงาน (ไม่มีประวัติย้ายสาย)
  - หน้าเว็บ จัดการระบบ > **รายงาน** (`ReportsView.vue`): เลือกรายงาน, ช่วงวันที่ (เดือนนี้/เดือนที่แล้ว/30 วัน/กำหนดเอง), ตารางตามชนิดคอลัมน์, ตารางยาวแสดง 50 แถว + แสดงทั้งหมด, ปุ่มส่งออก Excel (sheet สรุป ช่วงวันที่/เวลาออก + 1 ตาราง = 1 sheet, หัวตารางกรมท่า, freeze แถวหัว, ตัวกรอง)
  - test 14 ข้อ (การนับทุกรายงาน, สิทธิ์, ช่วงวันที่, Excel เปิดได้และมี sheet ครบ) → backend **265/265**; ทดสอบกับ DB dev: ทั้ง 4 รายงาน + ส่งออก Excel ได้
- **อนุมัติรถนอกโดยหัวหน้า + แบบฟอร์ม W-HR-009 (PDF) (2026-10-05)** - dev: HR ตกลงว่าถ้าระบบ export PDF ตามตัวอย่าง `docs/ขอรถนอก.pdf` ได้ ไม่ต้องแนบไฟล์แล้ว แต่ต้องเพิ่มการอนุมัติของหัวหน้า; dev เลือก: ระดับผู้อนุมัติ 3 ระดับ (เผื่อหัวหน้าไม่อยู่), อนุมัติคนเดียวพอ, หัวหน้าขอเอง = อนุมัติอัตโนมัติ, เฉพาะรถนอก, จัดรถหลังอนุมัติ, ลายเซ็น/ตราอัปโหลดรูปครั้งเดียว (DocuWorks ใช้ตรงไม่ได้), Admin เป็นคน export
  - migration **028**: `Users.ApprovalLevel` (1/2/3) + `SignatureFile`; `VehicleRequests.Reason`, `ApprovalStatus` (NotRequired/Pending/Approved/Rejected), `ApproverUserID`, `ApprovedAt`, `ApprovalNote` (รันบน dev แล้ว)
  - backend: `resolveApproval` (ไม่ต้องอนุมัติ / อนุมัติอัตโนมัติ / รออนุมัติ - ผู้อนุมัติต้องอยู่ใน `listApprovers` ของแผนกหลักผู้ขอ), ไม่บังคับแนบไฟล์ (ลบไฟล์สุดท้ายได้), ผู้ขอแก้ไข → รออนุมัติใหม่, `approve`/`reject` แบบ UPDATE มีเงื่อนไข, `assignLocked` ปฏิเสธ `APPROVAL_REQUIRED`, `users/signature.js` (PNG/JPG ≤ 1 MB), `GET /users/approvers`, `GET /users/:id/signature`, `PUT/DELETE /auth/me/signature`, สร้างผู้ใช้ local กำหนดระดับได้; อีเมล (ไทย) `vehicleApprovalRequested` / `vehicleApproved` / `vehicleRejected` - ส่งคำขอที่ต้องอนุมัติ: ผู้ขอ + ผู้อนุมัติ (Admin ได้รับหลังอนุมัติ) → backend **273/273**
  - frontend: ฟอร์มขอรถนอก (เหตุผล + เลือกผู้อนุมัติ "ระดับ N - ชื่อ" / ข้อความอนุมัติอัตโนมัติ, ไฟล์แนบ "ถ้ามี"), แท็บ **รออนุมัติ** (`VehicleApprovalsView.vue`, แสดงเมื่อมีระดับอนุมัติ: อนุมัติ / ไม่อนุมัติ + เหตุผล / ทั้งหมด), ป้ายสถานะ รออนุมัติ/ไม่อนุมัติ (`VehicleRequestStatusBadge` รับ `approvalStatus`), คำขอของฉันแสดงผู้อนุมัติ + เหตุผลที่ไม่อนุมัติ, modal รายละเอียดมีส่วน "การอนุมัติ", ปุ่มจัดรถปิดจนกว่าจะอนุมัติ (`utils/vehicleApproval.js`), ปุ่ม **PDF / ส่งออกแบบฟอร์ม** (`utils/carBookingForm.js`: หน้าต่างพิมพ์ A4 แนวนอนตามแบบ W-HR-009 + รูปลายเซ็นแปลงเป็น data URL แล้วเลือก "บันทึกเป็น PDF" - ใช้ฟอนต์ไทยของเครื่อง ไม่ต้องมีไลบรารี PDF), หน้าจัดการผู้ใช้เลือกระดับผู้อนุมัติ, โปรไฟล์อัปโหลด/เปลี่ยน/ลบลายเซ็น
  - แก้ติดมา: ปุ่ม "เปิดใช้งาน" ผู้ใช้เคยล้างรหัสพนักงาน (ไม่ได้ส่งค่าเดิม) → ส่งรหัสพนักงาน + ระดับอนุมัติเดิมไปด้วย; โปรไฟล์แสดง role หัวหน้างานถูกต้อง
  - ทดสอบในเบราว์เซอร์ (dev): ตั้ง admin เป็นผู้อนุมัติระดับ 1 + ลายเซ็นทดสอบ, สร้างคำขอทดสอบ 2 รายการ (ผู้ขอ = ผู้ใช้ทดสอบ) → อนุมัติ 1 / ไม่อนุมัติ 1 พร้อมเหตุผล → หน้าจัดการ: ที่ไม่อนุมัติจัดรถไม่ได้, ที่อนุมัติมีปุ่ม PDF → แบบฟอร์มออกครบทุกช่อง + รูปลายเซ็น; ล้างข้อมูลทดสอบแล้ว (ลบคำขอ, คืนเลข VR, ลบลายเซ็น, เอาระดับ admin ออก)
  - **ตัดช่องแนบไฟล์ออกจากฟอร์มขอรถ** (dev: "อนุมัติแล้ว ผู้ขอไม่จำเป็นต้องแนบไฟล์แล้ว") - ลบส่วน UI/โค้ดอัปโหลดใน `VehicleRequestForm.vue`, action `addAttachments`/`removeAttachment` ใน store, `checkFiles` และข้อความที่ไม่ใช้แล้ว; ไฟล์แนบของคำขอเก่ายังแสดง/เปิดได้ (`AttachmentLinks`) - API แนบไฟล์ฝั่ง backend ยังอยู่ (ไม่มีหน้าเว็บเรียกแล้ว) เผื่อเปิดดู/ลบไฟล์เดิม
  - dev: "ไม่เห็นฟอร์มที่ export" - สาเหตุ: ปุ่มขึ้นเฉพาะคำขอที่อนุมัติแล้ว แต่คำขอรถนอกทั้งหมดบน dev (55 รายการ) สร้างก่อนมีระบบอนุมัติ (NotRequired) → ให้ส่งออกได้ทั้งที่อนุมัติแล้วและคำขอเก่า (ช่อง Approved by ว่างไว้เซ็นมือ, ไม่ดึงลายเซ็น) + เปลี่ยนลิงก์ "PDF" เป็นปุ่มมีกรอบ "ฟอร์ม PDF" ให้เห็นชัด
  - dev อธิบายขั้นตอนจริง: Admin ส่งฟอร์มให้บริษัทรถ*ก่อน*รู้คนขับ แล้วค่อยจัดรถ+แจ้งพนักงานเมื่อรู้คนขับ/รถ → ส่งออกฟอร์มไม่ต้องจัดคนขับอยู่แล้ว (ช่องพนักงานขับรถว่างให้บริษัทรถกรอก); **ตัดอีเมล "อนุมัติแล้ว" ที่ส่งถึงผู้ขอ** (เทมเพลต `vehicleApproved` ลบออก) - อนุมัติแล้วแจ้ง Admin อย่างเดียว, อีเมลรับเรื่องของผู้ขอบอกว่าจะแจ้งอีกครั้งเมื่อจัดรถและคนขับแล้ว
  - ⚠️ ก่อนใช้งานจริง: Admin ต้องกำหนดระดับผู้อนุมัติให้หัวหน้าแต่ละแผนก (ไม่มีผู้อนุมัติ = ส่งคำขอรถนอกไม่ได้ ฟอร์มขึ้นข้อความให้ติดต่อ Admin) และผู้อนุมัติอัปโหลดลายเซ็น
  - ⚠️ lint frontend มี error เดิมที่ไม่เกี่ยวกับงานนี้ (`ShuttleDispatchPrintModal.vue` ตัวแปรไม่ได้ใช้, `TabletDisplayView.vue` `err`) - มาจากงานของ agent อื่น ยังไม่ได้แก้
- **ปิด M7 (2026-10-05)** - dev ตอบ: (1) **เก็บปุ่มเช็คอินบนจอ tablet** → แก้ REQUIREMENTS กฎห้อง 8 + หน้าจอ 16 ให้ตรง, (2) แจ้งเตือนใช้ห้องเกินเวลาแบบ **(ข) เตือนก่อนหมดเวลา 5 นาทีเมื่อมีคนจองต่อ**, (3) ยืนยันดีไซน์อีเมลรอบล่าสุด (สีน้ำเงิน)
  - migration **027** `RoomBookings.EndingReminderSentAt`; `claimEndingSoonBookings` เลือก+ทำเครื่องหมายใน UPDATE เดียว (การจอง Booked/CheckedIn ที่จบภายใน 5 นาที และมีการจองห้องเดียวกันเริ่มภายใน 15 นาทีหลังจบ, เตือนครั้งเดียว) รันใน cron นาทีเดียวกับปล่อยห้องอัตโนมัติ → อีเมลอังกฤษ `roomEndingSoon` ถึงผู้จอง (แทน `roomOvertime` ที่ไม่ได้ใช้) - REQUIREMENTS กฎห้อง 7 ปรับตาม
  - ทดสอบกับ DB dev จริง: การจองที่จบใน 4 นาที + มีคนจองต่อ → ถูกเลือก, รอบสองไม่ซ้ำ, การจองอื่นไม่ถูกเลือก, หาการจองถัดไปถูก (ข้อมูลทดสอบลบแล้ว) - backend **251/251**
- **งานที่ agent อื่นทำเพิ่ม (พบตอนตรวจ 2026-10-05 - ไม่ได้บันทึกไว้ จึงสรุปจากโค้ด)**
  - **เช็คอินผ่านจอ tablet หน้าห้อง** (dev ยืนยันเก็บไว้ 2026-10-05): `POST /api/tablet/display/:token/checkin` (เช็คอินการจองของห้องที่จอผูกอยู่ ไม่ต้อง login) + ปุ่มบนจอ + `status`/`isCheckedIn` ในข้อมูลจอ - ⚠️ **ขัดกับ REQUIREMENTS กฎห้องข้อ 8** ("Tablet แสดงผลอย่างเดียว ไม่มีปุ่มเช็คอิน") และใครเดินผ่านก็กดเช็คอินแทนผู้จองได้ (ทำให้การปล่อยห้องอัตโนมัติไม่ทำงาน) - **รอ dev ยืนยันว่าจะเก็บหรือเอาออก** (commit แยกไว้ ถอนได้ง่าย)
  - **รหัสพนักงาน**: migration **026** `Users.EmployeeCode` (รันบน dev แล้ว) + ช่องในหน้าจัดการผู้ใช้/API
  - **พิมพ์ใบส่งรถโอที**: `components/fleet/ShuttleDispatchPrintModal.vue` เปิดจากมุมมองรวมตามสาย/ใบรายชื่อ (ตามตัวอย่าง PDF ใน docs/ - ไฟล์ PDF ไม่ commit เผื่อมีข้อมูลพนักงานจริง)
  - **ปรับดีไซน์อีเมล**: สีหลักน้ำเงิน, ชื่อระบบอังกฤษเป็น "Room & Vehicle Booking System" + `backend/scripts/test-email.js` (ส่งตัวอย่างตรง ไม่ผ่าน redirect, ยังใช้ pin ใบรับรอง)
  - ตอนตรวจ: test ล้ม 1 (ยังคาดหวังชื่อระบบเดิม) + lint error (`BRAND` ไม่ได้ใช้) - Claude แก้แล้ว → backend **250/250**, frontend build ผ่าน
  - ทดสอบจริงบน dev: ส่งคำขอรถโอที VR-2026-0008 แล้วยกเลิก → อีเมล "คำขอรถใหม่" ส่งถึง Admin (redirect เข้ากล่อง dev) - ผู้ขอ (บัญชี local ผู้ดูแลระบบ) ไม่มีอีเมลจึงไม่มีอีเมลยืนยัน/ยกเลิก; Admin 5 คนมีอีเมล 3 คน (อีก 2 คนจะไม่ได้รับแจ้ง)
- **รูปแบบวันเวลา (Claude, 2026-09-29)** - dev ยืนยัน: **ปี ค.ศ.**, วันที่แบบไทย **DD/MM/YYYY**, เวลา **24 ชั่วโมง** (เช่น `30/09/2026 20:00`) - `formatDateDMY`/`formatDateTimeDMY` ประกอบเองแทน `Intl('th-TH')` ที่แปลงเป็น พ.ศ., `formatDateTime` ภาษาไทยใช้ `th-TH-u-ca-gregory`, หน้าอุปกรณ์ใช้ฟังก์ชันกลาง (เดิม `29/9/69`) - ทดสอบในเบราว์เซอร์: รายการคำขอรถ + DatePicker/TimePicker แสดงถูก
- **กล่องรายละเอียดวันในปฏิทินหน้าแรก (Claude, 2026-09-29)** - dev: วันที่แสดงซ้ำ → หัวข้อย่อยเหลือ "ตารางการใช้ห้อง" (เดิมมีวันที่ `2026-09-25` ซ้ำกับหัวกล่อง), หัวกล่องเอา "ค.ศ." ที่ `dateStyle: 'full'` เติมออก → `วันศุกร์ที่ 25 กันยายน 2026`
- **รถไปงานนอก: ไป-กลับ / ไปอย่างเดียว / กลับอย่างเดียว (Claude, 2026-09-29)** - dev ยืนยัน: ไป/กลับอย่างเดียวกรอกแค่**เวลารับ** ระบบกันคนขับ/รถไว้ **2 ชั่วโมง** (dev เลือกเองแทนการกรอกเวลาถึงโดยประมาณ - ทริปไกลอาจถูกจัดงานถัดไปซ้อนได้)
  - migration `021_add_vehicle_request_trip_type.sql` (รันบน dev แล้ว): `VehicleRequests.TripType` (`RoundTrip`/`OneWay`/`ReturnOnly`, default `RoundTrip` - คำขอเดิม + โอทีเป็นไป-กลับ)
  - backend คำนวณ ReturnTime = DepartTime + 2 ชม. เองสำหรับไป/กลับอย่างเดียว (ไม่เชื่อค่าจาก client), `ONE_WAY_BLOCK_HOURS` ใน `vehicle-requests/routes.js` (ฟอร์มมีค่าเดียวกัน)
  - ฟอร์มมีตัวเลือกรูปแบบการเดินทาง ไป/กลับอย่างเดียวซ่อนวัน/เวลากลับ + ป้ายรูปแบบในรายการคำขอของฉัน/จัดการคำขอ/หน้าจัดรถ
  - backend **188/188** ผ่าน, ทดสอบจริง: สร้างไปอย่างเดียว (#495, ส่งเวลากลับ +50 ชม.) → เก็บ 2 ชม. แล้วยกเลิกทิ้ง
- **จุดรับ/จุดส่งแนบแผนที่แยกกัน + ติ๊ก "ที่บริษัท" (Claude, 2026-09-29)** - dev: เดิมมีช่องแผนที่ช่องเดียวไม่รู้ว่าของจุดไหน, ถ้าเป็นบริษัทไม่ต้องแนบ ให้ติ๊กได้
  - migration `022_pickup_map_link.sql` (รันบน dev แล้ว): เพิ่ม `PickupMapLink`, `MapLink` เดิม = แผนที่ปลายทาง (กลับเป็น NULL ได้; สตริงว่างของโอทีเดิมเปลี่ยนเป็น NULL)
  - API: รับ `pickupAtCompany`/`destinationAtCompany` + `pickupMapLink`/`destinationMapLink` (เลิกใช้ `mapLink`) - ติ๊กบริษัท → ชื่อสถานที่เป็น `บริษัท` (`COMPANY_LOCATION`) ไม่ต้องมีแผนที่, ไม่ติ๊ก → ต้องมีชื่อ + ลิงก์ http(s); ส่งกลับ `pickupAtCompany`/`destinationAtCompany` (อนุมานจากชื่อ `บริษัท` + ไม่มีแผนที่) - โอทีไม่มีแผนที่เหมือนเดิม
  - ฟอร์ม: กล่องจุดรับ/สถานที่ปลายทาง แต่ละกล่องมีช่องติ๊ก "ที่บริษัท" + ชื่อสถานที่ + ลิงก์แผนที่, คำขอใหม่ติ๊กจุดรับเป็นบริษัทไว้ก่อน (กลับอย่างเดียว → สลับเป็นปลายทาง), ป้าย "จุดรับ-ส่ง" → "จุดรับ", ไป/กลับอย่างเดียวใช้ "วันที่รับ"; รายการคำขอแสดงลิงก์ "แผนที่จุดรับ"/"แผนที่ปลายทาง"
  - backend **193/193** ผ่าน, ทดสอบจริง: จุดรับบริษัท + ปลายทางมีแผนที่ (#515) → บันทึกถูก แล้วยกเลิกทิ้ง, ปลายทางไม่มีแผนที่ → 400
  - หมายเหตุ: คำขอเก่าไม่มีแผนที่จุดรับ - ถ้าเปิดแก้ไขจะต้องติ๊กบริษัทหรือกรอกแผนที่จุดรับ
- **จัด layout ฟอร์มขอรถให้กระชับ (Claude, 2026-09-29)** - dev: ใช้พื้นที่ให้คุ้มกว่านี้ → จอกว้าง (lg) แถวแรกรวม ผู้ขอ/เบอร์/รูปแบบการเดินทาง/ประเภทรถ (ปุ่มแถบ), วันเวลา 4 ช่องแถวเดียว (ไป/กลับอย่างเดียวแสดงคำอธิบาย 2 ชม. ในที่ว่างข้างช่อง), จุดรับ/ปลายทางวางคู่กัน ช่องติ๊ก "ที่บริษัท" อยู่หัวกล่อง ชื่อสถานที่+แผนที่แถวเดียว, ค้นหาพนักงาน+จำนวนแขกแถวเดียว คนที่เลือกเป็นป้ายเล็ก (โอทีแสดงสาย/จุดจอดในป้าย), ประเภทโอทีเป็นปุ่มแถบ - จอแคบยังเรียงลงตามเดิม; ฟอร์มงานนอกทั้งหมดอยู่ในจอเดียวที่ 1920x855
- **คำขอรถของฉัน: หน้าละ 7 รายการ (เดิม 5, dev ขอเพิ่ม) + เปลี่ยนหน้า (Claude, 2026-09-29)** - dev ยืนยัน: เรียงจาก**คำขอที่ส่งล่าสุด** (`createdAt` ใหม่→เก่า; เดิมเรียงตามวันเดินทาง) แบ่งหน้าฝั่งหน้าเว็บ (คำขอของตัวเองโหลดมาทั้งหมดอยู่แล้ว) - component กลาง `components/common/PaginationBar.vue` (v-model:page, ซ่อนเองถ้ามีหน้าเดียว, "แสดง 1–5 จาก 7 รายการ") ใช้กับหน้าอื่นได้, ยกเลิกแล้วรายการลดจะไม่ค้างหน้าว่าง, กดแก้ไขจากหน้าท้ายๆ เลื่อนขึ้นไปที่ฟอร์ม - ทดสอบในเบราว์เซอร์: 7 รายการ → หน้า 1 = 5, หน้า 2 = 2
- **คำขอรถของฉัน: 1 คำขอ = 1 แถว (Claude, 2026-09-29)** - dev: 1 รายการใช้พื้นที่เยอะไป → จอกว้าง 4 คอลัมน์ในแถวเดียว (เส้นทาง+เวลา+รูปแบบ/ประเภทรถ/จำนวนคน | แผนที่+ไฟล์แนบ | คนขับ/รถแบบย่อ (`AssignmentSummary compact`) | สถานะ+แก้ไข/ยกเลิก) ในกล่องเดียวคั่นเส้นบาง แทนการ์ดแยก 2 ส่วน - จากราว 200px เหลือราว 65px ต่อรายการ, 5 รายการ + แถบเปลี่ยนหน้าอยู่ในจอเดียว; จอแคบเรียงลงเป็นบรรทัด
- **TimePicker/DatePicker แก้ไขค่า Object vs String (Gemini, 2026-09-29)** - ติดตั้ง `@vuepic/vue-datepicker` (named export `{ VueDatePicker }`) แทน native `<input type="time/date">` ทั่วทั้งโปรเจกต์ - แก้บั๊ก `TimePicker` ส่งค่ากลับเป็น `{ hours, minutes }` (Object) แทน String `HH:mm` ซึ่งทำให้ `onSubmit` พังเงียบๆ - ตอนนี้ `TimePicker` แปลง Object→String ก่อน emit ครบแล้ว (`frontend/src/components/common/TimePicker.vue`, `DatePicker.vue`) - frontend build ผ่าน

- **เดินทางกลุ่ม: ลงชื่อ + รายงานจุดขึ้นรถส่งบริษัทรถ (Claude, 2026-10-07)** - dev: Admin สร้างกิจกรรม → พนักงานลงชื่อ+จุดขึ้นรถ+ลิงก์แผนที่ → Admin ส่งออกรายงาน Excel ไปให้บริษัทรถ (บริษัทรถจัดรถเอง ตามที่ HR ตกลง); ที่นั่งไม่จำกัด (migration 029–030, รายละเอียดใน PLAN.md หัวข้อ "เดินทางกลุ่ม")
  - ระหว่างทางทำ Smart Route/จัดสายรถ (ลิงก์ → พิกัด, แบ่งสาย, ประเภทรถ) จนเสร็จและทดสอบ แต่ HR ตัดสินให้บริษัทรถจัดรถเอง → **ถอนออกทั้งหมด** เหลือรายงาน Excel (รายชื่อ + จุดขึ้นรถ + ลิงก์แผนที่คลิกได้ เรียงตามจุดขึ้นรถ) ให้ Admin ส่งออกไปส่งบริษัทรถ; migration 030 ล้าง DB ที่เคยรันเวอร์ชันเก่า (ตาราง `EventRoutes`, คอลัมน์พิกัด/แผน/`MaxSeats`)
  - **"การขึ้นรถของฉัน" เป็นรายการก่อน (2026-10-07)**: dev: ถ้าแสดงรายละเอียดทุกสายเลยจะดูยาก → ตาราง 1 สาย = 1 แถว + ปุ่ม "ดูรายละเอียด" เปิด modal ทั้งสาย, ตัวสลับ กำลังจะถึง | ที่ผ่านมาแล้ว (ค่าเริ่มต้น กำลังจะถึง), แบ่งหน้า 7 - ⚠️ ยังไม่ได้ลองในเบราว์เซอร์
  - **หน้าการเดินทางกลุ่มแบ่ง 2 แท็บ (2026-10-07)**: ลงชื่อขึ้นรถ | การขึ้นรถของฉัน (`?tab=boarding`, ลิงก์อีเมลเปิดแท็บหลัง) - แท็บหลังแสดง**ทั้งสายรถ** ที่ตัวเองอยู่ (`GET /events/boarding/mine` คืน `routes[]` พร้อมผู้เดินทางทุกคนในสาย: ชื่อ/แผนก/จุดขึ้น/เวลา ไม่ส่งเบอร์/รหัส) ตารางต่อสาย ไฮไลต์แถวตัวเอง - backend 317 test + ทดสอบ SQL จริง (เพื่อนร่วมสายเห็นทั้งสายของตัวเอง ไม่เห็นสายอื่น)
  - **หน้า "การเดินทางกลุ่ม" ทำใหม่เป็นตาราง (2026-10-07)** - dev ไม่ชอบการ์ด: รายการกิจกรรมเป็นตาราง (กิจกรรม/ปลายทาง/วันเดินทาง+กลับ/ปิดรับ/ผู้ลงชื่อ/สถานะ + ปุ่ม ลงชื่อ รายชื่อ แก้ไข ลบ, หน้าละ 7), "การขึ้นรถของฉัน" เป็นตารางกะทัดรัด 1 คน = 1 แถว, หัวข้อ/ปุ่ม/ตัวอักษร/วันที่ตรงกับหน้าอื่น (modal ลงชื่อ/สร้างกิจกรรม/รายชื่อยังเป็นแบบเดิม)
  - **หน้าพนักงานดูรายละเอียดการขึ้นรถ (2026-10-07)**: เดิมมีแค่กล่องในการ์ดกิจกรรม → ทำส่วน "การขึ้นรถของฉัน" ไว้บนสุดของหน้าการเดินทางกลุ่ม (`MyBoardingSection.vue`, การ์ดกลาง `BoardingEntryCard.vue`) - dev ไม่ต้องการแท็บใหม่ จึงไม่มีแท็บ/หน้าแยก; ส่งออก Excel แยกตามสายรถ (`GET /events/:id/report/routes`, ชีตสรุป + 1 ชีตต่อสาย) - backend 315 test; ⚠️ ยังไม่ได้ลองหน้าในเบราว์เซอร์
  - **รายละเอียดการขึ้นรถ - ปรับหน้าให้ใช้ง่ายขึ้น (2026-10-07, migration 032 ประเภทรถ)**: dev บอกใช้ยาก (ต้องตั้งสายก่อนแล้วเลื่อนไปจัดทีละคน, จัดทีละแถวนาน, ช่องเวลาเป็นป๊อปอัป, จัดกลุ่มตามจุดขึ้นรถสับสน) → ทำใหม่ตามขั้นตอนจริง: สร้างสาย (ตู้/เก๋ง ทะเบียน คนขับ - เลือกจากข้อมูลในระบบเติมให้ได้) → เพิ่มผู้เดินทางเข้าสายด้วยการติ๊กหลายคน (ใช้จุดขึ้นรถที่ลงไว้) → ช่องเวลาพิมพ์ตรงๆ + ตั้งทั้งสาย → ดูรายงานตรวจ → ประกาศ; ไม่มีการจัดกลุ่มตามจุดขึ้นรถแล้ว
  - **รายละเอียดการขึ้นรถ** (dev: หลังส่งข้อมูลให้บริษัทรถ Admin สร้างรายละเอียดให้พนักงานรู้ว่าขึ้นสายไหน กี่โมง รถทะเบียนอะไร ใครขับ): พิมพ์เอง (สาย+ทะเบียน+ชื่อ/เบอร์คนขับ), เวลาขึ้นรถตามจริง (จุดเดียวกันตั้งพร้อมกันได้), ประกาศแล้วเห็นในเว็บ + อีเมลแนบ Excel สรุป, เห็นเฉพาะเจ้าของ+คนลงให้+Admin - backend 308 test + ทดสอบ SQL จริงกับ DB dev (สิทธิ์การเห็น, แทนที่แผน, ยกเลิกประกาศ, ล้างข้อมูลทดสอบแล้ว); ⚠️ ยังไม่ได้ลองหน้า Admin/การ์ดพนักงานในเบราว์เซอร์ และยังไม่ได้ส่งอีเมลจริง (ทดสอบแค่แม่แบบ+ไฟล์แนบ)
  - แก้ลงชื่อไม่ได้เพราะลิงก์ Google Maps ยาวเกิน 500 ตัวอักษร (SQL error → 500): ขยายคอลัมน์เป็น 2000 + ช่องที่ยาวเกินตอบ 400 พร้อมบอกช่อง (`EVENT_FIELD_TOO_LONG`) + ประเภทเที่ยวผิดตอบ 400
  - แก้ลงชื่อไม่ได้ (400): ฟอร์มส่ง `auth.user.name` (ไม่มี → `fullName`) และ route ใช้ error code ที่ไม่มีอยู่ (`INVALID_INPUT`/`FORBIDDEN`) + ข้อความไทยตรงๆ → ใช้ code จริง + คำแปล th/en; แจ้งเตือนเปลี่ยนจาก `alert()` เป็น toast; ปุ่มค้างตอน error แก้แล้ว
  - ตัดช่อง "จำนวนที่นั่งสูงสุด" (คอลัมน์ `EventTrips.MaxSeats` ยังอยู่ใน DB แต่ไม่ใช้); ปุ่ม Export CSV เห็นเฉพาะ Admin; ไอคอนทั้งเว็บเปลี่ยนจากอีโมจิเป็น `AppIcon.vue` (REQUIREMENTS NFR)
  - (ประวัติ) Smart Route ที่ถอนออกแล้ว: ทดสอบ SQL จริงกับ DB dev ด้วยข้อมูลชั่วคราว (14 คนสองฝั่งกรุงเทพฯ → 2 สายรถตู้ 7+7, เรียงลำดับรับ+เวลา+ลิงก์นำทางถูกต้อง, แทนที่แผน, แก้พิกัด, ลบข้อมูลทดสอบแล้ว) - ⚠️ **ยังไม่ได้ดูหน้าจัดสายในเบราว์เซอร์** และยังไม่ได้ลองลิงก์สั้นจริงของ Google (ทดสอบแค่ด้วย mock + ลิงก์ที่ไม่มีอยู่)
  - ⚠️ ต้องรีสตาร์ท backend ที่รันอยู่ และรัน `npm run migrate` บนเครื่องอื่น (029–030) - ยังไม่ได้ดูหน้า "เดินทางกลุ่ม" ในเบราว์เซอร์

## สถานะล่าสุด ณ 2026-09-30 (สิ้น M6 + ปรับเพิ่มหลัง M6 ทั้งหมด - ยังไม่เริ่ม M7)

**ตรวจสอบล่าสุด (Claude, 2026-09-30):**
- Backend: **265/265 test ผ่าน** (รวม integration test กับ DB จริง), lint ผ่าน
- Frontend: build ผ่าน, lint 0 error (warning 6 จุดเรื่องลำดับ attribute ในไฟล์เดิม `ShuttleRoutesPanel.vue`/`ShuttlePassengersView.vue`)
- Migration ที่รันบน dev แล้ว: **001–027** (025 = เลขที่เอกสารคำขอรถ, 026 = รหัสพนักงาน) (023 = `Rooms.IsActive`, 024 = ตาราง `Devices` + ลบ `Rooms.TabletToken/LastSeenAt`)
- เอกสาร sync กับโค้ดแล้ว (2026-09-30): REQUIREMENTS (กฎรถ 14–17, กฎห้อง 9, §5 ข้อมูล, §6 หน้าจอ+ตำแหน่งเมนูจริง, NFR ธีม/เวลา 24 ชม.), ARCHITECTURE (ER, API, โครงโฟลเดอร์, หมายเหตุการออกแบบ), PLAN (สถานะ, หัวข้อ M6+ งานที่เพิ่มนอกแผน, หมายเหตุ M8/M10/M11)

**งานที่เพิ่มหลัง M6 (สรุป - รายละเอียดอยู่ในรายการด้านบน):** ขอรถได้ทุกคน + ขอบเขตแผนกหลัก, ประเภทการเดินทาง, แผนที่จุดรับ/ปลายทาง, สายรถ/คนขับประจำ/ผู้โดยสารรถรับส่ง, หน้าจัดการคำขอรถ (ตัวกรอง, modal รายละเอียด, รวมตามสาย + ใบรายชื่อ + จัดรถทั้งเที่ยว), โอทีเที่ยวเดียวกันใช้รถร่วมกัน, กันผู้โดยสารซ้ำ, ลบจริงแบบเช็คประวัติ (คนขับ/รถ/ผู้ให้บริการ/ห้อง), อุปกรณ์เป็นตารางของตัวเอง, จอ tablet (อังกฤษ, ธีมแบบ Tesla, ปฏิทินห้อง, responsive - เครื่องหลัก Galaxy Tab A11+)

**งานค้างก่อน M7:**
- ✅ commit แล้ว (2026-09-30) แยก 8 commit: `bc85d28` db migrations 015–024 → `0e65416`/`fb60447`/`23642ec` backend (แผนก+ขอบเขต / รถ+คำขอรถ / ห้อง+การจอง+อุปกรณ์) → `fb88a91`/`39ab570`/`c0212ff` frontend (ส่วนกลาง / รถ / ห้อง+อุปกรณ์+จอ tablet) → `c5be174` docs
- ⚠️ ยังไม่ได้ทดสอบในเบราว์เซอร์ด้วยบัญชีที่ไม่ใช่ Admin (ขอบเขตแผนกหลัก, หน้าคำขอของฉัน)
- ⚠️ ยังไม่ได้ลองปุ่ม "จัดรถทั้งเที่ยว" ในเบราว์เซอร์ (backend มี integration test แล้ว) และการเลื่อนตารางวันนี้ไปประชุมปัจจุบันอัตโนมัติบนจอ tablet
- ⚠️ ประเภทโอที (เช้า/เย็น/วันหยุด) ยังไม่มีคอลัมน์ของตัวเอง - อนุมานจากจุดรับ/ปลายทาง (`otTypeOf`) ถ้า M8 ต้องรายงานตามประเภทโอที ควรเพิ่มคอลัมน์ก่อน
- ❓ รอ dev ตัดสินใจ: สิทธิ์ของ Supervisor (ตอนนี้เท่า Employee), หัวข้อฟิลด์ตัวหนาทั้งระบบ, ปฏิทินบนจอ tablet แสดงหัวข้อประชุมได้ไหม (เรื่องความลับ)
- ⬜ M7 - Notifications: **อีเมลอย่างเดียว** (dev ตัด LINE ออก 2026-09-30) - ต้องขอข้อมูล SMTP จาก IT (host/port/ต้อง login ไหม/อีเมลผู้ส่ง)
- 📝 ข้อมูลทดสอบบน dev: การจองห้องทดสอบ #58, #60–#87 ยกเลิกแล้วทั้งหมด (ยังอยู่ในฐานข้อมูลเป็นสถานะ Cancelled - ระวังตอนทำรายงาน M8 ถ้าใช้ข้อมูล dev)

---

## 2026-10-08 - UI style กลาง, ตรวจ 2 ภาษา, responsive, M9 Audit Log (Claude)

**UI/หน้าจอ (commit `628c02f`, `b12c303`)**
- dev สั่งปรับธีมเป็น minimal business ขาว/เทา/ดำ ผ่านการเทียบตัวอย่างหลายแบบ → สรุป: สีเน้นดำ, ตารางแบนไม่มีกรอบ/เงา, มุมโค้ง 2 ระดับ, เมนูหลัก + เมนูย่อย (`SubNav`, ไอคอน, ไม่มีเส้นล่าง), เนื้อหากว้างสูงสุด 1536px กลางจอ
- กติกาเต็มอยู่ที่ `docs/UI-STYLE.md` (บังคับทั้งหน้าใหม่และหน้าแก้ไข) + `CLAUDE.md` + REQUIREMENTS § 7; ตัวตรวจ `npm run lint:ui`, `npm run lint:i18n`
- responsive: จอ laptop เล็กสุด 1024px กว้าง / 560px สูง; เมนูย่อยเกิน 6 รายการซ่อนไอคอนที่ < 1366px; หน้าแรกปฏิทินพอดีจอ (จำนวนแถวตามสัปดาห์จริง)
- i18n: ย้ายข้อความ hardcode เป็น key, เพิ่มคำแปล error `INTERNAL_ERROR`/`TABLET_TOKEN_INVALID`, แก้ `pagination.previous`, วันที่ ค.ศ. ผ่าน `utils/datetime.js`, ชื่อแท็บ/`lang` ตามภาษา; ข้อยกเว้น (เอกสารฟอร์ม W-HR-009/ใบจัดรถภาษาไทยตายตัว, ค่า `'บริษัท'`/`'บ้าน (ตามสายรถพนักงาน)'` ที่เก็บใน DB ของรถโอที) ขึ้นทะเบียนที่ `ALLOW_THAI` ใน `scripts/check-i18n.mjs` - ถ้าจะแปลค่า DB ต้องเปลี่ยนเป็น enum + ย้ายข้อมูลเดิมก่อน

**M9 Audit Log (commit แล้ว - ดู `git log` หัวข้อ audit)**
- migration `035_create_audit_logs.sql` (รันบน DB dev แล้ว), `modules/audit/` (`actions.js` แคตตาล็อก+ตัดข้อมูลลับ, `repository.js`, `service.js`, `routes.js`), `middleware/audit.js` (ต่อก่อน router ย่อยทั้งหมดใน `app.js`), `jobs/autoRelease.js` บันทึก `booking.autoRelease`
- ค่าก่อนแก้: user, booking, vehicleRequest, room, department, driver (loader แบบ lazy ใน `service.js` เพราะ test อื่น mock repo บางส่วน)
- frontend: `views/admin/AuditLogView.vue` + เมนู "บันทึกการใช้งาน" + route `/admin/audit` + key `audit.*` (รหัส action แปลที่ `audit.actions.<entity>.<verb>` - เพิ่มรหัสใหม่ใน `actions.js` ต้องเพิ่มคำแปลด้วย)
- ทดสอบ: backend **347/347** (ไม่รวม integration ที่ต้องใช้ DB) รวม `audit.test.js` 17 ตัว; ทดสอบ SQL กับ DB dev จริง (insert/list/ตัวกรอง/LIKE escape - แก้บั๊ก escape `]` ที่พบ); ตรวจหน้าเว็บด้วย mock API (ไม่ได้ลองกับ backend จริงที่รันอยู่)
- ⚠️ ต้องรีสตาร์ท backend ที่รันอยู่ (ยังเป็นโค้ดเก่าไม่มี audit) และรัน `npm run migrate` บนเครื่องอื่น; หลัง IIS ARR ตั้ง `TRUST_PROXY=1`
- ⚠️ ยังไม่ได้ลองใน UI จริงว่าทุก action ถูกบันทึก (ทดสอบผ่าน unit + DB เท่านั้น) - ควรลองจอง/ยกเลิก/อนุมัติ/แก้ผู้ใช้จริง 1 รอบแล้วดูหน้า audit

## สถานะล่าสุด ณ 2026-10-08

- Backend: **347 test ผ่าน** (ไม่รวม integration), eslint สะอาด; Frontend: build ผ่าน, eslint 0 error (warning เดิม 6 จุด), `lint:ui` + `lint:i18n` ผ่าน
- Migration บน dev: **001–035**
- **ถัดไป: M10** (สคริปต์ตรวจ external URL ใน `dist/`, ไล่ responsive 375/768 ทุกหน้า) แล้ว **M11** (`deploy/iis`, `deploy/pm2` ยังว่าง, ยังไม่มี `README.md` ที่ราก)
- ค้างจากก่อนหน้า: ทดสอบด้วยบัญชีที่ไม่ใช่ Admin, คำถามสิทธิ์ Supervisor ที่รอ dev ตัดสินใจ (ดู "งานค้าง" ด้านบน)

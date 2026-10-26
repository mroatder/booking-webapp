# Security Checklist - ระบบจองห้องประชุมและรถ

ตรวจจากโค้ดเมื่อ 2026-10-09 (ยังไม่ได้ทดสอบเจาะระบบจริง) ใช้ติ๊กก่อน deploy ทุกครั้ง
สัญลักษณ์: `[x]` ทำแล้วในโค้ด, `[ ]` ยังต้องทำ  |  ระดับ: 🔴 สูง 🟠 กลาง 🟡 ต่ำ

## 1. Secrets และ Configuration
- [x] `.env`, `*.pem`, `*.key`, `uploads/`, `certs/` อยู่ใน `.gitignore` และไม่ถูก track
- [x] 🔴 `JWT_SECRET`: ห้ามมี fallback ใน production - throw ตอนเริ่มระบบถ้าไม่ตั้งหรือสั้นกว่า 32 ตัวอักษร (`backend/src/config/env.js`)
- [ ] 🔴 สร้าง `JWT_SECRET` ใหม่แบบสุ่ม (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) และเก็บเฉพาะบนเซิร์ฟเวอร์
- [ ] 🟠 ตั้ง `NODE_ENV=production` บนเซิร์ฟเวอร์จริง และ `MAIL_REDIRECT_TO` ต้องว่าง
- [ ] 🟠 จำกัดสิทธิ์ไฟล์ `backend/.env` ให้เฉพาะบัญชีที่รัน Node/PM2 อ่านได้
- [ ] 🟡 ตรวจประวัติ git ว่าไม่เคยมี secret หลุด (`git log -p -S"password"`) ถ้าเจอให้เปลี่ยนรหัสนั้นทันที
- [ ] 🟡 หมุนเวียนรหัสผ่านบัญชี service (LDAP bind, SMTP, DB) เป็นระยะ

## 2. Authentication / Session
- [x] cookie `httpOnly` + `sameSite=strict`
- [x] ตรวจผู้ใช้กับ DB ทุกคำขอ (ปิดใช้งาน/ลดสิทธิ์มีผลทันที)
- [x] login rate limit ต่อ username และต่อ IP
- [x] 🔴 cookie `secure: true` เมื่อใช้ HTTPS (`auth/routes.js` ตอนนี้ฮาร์ดโค้ด `false`)
- [ ] 🟠 ตั้ง `TRUST_PROXY=1` หลัง IIS ARR ไม่งั้น limiter และ audit log เห็นแต่ IP ของ proxy
- [x] 🟠 จำกัดรูปแบบ `username` (เช่น `^[\w.\-]{1,100}$`) ก่อนส่งเข้า LDAP/DB
- [ ] 🟠 ทบทวนการล็อกตาม username (ผู้อื่นล็อกบัญชีเราได้) - พิจารณาหน่วงเวลาแบบทวีคูณแทนล็อกตรงๆ
- [ ] 🟡 ย้าย rate limit ไปเก็บใน DB/Redis ถ้าจะรัน backend มากกว่า 1 process
- [ ] 🟡 มีกลไกเพิกถอน session (เช่น เก็บ token version ใน Users) ให้ logout/เปลี่ยนรหัสผ่านทำให้ token เก่าใช้ไม่ได้
- [ ] 🟡 bcrypt cost 12 และนโยบายรหัสผ่าน Local (ความยาว ≥ 12, ห้ามรหัสที่พบบ่อย)
- [ ] 🟡 บัญชี Local admin: ใช้รหัสผ่านยาวและเก็บในที่ปลอดภัย ใช้เฉพาะกรณีฉุกเฉิน

## 3. Authorization (สิทธิ์การเข้าถึง)
- [x] router ของ Admin ใช้ `requireAuth + requireRole('Admin')` ครบ (users, drivers, fleet, reports, audit)
- [x] bookings / vehicle-requests / ลายเซ็น / ไฟล์แนบ ตรวจเจ้าของหรือ Admin
- [x] ห้าม Admin ลดสิทธิ์/ปิดบัญชีตัวเอง และห้ามเหลือ Admin 0 คน
- [ ] 🟠 ทำ test ข้ามผู้ใช้ (IDOR) สำหรับทุก endpoint ที่รับ `:id` โดยเฉพาะ `events/:id/passengers`, `departments`
- [ ] 🟡 ทุก route ใหม่ต้องมี `requireAuth` ชัดเจน - เพิ่ม test ที่ไล่ route ทั้งหมดแล้วเช็คว่าไม่มี route เปิดโดยไม่ตั้งใจ (ยกเว้น `/auth/login`, `/health`, `/tablet/display/*`)

## 4. Input Validation / Injection
- [x] SQL ใช้ parameterized query ทั้งหมด (ส่วนที่ต่อสตริงเป็นชื่อตาราง/คอลัมน์ในโค้ด)
- [x] LDAP search ใช้ `escapeFilterValue`
- [x] ลิงก์ที่ผู้ใช้กรอกรับเฉพาะ http/https
- [x] 🟠 `authenticateWithLdap` ต้อง escape `userPrincipalName` ใน filter (`auth/ldap.js`)
- [x] Excel export: ตรวจแล้วไม่ต้องแก้ - ExcelJS เขียนสตริงเป็น shared string ไม่ใช่สูตร Excel จึงไม่ประมวลผล `=...` (ความเสี่ยงนี้เกิดกับ CSV เท่านั้น - ถ้าเพิ่ม export CSV ต้อง escape)
- [ ] 🟡 จำกัดความยาว/ชนิดข้อมูลทุกฟิลด์ที่รับจาก body ให้สอดคล้องกับความยาวคอลัมน์

## 5. File Upload
- [x] ตรวจ magic bytes, จำกัดขนาด/จำนวน, ชื่อไฟล์สุ่ม, regex กัน path traversal
- [x] ดาวน์โหลดผ่าน API ที่ตรวจสิทธิ์ ไม่มี URL สาธารณะ
- [ ] 🟠 `UPLOAD_DIR` ต้องอยู่นอกโฟลเดอร์ที่ IIS เสิร์ฟ และ backup แยก
- [ ] 🟡 สแกนไวรัสไฟล์แนบ (ถ้านโยบายองค์กรกำหนด)
- [ ] 🟡 ตั้งโควตา/ลบไฟล์กำพร้าเป็นระยะ

## 6. Transport (HTTPS / เครือข่าย)
- [ ] 🔴 เปิด HTTPS ที่ IIS (แล้วเปิดบรรทัด Strict-Transport-Security ใน `deploy/iis/web.config` และตั้ง `NODE_ENV=production`) (ใบรับรองที่เชื่อถือได้) และ redirect HTTP → HTTPS
- [ ] 🔴 LDAP: ใช้ `ldaps://` หรือ StartTLS (ตอนนี้ plain, รหัสผ่านพนักงานวิ่งแบบ cleartext)
- [ ] 🔴 SQL Server: ตั้ง `DB_ENCRYPT=true` (+ `DB_TRUST_SERVER_CERT=false` เมื่อมีใบรับรองที่ถูกต้อง) ใน `.env` บนเซิร์ฟเวอร์ - โค้ดรองรับแล้ว เหลือการตั้งค่าจริง
- [ ] 🟠 Backend ฟังเฉพาะ `127.0.0.1` ไม่เปิดพอร์ต 3003 ออกเครือข่าย (firewall ปิด)
- [ ] 🟠 SMTP ใช้ TLS ที่ pin ใบรับรอง (`SMTP_CA_FILE`/`SMTP_TLS_FINGERPRINT`) ห้ามปิดการตรวจ

## 7. Security Headers / Frontend
- [x] Backend ใช้ helmet + CSP
- [x] Vue escape ข้อความอัตโนมัติ ไม่มี `v-html`/`innerHTML`/`eval` ใน `src/`
- [x] หน้าพิมพ์แบบฟอร์ม (`carBookingForm.js`) escape ข้อมูลก่อนเขียนลง `document.write`
- [x] 🟠 เพิ่ม header ที่ `deploy/iis/web.config`: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Strict-Transport-Security`
- [x] 🟠 ปิด `DirectoryListingModule` ใน handlers ของ IIS และลบ header `X-Powered-By`/`Server`
- [ ] 🟡 ลบไฟล์ `web.config` ที่ราก repo ในเครื่อง dev (ไม่ได้ถูก track ใน git - ถูก ignore อยู่ แต่เป็น config ตัวเก่า proxy พอร์ต 3001 และเสิร์ฟ `/uploads` ตรง อย่า deploy ตัวนี้)
- [ ] 🟡 ตรวจว่า CSP ไม่บล็อกการทำงานของแอปหลังเพิ่ม (ทดสอบทุกหน้า รวมหน้า tablet และการพิมพ์ PDF)
- [ ] 🟡 ไม่เก็บข้อมูลอ่อนไหวใน `localStorage` (ตอนนี้เก็บเฉพาะภาษา)

## 8. หน้าจอ Tablet (token ใน URL)
- [x] token สุ่ม 24 byte, regenerate ได้, audit log ไม่เก็บ token จริง
- [ ] 🟠 ไม่ให้ IIS log เก็บ path `/api/tablet/display/*` เต็ม (หรือ mask token)
- [x] 🟠 rate limit ให้ `/tablet/display/:token/*` (กันเดา token / ยิง checkin ซ้ำ)
- [ ] 🟡 regenerate token ทันทีเมื่อ tablet หาย/เปลี่ยนมือ และทบทวนทุกไตรมาส
- [ ] 🟡 ข้อมูลที่จอแสดงมีแค่ชื่อเรื่อง/เวลา - ยืนยันว่าไม่เปิดเผยชื่อผู้จอง

## 9. Database
- [x] ใช้ SQL login เฉพาะแอป ไม่ใช้ `sa`
- [x] สคริปต์ `setup-database.sql` ไม่ให้ `db_owner` อีกต่อไป (มีผลกับการติดตั้งใหม่เท่านั้น)
- [ ] 🔴 ฐานข้อมูลที่ใช้งานอยู่: ลดสิทธิ์ `booking_app` จาก `db_owner` ด้วยตนเอง และแยกบัญชี migration - ตอนนี้ CI รัน `npm run migrate` ด้วยบัญชีเดียวกับแอป จึงต้องปรับ pipeline ก่อน ไม่งั้น deploy จะล้ม
- [ ] 🟠 ปิด SQL Browser/พอร์ต 1433 จากเครือข่ายที่ไม่จำเป็น (firewall อนุญาตเฉพาะเครื่อง backend)
- [ ] 🟠 ปิดบัญชี `sa` หรือตั้งรหัสผ่านยาว และเปิด `CHECK_POLICY` (ตั้งไว้แล้วสำหรับ `booking_app`)
- [ ] 🟠 Backup อัตโนมัติ + ทดสอบกู้คืนจริง + เข้ารหัสไฟล์ backup (รวมโฟลเดอร์ `uploads/`)
- [ ] 🟡 เปิด SQL Server audit/login failure logging
- [ ] 🟡 พิจารณา Transparent Data Encryption (TDE) ถ้าข้อมูลมีความอ่อนไหว
- [ ] 🟡 `audit_logs`: กำหนดนโยบายเก็บ/ลบ และห้ามแอปมีสิทธิ์ DELETE/UPDATE ตารางนี้ (INSERT อย่างเดียว)

## 10. Dependencies / Supply chain
- [x] 🟠 อัปเดต frontend: `source-map-js` (high) - `npm audit fix`
- [ ] 🟠 backend: `uuid` ผ่าน `exceljs` (moderate) - ทดสอบอัปเดต/หาไลบรารีทดแทน
- [x] 🟡 เพิ่ม `npm audit --omit=dev --audit-level=high` ใน `.github/workflows/ci.yml`
- [ ] 🟡 เปิด Dependabot/Renovate สำหรับ frontend และ backend
- [ ] 🟡 commit `package-lock.json` เสมอ และใช้ `npm ci` ตอน deploy
- [ ] 🟡 อัปเดต Node.js LTS และ Windows/IIS/SQL Server patch เป็นประจำ

## 11. Logging / Monitoring / Audit
- [x] audit log ทุกคำขอที่แก้ข้อมูล, redact ฟิลด์ลับ, บันทึก login ล้มเหลว/ถูกบล็อก
- [ ] 🟠 ตั้งแจ้งเตือนเมื่อมี `auth.loginFailed`/`auth.loginBlocked` ผิดปกติ
- [ ] 🟠 หมุน log ของ PM2/IIS และจำกัดสิทธิ์อ่าน log
- [ ] 🟡 ไม่ log ข้อมูลส่วนบุคคลเกินจำเป็นใน `console.error`
- [ ] 🟡 ตรวจ audit log เป็นระยะ (การเปลี่ยน role, การสร้าง Admin)

## 12. Operations / Process
- [ ] 🟠 รัน Node/PM2 ด้วยบัญชี Windows สิทธิ์ต่ำ ไม่ใช่ Administrator/SYSTEM
- [ ] 🟠 เขียนแผนรับมือเหตุ (ใครทำอะไรเมื่อ secret รั่ว/บัญชีถูกยึด: เปลี่ยน JWT_SECRET → ทุกคนต้อง login ใหม่)
- [ ] 🟡 ทำ penetration test / security review ซ้ำหลังแก้รายการ 🔴 ทั้งหมด
- [ ] 🟡 เพิ่มขั้นตอน security review ในกระบวนการ merge (`/security-review`)
- [ ] 🟡 PDPA: ระบุข้อมูลส่วนบุคคลที่เก็บ (ชื่อ, แผนก, เบอร์, อีเมล, ลายเซ็น), ระยะเวลาเก็บ, และช่องทางลบข้อมูล

## ลำดับที่แนะนำ
1. 🔴 ทั้งหมด: JWT_SECRET, cookie secure, HTTPS, LDAPS, SQL encrypt, สิทธิ์ DB
2. 🟠 security header + ลบ `web.config` ตัวเก่า + escape LDAP/Excel + `TRUST_PROXY`
3. 🟠 dependency และ rate limit tablet
4. 🟡 ที่เหลือตามรอบ sprint

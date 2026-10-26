# Deployment guide (Windows Server + IIS + PM2)

ระบบเว็บแอปพลิเคชันสำหรับบริหารจัดการและจองห้องประชุม รถยนต์ส่วนกลาง และรถรับส่งพนักงาน พร้อมระบบ Active Directory (LDAP), จอแสดงผลหน้าห้องประชุม (Tablet), และการแจ้งเตือนทางอีเมล

---

## 🛠️ เทคโนโลยีที่ใช้
- **Frontend:** Vue 3, Vite, Tailwind CSS v4, Pinia, Vue Router, Vue I18n (รองรับ 2 ภาษา: ไทย / อังกฤษ)
- **Backend:** Node.js (ES Modules), Express 5, MSSQL (`mssql`), Nodemailer, Node-Cron
- **Database:** Microsoft SQL Server (รองรับ Collation `Thai_CI_AS`)
- **Deployment:** IIS (Frontend Static + ARR Reverse Proxy) + PM2 (Backend Process Manager)

---

## 📦 คู่มือการติดตั้งและ Deploy บน Windows Server

### 1. ความต้องการของระบบ (Prerequisites)
* **Windows Server** (2016 ขึ้นไปแนะนำ)
* **Node.js LTS** (เวอร์ชัน 20.x หรือใหม่กว่า)
* **Microsoft SQL Server** (หรือ SQL Server Express)
* **IIS (Internet Information Services)** เปิดใช้งานฟีเจอร์:
  - **URL Rewrite Module**
  - **Application Request Routing (ARR)** (ตั้งค่าเปิดใช้งาน Proxy ใน IIS Manager -> Server Proxy Settings -> Enable proxy)

---

### 2. ขั้นตอนการติดตั้งฐานข้อมูล (MSSQL)
รันสคริปต์เพื่อสร้าง Database และ Least-Privilege Login สำหรับแอปพลิเคชัน (ต้องใช้สิทธิ์ Admin เช่น `sa` รันครั้งเดียวตอนตั้งค่า):

```cmd
sqlcmd -S <ชื่อเครื่องเซิร์ฟเวอร์>\SQLEXPRESS -U sa -P <รหัสผ่าน_sa> ^
  -v DbName="booking_project_prod" LoginName="booking_app" LoginPassword="<ตั้งรหัสผ่านใหม่ที่ปลอดภัย>" ^
  -i deploy/mssql/setup-database.sql
```

---

### 3. การติดตั้งและรัน Backend
1. คัดลอกโฟลเดอร์ `backend/` ไปยังเซิร์ฟเวอร์ (เช่น `C:\inetpub\booking-backend`)
2. สร้างไฟล์ `.env` ในโฟลเดอร์ `backend/` โดยคัดลอกค่าจาก `.env.example`:
   ```env
   PORT=3000
   NODE_ENV=production
   JWT_SECRET=ใส่รหัสลับขนาดยาวที่สุ่มขึ้นมา
   JWT_EXPIRES_IN=8h
   UPLOAD_DIR=uploads
   
   DB_HOST=localhost
   DB_INSTANCE=SQLEXPRESS
   DB_NAME=booking_project_prod
   DB_USER=booking_app
   DB_PASSWORD=รหัสผ่านที่ตั้งตอนสร้าง Login
   DB_ENCRYPT=false

   LDAP_URL=ldap://ad.example.local:389
   LDAP_BASE_DN=DC=example,DC=local
   LDAP_DOMAIN=example.local
   LDAP_BIND_USER=
   LDAP_BIND_PASSWORD=

   SMTP_HOST=smtp.example.local
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_FROM="Room & Vehicle Booking System" <noreply@example.local>
   
   TRUST_PROXY=1
   ```
3. ติดตั้ง Dependencies และรัน Migration:
   ```cmd
   cd backend
   npm ci --production=false
   npm run migrate
   ```
4. **สร้างบัญชีผู้ดูแลระบบ (Super Admin) คนแรก:**
   ```cmd
   node src/db/create-local-user.js --username admin --password "รหัสผ่านแอดมิน" --fullName "System Administrator" --role Admin
   ```
5. ติดตั้งและเริ่มรัน Backend ผ่าน PM2:
   ```cmd
   npm install -g pm2 pm2-windows-startup
   pm2-startup install
   pm2 start deploy/pm2/ecosystem.config.js
   pm2 save
   ```

---

### 4. การ Build และติดตั้ง Frontend บน IIS
1. ที่เครื่องพัฒนาหรือเครื่อง Build ให้เปิดโฟลเดอร์ `frontend/` แล้วรันคำสั่ง:
   ```cmd
   npm run build
   ```
2. คัดลอกไฟล์ทั้งหมดในโฟลเดอร์ `frontend/dist/` ไปไว้ที่โฟลเดอร์ของเว็บไซต์ IIS (เช่น `C:\inetpub\wwwroot\booking`)
3. คัดลอกไฟล์ `deploy/iis/web.config` ไปไว้ที่ root ของเว็บไซต์ IIS (`C:\inetpub\wwwroot\booking\web.config`) เพื่อทำ URL Rewrite และ Reverse Proxy ไปยัง Backend พอร์ต `3000`
4. เปิด IIS Manager ผูกเว็บไซต์กับ Port ที่ต้องการ (เช่น Port 80 หรือ 443) และตรวจสอบว่าเปิดใช้งาน ARR Proxy เรียบร้อยแล้ว

---

### 5. การตั้งค่าหน้าจอ Tablet หน้าห้องประชุม
1. เปิดเว็บเบราว์เซอร์บน Tablet (Android / iPad) แล้วเข้าใช้งานระบบผ่าน URL ของบริษัท
2. เข้าสู่ระบบด้วยบัญชี Admin ไปที่เมนู **จัดการอุปกรณ์ (Devices)**
3. เพิ่มอุปกรณ์ใหม่ กำหนดชื่อ และเลือกห้องประชุมที่ต้องการผูก จากนั้นคัดลอกหรือเปิดหน้าจอ Tablet ผ่าน Token ที่ระบบสร้างให้
4. แนะนำให้ตั้งค่าเบราว์เซอร์บน Tablet เป็น **Add to Home screen**, ล็อกหน้าจอแนว landscape และเปิดโหมดป้องกันหน้าจอดับ (Keep Screen On)

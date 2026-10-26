import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production'
const DEV_JWT_SECRET = 'dev-secret-do-not-use-in-production'

// production ต้องตั้ง JWT_SECRET เอง (สุ่มยาว ≥ 32 ตัวอักษร) - ห้ามใช้ค่า fallback ของ dev หรือค่าตัวอย่างใน .env.example
function jwtSecret() {
  const value = process.env.JWT_SECRET
  if (!isProduction) return value || DEV_JWT_SECRET
  if (!value || value.length < 32 || value === DEV_JWT_SECRET || value.startsWith('change-me')) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production')
  }
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),

  // URL ที่ผู้ใช้เปิดระบบ (ใช้ทำลิงก์ในอีเมล เช่น http://booking.company.local) - เว้นว่าง = อีเมลไม่มีปุ่มลิงก์
  appBaseUrl: process.env.APP_BASE_URL ?? '',

  // cookie login ติด flag Secure (ส่งผ่าน HTTPS เท่านั้น) - ค่าเริ่มต้น: เปิดใน production, ตั้ง COOKIE_SECURE=false ได้ถ้ายังใช้ HTTP ภายใน
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,

  // จำนวน reverse proxy ที่อยู่หน้า backend (เช่น IIS ARR = 1) - เว้นว่าง = ไม่เชื่อ X-Forwarded-For
  trustProxy: process.env.TRUST_PROXY ?? '',

  // จำกัดล็อกอินผิดต่อ username ภายในหน้าต่างเวลา (นาที) - ดู modules/auth/loginLimiter.js
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5),
  loginWindowMinutes: Number(process.env.LOGIN_WINDOW_MINUTES ?? 15),

  jwtSecret: jwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',

  // โฟลเดอร์เก็บไฟล์แนบ (แบบฟอร์มขอรถ) - ต้องอยู่นอกโฟลเดอร์ที่ IIS เสิร์ฟ และต้อง backup แยกจาก DB
  uploadDir: path.resolve(backendRoot, process.env.UPLOAD_DIR ?? 'uploads'),

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    instance: process.env.DB_INSTANCE ?? 'SQLEXPRESS',
    database: process.env.DB_NAME ?? 'booking_project',
    user: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD ?? '',
    encrypt: process.env.DB_ENCRYPT === 'true',
    // true = ไม่ตรวจใบรับรองของ SQL Server (ค่าเดิม - ใช้เมื่อเซิร์ฟเวอร์ใช้ใบรับรองที่ออกเอง) | ตั้ง DB_TRUST_SERVER_CERT=false เมื่อมีใบรับรองที่ถูกต้อง
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT !== 'false',
  },

  ldap: {
    url: process.env.LDAP_URL ?? '',
    baseDn: process.env.LDAP_BASE_DN ?? '',
    domain: process.env.LDAP_DOMAIN ?? '',
    // บัญชีบริการ (read-only) สำหรับให้ Admin ค้นหา/เพิ่มผู้ใช้จาก AD - ไม่ต้องมีสิทธิ์ admin ใน AD
    bindUser: process.env.LDAP_BIND_USER ?? '',
    bindPassword: process.env.LDAP_BIND_PASSWORD ?? '',
  },

  // แจ้งเตือนทางอีเมลอย่างเดียว (dev 2026-09-30 ตัด LINE ออก)
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 25),
    secure: process.env.SMTP_SECURE === 'true', // true = SSL ตั้งแต่ต้น (465), false = STARTTLS ถ้าเซิร์ฟเวอร์รองรับ
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? '',
    // เซิร์ฟเวอร์เมลใช้ใบรับรองที่ออกเอง → pin ใบรับรองแทนการปิดตรวจ (ดู modules/notifications/mailer.js)
    caFile: process.env.SMTP_CA_FILE ?? '',
    tlsFingerprint: process.env.SMTP_TLS_FINGERPRINT ?? '',
    // ระหว่างพัฒนา/ทดสอบ: ส่งอีเมลทุกฉบับไปที่อีเมลนี้แทนผู้รับจริง (กันส่งถึงเพื่อนร่วมงานโดยไม่ตั้งใจ) - production เว้นว่าง
    redirectTo: process.env.MAIL_REDIRECT_TO ?? '',
  },
}

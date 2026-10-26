import fs from 'node:fs'
import nodemailer from 'nodemailer'
import { env } from '../../config/env.js'

/**
 * ตัวส่งอีเมล (แจ้งเตือนทางอีเมลอย่างเดียว - dev 2026-09-30)
 *
 * เซิร์ฟเวอร์เมลของบริษัทใช้ใบรับรองที่ออกเอง (self-signed, ชื่อไม่ตรงกับ host) Node จึงไม่เชื่อถือ
 * ห้ามแก้ด้วยการปิดตรวจใบรับรอง (รหัสผ่าน SMTP จะถูกดักได้) - ใช้การ "pin" แทน:
 *  - SMTP_CA_FILE          = ใบรับรองราก (root) ของเซิร์ฟเวอร์เมล ใช้ตรวจสายใบรับรอง
 *  - SMTP_TLS_FINGERPRINT  = SHA-256 fingerprint ของใบรับรองเซิร์ฟเวอร์ ยอมรับเฉพาะใบนี้เท่านั้น (แทนการเทียบชื่อ host)
 * ถ้า IT ติดตั้งใบรับรองที่ถูกต้องให้เซิร์ฟเวอร์เมลแล้ว เว้นว่างทั้งสองค่าได้เลย
 */
function tlsOptions() {
  const { caFile, tlsFingerprint } = env.smtp
  if (!caFile && !tlsFingerprint) return undefined
  const options = {}
  if (caFile) options.ca = [fs.readFileSync(caFile)]
  if (tlsFingerprint) {
    const expected = tlsFingerprint.replace(/[^0-9a-f]/gi, '').toUpperCase()
    options.checkServerIdentity = (_host, cert) => {
      const actual = (cert.fingerprint256 ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase()
      if (actual !== expected) return new Error('SMTP certificate fingerprint mismatch')
      return undefined
    }
  }
  return options
}

let transporter = null

export function getTransporter() {
  if (!transporter) {
    const { host, port, secure, user, password } = env.smtp
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure && port !== 25, // 587: บังคับ STARTTLS ไม่ยอมส่งรหัสผ่านแบบไม่เข้ารหัส
      auth: user ? { user, pass: password } : undefined,
      tls: tlsOptions(),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }
  return transporter
}

export function isMailConfigured() {
  return Boolean(env.smtp.host && env.smtp.from)
}

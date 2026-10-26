import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

/**
 * จำกัดการล็อกอินผิดซ้ำๆ (กันเดารหัสผ่าน และกันบัญชี AD ถูกล็อกจากการเดา)
 *  - ต่อ username: เกิน maxPerUser ครั้งภายใน windowMs → ปฏิเสธ 429 (ไม่ว่ามาจาก IP ไหน)
 *  - ต่อ IP: เกิน maxPerIp ครั้ง → ปฏิเสธ 429
 * เก็บในหน่วยความจำของ process (backend ตัวเดียวผ่าน PM2) - รีสตาร์ทแล้วเริ่มนับใหม่
 */
export function createLoginLimiter({ maxPerUser = 5, maxPerIp = 30, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const buckets = new Map() // key -> { count, first }

  const live = (key) => {
    const b = buckets.get(key)
    if (!b) return null
    if (now() - b.first >= windowMs) {
      buckets.delete(key)
      return null
    }
    return b
  }
  const bump = (key) => {
    const b = live(key)
    if (b) b.count += 1
    else buckets.set(key, { count: 1, first: now() })
  }
  const purge = () => {
    if (buckets.size < 5000) return
    for (const key of buckets.keys()) live(key)
  }
  const nameKey = (username) => `u:${String(username ?? '').trim().toLowerCase()}`
  const ipKey = (ip) => `ip:${ip ?? 'unknown'}`

  return {
    /** ถ้าถูกบล็อกอยู่ จะ throw AppError 429 พร้อมจำนวนวินาทีที่ต้องรอ */
    check(ip, username) {
      for (const [key, max] of [[nameKey(username), maxPerUser], [ipKey(ip), maxPerIp]]) {
        const b = live(key)
        if (b && b.count >= max) {
          const retryAfterSeconds = Math.max(1, Math.ceil((b.first + windowMs - now()) / 1000))
          throw new AppError(ErrorCodes.AUTH_TOO_MANY_ATTEMPTS, 429, { retryAfterSeconds })
        }
      }
    },
    fail(ip, username) {
      purge()
      bump(nameKey(username))
      bump(ipKey(ip))
    },
    success(ip, username) {
      buckets.delete(nameKey(username))
    },
  }
}

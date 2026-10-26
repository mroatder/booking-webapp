import { AppError } from '../errors/AppError.js'
import { ErrorCodes } from '../errors/codes.js'

/**
 * จำกัดจำนวนคำขอต่อ IP ภายในหน้าต่างเวลา (เก็บในหน่วยความจำของ process) - ใช้กับ endpoint สาธารณะ
 * เช่น จอ tablet ที่เข้าด้วย token ใน URL (กันเดา token / ยิงซ้ำ) เกินแล้วตอบ 429
 */
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const buckets = new Map() // ip -> { count, first }
  return function rateLimit(req, res, next) {
    const t = now()
    if (buckets.size > 5000) {
      for (const [key, b] of buckets) if (t - b.first >= windowMs) buckets.delete(key)
    }
    const key = req.ip ?? 'unknown'
    let b = buckets.get(key)
    if (!b || t - b.first >= windowMs) {
      b = { count: 0, first: t }
      buckets.set(key, b)
    }
    b.count += 1
    if (b.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((b.first + windowMs - t) / 1000))
      res.set('Retry-After', String(retryAfterSeconds))
      return next(new AppError(ErrorCodes.AUTH_TOO_MANY_ATTEMPTS, 429, { retryAfterSeconds }))
    }
    next()
  }
}

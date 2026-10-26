import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '../src/middleware/rateLimit.js'

function run(limiter, ip) {
  let err = null
  limiter({ ip }, { set() {} }, (e) => {
    err = e ?? null
  })
  return err
}

describe('createRateLimiter', () => {
  it('ผ่านจนถึงเพดาน แล้วตอบ 429 และเริ่มนับใหม่เมื่อพ้นหน้าต่างเวลา', () => {
    let t = 0
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    expect(run(limiter, '1.1.1.1')).toBeNull()
    expect(run(limiter, '1.1.1.1')).toBeNull()
    expect(run(limiter, '1.1.1.1').statusCode).toBe(429)
    expect(run(limiter, '2.2.2.2')).toBeNull() // IP อื่นไม่โดน
    t = 1000
    expect(run(limiter, '1.1.1.1')).toBeNull()
  })
})

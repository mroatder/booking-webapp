import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { createLoginLimiter } from '../src/modules/auth/loginLimiter.js'

vi.mock('../src/db/pool.js', () => ({ getPool: vi.fn().mockResolvedValue({}), sql: {} }))
vi.mock('../src/modules/auth/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  login: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { AppError } from '../src/errors/AppError.js'
import * as authService from '../src/modules/auth/service.js'

describe('createLoginLimiter', () => {
  let t
  const limiter = () => createLoginLimiter({ maxPerUser: 3, maxPerIp: 5, windowMs: 1000, now: () => t })
  beforeEach(() => {
    t = 0
  })

  it('blocks a username after too many failures, from any IP, and reports how long to wait', () => {
    const l = limiter()
    for (let i = 0; i < 3; i++) l.fail('1.1.1.1', 'Somchai')
    expect(() => l.check('9.9.9.9', 'somchai')).toThrow(AppError)
    try {
      l.check('9.9.9.9', 'SOMCHAI')
    } catch (e) {
      expect(e.code).toBe('AUTH_TOO_MANY_ATTEMPTS')
      expect(e.statusCode).toBe(429)
      expect(e.details.retryAfterSeconds).toBe(1)
    }
  })

  it('unblocks after the window and resets the user counter on success', () => {
    const l = limiter()
    for (let i = 0; i < 3; i++) l.fail('1.1.1.1', 'a')
    t = 1000
    expect(() => l.check('1.1.1.1', 'a')).not.toThrow()
    for (let i = 0; i < 2; i++) l.fail('1.1.1.1', 'b')
    l.success('1.1.1.1', 'b')
    l.fail('1.1.1.1', 'b')
    expect(() => l.check('1.1.1.1', 'b')).not.toThrow()
  })

  it('blocks an IP that tries many different usernames', () => {
    const l = limiter()
    for (let i = 0; i < 5; i++) l.fail('2.2.2.2', 'user' + i)
    expect(() => l.check('2.2.2.2', 'someone-new')).toThrow(AppError)
    expect(() => l.check('3.3.3.3', 'someone-new')).not.toThrow()
  })
})

describe('POST /api/auth/login throttling', () => {
  const app = createApp()
  beforeEach(() => vi.clearAllMocks())

  it('answers 429 with Retry-After after repeated wrong passwords and leaves other users alone', async () => {
    authService.login.mockRejectedValue(new AppError('AUTH_INVALID_CREDENTIALS', 401))
    const codes = []
    for (let i = 0; i < 7; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ username: 'victim', password: 'x' + i })
      codes.push(r.status)
      if (r.status === 429) {
        expect(r.body.errorCode).toBe('AUTH_TOO_MANY_ATTEMPTS')
        expect(Number(r.headers['retry-after'])).toBeGreaterThan(0)
      }
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429, 429])

    // บล็อกเฉพาะ username ที่ถูกเดา - คนอื่นยังล็อกอินได้
    authService.login.mockResolvedValue({ token: 't', user: { id: 2 } })
    const ok = await request(app).post('/api/auth/login').send({ username: 'colleague', password: 'right' })
    expect(ok.status).toBe(200)

    // ระหว่างถูกบล็อก ไม่มีการเรียกตรวจรหัสผ่านอีก (ไม่ไปรบกวน AD)
    authService.login.mockClear()
    await request(app).post('/api/auth/login').send({ username: 'victim', password: 'right' })
    expect(authService.login).not.toHaveBeenCalled()
  })
})

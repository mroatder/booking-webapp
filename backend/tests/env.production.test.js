import { describe, it, expect, vi, afterEach } from 'vitest'

const load = () => import('../src/config/env.js')

describe('env (production)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each([['', 'ว่าง'], ['short', 'สั้นเกิน'], ['dev-secret-do-not-use-in-production', 'ค่า dev'], ['change-me-to-a-long-random-string-xxxxxxxx', 'ค่าตัวอย่าง']])(
    'ไม่ยอมเริ่มเมื่อ JWT_SECRET = %s (%s)',
    async (secret) => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('JWT_SECRET', secret)
      await expect(load()).rejects.toThrow(/JWT_SECRET/)
    },
  )

  it('เริ่มได้เมื่อ JWT_SECRET แข็งแรง และเปิด cookie secure เป็นค่าเริ่มต้น', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JWT_SECRET', 'x'.repeat(48))
    const { env } = await load()
    expect(env.cookieSecure).toBe(true)
  })
})

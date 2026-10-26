import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/users/repository.js', () => ({
  findByUsername: vi.fn(),
  findById: vi.fn(),
  upsertFromAd: vi.fn(),
  updatePhone: vi.fn(),
  updateEmail: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as usersRepo from '../src/modules/users/repository.js'

function authCookie(role = 'Employee', id = 1) {
  const token = jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })
  return `token=${token}`
}

function userRow(overrides = {}) {
  return {
    UserID: 1,
    Username: 'john',
    FullName: 'John AD',
    Department: 'IT',
    Phone: null,
    Email: 'john@example.local',
    AuthSource: 'AD',
    Role: 'Employee',
    IsActive: true,
    ...overrides,
  }
}

const app = createApp()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PUT /api/auth/me/phone', () => {
  it('requires authentication', async () => {
    const res = await request(app).put('/api/auth/me/phone').send({ phone: '0811111111' })
    expect(res.status).toBe(401)
  })

  it("updates only the caller's own phone (AD users included), trimmed", async () => {
    usersRepo.updatePhone.mockResolvedValue(userRow({ Phone: '081-111-1111' }))
    const res = await request(app)
      .put('/api/auth/me/phone')
      .set('Cookie', authCookie('Employee', 7))
      .send({ phone: '  081-111-1111  ', userId: 99 })

    expect(res.status).toBe(200)
    expect(usersRepo.updatePhone).toHaveBeenCalledWith(expect.anything(), 7, '081-111-1111')
    expect(res.body.user).toMatchObject({ phone: '081-111-1111', authSource: 'AD' })
  })

  it('clears the phone when sent empty', async () => {
    usersRepo.updatePhone.mockResolvedValue(userRow())
    await request(app).put('/api/auth/me/phone').set('Cookie', authCookie()).send({ phone: '   ' })
    expect(usersRepo.updatePhone).toHaveBeenCalledWith(expect.anything(), 1, null)
  })

  it.each([
    ['too long', { phone: '0'.repeat(51) }],
    ['not a string', { phone: 812345678 }],
  ])('rejects a phone that is %s', async (_label, body) => {
    const res = await request(app).put('/api/auth/me/phone').set('Cookie', authCookie()).send(body)
    expect(res.status).toBe(400)
    expect(usersRepo.updatePhone).not.toHaveBeenCalled()
  })

  it('rejects a deactivated account', async () => {
    usersRepo.updatePhone.mockResolvedValue(userRow({ IsActive: false }))
    const res = await request(app).put('/api/auth/me/phone').set('Cookie', authCookie()).send({ phone: '1234' })
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/auth/me/email', () => {
  it('requires authentication', async () => {
    const res = await request(app).put('/api/auth/me/email').send({ email: 'a@b.co' })
    expect(res.status).toBe(401)
  })

  it("updates only the caller's own email (AD users included), trimmed", async () => {
    usersRepo.updateEmail.mockResolvedValue(userRow({ Email: 'me@corp.test' }))
    const res = await request(app)
      .put('/api/auth/me/email')
      .set('Cookie', authCookie('Employee', 7))
      .send({ email: '  me@corp.test  ', userId: 99 })

    expect(res.status).toBe(200)
    expect(usersRepo.updateEmail).toHaveBeenCalledWith(expect.anything(), 7, 'me@corp.test')
    expect(res.body.user).toMatchObject({ email: 'me@corp.test', authSource: 'AD' })
  })

  it('clears the email when sent empty', async () => {
    usersRepo.updateEmail.mockResolvedValue(userRow())
    await request(app).put('/api/auth/me/email').set('Cookie', authCookie()).send({ email: '   ' })
    expect(usersRepo.updateEmail).toHaveBeenCalledWith(expect.anything(), 1, null)
  })

  it.each([
    ['malformed', { email: 'not-an-email' }],
    ['too long', { email: `${'a'.repeat(251)}@b.co` }],
    ['not a string', { email: 123 }],
  ])('rejects an email that is %s', async (_label, body) => {
    const res = await request(app).put('/api/auth/me/email').set('Cookie', authCookie()).send(body)
    expect(res.status).toBe(400)
    expect(usersRepo.updateEmail).not.toHaveBeenCalled()
  })
})

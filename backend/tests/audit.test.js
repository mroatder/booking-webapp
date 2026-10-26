import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import express from 'express'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/audit/repository.js', () => ({
  insert: vi.fn(),
  list: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as repo from '../src/modules/audit/repository.js'
import { describeRequest, sanitize, buildDetails, KNOWN_ACTIONS } from '../src/modules/audit/actions.js'
import { recordAudit, loadBefore, toPublicLog } from '../src/modules/audit/service.js'
import { createAuditTrail } from '../src/middleware/audit.js'

const cookie = (role = 'Admin', id = 1) => `token=${jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })}`

describe('describeRequest', () => {
  it('maps a route to an action, entity and id', () => {
    expect(describeRequest('POST', '/api/bookings/12/checkin?x=1')).toEqual({
      template: '/bookings/:id/checkin',
      entityType: 'booking',
      entityId: 12,
      action: 'booking.checkin',
    })
    expect(describeRequest('DELETE', '/api/vehicle-requests/7/attachments/3')).toMatchObject({
      action: 'vehicleRequest.removeAttachment',
      entityId: 7,
    })
  })

  it('never keeps a tablet token in the stored path', () => {
    const token = 'a'.repeat(40)
    const r = describeRequest('POST', `/api/tablet/display/${token}/checkin`)
    expect(r.template).toBe('/tablet/display/:token/checkin')
    expect(r.action).toBe('booking.checkinTablet')
  })

  it('falls back to entity.method for unknown routes', () => {
    expect(describeRequest('PATCH', '/api/rooms/5/something').action).toBe('room.patch')
    expect(describeRequest('POST', '/api/unknown').action).toBe('api.post')
  })

  it('covers approval and user changes named by the plan', () => {
    expect(KNOWN_ACTIONS).toEqual(
      expect.arrayContaining(['vehicleRequest.approve', 'vehicleRequest.reject', 'user.update', 'vehicleRequest.assign', 'auth.loginFailed']),
    )
  })
})

describe('sanitize / buildDetails', () => {
  it('redacts secrets and shortens long values', () => {
    const out = sanitize({ username: 'a', password: 'x', nested: { signatureData: 'y', ok: 'z' }, long: 'q'.repeat(900) })
    expect(out.password).toBe('[redacted]')
    expect(out.nested.signatureData).toBe('[redacted]')
    expect(out.nested.ok).toBe('z')
    expect(out.long.length).toBeLessThan(600)
  })

  it('returns null when there is nothing to store and valid JSON when too large', () => {
    expect(buildDetails({})).toBeNull()
    const big = buildDetails({ body: { items: Array.from({ length: 50 }, () => ({ t: 'x'.repeat(400) })) } })
    expect(big.length).toBeLessThanOrEqual(8000)
    expect(() => JSON.parse(big)).not.toThrow()
  })
})

describe('recordAudit', () => {
  it('writes through the injected writer and never throws when it fails', async () => {
    const write = vi.fn().mockRejectedValue(new Error('db down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordAudit({ action: 'x.y', body: { a: 1 } }, { pool: {}, write })).resolves.toBeUndefined()
    expect(write).toHaveBeenCalledOnce()
    expect(JSON.parse(write.mock.calls[0][1].details)).toEqual({ body: { a: 1 } })
    errSpy.mockRestore()
  })

  it('is skipped under test unless a pool is injected', async () => {
    const write = vi.fn()
    await recordAudit({ action: 'x.y' }, { write })
    expect(write).not.toHaveBeenCalled()
  })
})

describe('loadBefore', () => {
  it('returns a sanitized snapshot, or undefined when the loader fails', async () => {
    const loaders = { user: vi.fn().mockResolvedValue({ UserID: 1, PasswordHash: 'secret', Role: 'Admin' }) }
    expect(await loadBefore('user', 1, { pool: {}, loaders })).toEqual({ UserID: 1, PasswordHash: '[redacted]', Role: 'Admin' })
    loaders.user.mockRejectedValue(new Error('x'))
    expect(await loadBefore('user', 1, { pool: {}, loaders })).toBeUndefined()
    expect(await loadBefore('nothing', 1, { pool: {}, loaders })).toBeUndefined()
  })
})

describe('auditTrail middleware', () => {
  function appWith(record, before = vi.fn().mockResolvedValue(undefined)) {
    const app = express()
    app.use(express.json())
    app.use('/api', createAuditTrail({ record, before }))
    app.get('/api/rooms', (req, res) => res.json([]))
    app.put('/api/users/9', (req, res) => {
      req.user = { id: 4, role: 'Admin' }
      res.json({ ok: true })
    })
    app.post('/api/bookings', (req, res) => res.status(400).json({ errorCode: 'VALIDATION_ERROR' }))
    app.post('/api/auth/login', (req, res) => res.status(req.body.password === 'good' ? 200 : 401).json({}))
    return app
  }

  it('does not log reads or failed requests', async () => {
    const record = vi.fn()
    const app = appWith(record)
    await request(app).get('/api/rooms')
    await request(app).post('/api/bookings').send({})
    expect(record).not.toHaveBeenCalled()
  })

  it('logs a successful change with the actor, before snapshot and body', async () => {
    const record = vi.fn()
    const before = vi.fn().mockResolvedValue({ Role: 'Employee' })
    await request(appWith(record, before)).put('/api/users/9').send({ role: 'Admin', approvalLevel: 2 })
    expect(before).toHaveBeenCalledWith('user', 9)
    expect(record).toHaveBeenCalledOnce()
    expect(record.mock.calls[0][0]).toMatchObject({
      userId: 4,
      action: 'user.update',
      entityType: 'user',
      entityId: 9,
      path: '/users/:id',
      statusCode: 200,
      before: { Role: 'Employee' },
      body: { role: 'Admin', approvalLevel: 2 },
    })
  })

  it('logs login success and failure without the password', async () => {
    const record = vi.fn()
    const app = appWith(record)
    await request(app).post('/api/auth/login').send({ username: 'somchai', password: 'good' })
    await request(app).post('/api/auth/login').send({ username: 'somchai', password: 'bad' })
    expect(record.mock.calls.map((c) => c[0].action)).toEqual(['auth.login', 'auth.loginFailed'])
    for (const [entry] of record.mock.calls) {
      expect(entry.actor).toBe('somchai')
      expect(entry.body).toBeUndefined()
    }
  })
})

describe('GET /api/audit', () => {
  const app = createApp()

  beforeEach(() => {
    repo.list.mockReset()
    repo.list.mockResolvedValue({
      total: 1,
      items: [
        { AuditLogID: 5, CreatedAt: new Date('2026-10-08T03:00:00Z'), UserID: 2, Username: 'somchai', FullName: 'Somchai', Action: 'booking.create', EntityType: 'booking', EntityID: 11, Method: 'POST', Path: '/bookings', StatusCode: 201, IpAddress: '10.0.0.5', Details: '{"body":{"title":"x"}}' },
      ],
    })
  })

  it('requires login and Admin', async () => {
    expect((await request(app).get('/api/audit')).status).toBe(401)
    expect((await request(app).get('/api/audit').set('Cookie', cookie('Employee', 2))).status).toBe(403)
  })

  it('returns the page with parsed details and passes filters (Bangkok day boundaries)', async () => {
    const res = await request(app)
      .get('/api/audit?from=2026-10-01&to=2026-10-02&action=booking.create&entityType=booking&q=abc&page=2&pageSize=10')
      .set('Cookie', cookie())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 1, page: 2, pageSize: 10 })
    expect(res.body.items[0]).toMatchObject({ id: '5', action: 'booking.create', username: 'somchai', details: { body: { title: 'x' } } })

    const [, filters, paging] = repo.list.mock.calls[0]
    expect(filters.from.toISOString()).toBe('2026-09-30T17:00:00.000Z')
    expect(filters.to.toISOString()).toBe('2026-10-02T17:00:00.000Z')
    expect(filters).toMatchObject({ action: 'booking.create', entityType: 'booking', q: 'abc' })
    expect(paging).toEqual({ limit: 10, offset: 10 })
  })

  it('rejects malformed filters and caps the page size', async () => {
    for (const q of ['from=nope', 'userId=-1', 'action=drop%20table', 'from=2026-10-05&to=2026-10-01']) {
      expect((await request(app).get(`/api/audit?${q}`).set('Cookie', cookie())).status).toBe(400)
    }
    await request(app).get('/api/audit?pageSize=9999').set('Cookie', cookie())
    expect(repo.list.mock.calls.at(-1)[2].limit).toBe(200)
  })

  it('lists known actions for the filter', async () => {
    const res = await request(app).get('/api/audit/actions').set('Cookie', cookie())
    expect(res.status).toBe(200)
    expect(res.body).toContain('vehicleRequest.approve')
  })
})

describe('toPublicLog', () => {
  it('keeps unparseable details instead of failing', () => {
    expect(toPublicLog({ AuditLogID: 1, Action: 'a.b', Details: 'not json' }).details).toEqual({ raw: 'not json' })
  })
})

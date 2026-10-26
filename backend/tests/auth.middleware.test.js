import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { requireAuth, requireRole } from '../src/middleware/auth.js'
import { env } from '../src/config/env.js'
import { ErrorCodes } from '../src/errors/codes.js'
import { loadCurrentUser } from '../src/modules/auth/currentUser.js'

describe('requireAuth', () => {
  beforeEach(() => {
    loadCurrentUser.mockReset()
    loadCurrentUser.mockImplementation(async (payload) => ({ UserID: payload.sub, IsActive: true, Role: payload.role }))
  })
  const tokenFor = (claims) => jwt.sign(claims, env.jwtSecret, { expiresIn: '1h' })

  it('rejects when there is no token cookie', async () => {
    const next = vi.fn()
    await requireAuth({ cookies: {} }, {}, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0].code).toBe(ErrorCodes.AUTH_UNAUTHENTICATED)
  })

  it('rejects when the token is invalid', async () => {
    const next = vi.fn()
    await requireAuth({ cookies: { token: 'not-a-real-jwt' } }, {}, next)

    expect(next.mock.calls[0][0].code).toBe(ErrorCodes.AUTH_UNAUTHENTICATED)
  })

  it('attaches req.user and calls next() when the token is valid', async () => {
    const req = { cookies: { token: tokenFor({ sub: 5, role: 'Admin' }) } }
    const next = vi.fn()

    await requireAuth(req, {}, next)

    expect(next).toHaveBeenCalledWith()
    expect(req.user).toEqual({ id: 5, role: 'Admin' })
  })

  it('uses the CURRENT role from the database, not the role inside the token (demotion applies immediately)', async () => {
    loadCurrentUser.mockResolvedValue({ UserID: 5, IsActive: true, Role: 'Employee' })
    const req = { cookies: { token: tokenFor({ sub: 5, role: 'Admin' }) } }
    const next = vi.fn()

    await requireAuth(req, {}, next)

    expect(req.user).toEqual({ id: 5, role: 'Employee' })
    const guard = vi.fn()
    requireRole('Admin')(req, {}, guard)
    expect(guard.mock.calls[0][0].code).toBe(ErrorCodes.AUTH_FORBIDDEN)
  })

  it('rejects a user who was deactivated after the token was issued', async () => {
    loadCurrentUser.mockResolvedValue({ UserID: 5, IsActive: false, Role: 'Employee' })
    const next = vi.fn()
    await requireAuth({ cookies: { token: tokenFor({ sub: 5, role: 'Employee' }) } }, {}, next)
    expect(next.mock.calls[0][0].code).toBe(ErrorCodes.AUTH_UNAUTHENTICATED)
  })

  it('rejects a user that no longer exists', async () => {
    loadCurrentUser.mockResolvedValue(null)
    const next = vi.fn()
    await requireAuth({ cookies: { token: tokenFor({ sub: 5, role: 'Admin' }) } }, {}, next)
    expect(next.mock.calls[0][0].code).toBe(ErrorCodes.AUTH_UNAUTHENTICATED)
  })

  it('passes a database failure on to the error handler instead of letting the request through', async () => {
    const boom = new Error('db down')
    loadCurrentUser.mockRejectedValue(boom)
    const next = vi.fn()
    await requireAuth({ cookies: { token: tokenFor({ sub: 5, role: 'Admin' }) } }, {}, next)
    expect(next).toHaveBeenCalledWith(boom)
  })
})

describe('requireRole', () => {
  it('allows the request when the role matches', () => {
    const next = vi.fn()
    requireRole('Admin')({ user: { role: 'Admin' } }, {}, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('rejects with AUTH_FORBIDDEN when the role does not match', () => {
    const next = vi.fn()
    requireRole('Admin')({ user: { role: 'Employee' } }, {}, next)
    expect(next.mock.calls[0][0].code).toBe(ErrorCodes.AUTH_FORBIDDEN)
  })

  it('rejects when req.user is missing (requireAuth was skipped)', () => {
    const next = vi.fn()
    requireRole('Admin')({}, {}, next)
    expect(next.mock.calls[0][0].code).toBe(ErrorCodes.AUTH_FORBIDDEN)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/rooms/repository.js', () => ({
  listAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  setActive: vi.fn(),
  countUpcomingBookings: vi.fn(),
  findByName: vi.fn().mockResolvedValue(null),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as roomsRepo from '../src/modules/rooms/repository.js'
import { AppError } from '../src/errors/AppError.js'

function authCookie(role = 'Admin', id = 1) {
  const token = jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })
  return `token=${token}`
}

const app = createApp()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/rooms', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/rooms')
    expect(res.status).toBe(401)
    expect(res.body.errorCode).toBe('AUTH_UNAUTHENTICATED')
  })

  it('returns rooms for any authenticated user, not just Admin', async () => {
    roomsRepo.listAll.mockResolvedValue([
      {
        RoomID: 1,
        Name: 'ห้องประชุม A',
        Floor: '3',
        CreatedAt: new Date(),
      },
    ])

    const res = await request(app).get('/api/rooms').set('Cookie', authCookie('Employee'))

    expect(res.status).toBe(200)
    expect(res.body.rooms).toEqual([expect.objectContaining({ id: 1, name: 'ห้องประชุม A', floor: '3' })])
  })
})

describe('POST /api/rooms', () => {
  it('rejects non-Admin users', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Cookie', authCookie('Employee'))
      .send({ name: 'x' })

    expect(res.status).toBe(403)
    expect(res.body.errorCode).toBe('AUTH_FORBIDDEN')
  })

  it('validates input (empty name)', async () => {
    const res = await request(app).post('/api/rooms').set('Cookie', authCookie('Admin')).send({ name: '' })

    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('VALIDATION_ERROR')
    expect(roomsRepo.create).not.toHaveBeenCalled()
  })

  it('creates a room as Admin', async () => {
    roomsRepo.create.mockResolvedValue({
      RoomID: 2,
      Name: 'ห้องประชุม B',
      Floor: null,
      CreatedAt: new Date(),
    })

    const res = await request(app)
      .post('/api/rooms')
      .set('Cookie', authCookie('Admin'))
      .send({ name: 'ห้องประชุม B' })

    expect(res.status).toBe(201)
    expect(res.body.room.name).toBe('ห้องประชุม B')
    expect(roomsRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'ห้องประชุม B', floor: null }),
    )
  })
})

describe('DELETE /api/rooms/:id', () => {
  it('returns 404 when the room does not exist', async () => {
    roomsRepo.findById.mockResolvedValue(null)

    const res = await request(app).delete('/api/rooms/999').set('Cookie', authCookie('Admin'))

    expect(res.status).toBe(404)
    expect(roomsRepo.remove).not.toHaveBeenCalled()
  })
})

describe('room deletion keeps booking history', () => {
  it('deletes a room that was never booked', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1 })
    roomsRepo.remove.mockResolvedValue()
    const res = await request(app).delete('/api/rooms/1').set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(204)
  })

  it('refuses to delete a room with bookings and says how many (was a 500 from the foreign key)', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1 })
    roomsRepo.remove.mockRejectedValue(new AppError('ROOM_IN_USE', 409, { bookings: 12 }))
    const res = await request(app).delete('/api/rooms/1').set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ errorCode: 'ROOM_IN_USE', details: { bookings: 12 } })
  })

  it('refuses to deactivate a room that still has upcoming bookings', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1 })
    roomsRepo.countUpcomingBookings.mockResolvedValue(3)
    const res = await request(app).put('/api/rooms/1/active').set('Cookie', authCookie('Admin')).send({ isActive: false })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ errorCode: 'ROOM_HAS_UPCOMING_BOOKINGS', details: { bookings: 3 } })
    expect(roomsRepo.setActive).not.toHaveBeenCalled()
  })

  it('deactivates and reactivates a room', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1 })
    roomsRepo.countUpcomingBookings.mockResolvedValue(0)
    roomsRepo.setActive.mockResolvedValue({ RoomID: 1, Name: 'A', IsActive: false })
    const off = await request(app).put('/api/rooms/1/active').set('Cookie', authCookie('Admin')).send({ isActive: false })
    expect(off.status).toBe(200)
    expect(off.body.room.isActive).toBe(false)
    await request(app).put('/api/rooms/1/active').set('Cookie', authCookie('Admin')).send({ isActive: true })
    expect(roomsRepo.countUpcomingBookings).toHaveBeenCalledTimes(1)
    expect(roomsRepo.setActive).toHaveBeenLastCalledWith({}, 1, true)
  })

  it('only admins see deactivated rooms', async () => {
    roomsRepo.listAll.mockResolvedValue([])
    await request(app).get('/api/rooms?includeInactive=true').set('Cookie', authCookie('Employee'))
    expect(roomsRepo.listAll).toHaveBeenLastCalledWith({}, { includeInactive: false })
    await request(app).get('/api/rooms?includeInactive=true').set('Cookie', authCookie('Admin'))
    expect(roomsRepo.listAll).toHaveBeenLastCalledWith({}, { includeInactive: true })
  })
})

describe('room name uniqueness', () => {
  it('rejects a duplicate name on create with NAME_TAKEN', async () => {
    roomsRepo.findByName.mockResolvedValueOnce({ RoomID: 9, Name: 'ห้อง A' })
    const res = await request(app).post('/api/rooms').set('Cookie', authCookie('Admin')).send({ name: 'ห้อง A' })
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('NAME_TAKEN')
  })
})

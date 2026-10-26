import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/tablet/repository.js', () => ({
  listAll: vi.fn(),
  findById: vi.fn(),
  findByToken: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  regenerateToken: vi.fn(),
  touchLastSeen: vi.fn(),
}))

vi.mock('../src/modules/rooms/repository.js', () => ({
  findById: vi.fn(),
}))

vi.mock('../src/modules/bookings/repository.js', () => ({
  listBusyRanges: vi.fn(async () => []),
  findById: vi.fn(),
  checkin: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as devicesRepo from '../src/modules/tablet/repository.js'
import * as roomsRepo from '../src/modules/rooms/repository.js'
import * as bookingsRepo from '../src/modules/bookings/repository.js'

function authCookie(role = 'Admin', id = 1) {
  const token = jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })
  return `token=${token}`
}

function device(overrides = {}) {
  return {
    DeviceID: 5,
    Name: 'จอหน้าห้อง A',
    RoomID: 1,
    RoomName: 'A',
    RoomFloor: '3',
    RoomIsActive: true,
    Token: 'tok',
    LastSeenAt: null,
    ...overrides,
  }
}

const app = createApp()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/tablet/display/:token', () => {
  it('shows the schedule of the room the device is assigned to, and records that it was seen', async () => {
    devicesRepo.findByToken.mockResolvedValue(device())
    const res = await request(app).get('/api/tablet/display/tok')
    expect(res.status).toBe(200)
    expect(res.body.room).toEqual({ id: 1, name: 'A', floor: '3' })
    expect(devicesRepo.touchLastSeen).toHaveBeenCalledWith({}, 5)
  })

  it('404s for an unknown or deleted device token', async () => {
    devicesRepo.findByToken.mockResolvedValue(null)
    expect((await request(app).get('/api/tablet/display/nope')).status).toBe(404)
  })

  it.each([[{ RoomID: null, RoomName: null }], [{ RoomIsActive: false }]])(
    'tells a device without an active room that it is not assigned (still counts as seen) %j',
    async (overrides) => {
      devicesRepo.findByToken.mockResolvedValue(device(overrides))
      const res = await request(app).get('/api/tablet/display/tok')
      expect(res.status).toBe(409)
      expect(res.body.errorCode).toBe('DEVICE_NOT_ASSIGNED')
      expect(devicesRepo.touchLastSeen).toHaveBeenCalled()
    },
  )
})

describe('GET /api/tablet/display/:token/calendar', () => {
  function thisMonth(offset = 0) {
    const d = new Date()
    d.setMonth(d.getMonth() + offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  it('returns every booking of the device room in that month only, including auto-released ones, with status', async () => {
    devicesRepo.findByToken.mockResolvedValue(device())
    bookingsRepo.listBusyRanges.mockResolvedValue([
      { BookingID: 1, StartTime: new Date(), EndTime: new Date(), Title: 'ประชุม', Status: 'AutoReleased' },
    ])
    const res = await request(app).get(`/api/tablet/display/tok/calendar?month=${thisMonth()}`)
    expect(res.status).toBe(200)
    expect(res.body.bookings).toEqual([expect.objectContaining({ bookingId: 1, title: 'ประชุม', status: 'AutoReleased' })])
    const [, roomId, from, to, options] = bookingsRepo.listBusyRanges.mock.calls[0]
    expect(roomId).toBe(1)
    expect(options).toEqual({ includeReleased: true })
    expect(from.getDate()).toBe(1)
    expect(to.getDate()).toBe(1)
    expect(to.getMonth()).toBe((from.getMonth() + 1) % 12)
  })

  it.each([['2026-13'], ['abc'], [''], ['1999-01']])('rejects month %s', async (month) => {
    devicesRepo.findByToken.mockResolvedValue(device())
    const res = await request(app).get(`/api/tablet/display/tok/calendar?month=${month}`)
    expect(res.status).toBe(400)
  })

  it('404s for an unknown token and 409s for a device without a room', async () => {
    devicesRepo.findByToken.mockResolvedValueOnce(null)
    expect((await request(app).get(`/api/tablet/display/x/calendar?month=${thisMonth()}`)).status).toBe(404)
    devicesRepo.findByToken.mockResolvedValueOnce(device({ RoomID: null }))
    expect((await request(app).get(`/api/tablet/display/x/calendar?month=${thisMonth(1)}`)).status).toBe(409)
  })
})

describe('/api/tablet/devices (Admin)', () => {
  it('is admin only', async () => {
    const res = await request(app).get('/api/tablet/devices').set('Cookie', authCookie('Employee'))
    expect(res.status).toBe(403)
  })

  it('lists devices with online status from when they were last seen', async () => {
    devicesRepo.listAll.mockResolvedValue([
      device({ LastSeenAt: new Date() }),
      device({ DeviceID: 6, RoomID: null, RoomName: null, LastSeenAt: new Date(Date.now() - 10 * 60 * 1000) }),
      device({ DeviceID: 7 }),
    ])
    const res = await request(app).get('/api/tablet/devices').set('Cookie', authCookie())
    expect(res.body.devices.map((d) => d.status)).toEqual(['Online', 'Offline', 'NeverConnected'])
    expect(res.body.devices[1]).toMatchObject({ roomId: null, roomIsActive: null })
  })

  it('adds a device, with or without a room', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1, IsActive: true })
    devicesRepo.create.mockResolvedValue(device())
    const withRoom = await request(app).post('/api/tablet/devices').set('Cookie', authCookie()).send({ name: ' จอ A ', roomId: 1 })
    expect(withRoom.status).toBe(201)
    expect(devicesRepo.create).toHaveBeenLastCalledWith({}, { name: 'จอ A', roomId: 1 })

    await request(app).post('/api/tablet/devices').set('Cookie', authCookie()).send({ name: 'สำรอง', roomId: '' })
    expect(devicesRepo.create).toHaveBeenLastCalledWith({}, { name: 'สำรอง', roomId: null })
  })

  it('rejects a missing name, an unknown room, or a deactivated room', async () => {
    expect((await request(app).post('/api/tablet/devices').set('Cookie', authCookie()).send({ name: ' ' })).status).toBe(400)
    roomsRepo.findById.mockResolvedValueOnce(null)
    expect((await request(app).post('/api/tablet/devices').set('Cookie', authCookie()).send({ name: 'x', roomId: 9 })).status).toBe(404)
    roomsRepo.findById.mockResolvedValueOnce({ RoomID: 2, IsActive: false })
    const inactive = await request(app).post('/api/tablet/devices').set('Cookie', authCookie()).send({ name: 'x', roomId: 2 })
    expect(inactive.body.errorCode).toBe('ROOM_INACTIVE')
    expect(devicesRepo.create).not.toHaveBeenCalled()
  })

  it('moves a device to another room', async () => {
    devicesRepo.findById.mockResolvedValue(device())
    roomsRepo.findById.mockResolvedValue({ RoomID: 2, IsActive: true })
    devicesRepo.update.mockResolvedValue(device({ RoomID: 2 }))
    const res = await request(app).put('/api/tablet/devices/5').set('Cookie', authCookie()).send({ name: 'จอ', roomId: 2 })
    expect(res.status).toBe(200)
    expect(devicesRepo.update).toHaveBeenCalledWith({}, '5', { name: 'จอ', roomId: 2 })
  })

  it('deletes a device', async () => {
    devicesRepo.findById.mockResolvedValue(device())
    const res = await request(app).delete('/api/tablet/devices/5').set('Cookie', authCookie())
    expect(res.status).toBe(204)
    expect(devicesRepo.remove).toHaveBeenCalledWith({}, '5')
  })

  it('404s when deleting or regenerating an unknown device', async () => {
    devicesRepo.findById.mockResolvedValue(null)
    expect((await request(app).delete('/api/tablet/devices/9').set('Cookie', authCookie())).status).toBe(404)
    expect((await request(app).post('/api/tablet/devices/9/token/regenerate').set('Cookie', authCookie())).status).toBe(404)
    expect(devicesRepo.remove).not.toHaveBeenCalled()
  })

  it('regenerates the token of a device', async () => {
    devicesRepo.findById.mockResolvedValue(device())
    devicesRepo.regenerateToken.mockResolvedValue(device({ Token: 'new' }))
    const res = await request(app).post('/api/tablet/devices/5/token/regenerate').set('Cookie', authCookie())
    expect(res.body.device.token).toBe('new')
  })
})

describe('POST /api/tablet/display/:token/checkin', () => {
  it('checks in a booking via tablet token', async () => {
    devicesRepo.findByToken.mockResolvedValue(device())
    bookingsRepo.findById.mockResolvedValue({ BookingID: 10, RoomID: 1, Status: 'Booked', Title: 'Meeting' })
    bookingsRepo.checkin.mockResolvedValue({ BookingID: 10, RoomID: 1, Status: 'CheckedIn', Title: 'Meeting' })

    const res = await request(app)
      .post('/api/tablet/display/tok/checkin')
      .send({ bookingId: 10 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.booking.isCheckedIn).toBe(true)
    expect(bookingsRepo.checkin).toHaveBeenCalledWith({}, 10)
  })

  it('rejects invalid booking or non-booked status', async () => {
    devicesRepo.findByToken.mockResolvedValue(device())
    bookingsRepo.findById.mockResolvedValue({ BookingID: 10, RoomID: 1, Status: 'CheckedIn' })

    const res = await request(app)
      .post('/api/tablet/display/tok/checkin')
      .send({ bookingId: 10 })

    expect(res.status).toBe(400)
  })
})

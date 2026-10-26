import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/bookings/repository.js', () => ({
  create: vi.fn(),
  findById: vi.fn(),
  listMine: vi.fn(),
  listAll: vi.fn(),
  listBusyRanges: vi.fn(),
  updateSingle: vi.fn(),
  cancel: vi.fn(),
  checkin: vi.fn(),
}))

vi.mock('../src/modules/notifications/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  roomBookingUpdatedByAdmin: vi.fn(),
}))

vi.mock('../src/modules/rooms/repository.js', () => ({
  listAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as notify from '../src/modules/notifications/service.js'
import * as bookingsRepo from '../src/modules/bookings/repository.js'
import * as roomsRepo from '../src/modules/rooms/repository.js'

function authCookie(role = 'Employee', id = 1) {
  const token = jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })
  return `token=${token}`
}

const app = createApp()

beforeEach(() => {
  vi.clearAllMocks()
})

function futureIso(hoursFromNow) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
}

describe('POST /api/bookings', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/bookings').send({})
    expect(res.status).toBe(401)
  })

  it('validates required fields', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({ roomId: 1, title: '', startTime: futureIso(1), endTime: futureIso(2) })

    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('VALIDATION_ERROR')
    expect(bookingsRepo.create).not.toHaveBeenCalled()
  })

  it('rejects endTime before startTime', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({ roomId: 1, title: 'x', startTime: futureIso(2), endTime: futureIso(1) })

    expect(res.status).toBe(400)
  })

  it('rejects a start time in the past', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({ roomId: 1, title: 'x', startTime: futureIso(-1), endTime: futureIso(1) })

    expect(res.status).toBe(400)
  })

  it('rejects a start time beyond the 90-day advance limit', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({ roomId: 1, title: 'x', startTime: futureIso(91 * 24), endTime: futureIso(91 * 24 + 1) })

    expect(res.status).toBe(400)
  })

  it('404s when the room does not exist', async () => {
    roomsRepo.findById.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({ roomId: 999, title: 'x', startTime: futureIso(1), endTime: futureIso(2) })

    expect(res.status).toBe(404)
  })

  it('creates a single booking', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1 })
    bookingsRepo.create.mockResolvedValue([
      {
        BookingID: 10,
        RoomID: 1,
        RoomName: 'A',
        UserID: 1,
        Title: 'Standup',
        StartTime: new Date(),
        EndTime: new Date(),
        Status: 'Booked',
      },
    ])

    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({ roomId: 1, title: 'Standup', startTime: futureIso(1), endTime: futureIso(2) })

    expect(res.status).toBe(201)
    expect(res.body.bookings).toHaveLength(1)
    expect(bookingsRepo.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ occurrences: [expect.anything()] }),
    )
  })

  it('expands a weekly recurrence into multiple occurrences capped at 90 days', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1 })
    bookingsRepo.create.mockResolvedValue([])

    await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({
        roomId: 1,
        title: 'Weekly standup',
        startTime: futureIso(1),
        endTime: futureIso(2),
        recurrence: { freq: 'weekly', until: futureIso(120 * 24) }, // เกิน 90 วัน ต้องถูกตัด
      })

    const call = bookingsRepo.create.mock.calls[0][1]
    expect(call.occurrences.length).toBeGreaterThan(1)
    const lastOccurrence = call.occurrences[call.occurrences.length - 1]
    const horizon = Date.now() + 90 * 24 * 60 * 60 * 1000
    expect(new Date(lastOccurrence.startTime).getTime()).toBeLessThanOrEqual(horizon)
  })

  it('returns ROOM_BOOKING_CONFLICT with 409 when the repository detects a clash', async () => {
    roomsRepo.findById.mockResolvedValue({ RoomID: 1 })
    const { AppError } = await import('../src/errors/AppError.js')
    const { ErrorCodes } = await import('../src/errors/codes.js')
    bookingsRepo.create.mockRejectedValue(new AppError(ErrorCodes.ROOM_BOOKING_CONFLICT, 409))

    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', authCookie())
      .send({ roomId: 1, title: 'x', startTime: futureIso(1), endTime: futureIso(2) })

    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('ROOM_BOOKING_CONFLICT')
  })
})

describe('GET /api/bookings', () => {
  it('forces Employee users to only see their own bookings regardless of ?mine=', async () => {
    bookingsRepo.listMine.mockResolvedValue([])

    await request(app).get('/api/bookings?mine=false').set('Cookie', authCookie('Employee', 5))

    expect(bookingsRepo.listMine).toHaveBeenCalledWith(expect.anything(), 5, null, null)
    expect(bookingsRepo.listAll).not.toHaveBeenCalled()
  })

  it('lets Admin see everyone’s bookings when mine is not set', async () => {
    bookingsRepo.listAll.mockResolvedValue([])

    await request(app).get('/api/bookings').set('Cookie', authCookie('Admin', 1))

    expect(bookingsRepo.listAll).toHaveBeenCalled()
    expect(bookingsRepo.listMine).not.toHaveBeenCalled()
  })

  it('lets Admin filter all bookings by room, status and date range, and returns who booked and when', async () => {
    bookingsRepo.listAll.mockResolvedValue([
      {
        BookingID: 9, RoomID: 2, RoomName: 'A', UserID: 7, Title: 'x', StartTime: new Date(), EndTime: new Date(),
        Status: 'Cancelled', OwnerName: 'สมชาย', OwnerDepartment: 'QC', OwnerPhone: '081', OwnerEmail: 'a@b.c',
        CreatedAt: new Date('2026-09-01T02:00:00Z'), UpdatedAt: new Date('2026-09-02T02:00:00Z'),
      },
    ])
    const res = await request(app)
      .get('/api/bookings?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z&roomId=2&status=Cancelled')
      .set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(200)
    expect(bookingsRepo.listAll).toHaveBeenCalledWith(expect.anything(), new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'), { roomId: 2, status: 'Cancelled' })
    expect(res.body.bookings[0]).toMatchObject({ ownerName: 'สมชาย', ownerDepartment: 'QC', ownerPhone: '081', status: 'Cancelled', createdAt: '2026-09-01T02:00:00.000Z' })
  })

  it.each([
    ['status=Unknown'],
    ['roomId=abc'],
    ['from=2026-10-01T00:00:00Z&to=2026-09-01T00:00:00Z'],
    ['from=2025-01-01T00:00:00Z&to=2026-12-31T00:00:00Z'],
  ])('rejects an invalid Admin filter (%s)', async (query) => {
    const res = await request(app).get(`/api/bookings?${query}`).set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(400)
  })
})

describe('PUT/DELETE /api/bookings/:id - ownership', () => {
  it('rejects editing someone else’s booking', async () => {
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 99 })

    const res = await request(app)
      .put('/api/bookings/1')
      .set('Cookie', authCookie('Employee', 1))
      .send({ title: 'x', startTime: futureIso(1), endTime: futureIso(2) })

    expect(res.status).toBe(403)
  })

  it('allows the owner to cancel their own booking', async () => {
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 1 })
    bookingsRepo.cancel.mockResolvedValue({ BookingID: 1, Status: 'Cancelled' })

    const res = await request(app).delete('/api/bookings/1').set('Cookie', authCookie('Employee', 1))

    expect(res.status).toBe(204)
    expect(bookingsRepo.cancel).toHaveBeenCalledWith(expect.anything(), '1', 'single')
  })

  it('allows Admin to cancel a whole recurring series', async () => {
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 99, RecurrenceGroupID: 'abc' })
    bookingsRepo.cancel.mockResolvedValue({ BookingID: 1, Status: 'Cancelled' })

    const res = await request(app)
      .delete('/api/bookings/1?scope=series')
      .set('Cookie', authCookie('Admin', 1))

    expect(res.status).toBe(204)
    expect(bookingsRepo.cancel).toHaveBeenCalledWith(expect.anything(), '1', 'series')
  })
})

describe('POST /api/bookings/:id/checkin', () => {
  it('rejects checkin if not authenticated', async () => {
    const res = await request(app).post('/api/bookings/1/checkin')
    expect(res.status).toBe(401)
  })

  it('rejects checkin if not the owner', async () => {
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 99, Status: 'Booked', StartTime: new Date().toISOString() })
    const res = await request(app).post('/api/bookings/1/checkin').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(403)
  })

  it('rejects checkin if booking status is not Booked', async () => {
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 1, Status: 'CheckedIn', StartTime: new Date().toISOString() })
    const res = await request(app).post('/api/bookings/1/checkin').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('CHECKIN_STATUS_INVALID')
  })

  it('rejects checkin outside the 10-minute window', async () => {
    // 30 minutes in the future
    const futureStart = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 1, Status: 'Booked', StartTime: futureStart })
    const res = await request(app).post('/api/bookings/1/checkin').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('CHECKIN_WINDOW_INVALID')
  })

  it('allows owner to check in within valid 10-minute window', async () => {
    // StartTime is 2 minutes ago
    const validStart = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 1, Status: 'Booked', StartTime: validStart })
    bookingsRepo.checkin.mockResolvedValue({ BookingID: 1, UserID: 1, Status: 'CheckedIn', CheckedInAt: new Date().toISOString() })

    const res = await request(app).post('/api/bookings/1/checkin').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(200)
    expect(res.body.booking.status).toBe('CheckedIn')
  })
})

describe('GET /api/rooms/:id/availability', () => {
  beforeEach(() => {
    roomsRepo.findById.mockResolvedValue({ id: 1, name: 'Room A' })
    bookingsRepo.listBusyRanges.mockResolvedValue([
      { BookingID: 5, StartTime: new Date(), EndTime: new Date(), Title: 'x', Status: 'AutoReleased' },
    ])
  })

  it('excludes auto-released bookings by default (used for free-slot checks)', async () => {
    const res = await request(app).get('/api/rooms/1/availability?date=2026-09-28').set('Cookie', authCookie())
    expect(res.status).toBe(200)
    expect(bookingsRepo.listBusyRanges.mock.calls[0][4]).toEqual({ includeReleased: false })
  })

  it('includes auto-released bookings with their status when includeReleased=1', async () => {
    const res = await request(app)
      .get('/api/rooms/1/availability?month=2026-09&includeReleased=1')
      .set('Cookie', authCookie())
    expect(res.status).toBe(200)
    expect(bookingsRepo.listBusyRanges.mock.calls[0][4]).toEqual({ includeReleased: true })
    expect(res.body.busy[0].status).toBe('AutoReleased')
  })
})

describe('PUT /api/bookings/:id - email when an admin edits', () => {
  const body = () => ({ title: 'x', startTime: futureIso(1), endTime: futureIso(2) })

  it('Admin editing someone else’s booking notifies the owner', async () => {
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 99, RoomName: 'Room A', Status: 'Booked', StartTime: futureIso(1) })
    bookingsRepo.updateSingle.mockResolvedValue({ BookingID: 1, UserID: 99, Title: 'x', StartTime: new Date(), EndTime: new Date() })
    const res = await request(app).put('/api/bookings/1').set('Cookie', authCookie('Admin', 1)).send(body())
    expect(res.status).toBe(200)
    expect(notify.roomBookingUpdatedByAdmin).toHaveBeenCalledWith(expect.objectContaining({ UserID: 99 }), 'Room A')
  })

  it('the owner editing their own booking sends nothing', async () => {
    bookingsRepo.findById.mockResolvedValue({ BookingID: 1, UserID: 1, RoomName: 'Room A', Status: 'Booked', StartTime: futureIso(1) })
    bookingsRepo.updateSingle.mockResolvedValue({ BookingID: 1, UserID: 1, Title: 'x', StartTime: new Date(), EndTime: new Date() })
    await request(app).put('/api/bookings/1').set('Cookie', authCookie('Employee', 1)).send(body())
    expect(notify.roomBookingUpdatedByAdmin).not.toHaveBeenCalled()
  })
})

describe('PUT /api/bookings/:id - same rules as creating', () => {
  const existing = (extra = {}) => ({ BookingID: 1, UserID: 1, RoomName: 'Room A', Status: 'Booked', StartTime: futureIso(5), ...extra })
  const put = (body, user = authCookie('Employee', 1)) => request(app).put('/api/bookings/1').set('Cookie', user).send(body)
  const ok = { title: 'x', startTime: futureIso(5), endTime: futureIso(6) }

  it('cannot move a booking into the past or beyond 90 days, and says which', async () => {
    bookingsRepo.findById.mockResolvedValue(existing())
    const past = await put({ ...ok, startTime: futureIso(-48), endTime: futureIso(-47) })
    expect(past.status).toBe(400)
    expect(past.body.errorCode).toBe('DATE_IN_PAST')
    const far = await put({ ...ok, startTime: futureIso(24 * 95), endTime: futureIso(24 * 95 + 1) })
    expect(far.body.errorCode).toBe('DATE_TOO_FAR_AHEAD')
    expect(bookingsRepo.updateSingle).not.toHaveBeenCalled()
  })

  it('can still fix the title of a meeting that already started (start time unchanged)', async () => {
    const started = futureIso(-2)
    bookingsRepo.findById.mockResolvedValue(existing({ Status: 'CheckedIn', StartTime: started }))
    bookingsRepo.updateSingle.mockResolvedValue({ BookingID: 1, UserID: 1, Title: 'new', StartTime: started, EndTime: futureIso(1) })
    const res = await put({ title: 'new', startTime: started, endTime: futureIso(1) })
    expect(res.status).toBe(200)
  })

  it('cannot edit a cancelled or auto-released booking', async () => {
    for (const Status of ['Cancelled', 'AutoReleased']) {
      bookingsRepo.findById.mockResolvedValue(existing({ Status }))
      const res = await put(ok)
      expect(res.status).toBe(409)
      expect(res.body.errorCode).toBe('BOOKING_NOT_EDITABLE')
    }
  })

  it('rejects a title longer than the column instead of failing in SQL', async () => {
    bookingsRepo.findById.mockResolvedValue(existing())
    const res = await put({ ...ok, title: 'x'.repeat(301) })
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('FIELD_TOO_LONG')
  })
})

describe('POST /api/bookings - specific errors', () => {
  it('tells the user a booking is in the past, beyond 90 days, or has a title that is too long', async () => {
    const post = (body) => request(app).post('/api/bookings').set('Cookie', authCookie()).send({ roomId: 1, title: 'x', ...body })
    expect((await post({ startTime: futureIso(-3), endTime: futureIso(-2) })).body.errorCode).toBe('DATE_IN_PAST')
    expect((await post({ startTime: futureIso(24 * 100), endTime: futureIso(24 * 100 + 1) })).body.errorCode).toBe('DATE_TOO_FAR_AHEAD')
    expect((await post({ title: 'y'.repeat(400), startTime: futureIso(2), endTime: futureIso(3) })).body.errorCode).toBe('FIELD_TOO_LONG')
  })
})

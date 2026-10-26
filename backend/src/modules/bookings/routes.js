import express from 'express'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth } from '../../middleware/auth.js'
import * as bookingsRepo from './repository.js'
import * as roomsRepo from '../rooms/repository.js'
import * as notify from '../notifications/service.js'

export const bookingsRouter = express.Router()

const MAX_ADVANCE_DAYS = 90
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toPublicBooking(row) {
  return {
    id: row.BookingID,
    roomId: row.RoomID,
    roomName: row.RoomName,
    ownerName: row.OwnerName ?? undefined,
    ownerDepartment: row.OwnerDepartment ?? undefined,
    ownerPhone: row.OwnerPhone ?? undefined,
    ownerEmail: row.OwnerEmail ?? undefined,
    userId: row.UserID,
    title: row.Title,
    startTime: row.StartTime,
    endTime: row.EndTime,
    recurrenceGroupId: row.RecurrenceGroupID,
    status: row.Status,
    checkedInAt: row.CheckedInAt,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  }
}

const TITLE_MAX = 300 // ตามคอลัมน์ RoomBookings.Title

/** หัวข้อการประชุม: ห้ามว่าง และห้ามยาวเกินคอลัมน์ (เดิมเกินแล้วได้ 500 จาก SQL) */
function parseTitle(value) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  if (title.length > TITLE_MAX) throw new AppError(ErrorCodes.FIELD_TOO_LONG, 400, { field: 'title', max: TITLE_MAX })
  return title
}

/** เวลาเริ่มต้องไม่ย้อนหลังและไม่เกิน 90 วันล่วงหน้า - ใช้ทั้งตอนสร้างและตอนย้ายเวลาของการจองเดิม */
function assertBookableStart(startTime, now = new Date()) {
  if (startTime < now) throw new AppError(ErrorCodes.DATE_IN_PAST, 400)
  if (startTime.getTime() > now.getTime() + NINETY_DAYS_MS) throw new AppError(ErrorCodes.DATE_TOO_FAR_AHEAD, 400)
}

const BOOKING_STATUSES = ['Booked', 'CheckedIn', 'AutoReleased', 'Cancelled']
const MAX_ADMIN_RANGE_MS = 400 * 24 * 60 * 60 * 1000

function canManage(req, booking) {
  return req.user.role === 'Admin' || req.user.id === booking.UserID
}

/**
 * รับ input การสร้างการจอง - validate + ขยาย recurrence (รายสัปดาห์) เป็น occurrence จริงทีละแถว
 * จำกัดล่วงหน้าไม่เกิน 90 วันตาม REQUIREMENTS.md กฎข้อ 3 (ตัด occurrence ที่เกินขอบเขตทิ้งอัตโนมัติ)
 */
function validateCreateInput(body) {
  const roomId = Number(body?.roomId)
  const title = parseTitle(body?.title)
  const startTime = toDate(body?.startTime)
  const endTime = toDate(body?.endTime)

  if (!Number.isInteger(roomId) || !startTime || !endTime || endTime <= startTime) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }

  const now = new Date()
  const horizon = new Date(now.getTime() + NINETY_DAYS_MS)

  if (startTime < now) {
    throw new AppError(ErrorCodes.DATE_IN_PAST, 400)
  }

  if (!body?.recurrence) {
    assertBookableStart(startTime, now)
    return { roomId, title, occurrences: [{ startTime, endTime }] }
  }

  const freq = body.recurrence.freq
  const until = toDate(body.recurrence.until)
  if (freq !== 'weekly' || !until) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }

  const cappedUntil = until > horizon ? horizon : until
  const durationMs = endTime.getTime() - startTime.getTime()
  const occurrences = []
  let occStart = startTime

  while (occStart <= cappedUntil) {
    occurrences.push({ startTime: occStart, endTime: new Date(occStart.getTime() + durationMs) })
    occStart = new Date(occStart.getTime() + ONE_WEEK_MS)
  }

  if (occurrences.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }

  return { roomId, title, occurrences }
}

bookingsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const from = req.query.from ? toDate(req.query.from) : null
    const to = req.query.to ? toDate(req.query.to) : null

    const onlyMine = req.query.mine === 'true' || req.user.role !== 'Admin'
    if (onlyMine) {
      const rows = await bookingsRepo.listMine(pool, req.user.id, from, to)
      return res.json({ bookings: rows.map(toPublicBooking) })
    }

    // Admin: ดูการจองของทุกคน - กรองห้อง/สถานะได้, ช่วงเวลาไม่เกิน ~13 เดือน (ย้อนหลังได้)
    const rangeFrom = from ?? new Date()
    const rangeTo = to ?? new Date(Date.now() + NINETY_DAYS_MS)
    const roomId = req.query.roomId ? Number(req.query.roomId) : undefined
    const status = req.query.status ? String(req.query.status) : undefined
    if (
      rangeTo <= rangeFrom ||
      rangeTo - rangeFrom > MAX_ADMIN_RANGE_MS ||
      (roomId !== undefined && (!Number.isInteger(roomId) || roomId <= 0)) ||
      (status !== undefined && !BOOKING_STATUSES.includes(status))
    ) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    const rows = await bookingsRepo.listAll(pool, rangeFrom, rangeTo, { roomId, status })

    res.json({ bookings: rows.map(toPublicBooking) })
  } catch (err) {
    next(err)
  }
})

bookingsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const input = validateCreateInput(req.body)
    const pool = await getPool()

    const room = await roomsRepo.findById(pool, input.roomId)
    if (!room) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (room.IsActive === false) throw new AppError(ErrorCodes.ROOM_INACTIVE, 409)

    const rows = await bookingsRepo.create(pool, {
      roomId: input.roomId,
      userId: req.user.id,
      title: input.title,
      occurrences: input.occurrences,
    })

    notify.roomBooked(rows, room.Name)
    res.status(201).json({ bookings: rows.map(toPublicBooking) })
  } catch (err) {
    next(err)
  }
})

bookingsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const booking = await bookingsRepo.findById(pool, req.params.id)
    if (!booking) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (!canManage(req, booking)) throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)

    res.json({ booking: toPublicBooking(booking) })
  } catch (err) {
    next(err)
  }
})

bookingsRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const existing = await bookingsRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (!canManage(req, existing)) throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)

    // การจองที่ยกเลิก/ปล่อยห้องไปแล้วแก้ไม่ได้ (เดิมแก้ได้ ทำให้ข้อมูลประวัติเพี้ยน)
    if (existing.Status !== 'Booked' && existing.Status !== 'CheckedIn') {
      throw new AppError(ErrorCodes.BOOKING_NOT_EDITABLE, 409)
    }

    const title = parseTitle(req.body?.title)
    const startTime = toDate(req.body?.startTime)
    const endTime = toDate(req.body?.endTime)
    if (!startTime || !endTime || endTime <= startTime) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    // ใช้กฎเวลาเดียวกับตอนสร้าง แต่เฉพาะเมื่อ "เปลี่ยนเวลาเริ่ม" - แก้แค่ชื่อ/เวลาจบของการประชุมที่เริ่มไปแล้วยังทำได้
    if (startTime.getTime() !== new Date(existing.StartTime).getTime()) assertBookableStart(startTime)

    const booking = await bookingsRepo.updateSingle(pool, req.params.id, { title, startTime, endTime })
    if (booking && req.user.id !== existing.UserID) notify.roomBookingUpdatedByAdmin(booking, existing.RoomName)
    res.json({ booking: toPublicBooking(booking) })
  } catch (err) {
    next(err)
  }
})

bookingsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const existing = await bookingsRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (!canManage(req, existing)) throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)

    const scope = req.query.scope === 'series' ? 'series' : 'single'
    await bookingsRepo.cancel(pool, req.params.id, scope)
    notify.roomBookingCancelled(existing, { byAdmin: req.user.id !== existing.UserID })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

bookingsRouter.post('/:id/checkin', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const booking = await bookingsRepo.findById(pool, req.params.id)
    if (!booking) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    if (booking.UserID !== req.user.id) {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)
    }

    if (booking.Status !== 'Booked') {
      throw new AppError(ErrorCodes.CHECKIN_STATUS_INVALID, 400)
    }

    const now = new Date()
    const startTime = new Date(booking.StartTime)
    const windowStart = new Date(startTime.getTime() - 10 * 60 * 1000)
    const windowEnd = new Date(startTime.getTime() + 10 * 60 * 1000)

    if (now < windowStart || now > windowEnd) {
      throw new AppError(ErrorCodes.CHECKIN_WINDOW_INVALID, 400)
    }

    const updated = await bookingsRepo.checkin(pool, req.params.id)
    res.json({ booking: toPublicBooking(updated) })
  } catch (err) {
    next(err)
  }
})

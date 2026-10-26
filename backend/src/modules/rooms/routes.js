import express from 'express'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { textField } from '../../utils/validation.js'
import * as roomsRepo from './repository.js'
import * as bookingsRepo from '../bookings/repository.js'

export const roomsRouter = express.Router()

function toPublicRoom(room) {
  return {
    id: room.RoomID,
    name: room.Name,
    floor: room.Floor,
    isActive: room.IsActive !== false,
    createdAt: room.CreatedAt,
  }
}

function validateRoomInput(body) {
  const name = textField(body?.name, { field: 'name', max: 200 })
  const floor = textField(body?.floor, { field: 'floor', max: 100, required: false })
  return { name, floor }
}

/** ชื่อห้องห้ามซ้ำ (Collation ของ DB ไม่สนตัวพิมพ์) - excludeId = ห้องที่กำลังแก้ */
async function assertRoomNameFree(pool, name, excludeId = null) {
  const same = await roomsRepo.findByName(pool, name)
  if (same && same.RoomID !== excludeId) throw new AppError(ErrorCodes.NAME_TAKEN, 409)
}

roomsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    // ห้องที่ปิดใช้งานเห็นได้เฉพาะ Admin (หน้าจัดการห้อง) - คนทั่วไปเห็นเฉพาะห้องที่จองได้
    const includeInactive = req.query.includeInactive === 'true' && req.user.role === 'Admin'
    const rooms = await roomsRepo.listAll(pool, { includeInactive })
    res.json({ rooms: rooms.map(toPublicRoom) })
  } catch (err) {
    next(err)
  }
})

roomsRouter.get('/:id/availability', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()

    const room = await roomsRepo.findById(pool, req.params.id)
    if (!room) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    let from, to
    if (req.query.from && req.query.to) {
      from = new Date(req.query.from)
      to = new Date(req.query.to)
    } else if (req.query.month) {
      const [yearStr, monthStr] = String(req.query.month).split('-')
      const year = Number(yearStr)
      const month = Number(monthStr)
      if (!year || !month || month < 1 || month > 12) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
      }
      from = new Date(year, month - 1, 1 - 7, 0, 0, 0, 0)
      to = new Date(year, month, 1 + 7, 0, 0, 0, 0)
    } else if (req.query.date) {
      const dateParam = String(req.query.date)
      from = new Date(`${dateParam}T00:00:00`)
      to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
    } else {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }

    const includeReleased = req.query.includeReleased === '1'
    const busy = await bookingsRepo.listBusyRanges(pool, req.params.id, from, to, { includeReleased })
    res.json({
      busy: busy.map((b) => ({
        bookingId: b.BookingID,
        startTime: b.StartTime,
        endTime: b.EndTime,
        title: b.Title,
        status: b.Status,
      })),
    })
  } catch (err) {
    next(err)
  }
})

roomsRouter.post('/', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const input = validateRoomInput(req.body)
    const pool = await getPool()
    await assertRoomNameFree(pool, input.name)
    const room = await roomsRepo.create(pool, input)
    res.status(201).json({ room: toPublicRoom(room) })
  } catch (err) {
    next(err)
  }
})

roomsRouter.put('/:id', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const input = validateRoomInput(req.body)
    const pool = await getPool()

    const existing = await roomsRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    await assertRoomNameFree(pool, input.name, existing.RoomID)

    const room = await roomsRepo.update(pool, req.params.id, input)
    res.json({ room: toPublicRoom(room) })
  } catch (err) {
    next(err)
  }
})

// ปิด/เปิดใช้งานห้อง (soft delete) - ปิดไม่ได้ถ้ายังมีการจองที่ยังไม่ถึง/ยังไม่จบ (ให้ยกเลิกก่อน คนจองจะได้รู้)
roomsRouter.put('/:id/active', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    if (typeof req.body?.isActive !== 'boolean') throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const pool = await getPool()
    const existing = await roomsRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (!req.body.isActive) {
      const upcoming = await roomsRepo.countUpcomingBookings(pool, existing.RoomID)
      if (upcoming > 0) throw new AppError(ErrorCodes.ROOM_HAS_UPCOMING_BOOKINGS, 409, { bookings: upcoming })
    }
    const room = await roomsRepo.setActive(pool, existing.RoomID, req.body.isActive)
    res.json({ room: toPublicRoom(room) })
  } catch (err) {
    next(err)
  }
})

// ลบจริงได้เฉพาะห้องที่ไม่เคยมีการจอง - มีประวัติแล้ว → 409 ROOM_IN_USE (ปิดใช้งานแทน)
roomsRouter.delete('/:id', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const pool = await getPool()

    const existing = await roomsRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    await roomsRepo.remove(pool, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

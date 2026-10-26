import express from 'express'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import * as roomsRepo from '../rooms/repository.js'
import * as devicesRepo from './repository.js'
import * as bookingsRepo from '../bookings/repository.js'

export const tabletRouter = express.Router()

// จอ tablet รีเฟรชทุก 30 วินาที (~2 คำขอ/นาที/จอ) - เผื่อหลายจอหลัง IP เดียวกัน; เกินนี้ = น่าจะเดา token หรือยิงซ้ำ
const displayLimiter = createRateLimiter({ max: 300, windowMs: 60 * 1000 })
tabletRouter.use('/display', displayLimiter)

// ถือว่า tablet "Online" ถ้าโหลด/รีเฟรชหน้าแสดงผลภายใน 2 นาทีที่ผ่านมา
// (หน้าแสดงผล auto-refresh ทุก 30 วินาที เผื่อ margin ไว้พอสมควรกันเน็ตสะดุดสั้นๆ)
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000
const UPCOMING_THRESHOLD_MS = 15 * 60 * 1000

function toPublicSlot(b) {
  return {
    bookingId: b.BookingID,
    startTime: b.StartTime,
    endTime: b.EndTime,
    title: b.Title,
    status: b.Status,
    isCheckedIn: b.Status === 'CheckedIn',
  }
}

// Public - แสดงผลหน้าห้อง เข้าด้วย tablet token เท่านั้น ไม่ต้อง login
tabletRouter.get('/display/:token', async (req, res, next) => {
  try {
    const pool = await getPool()
    const device = await devicesRepo.findByToken(pool, req.params.token)
    if (!device) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    // นับว่าจอออนไลน์แม้ยังไม่ผูกห้อง - Admin จะเห็นว่าจอติดตั้งแล้ว รอผูกห้อง
    await devicesRepo.touchLastSeen(pool, device.DeviceID)
    if (!device.RoomID || !device.RoomIsActive) throw new AppError(ErrorCodes.DEVICE_NOT_ASSIGNED, 409)
    const room = { RoomID: device.RoomID, Name: device.RoomName, Floor: device.RoomFloor }

    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    const schedule = await bookingsRepo.listBusyRanges(pool, room.RoomID, dayStart, dayEnd)

    const currentMeeting = schedule.find(
      (b) => new Date(b.StartTime) <= now && new Date(b.EndTime) > now,
    )
    const nextMeeting = schedule
      .filter((b) => new Date(b.StartTime) > now)
      .sort((a, b) => new Date(a.StartTime) - new Date(b.StartTime))[0]

    let status = 'free'
    if (currentMeeting) {
      status = 'busy'
    } else if (nextMeeting && new Date(nextMeeting.StartTime) - now <= UPCOMING_THRESHOLD_MS) {
      status = 'upcoming'
    }

    res.json({
      room: { id: room.RoomID, name: room.Name, floor: room.Floor },
      status,
      currentMeeting: currentMeeting ? toPublicSlot(currentMeeting) : null,
      nextMeeting: nextMeeting ? toPublicSlot(nextMeeting) : null,
      schedule: schedule.map(toPublicSlot),
      serverTime: now.toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

// Public - เช็คอินการจองผ่านจอ tablet หน้าห้อง โดยไม่ต้อง login
tabletRouter.post('/display/:token/checkin', async (req, res, next) => {
  try {
    const pool = await getPool()
    const device = await devicesRepo.findByToken(pool, req.params.token)
    if (!device) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (!device.RoomID || !device.RoomIsActive) throw new AppError(ErrorCodes.DEVICE_NOT_ASSIGNED, 409)

    const bookingId = typeof req.body?.bookingId === 'number' ? req.body.bookingId : (req.body?.bookingId ? parseInt(req.body.bookingId, 10) : null)
    if (!bookingId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const booking = await bookingsRepo.findById(pool, bookingId)
    if (!booking || booking.RoomID !== device.RoomID) {
      throw new AppError(ErrorCodes.NOT_FOUND, 404)
    }

    if (booking.Status !== 'Booked') {
      throw new AppError(ErrorCodes.CHECKIN_STATUS_INVALID, 400)
    }

    const updated = await bookingsRepo.checkin(pool, bookingId)
    res.json({ success: true, booking: toPublicSlot(updated) })
  } catch (err) {
    next(err)
  }
})

/**
 * Public - ปฏิทินรายเดือนของห้องบนจอ tablet (ดูอย่างเดียว ตรวจสอบหน้าห้อง) ?month=YYYY-MM
 * คืนการจองเฉพาะเดือนนั้น ทุกสถานะเหมือนหน้าแรก (จองอยู่/เช็คอินแล้ว/ปล่อยห้องอัตโนมัติ - ไม่รวมที่ยกเลิก)
 * พร้อม status ให้จอแยกสี - ย้อนหลัง/ล่วงหน้าได้ไม่เกิน 12 เดือน (dev 2026-09-29)
 */
tabletRouter.get('/display/:token/calendar', async (req, res, next) => {
  try {
    const match = /^(\d{4})-(\d{2})$/.exec(String(req.query.month ?? ''))
    if (!match) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const year = Number(match[1])
    const month = Number(match[2])
    const now = new Date()
    const monthsAway = Math.abs((year - now.getFullYear()) * 12 + (month - 1 - now.getMonth()))
    if (month < 1 || month > 12 || monthsAway > 12) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const pool = await getPool()
    const device = await devicesRepo.findByToken(pool, req.params.token)
    if (!device) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (!device.RoomID || !device.RoomIsActive) throw new AppError(ErrorCodes.DEVICE_NOT_ASSIGNED, 409)

    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)
    const bookings = await bookingsRepo.listBusyRanges(pool, device.RoomID, from, to, { includeReleased: true })
    res.json({ bookings: bookings.map((b) => ({ ...toPublicSlot(b), status: b.Status })) })
  } catch (err) {
    next(err)
  }
})

// ---------------- Admin: จัดการอุปกรณ์ (จอ tablet) ----------------
// สถานะ Online/Offline คำนวณจาก LastSeenAt จริง - ไม่มีคำสั่งส่งไปหา tablet (เป็นแค่หน้าเว็บที่เปิดทิ้งไว้)

function toPublicDevice(d, now = Date.now()) {
  const lastSeenAt = d.LastSeenAt ?? null
  const isOnline = lastSeenAt ? now - new Date(lastSeenAt).getTime() <= ONLINE_THRESHOLD_MS : false
  return {
    id: d.DeviceID,
    name: d.Name,
    roomId: d.RoomID ?? null,
    roomName: d.RoomName ?? null,
    floor: d.RoomFloor ?? null,
    roomIsActive: d.RoomID ? Boolean(d.RoomIsActive) : null,
    token: d.Token,
    status: lastSeenAt ? (isOnline ? 'Online' : 'Offline') : 'NeverConnected',
    lastSeenAt,
  }
}

async function validateDevice(pool, body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 200) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  let roomId = null
  if (body?.roomId !== undefined && body.roomId !== null && body.roomId !== '') {
    roomId = Number(body.roomId)
    if (!Number.isInteger(roomId) || roomId <= 0) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const room = await roomsRepo.findById(pool, roomId)
    if (!room) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    if (room.IsActive === false) throw new AppError(ErrorCodes.ROOM_INACTIVE, 409)
  }
  return { name, roomId }
}

const adminOnly = [requireAuth, requireRole('Admin')]

tabletRouter.get('/devices', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const now = Date.now()
    const devices = await devicesRepo.listAll(pool)
    res.json({ devices: devices.map((d) => toPublicDevice(d, now)) })
  } catch (err) {
    next(err)
  }
})

tabletRouter.post('/devices', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const device = await devicesRepo.create(pool, await validateDevice(pool, req.body))
    res.status(201).json({ device: toPublicDevice(device) })
  } catch (err) {
    next(err)
  }
})

tabletRouter.put('/devices/:id', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    if (!(await devicesRepo.findById(pool, req.params.id))) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const device = await devicesRepo.update(pool, req.params.id, await validateDevice(pool, req.body))
    res.json({ device: toPublicDevice(device) })
  } catch (err) {
    next(err)
  }
})

// ลบได้เสมอ (อุปกรณ์ไม่มีประวัติที่ข้อมูลอื่นอ้างถึง) - ลิงก์ของจอนั้นใช้ไม่ได้ทันที
tabletRouter.delete('/devices/:id', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    if (!(await devicesRepo.findById(pool, req.params.id))) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    await devicesRepo.remove(pool, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

tabletRouter.post('/devices/:id/token/regenerate', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    if (!(await devicesRepo.findById(pool, req.params.id))) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const device = await devicesRepo.regenerateToken(pool, req.params.id)
    res.json({ device: toPublicDevice(device) })
  } catch (err) {
    next(err)
  }
})

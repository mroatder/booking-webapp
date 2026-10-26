import express from 'express'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import * as eventsRepo from './repository.js'
import { MAP_URL_MAX } from './limits.js'
import { eventReportToXlsx, myRouteToXlsx, routeReportToXlsx } from './report.js'
import { groupRoutesForViewer, parseBoardingBody, toBoardingPassenger, toBoardingRoute } from './boarding.js'
import * as notify from '../notifications/service.js'
import * as usersRepo from '../users/repository.js'
import { toHttpUrl } from '../../utils/url.js'
import { textField, isValidPhone, parseDate } from '../../utils/validation.js'
import { directoryScopeFor } from '../users/directoryScope.js'

export const eventsRouter = express.Router()

// ความยาวสูงสุดตามคอลัมน์ EventPassengers - เกินแล้ว SQL Server ปฏิเสธเป็น 500 จึงตรวจก่อนให้ตอบ 400 พร้อมบอกว่าช่องไหน
const PASSENGER_FIELD_LIMITS = {
  passengerName: 150,
  employeeCode: 50,
  department: 100,
  phoneNumber: 50,
  pickupLocation: 250,
  googleMapUrl: MAP_URL_MAX,
  note: 500,
}

const TRIP_TYPES = ['RoundTrip', 'GoOnly', 'ReturnOnly']

function assertPassengerFieldLengths(item) {
  if (item.tripType && !TRIP_TYPES.includes(item.tripType)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  for (const [field, max] of Object.entries(PASSENGER_FIELD_LIMITS)) {
    if (typeof item[field] === 'string' && item[field].length > max) {
      throw new AppError(ErrorCodes.EVENT_FIELD_TOO_LONG, 400, { field, max })
    }
  }
}

/** ลิงก์หมุดต้องเป็น http/https เท่านั้น (ว่างได้) - กัน javascript: ถูกเก็บแล้วไปรันเมื่อ Admin กดเปิดหมุด */
function normalizeMapUrl(value) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null
  const url = toHttpUrl(value, MAP_URL_MAX)
  if (!url) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return url
}

/**
 * ข้อมูลกิจกรรม: ชื่อ/ปลายทางไม่ยาวเกินคอลัมน์ (200), วันเดินทางต้องเป็นวันที่จริง,
 * วันกลับต้องไม่ก่อนวันไป, วันปิดรับลงชื่อต้องไม่หลังวันเดินทาง - กิจกรรมใหม่ต้องไม่ย้อนหลัง (requireFuture)
 */
function parseEventInput(body, { requireFuture }) {
  const title = textField(body?.title, { field: 'title', max: 200 })
  const destination = textField(body?.destination, { field: 'destination', max: 200 })
  const description = textField(body?.description, { field: 'description', max: 4000, required: false })
  const eventDate = parseDate(body?.eventDate)
  if (!eventDate) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, { field: 'eventDate' })
  if (requireFuture && eventDate < new Date()) throw new AppError(ErrorCodes.DATE_IN_PAST, 400)
  const returnDate = parseDate(body?.returnDate)
  if (body?.returnDate && !returnDate) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, { field: 'returnDate' })
  const registrationDeadline = parseDate(body?.registrationDeadline)
  if (body?.registrationDeadline && !registrationDeadline) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, { field: 'registrationDeadline' })
  if ((returnDate && returnDate < eventDate) || (registrationDeadline && registrationDeadline > eventDate)) {
    throw new AppError(ErrorCodes.EVENT_DATES_INVALID, 400)
  }
  return { title, description, destination, eventDate, returnDate, registrationDeadline }
}

const adminOnly = [requireAuth, requireRole('Admin')]

eventsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const events = await eventsRepo.listActiveEvents(pool)
    res.json({ events })
  } catch (err) {
    next(err)
  }
})

eventsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const eventId = parseInt(req.params.id, 10)
    if (isNaN(eventId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const event = await eventsRepo.getEventById(pool, eventId)
    if (!event) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    res.json({ event: event })
  } catch (err) {
    next(err)
  }
})

/**
 * ผู้รับแจ้งเตือนตอนสร้างกิจกรรม (Admin ต้องเลือกก่อนสร้าง): { mode: 'all' } หรือ { mode: 'selected', userIds: [...] } (ต้องมีอย่างน้อย 1 คน)
 */
async function parseNotifyAudience(pool, body) {
  const mode = body?.mode
  if (mode === 'all') return { notifyAll: true, inviteeIds: [] }
  if (mode !== 'selected' || !Array.isArray(body.userIds)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const ids = [...new Set(body.userIds.map(Number))]
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  const found = await eventsRepo.findActiveUserIds(pool, ids)
  if (found.length !== ids.length) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return { notifyAll: false, inviteeIds: ids }
}

eventsRouter.post('/', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const pool = await getPool()
    const { title, description, destination, eventDate, returnDate, registrationDeadline } = parseEventInput(req.body, { requireFuture: true })

    const audience = await parseNotifyAudience(pool, req.body.notify)

    const event = await eventsRepo.createEvent(pool, {
      title,
      description,
      destination,
      eventDate,
      returnDate,
      registrationDeadline,
      createdByUserId: req.user.id,
      ...audience,
    })

    notify.eventCreated(event, audience)
    res.status(201).json({ event })
  } catch (err) {
    next(err)
  }
})

eventsRouter.put('/:id', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const pool = await getPool()
    const eventId = parseInt(req.params.id, 10)
    if (isNaN(eventId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const before = await eventsRepo.getEventById(pool, eventId)
    // เลื่อนไปเป็นวันที่ผ่านมาแล้วไม่ได้ แต่แก้ข้อมูลอื่นของกิจกรรมที่เริ่มไปแล้วได้ (วันเดินทางไม่เปลี่ยน)
    const dateChanged = !before || new Date(req.body?.eventDate).getTime() !== new Date(before.EventDate).getTime()
    const { title, description, destination, eventDate, returnDate, registrationDeadline } = parseEventInput(req.body, { requireFuture: dateChanged })
    const event = await eventsRepo.updateEvent(pool, eventId, {
      title,
      description,
      destination,
      eventDate,
      returnDate,
      registrationDeadline,
    })

    const time = (d) => (d ? new Date(d).getTime() : null)
    if (
      before &&
      event &&
      (time(before.EventDate) !== time(event.EventDate) ||
        time(before.ReturnDate) !== time(event.ReturnDate) ||
        before.Destination !== event.Destination)
    ) {
      notify.eventChanged(event)
    }
    res.json({ event })
  } catch (err) {
    next(err)
  }
})

eventsRouter.delete('/:id', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const pool = await getPool()
    const eventId = parseInt(req.params.id, 10)
    if (isNaN(eventId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const event = await eventsRepo.getEventById(pool, eventId)
    await eventsRepo.deleteEvent(pool, eventId)
    if (event) notify.eventCancelled(event)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

eventsRouter.post('/:id/passengers', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const eventId = parseInt(req.params.id, 10)
    if (isNaN(eventId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const event = await eventsRepo.getEventById(pool, eventId)
    if (!event) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    // Check registration deadline if set
    if (event.RegistrationDeadline && new Date() > new Date(event.RegistrationDeadline)) {
      throw new AppError(ErrorCodes.EVENT_REGISTRATION_CLOSED, 400)
    }

    const items = Array.isArray(req.body.passengers) ? req.body.passengers : [req.body]
    if (items.length === 0) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)


    const me = await usersRepo.findById(pool, req.user.id)

    // ลงชื่อให้ใครเป็นผู้ใช้ในระบบ → รหัสพนักงาน/แผนกต้องมาจากข้อมูลผู้ใช้จริง ไม่ใช่ค่าที่หน้าเว็บส่งมา
    // (หน้าเว็บไม่มีรหัสของผู้ใช้ให้ส่ง) - คนอื่นที่ไม่ใช่ตัวเอง Admin เลือกได้ทุกคน, ผู้ใช้ทั่วไปเลือกได้เฉพาะในแผนกหลัก
    const targetOf = (item) => (item.isSelf ? req.user.id : (item.userId ?? null))
    const others = [...new Set(items.map(targetOf).filter((id) => id && id !== req.user.id))]
    const scope = others.length ? await directoryScopeFor(pool, req.user) : undefined
    if (scope) {
      const allowed = new Set((await usersRepo.listDirectory(pool, scope)).map((u) => u.UserID))
      if (others.some((id) => !allowed.has(id))) throw new AppError(ErrorCodes.PASSENGER_OUT_OF_SCOPE, 400)
    }
    const people = new Map([[req.user.id, me]])
    for (const id of others) people.set(id, await usersRepo.findById(pool, id))

    const created = []
    const notifyList = []
    for (const item of items) {
      assertPassengerFieldLengths(item)
      const userId = targetOf(item)
      // ผู้เดินทางต้องเป็นพนักงานในระบบเท่านั้น (HR/dev: ไม่ให้พิมพ์ชื่อเอง) - ข้อมูลชื่อ/รหัส/แผนกมาจากผู้ใช้จริง
      if (!userId) throw new AppError(ErrorCodes.EVENT_PASSENGER_NOT_IN_SYSTEM, 400)
      const person = people.get(userId)
      if (!person) throw new AppError(ErrorCodes.NOT_FOUND, 404)
      const passengerName = item.passengerName || person?.FullName
      const phoneNumber = item.phoneNumber
      const pickupLocation = item.pickupLocation

      if (!passengerName || !phoneNumber || !pickupLocation) {
        throw new AppError(ErrorCodes.EVENT_PASSENGER_INFO_REQUIRED, 400)
      }
      if (!isValidPhone(phoneNumber)) throw new AppError(ErrorCodes.PHONE_INVALID, 400)
      // คนเดียวลงชื่อกิจกรรมเดียวกันซ้ำไม่ได้ (เดิมได้ ทำให้ซ้ำในรายงานและรถ)
      if (await eventsRepo.isUserRegistered(pool, eventId, userId)) {
        throw new AppError(ErrorCodes.EVENT_ALREADY_REGISTERED, 409, { userId })
      }

      const p = await eventsRepo.addPassenger(pool, eventId, {
        userId,
        passengerName,
        employeeCode: person?.EmployeeCode || item.employeeCode || null,
        department: person?.Department || item.department || null,
        phoneNumber,
        pickupLocation,
        googleMapUrl: normalizeMapUrl(item.googleMapUrl),
        tripType: item.tripType || 'RoundTrip',
        note: item.note ?? null,
        registeredByUserId: req.user.id,
      })
      created.push(p)
      if (userId !== req.user.id) {
        notifyList.push({ userId, pickupLocation, phoneNumber, tripType: item.tripType || 'RoundTrip' })
      }
    }

    const updatedEvent = await eventsRepo.getEventById(pool, eventId)
    if (notifyList.length) notify.eventRegisteredByOther(event, notifyList, me?.FullName ?? null)
    res.status(201).json({ passengers: created, event: updatedEvent })
  } catch (err) {
    next(err)
  }
})

eventsRouter.delete('/:id/passengers/:passengerId', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const passengerId = parseInt(req.params.passengerId, 10)
    if (isNaN(passengerId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const existing = await eventsRepo.getPassengerById(pool, passengerId)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    // Only Admin, the person who registered, or the passenger user can cancel
    const isAdmin = req.user.role === 'Admin'
    const isRegistrar = existing.RegisteredByUserID === req.user.id
    const isSelf = existing.UserID === req.user.id

    if (!isAdmin && !isRegistrar && !isSelf) {
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)
    }

    const eventId = await eventsRepo.removePassenger(pool, passengerId)
    const updatedEvent = eventId ? await eventsRepo.getEventById(pool, eventId) : null
    if (updatedEvent && existing.UserID && !isSelf) {
      const by = await usersRepo.findById(pool, req.user.id)
      notify.eventRegistrationRemoved(
        updatedEvent,
        { userId: existing.UserID, pickupLocation: existing.PickupLocation },
        by?.FullName ?? null,
      )
    }

    res.json({ message: 'ยกเลิกการลงชื่อเรียบร้อยแล้ว', event: updatedEvent })
  } catch (err) {
    next(err)
  }
})

// รายงานรายชื่อผู้เดินทาง + จุดขึ้นรถ (Excel) - Admin ดาวน์โหลดแล้วส่งให้บริษัทรถเอง
eventsRouter.get('/:id/report', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const eventId = parseInt(req.params.id, 10)
    if (isNaN(eventId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const event = await eventsRepo.getEventById(pool, eventId)
    if (!event) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    const buffer = await eventReportToXlsx(event, await eventsRepo.getBoarding(pool, eventId))
    const thaiName = `รายชื่อผู้เดินทาง_${event.Title}`.replace(/[\\/:*?"<>|\r\n]/g, ' ').slice(0, 100)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ชื่อไฟล์ไทยต้องใส่แบบ filename* (RFC 5987) ส่วน filename ธรรมดาเป็น ASCII สำรอง
      'Content-Disposition': `attachment; filename="event-${eventId}-passengers.xlsx"; filename*=UTF-8''${encodeURIComponent(thaiName)}.xlsx`,
      'Cache-Control': 'private, no-store',
    })
    res.send(Buffer.from(buffer))
  } catch (err) {
    next(err)
  }
})

// รายงานแยกตามสายรถ (Excel: สรุป + 1 ชีตต่อสาย) - ส่งบริษัทรถ/คนขับแต่ละคัน ต้องมีผู้เดินทางที่จัดสายแล้วอย่างน้อย 1 คน
eventsRouter.get('/:id/report/routes', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const eventId = parseInt(req.params.id, 10)
    if (isNaN(eventId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const event = await eventsRepo.getEventById(pool, eventId)
    if (!event) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const boarding = await eventsRepo.getBoarding(pool, eventId)
    if (!boarding.passengers.some((p) => p.RouteID)) throw new AppError(ErrorCodes.EVENT_BOARDING_EMPTY, 400)

    const buffer = await routeReportToXlsx(event, boarding)
    const thaiName = `สายรถ_${event.Title}`.replace(/[\\/:*?"<>|\r\n]/g, ' ').slice(0, 100)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="event-${eventId}-routes.xlsx"; filename*=UTF-8''${encodeURIComponent(thaiName)}.xlsx`,
      'Cache-Control': 'private, no-store',
    })
    res.send(Buffer.from(buffer))
  } catch (err) {
    next(err)
  }
})

// ---------- รายละเอียดการขึ้นรถ ----------

// พนักงานดูในเว็บ: สายรถที่ตัวเองอยู่ (เป็นเจ้าของรายชื่อ หรือเป็นคนลงชื่อให้) แสดงทั้งสายรวมเพื่อนร่วมสาย
// เฉพาะกิจกรรมที่ Admin ประกาศแล้ว - ผู้เดินทางในสายส่งชื่อ/แผนก/เบอร์โทร/จุดขึ้นรถ/เวลา (ไม่ส่งรหัสพนักงาน)
eventsRouter.get('/boarding/mine', requireAuth, async (req, res, next) => {
  try {
    const rows = await eventsRepo.listBoardingRoutesForUser(await getPool(), req.user.id)
    res.json({ routes: groupRoutesForViewer(rows, req.user.id) })
  } catch (err) {
    next(err)
  }
})

// ส่งออก Excel ของสายรถที่ฉันอยู่ (ทั้งสาย) - ใช้สิทธิ์เดียวกับหน้าการขึ้นรถของฉัน: ต้องเป็นสายของตัวเองและประกาศแล้ว ไม่งั้น 404
eventsRouter.get('/boarding/routes/:routeId/export', requireAuth, async (req, res, next) => {
  try {
    const routeId = parseInt(req.params.routeId, 10)
    if (isNaN(routeId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const rows = await eventsRepo.listBoardingRoutesForUser(await getPool(), req.user.id)
    const route = groupRoutesForViewer(rows, req.user.id).find((r) => r.routeId === routeId)
    if (!route) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    const buffer = await myRouteToXlsx(route)
    const thaiName = `${route.routeName}_${route.eventTitle}`.replace(/[\\/:*?"<>|\r\n]/g, ' ').slice(0, 100)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="boarding-route-${routeId}.xlsx"; filename*=UTF-8''${encodeURIComponent(thaiName)}.xlsx`,
      'Cache-Control': 'private, no-store',
    })
    res.send(Buffer.from(buffer))
  } catch (err) {
    next(err)
  }
})

async function loadEvent(pool, req) {
  const eventId = parseInt(req.params.id, 10)
  if (isNaN(eventId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const event = await eventsRepo.getEventById(pool, eventId)
  if (!event) throw new AppError(ErrorCodes.NOT_FOUND, 404)
  return event
}

async function boardingView(pool, eventId) {
  const b = await eventsRepo.getBoarding(pool, eventId)
  return {
    publishedAt: b.publishedAt ? new Date(b.publishedAt).toISOString() : null,
    routes: b.routes.map(toBoardingRoute),
    passengers: b.passengers.map(toBoardingPassenger),
  }
}

eventsRouter.get('/:id/boarding', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const event = await loadEvent(pool, req)
    res.json(await boardingView(pool, event.EventID))
  } catch (err) {
    next(err)
  }
})

// บันทึกร่างสายรถ + การจัดคน (ยังไม่แจ้งพนักงาน - ต้องกดประกาศ) ถ้าประกาศไปแล้ว พนักงานเห็นข้อมูลที่แก้ทันทีในเว็บ
eventsRouter.put('/:id/boarding', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const event = await loadEvent(pool, req)
    const parsed = parseBoardingBody(req.body, new Set(event.passengers.map((p) => p.PassengerID)))
    await eventsRepo.saveBoarding(pool, event.EventID, parsed)
    res.json(await boardingView(pool, event.EventID))
  } catch (err) {
    next(err)
  }
})

// ประกาศ: พนักงานเห็นในเว็บ + ส่งอีเมล (ประกาศซ้ำ = ส่งอีเมลซ้ำให้ทุกคน)
eventsRouter.post('/:id/boarding/publish', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const event = await loadEvent(pool, req)
    const { passengers, publishedAt } = await eventsRepo.getBoarding(pool, event.EventID)
    if (!passengers.some((p) => p.RouteID)) throw new AppError(ErrorCodes.EVENT_BOARDING_EMPTY, 400)
    await eventsRepo.setBoardingPublished(pool, event.EventID, new Date())
    notify.eventBoardingPublished(event.EventID, { update: Boolean(publishedAt) })
    res.json(await boardingView(pool, event.EventID))
  } catch (err) {
    next(err)
  }
})

// ยกเลิกประกาศ: พนักงานไม่เห็นอีก + อีเมลแจ้งคนที่เคยได้รับ (เฉพาะถ้าประกาศอยู่จริง)
eventsRouter.delete('/:id/boarding/publish', ...adminOnly, async (req, res, next) => {
  try {
    const pool = await getPool()
    const event = await loadEvent(pool, req)
    const { publishedAt } = await eventsRepo.getBoarding(pool, event.EventID)
    await eventsRepo.setBoardingPublished(pool, event.EventID, null)
    if (publishedAt) notify.eventBoardingRetracted(event.EventID)
    res.json(await boardingView(pool, event.EventID))
  } catch (err) {
    next(err)
  }
})

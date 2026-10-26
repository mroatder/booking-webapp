import express from 'express'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import * as driversRepo from './repository.js'
import * as vehicleRequestsRepo from '../vehicle-requests/repository.js'
import { toPublicVehicleRequest } from '../vehicle-requests/routes.js'
import { parseRange, trimmedOrNull, resolveOwnerProviderId } from '../fleet/common.js'
import { deleteFleetItem } from '../fleet/deletion.js'

// ทั้ง router เป็น Admin only - คนขับไม่มี account และพนักงานทั่วไปไม่ต้องเห็นตารางคนขับ
export const driversRouter = express.Router()
driversRouter.use(requireAuth, requireRole('Admin'))

// providerId = null → คนขับของบริษัท, มีค่า → คนขับของบริษัทรถเช่านั้น
function toPublicDriver(row) {
  return {
    id: row.DriverID,
    name: row.Name,
    phone: row.Phone,
    note: row.Note ?? null,
    providerId: row.ProviderID ?? null,
    providerName: row.ProviderName ?? null,
    isActive: Boolean(row.IsActive),
  }
}

async function validateDriver(pool, body) {
  const name = trimmedOrNull(body?.name, 200)
  if (!name) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return {
    name,
    phone: trimmedOrNull(body?.phone, 50),
    note: trimmedOrNull(body?.note, 200),
    providerId: await resolveOwnerProviderId(pool, body?.providerId),
  }
}

/**
 * รายชื่อคนขับ - ถ้าส่ง `busyFrom`/`busyTo` มาด้วย จะคืน `isBusy` ของแต่ละคนในช่วงนั้น
 * (ใช้ตอนเลือกคนขับให้คำขอ, `excludeRequestId` = คำขอที่กำลังจัด ไม่นับเป็นงานชนตัวเอง)
 */
driversRouter.get('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await driversRepo.listAll(pool, { includeInactive: req.query.includeInactive === 'true' })
    const drivers = rows.map(toPublicDriver)

    if (req.query.busyFrom || req.query.busyTo) {
      const { from, to } = parseRange({ from: req.query.busyFrom, to: req.query.busyTo })
      const excludeRequestId = req.query.excludeRequestId ? Number(req.query.excludeRequestId) : undefined
      const assignments = await vehicleRequestsRepo.listAssignments(pool, { from, to, excludeRequestId })
      const busyIds = new Set(assignments.map((a) => a.AssignedDriverID).filter(Boolean))
      for (const d of drivers) d.isBusy = busyIds.has(d.id)
    }

    res.json({ drivers })
  } catch (err) {
    next(err)
  }
})

driversRouter.post('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const input = await validateDriver(pool, req.body)
    const row = await driversRepo.create(pool, input)
    res.status(201).json({ driver: toPublicDriver(row) })
  } catch (err) {
    next(err)
  }
})

// ปฏิทินงานคนขับทุกคนในช่วงเวลา (ต้องประกาศก่อน /:id ไม่งั้น "schedule" จะถูกจับเป็น id)
driversRouter.get('/schedule', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query)
    const pool = await getPool()
    const rows = await vehicleRequestsRepo.listAssignments(pool, { from, to })
    res.json({ assignments: rows.map((r) => toPublicVehicleRequest(r)) })
  } catch (err) {
    next(err)
  }
})

driversRouter.get('/:id/schedule', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query)
    const pool = await getPool()
    const driver = await driversRepo.findById(pool, req.params.id)
    if (!driver) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const rows = await vehicleRequestsRepo.listAssignments(pool, { from, to, driverId: driver.DriverID })
    res.json({ driver: toPublicDriver(driver), assignments: rows.map((r) => toPublicVehicleRequest(r)) })
  } catch (err) {
    next(err)
  }
})

driversRouter.put('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    const input = await validateDriver(pool, req.body)
    const existing = await driversRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    // ไม่ส่ง isActive มา = คงสถานะเดิม (ไม่เปิดคนขับที่ปิดไว้กลับมาโดยไม่ตั้งใจ)
    const isActive = req.body?.isActive === undefined ? existing.IsActive !== false : Boolean(req.body.isActive)
    if (!isActive && existing.IsActive !== false && (await vehicleRequestsRepo.countUpcomingAssignments(pool, { driverId: existing.DriverID })) > 0) {
      throw new AppError(ErrorCodes.FLEET_ITEM_HAS_UPCOMING, 409)
    }
    const row = await driversRepo.update(pool, req.params.id, { ...input, isActive })
    res.json({ driver: toPublicDriver(row) })
  } catch (err) {
    next(err)
  }
})

// ลบจริงได้เฉพาะคนขับที่ไม่เคยถูกจัดให้คำขอรถ และไม่ได้เป็นคนขับประจำรถ - ไม่งั้น 409 FLEET_ITEM_IN_USE (ปิดใช้งานแทน)
driversRouter.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    if (!(await deleteFleetItem(pool, 'driver', Number(req.params.id)))) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

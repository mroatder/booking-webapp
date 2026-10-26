import express from 'express'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import * as fleetRepo from './repository.js'
import * as vehicleRequestsRepo from '../vehicle-requests/repository.js'
import * as driversRepo from '../drivers/repository.js'
import * as usersRepo from '../users/repository.js'
import { directoryScopeFor } from '../users/directoryScope.js'
import { parseRange, trimmedOrNull, resolveOwnerProviderId } from './common.js'
import { deleteFleetItem } from './deletion.js'

// Admin only ทั้งหมด - ข้อมูลรถ/ผู้ให้บริการใช้ตอนจัดรถเท่านั้น
const PROVIDER_KINDS = ['Rental', 'OnDemand']
const VEHICLE_TYPES = ['Van', 'Sedan']
const UNIQUE_VIOLATION = new Set([2627, 2601])

// ---------------- Providers: บริษัทรถเช่า / บริการเรียกรถออนไลน์ ----------------

export const providersRouter = express.Router()
providersRouter.use(requireAuth, requireRole('Admin'))

function toPublicProvider(row) {
  return { id: row.ProviderID, name: row.Name, kind: row.Kind, phone: row.Phone, isActive: Boolean(row.IsActive) }
}

function validateProvider(body) {
  const name = trimmedOrNull(body?.name, 200)
  const kind = body?.kind
  if (!name || !PROVIDER_KINDS.includes(kind)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  // เรียกรถออนไลน์ (Grab) ไม่มีเบอร์กลาง - เบอร์คนขับกรอกรายทริป; บริษัทรถเช่าเก็บเบอร์ติดต่อบริษัทได้
  return { name, kind, phone: kind === 'Rental' ? trimmedOrNull(body?.phone, 50) : null }
}

providersRouter.get('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await fleetRepo.listProviders(pool, { includeInactive: req.query.includeInactive === 'true' })
    res.json({ providers: rows.map(toPublicProvider) })
  } catch (err) {
    next(err)
  }
})

providersRouter.post('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const row = await fleetRepo.createProvider(pool, validateProvider(req.body))
    res.status(201).json({ provider: toPublicProvider(row) })
  } catch (err) {
    next(err)
  }
})

providersRouter.put('/:id', async (req, res, next) => {
  try {
    const input = validateProvider(req.body)
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive)
    const pool = await getPool()
    const existing = await fleetRepo.findProvider(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    // เปลี่ยนบริษัทรถเช่าเป็นเรียกรถออนไลน์ไม่ได้ถ้ายังมีคนขับ/รถลงทะเบียนอยู่ (จะกลายเป็นข้อมูลค้างที่เลือกไม่ได้)
    if (existing.Kind === 'Rental' && input.kind === 'OnDemand' && (await fleetRepo.countProviderResources(pool, existing.ProviderID)) > 0) {
      throw new AppError(ErrorCodes.PROVIDER_HAS_RESOURCES, 409)
    }
    const row = await fleetRepo.updateProvider(pool, req.params.id, { ...input, isActive })
    res.json({ provider: toPublicProvider(row) })
  } catch (err) {
    next(err)
  }
})

// ลบจริงได้เฉพาะผู้ให้บริการที่ไม่เคยถูกใช้ในคำขอรถ และไม่มีคนขับ/รถ/สายรถผูกอยู่ (ปิดใช้งานแทนได้เสมอ)
providersRouter.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    if (!(await deleteFleetItem(pool, 'provider', Number(req.params.id)))) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// ---------------- Vehicles: รถที่ลงทะเบียน (รถบริษัท + รถของบริษัทรถเช่า) ----------------

export const vehiclesRouter = express.Router()
vehiclesRouter.use(requireAuth, requireRole('Admin'))

function toPublicVehicle(row) {
  return {
    id: row.VehicleID,
    licensePlate: row.LicensePlate,
    vehicleType: row.VehicleType,
    seatCount: row.SeatCount,
    description: row.Description,
    providerId: row.ProviderID ?? null,
    providerName: row.ProviderName ?? null,
    routeId: row.RouteID ?? null,
    routeName: row.RouteName ?? null,
    isActive: Boolean(row.IsActive),
  }
}

async function validateVehicle(pool, body) {
  const licensePlate = trimmedOrNull(body?.licensePlate, 50)
  const vehicleType = body?.vehicleType
  const seatCount = body?.seatCount === undefined || body?.seatCount === null || body?.seatCount === '' ? null : Number(body.seatCount)
  if (!licensePlate || !VEHICLE_TYPES.includes(vehicleType)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  if (seatCount !== null && (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 100)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  const providerId = await resolveOwnerProviderId(pool, body?.providerId)
  
  let routeId = null
  if (body?.routeId) {
    const route = await fleetRepo.findShuttleRoute(pool, body.routeId)
    if (!route || !route.IsActive || route.ProviderID !== providerId) {
       throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    routeId = route.RouteID
  }

  return {
    licensePlate,
    vehicleType,
    seatCount,
    description: trimmedOrNull(body?.description, 200),
    providerId,
    routeId,
  }
}

/** ทะเบียนซ้ำกับรถที่ยังใช้งาน → LICENSE_PLATE_TAKEN (unique index UX_Vehicles_LicensePlate_Active) */
function mapPlateConflict(err) {
  return UNIQUE_VIOLATION.has(err.number) ? new AppError(ErrorCodes.LICENSE_PLATE_TAKEN, 409) : err
}

/** รายการรถ - ส่ง busyFrom/busyTo(/excludeRequestId) มาเพื่อได้ `isBusy` ตอนเลือกรถให้คำขอ */
vehiclesRouter.get('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await fleetRepo.listVehicles(pool, { includeInactive: req.query.includeInactive === 'true' })
    const vehicles = rows.map(toPublicVehicle)

    if (req.query.busyFrom || req.query.busyTo) {
      const { from, to } = parseRange({ from: req.query.busyFrom, to: req.query.busyTo })
      const excludeRequestId = req.query.excludeRequestId ? Number(req.query.excludeRequestId) : undefined
      const assignments = await vehicleRequestsRepo.listAssignments(pool, { from, to, excludeRequestId })
      const busyIds = new Set(assignments.map((a) => a.AssignedVehicleID).filter(Boolean))
      for (const v of vehicles) v.isBusy = busyIds.has(v.id)
    }

    res.json({ vehicles })
  } catch (err) {
    next(err)
  }
})

vehiclesRouter.post('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const row = await fleetRepo.createVehicle(pool, await validateVehicle(pool, req.body))
    res.status(201).json({ vehicle: toPublicVehicle(row) })
  } catch (err) {
    next(mapPlateConflict(err))
  }
})

vehiclesRouter.put('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    const input = await validateVehicle(pool, req.body)
    const existing = await fleetRepo.findVehicle(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const isActive = req.body?.isActive === undefined ? existing.IsActive !== false : Boolean(req.body.isActive)
    if (!isActive && existing.IsActive !== false && (await vehicleRequestsRepo.countUpcomingAssignments(pool, { vehicleId: existing.VehicleID })) > 0) {
      throw new AppError(ErrorCodes.FLEET_ITEM_HAS_UPCOMING, 409)
    }
    const row = await fleetRepo.updateVehicle(pool, req.params.id, { ...input, isActive })
    res.json({ vehicle: toPublicVehicle(row) })
  } catch (err) {
    next(mapPlateConflict(err))
  }
})

// ลบจริงได้เฉพาะรถที่ไม่เคยถูกจัดให้คำขอรถ และไม่ได้อยู่ในสายรถ (ปิดใช้งานแทนได้เสมอ)
vehiclesRouter.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    if (!(await deleteFleetItem(pool, 'vehicle', Number(req.params.id)))) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// ---------------- Shuttle Routes: สายรถรับส่งพนักงาน ----------------

export const shuttleRoutesRouter = express.Router()
// GET route สำหรับดึงสายรถ ให้ทุกคนเข้าถึงได้ (เพื่อเอาไปเลือกตอนขอรถโอที)
shuttleRoutesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await fleetRepo.listShuttleRoutes(pool, { includeInactive: req.query.includeInactive === 'true' })
    const vehiclesByRoute = await fleetRepo.listRouteVehicles(
      pool,
      rows.map((r) => r.RouteID),
    )
    // ทุกคนที่ login เห็นรายการสายได้ - เบอร์คนขับประจำให้เฉพาะ Admin
    const includeContacts = req.user.role === 'Admin'
    res.json({
      routes: rows.map((r) => toPublicShuttleRoute(r, vehiclesByRoute.get(r.RouteID) ?? [], { includeContacts })),
    })
  } catch (err) {
    next(err)
  }
})

// ส่วนที่เหลือ (POST, PUT) ให้เฉพาะ Admin
shuttleRoutesRouter.use(requireAuth, requireRole('Admin'))

function toPublicRouteVehicle(v, includeContacts) {
  return {
    vehicleId: v.VehicleID,
    licensePlate: v.LicensePlate,
    vehicleType: v.VehicleType,
    seatCount: v.SeatCount,
    isActive: Boolean(v.IsActive),
    driverId: v.RegularDriverID ?? null,
    driverName: v.DriverName ?? null,
    ...(includeContacts ? { driverPhone: v.DriverPhone ?? null } : {}),
  }
}

function toPublicShuttleRoute(row, vehicles = [], { includeContacts = true } = {}) {
  return {
    vehicles: vehicles.map((v) => toPublicRouteVehicle(v, includeContacts)),
    id: row.RouteID,
    providerId: row.ProviderID,
    providerName: row.ProviderName,
    name: row.Name,
    origin: row.Origin,
    destination: row.Destination,
    stops: row.StopsJson ? JSON.parse(row.StopsJson) : [],
    morningDepart: row.MorningDepart,
    morningArrive: row.MorningArrive,
    eveningDepart: row.EveningDepart,
    eveningArrive: row.EveningArrive,
    runDays: row.RunDays,
    isActive: Boolean(row.IsActive),
  }
}

function isValidTime(t) {
  if (!t) return true
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
}

async function validateShuttleRoute(pool, body) {
  const name = trimmedOrNull(body?.name, 100)
  const origin = trimmedOrNull(body?.origin, 200)
  const destination = trimmedOrNull(body?.destination, 200)
  let stops = []
  if (Array.isArray(body?.stops)) {
    stops = body.stops.map(s => {
      if (typeof s === 'string') {
        const name = trimmedOrNull(s, 100)
        return name ? { name, time: null } : null
      } else if (typeof s === 'object' && s !== null) {
        const name = trimmedOrNull(s.name, 100)
        const time = isValidTime(s.time) ? s.time : null
        return name ? { name, time } : null
      }
      return null
    }).filter(Boolean)
  }
  
  if (!name || !origin || !destination) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  
  const providerId = await resolveOwnerProviderId(pool, body?.providerId)
  if (!providerId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400) // Route must belong to a rental provider

  const morningDepart = body?.morningDepart || null
  const morningArrive = body?.morningArrive || null
  const eveningDepart = body?.eveningDepart || null
  const eveningArrive = body?.eveningArrive || null
  
  if (!isValidTime(morningDepart) || !isValidTime(morningArrive) || !isValidTime(eveningDepart) || !isValidTime(eveningArrive)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  
  // check time order if both are present
  if (morningDepart && morningArrive && morningDepart >= morningArrive) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  if (eveningDepart && eveningArrive && eveningDepart >= eveningArrive) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  
  const runDays = body?.runDays
  if (!runDays || !/^[01]{7}$/.test(runDays)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  
  return {
    providerId,
    name,
    origin,
    destination,
    stopsJson: stops.length > 0 ? JSON.stringify(stops) : null,
    morningDepart,
    morningArrive,
    eveningDepart,
    eveningArrive,
    runDays
  }
}



/**
 * รถประจำสาย: [{ vehicleId, driverId? }] - รถ/คนขับต้องเป็นของบริษัทรถเช่าเจ้าของสาย และยังใช้งานอยู่
 * รถซ้ำหรือคนขับซ้ำในสายเดียวกันไม่ได้ - ไม่ส่งมา (undefined) = ไม่แตะรถประจำสายเดิม
 */
async function validateRouteVehicles(pool, providerId, raw) {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || raw.length > 20) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const pairs = raw.map((p) => ({
    vehicleId: Number(p?.vehicleId),
    driverId: p?.driverId === null || p?.driverId === undefined || p?.driverId === '' ? null : Number(p.driverId),
  }))
  const vehicleIds = pairs.map((p) => p.vehicleId)
  const driverIds = pairs.map((p) => p.driverId).filter((d) => d !== null)
  if (
    vehicleIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    driverIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(vehicleIds).size !== vehicleIds.length ||
    new Set(driverIds).size !== driverIds.length
  ) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  for (const { vehicleId, driverId } of pairs) {
    const vehicle = await fleetRepo.findVehicle(pool, vehicleId)
    if (!vehicle || !vehicle.IsActive || vehicle.ProviderID !== providerId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    if (driverId) {
      const driver = await driversRepo.findById(pool, driverId)
      if (!driver || !driver.IsActive || driver.ProviderID !== providerId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
  }
  return pairs
}

async function respondWithRoute(res, pool, routeId, status = 200) {
  const row = await fleetRepo.findShuttleRoute(pool, routeId)
  const vehicles = (await fleetRepo.listRouteVehicles(pool, [routeId])).get(routeId) ?? []
  res.status(status).json({ route: toPublicShuttleRoute(row, vehicles) })
}

shuttleRoutesRouter.post('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const input = await validateShuttleRoute(pool, req.body)
    const pairs = await validateRouteVehicles(pool, input.providerId, req.body?.vehicles)
    const row = await fleetRepo.createShuttleRoute(pool, input)
    if (pairs) await fleetRepo.setRouteVehicles(pool, row.RouteID, pairs)
    await respondWithRoute(res, pool, row.RouteID, 201)
  } catch (err) {
    next(err)
  }
})

shuttleRoutesRouter.put('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    const input = await validateShuttleRoute(pool, req.body)
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive)
    const existing = await fleetRepo.findShuttleRoute(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const pairs = await validateRouteVehicles(pool, input.providerId, req.body?.vehicles)
    await fleetRepo.updateShuttleRoute(pool, req.params.id, { ...input, isActive })
    // เปลี่ยนบริษัทรถเช่าของสาย → รถเดิม (ของบริษัทเก่า) ต้องหลุดจากสาย ถ้าไม่ได้ส่งรายการใหม่มาก็ล้างทิ้ง
    const effectivePairs = pairs ?? (existing.ProviderID !== input.providerId ? [] : undefined)
    if (effectivePairs) await fleetRepo.setRouteVehicles(pool, existing.RouteID, effectivePairs)
    await respondWithRoute(res, pool, existing.RouteID)
  } catch (err) {
    next(err)
  }
})

// ลบจริงได้เมื่อไม่มีผู้โดยสารลงทะเบียนในสาย (ไม่งั้นปิดใช้งานแทน) รถประจำสายจะถูกถอดออกจากสาย
shuttleRoutesRouter.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    if (!(await deleteFleetItem(pool, 'route', Number(req.params.id)))) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// ---------------- Shuttle Passengers: ผู้โดยสารรถรับส่ง ----------------

export const shuttlePassengersRouter = express.Router()

// ฟอร์มขอรถโอทีใช้แสดงสาย/จุดจอดของคนที่เลือก - ไม่ใช่ Admin เห็นเฉพาะคนที่ตัวเองเลือกได้ (แผนกหลัก)
// กันพนักงานดูจุดขึ้นรถ (ใกล้บ้าน) ของคนทั้งบริษัท
shuttlePassengersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    let rows = await fleetRepo.listShuttlePassengers(pool)
    const scope = await directoryScopeFor(pool, req.user)
    if (scope) {
      const visible = new Set((await usersRepo.listDirectory(pool, scope)).map((u) => u.UserID))
      rows = rows.filter((r) => visible.has(r.UserID))
    }
    res.json({ passengers: rows.map(toPublicShuttlePassenger) })
  } catch (err) {
    next(err)
  }
})

shuttlePassengersRouter.use(requireAuth, requireRole('Admin'))

function toPublicShuttlePassenger(row) {
  return {
    userId: row.UserID,
    fullName: row.FullName,
    department: row.Department,
    routeId: row.RouteID,
    routeName: row.RouteName,
    providerId: row.ProviderID,
    pickupStop: row.PickupStop,
  }
}



shuttlePassengersRouter.put('/:userId', async (req, res, next) => {
  try {
    const pool = await getPool()
    const userId = parseInt(req.params.userId, 10)
    const routeId = parseInt(req.body.routeId, 10)
    const pickupStop = trimmedOrNull(req.body.pickupStop, 200)

    if (!userId || !routeId || !pickupStop) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const route = await fleetRepo.findShuttleRoute(pool, routeId)
    if (!route || !route.IsActive) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const row = await fleetRepo.upsertShuttlePassenger(pool, { userId, routeId, pickupStop })
    res.json({ passenger: toPublicShuttlePassenger(row) })
  } catch (err) {
    next(err)
  }
})

shuttlePassengersRouter.delete('/:userId', async (req, res, next) => {
  try {
    const pool = await getPool()
    const userId = parseInt(req.params.userId, 10)
    if (!userId) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    await fleetRepo.deleteShuttlePassenger(pool, userId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

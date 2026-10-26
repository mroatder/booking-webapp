import express from 'express'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import * as reportsRepo from './repository.js'
import * as service from './service.js'
import { reportToXlsx } from './excel.js'

/**
 * รายงาน (M8, Admin เท่านั้น) - GET /api/reports/:type?from&to → JSON, GET /api/reports/:type/export → .xlsx
 * type: rooms | vehicle-requests | drivers | shuttle-routes | group-trips, ช่วงเวลาไม่เกิน 400 วัน
 */
export const reportsRouter = express.Router()
reportsRouter.use(requireAuth, requireRole('Admin'))

const MAX_RANGE_MS = 400 * 24 * 3_600_000

const REPORTS = {
  rooms: {
    file: 'room-usage',
    build: async (pool, from, to) =>
      service.roomUsageReport(await reportsRepo.roomBookings(pool, from, to), await reportsRepo.activeRooms(pool)),
  },
  'vehicle-requests': {
    file: 'vehicle-requests',
    build: async (pool, from, to) => service.vehicleRequestReport(await reportsRepo.vehicleRequests(pool, from, to)),
  },
  drivers: {
    file: 'drivers-vehicles',
    build: async (pool, from, to) => service.driverVehicleReport(await reportsRepo.vehicleRequests(pool, from, to)),
  },
  'group-trips': {
    file: 'group-trips',
    build: async (pool, from, to) => service.eventTripReport(await reportsRepo.eventPassengers(pool, from, to)),
  },
  'shuttle-routes': {
    file: 'ot-shuttle-routes',
    build: async (pool, from, to) => service.shuttleRouteReport(await reportsRepo.shuttleRiders(pool, from, to)),
  },
}

function parseRequest(req) {
  const def = REPORTS[req.params.type]
  if (!def) throw new AppError(ErrorCodes.NOT_FOUND, 404)
  const from = new Date(req.query.from)
  const to = new Date(req.query.to)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > MAX_RANGE_MS) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  return { def, from, to }
}

reportsRouter.get('/:type', async (req, res, next) => {
  try {
    const { def, from, to } = parseRequest(req)
    res.json({ report: await def.build(await getPool(), from, to) })
  } catch (err) {
    next(err)
  }
})

reportsRouter.get('/:type/export', async (req, res, next) => {
  try {
    const { def, from, to } = parseRequest(req)
    const report = await def.build(await getPool(), from, to)
    const buffer = await reportToXlsx(report, { from, to })
    const stamp = service.bangkokDate(from).replace(/-/g, '')
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${def.file}-${stamp}.xlsx"`,
      'Cache-Control': 'private, no-store',
    })
    res.send(Buffer.from(buffer))
  } catch (err) {
    next(err)
  }
})

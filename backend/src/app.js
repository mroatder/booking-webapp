import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

import { getPool, sql } from './db/pool.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'
import { authRouter } from './modules/auth/routes.js'
import { roomsRouter } from './modules/rooms/routes.js'
import { usersRouter } from './modules/users/routes.js'
import { bookingsRouter } from './modules/bookings/routes.js'
import { tabletRouter } from './modules/tablet/routes.js'
import { vehicleRequestsRouter } from './modules/vehicle-requests/routes.js'
import { driversRouter } from './modules/drivers/routes.js'
import { providersRouter, vehiclesRouter, shuttleRoutesRouter, shuttlePassengersRouter } from './modules/fleet/routes.js'
import departmentsRoutes from './modules/departments/routes.js'
import { reportsRouter } from './modules/reports/routes.js'
import { eventsRouter } from './modules/events/routes.js'
import { alertsRouter } from './modules/alerts/routes.js'
import { auditRouter } from './modules/audit/routes.js'
import { auditTrail } from './middleware/audit.js'
import { env } from './config/env.js'

export function createApp() {
  const app = express()

  // ใช้เมื่อรันหลัง reverse proxy (IIS ARR) เพื่อให้ req.ip ใน audit log เป็น IP ผู้ใช้จริง - ตั้ง TRUST_PROXY=1 (จำนวน proxy)
  if (env.trustProxy) app.set('trust proxy', /^\d+$/.test(env.trustProxy) ? Number(env.trustProxy) : env.trustProxy)

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    }),
  )
  app.use(express.json())
  app.use(cookieParser())

  app.get('/health', async (req, res) => {
    try {
      const pool = await getPool()
      await pool.request().query('SELECT 1')
      res.status(200).json({ status: 'ok', db: 'ok' })
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' })
    }
  })

  app.use('/api', apiRouter())

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

function apiRouter() {
  const router = express.Router()
  // M9: บันทึก audit log อัตโนมัติทุกคำขอที่แก้ข้อมูล (ต้องอยู่ก่อน router ย่อยทั้งหมด)
  router.use(auditTrail)
  router.use('/audit', auditRouter)
  router.use('/auth', authRouter)
  router.use('/rooms', roomsRouter)
  router.use('/users', usersRouter)
  router.use('/bookings', bookingsRouter)
  router.use('/tablet', tabletRouter)
  router.use('/vehicle-requests', vehicleRequestsRouter)
  router.use('/drivers', driversRouter)
  router.use('/providers', providersRouter)
  router.use('/vehicles', vehiclesRouter)
  router.use('/routes', shuttleRoutesRouter)
  router.use('/passengers', shuttlePassengersRouter)
  router.use('/departments', departmentsRoutes)
  router.use('/reports', reportsRouter)
  router.use('/events', eventsRouter)
  router.use('/alerts', alertsRouter)
  return router
}

// re-export เผื่อโมดูลอื่นต้องใช้ sql types ตรงๆ (parameterized query)
export { sql }

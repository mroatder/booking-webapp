import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import * as repo from './repository.js'
import { KNOWN_ACTIONS } from './actions.js'
import { toPublicLog } from './service.js'

export const auditRouter = Router()

// ดู audit log ได้เฉพาะ Admin
auditRouter.use(requireAuth, requireRole('Admin'))

// วันที่ในตัวกรอง (YYYY-MM-DD) ตีความเป็นเวลาไทย (UTC+7) ตาม NFR; to = สิ้นวันนั้น (เป็นขอบเขตไม่รวม = เที่ยงคืนวันถัดไป)
const DAY_MS = 24 * 60 * 60 * 1000
function bangkokDayStart(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str ?? '')) return null
  const d = new Date(`${str}T00:00:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function positiveInt(value) {
  if (value === undefined || value === '') return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return n
}

export function parseFilters(query) {
  const filters = {}
  if (query.from) {
    filters.from = bangkokDayStart(query.from)
    if (!filters.from) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  if (query.to) {
    const end = bangkokDayStart(query.to)
    if (!end) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    filters.to = new Date(end.getTime() + DAY_MS)
  }
  if (filters.from && filters.to && filters.from >= filters.to) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  filters.userId = positiveInt(query.userId)
  filters.entityId = positiveInt(query.entityId)
  if (query.action) {
    if (typeof query.action !== 'string' || !/^[A-Za-z]+\.[A-Za-z]+$/.test(query.action)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    filters.action = query.action
  }
  if (query.entityType) {
    if (typeof query.entityType !== 'string' || !/^[A-Za-z]{1,40}$/.test(query.entityType)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    filters.entityType = query.entityType
  }
  if (query.q) {
    if (typeof query.q !== 'string') throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    filters.q = query.q.trim().slice(0, 100) || undefined
  }
  return filters
}

auditRouter.get('/', async (req, res, next) => {
  try {
    const filters = parseFilters(req.query)
    const page = positiveInt(req.query.page) ?? 1
    const pageSize = Math.min(positiveInt(req.query.pageSize) ?? 50, 200)
    const pool = await getPool()
    const { items, total } = await repo.list(pool, filters, { limit: pageSize, offset: (page - 1) * pageSize })
    res.json({ items: items.map(toPublicLog), total, page, pageSize })
  } catch (err) {
    next(err)
  }
})

// รายการรหัส action ที่รู้จัก (ใช้เติมตัวกรองในหน้าเว็บ)
auditRouter.get('/actions', (req, res) => {
  res.json(KNOWN_ACTIONS)
})

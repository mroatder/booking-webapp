import { getPool } from '../../db/pool.js'
import { env } from '../../config/env.js'
import * as repo from './repository.js'
import { sanitize, buildDetails } from './actions.js'
import * as usersRepo from '../users/repository.js'
import * as bookingsRepo from '../bookings/repository.js'
import * as vehicleRequestsRepo from '../vehicle-requests/repository.js'
import * as roomsRepo from '../rooms/repository.js'
import * as departmentsRepo from '../departments/repository.js'
import * as driversRepo from '../drivers/repository.js'

// เปิดเก็บ log ทุกที่ ยกเว้นตอนรัน test (test ใช้ pool จำลอง - เขียน log จริงไม่ได้)
export const auditEnabled = () => env.nodeEnv !== 'test'

/**
 * บันทึก audit log แบบ best-effort - ต้องไม่ทำให้ flow หลักล้มเหลวไม่ว่ากรณีใด
 * (เหมือนหลักการของอีเมลแจ้งเตือน: REQUIREMENTS § ระบบ ข้อ 4)
 */
export async function recordAudit(entry, { pool: injected, write = repo.insert } = {}) {
  if (!injected && !auditEnabled()) return
  try {
    const pool = injected ?? (await getPool())
    await write(pool, {
      ...entry,
      details: entry.details !== undefined ? entry.details : buildDetails(entry),
    })
  } catch (err) {
    console.error('[audit] failed to write audit log:', err?.message ?? err)
  }
}

/** ตัวโหลดค่า "ก่อนแก้" ของแต่ละ entity (ใช้ findById เดิมของแต่ละโมดูล) */
// เรียก findById แบบ lazy (ไม่อ้างอิง export ตอนโหลดโมดูล) เพื่อไม่ผูกกับโมดูลที่ test อื่น mock ไว้บางส่วน
export const BEFORE_LOADERS = {
  user: (pool, id) => usersRepo.findById(pool, id),
  booking: (pool, id) => bookingsRepo.findById(pool, id),
  vehicleRequest: (pool, id) => vehicleRequestsRepo.findById(pool, id),
  room: (pool, id) => roomsRepo.findById(pool, id),
  department: (pool, id) => departmentsRepo.findById(pool, id),
  driver: (pool, id) => driversRepo.findById(pool, id),
}

export async function loadBefore(entityType, entityId, { pool: injected, loaders = BEFORE_LOADERS } = {}) {
  const loader = loaders[entityType]
  if (!loader || !entityId) return undefined
  try {
    const pool = injected ?? (await getPool())
    const row = await loader(pool, entityId)
    return row ? sanitize(row) : undefined
  } catch {
    return undefined // ดึงค่าก่อนแก้ไม่ได้ก็ไม่เป็นไร ไม่บล็อกคำขอจริง
  }
}

export function toPublicLog(row) {
  let details = null
  if (row.Details) {
    try {
      details = JSON.parse(row.Details)
    } catch {
      details = { raw: row.Details }
    }
  }
  return {
    id: String(row.AuditLogID),
    createdAt: row.CreatedAt,
    userId: row.UserID ?? null,
    username: row.Username ?? null,
    fullName: row.FullName ?? null,
    actor: row.Actor ?? null,
    action: row.Action,
    entityType: row.EntityType ?? null,
    entityId: row.EntityID ?? null,
    method: row.Method ?? null,
    path: row.Path ?? null,
    statusCode: row.StatusCode ?? null,
    ip: row.IpAddress ?? null,
    details,
  }
}

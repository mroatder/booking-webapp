import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import * as fleetRepo from './repository.js'

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000

/** ช่วงเวลา from/to จาก query (ไม่เกิน 62 วัน กันดึงข้อมูลทีละมากเกิน) */
export function parseRange({ from: rawFrom, to: rawTo }) {
  const from = rawFrom ? new Date(rawFrom) : null
  const to = rawTo ? new Date(rawTo) : null
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return { from, to }
}

export function trimmedOrNull(value, maxLength) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const s = value.trim()
  if (s.length > maxLength) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return s || null
}

/** providerId ของคนขับ/รถ: null = ของบริษัทเอง, มีค่า = ต้องเป็นบริษัทรถเช่า (เรียกรถออนไลน์ไม่มีรายชื่อ) */
export async function resolveOwnerProviderId(pool, raw) {
  if (raw === undefined || raw === null || raw === '') return null
  const providerId = Number(raw)
  if (!Number.isInteger(providerId) || providerId <= 0) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const provider = await fleetRepo.findProvider(pool, providerId)
  if (!provider || provider.Kind !== 'Rental') throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return providerId
}

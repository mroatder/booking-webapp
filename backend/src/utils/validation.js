import { AppError } from '../errors/AppError.js'
import { ErrorCodes } from '../errors/codes.js'

/**
 * ข้อความ: trim แล้วต้องไม่ว่าง (required) และไม่ยาวเกินคอลัมน์ - เกินแล้วตอบ 400 FIELD_TOO_LONG
 * (เดิมปล่อยให้ SQL Server ปฏิเสธเป็น 500) ไม่ใช่ข้อความ/ว่างแบบไม่บังคับ → null
 */
export function textField(value, { field, max, required = true }) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    if (required) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, { field })
    return null
  }
  if (text.length > max) throw new AppError(ErrorCodes.FIELD_TOO_LONG, 400, { field, max })
  return text
}

/** เบอร์โทร: ตัวเลข + - ( ) . # , / ช่องว่าง (ขึ้นต้น + ได้) อย่างน้อย 4 หลัก ไม่เกิน 30 ตัวอักษร */
export function isValidPhone(value) {
  if (typeof value !== 'string') return false
  const text = value.trim()
  return text.length <= 30 && /^\+?[0-9][0-9\s().#,/-]*$/.test(text) && text.replace(/\D/g, '').length >= 4
}

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** วันที่ต้องแปลงได้จริง (ไม่ใช่ข้อความมั่ว) - คืน Date หรือ null */
export function parseDate(value) {
  if (value === undefined || value === null || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

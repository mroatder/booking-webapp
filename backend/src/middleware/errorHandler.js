import { AppError } from '../errors/AppError.js'
import { ErrorCodes } from '../errors/codes.js'

export function notFoundHandler(req, res, next) {
  next(new AppError(ErrorCodes.NOT_FOUND, 404))
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ errorCode: err.code, details: err.details })
  }

  // ข้อมูลจากผู้ใช้ที่ SQL Server ปฏิเสธ (id ไม่ใช่ตัวเลข, ข้อความยาวเกินคอลัมน์, อ้างอิงข้อมูลที่ไม่มี) = ความผิดของคำขอ ไม่ใช่ของระบบ
  if (err?.code === 'EPARAM' || [245, 8114, 8115].includes(err?.number)) {
    return res.status(400).json({ errorCode: ErrorCodes.VALIDATION_ERROR })
  }
  if ([2628, 8152].includes(err?.number)) return res.status(400).json({ errorCode: ErrorCodes.FIELD_TOO_LONG })
  if (err?.number === 547) return res.status(400).json({ errorCode: ErrorCodes.VALIDATION_ERROR })

  console.error('[unhandled error]', err)
  return res.status(500).json({ errorCode: ErrorCodes.INTERNAL_ERROR })
}

import { verifyToken } from '../modules/auth/jwt.js'
import { loadCurrentUser } from '../modules/auth/currentUser.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCodes } from '../errors/codes.js'

const COOKIE_NAME = 'token'

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) {
    return next(new AppError(ErrorCodes.AUTH_UNAUTHENTICATED, 401))
  }

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    return next(new AppError(ErrorCodes.AUTH_UNAUTHENTICATED, 401))
  }

  try {
    // ตรวจกับฐานข้อมูลทุกคำขอ: ผู้ใช้ที่ถูกปิดใช้งาน/ลบ = ออกจากระบบทันที, role ใช้ค่าล่าสุดเสมอ ไม่ใช่ค่าใน token
    const user = await loadCurrentUser(payload)
    if (!user || user.IsActive === false) {
      return next(new AppError(ErrorCodes.AUTH_UNAUTHENTICATED, 401))
    }
    req.user = { id: payload.sub, role: user.Role }
    next()
  } catch (err) {
    next(err)
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(ErrorCodes.AUTH_FORBIDDEN, 403))
    }
    next()
  }
}

export { COOKIE_NAME }

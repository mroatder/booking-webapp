import express from 'express'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, COOKIE_NAME } from '../../middleware/auth.js'
import * as authService from './service.js'
import { createLoginLimiter } from './loginLimiter.js'
import { isValidPhone, isValidEmail } from '../../utils/validation.js'
import { env } from '../../config/env.js'
import { getPool } from '../../db/pool.js'
import * as usersRepo from '../users/repository.js'
import { uploadSignature, saveSignature, removeSignature } from '../users/signature.js'
import * as vehicleRequestsRepo from '../vehicle-requests/repository.js'

const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000 // 8 ชั่วโมง สอดคล้องกับ JWT_EXPIRES_IN default

export const authRouter = express.Router()

const loginLimiter = createLoginLimiter({
  maxPerUser: env.loginMaxAttempts,
  windowMs: env.loginWindowMinutes * 60 * 1000,
})

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    // รูปแบบ username ที่ยอมรับ (ตัวอักษร ตัวเลข . _ - @) และจำกัดความยาว - กันอักขระพิเศษเข้า LDAP/DB และกัน payload ใหญ่เข้า bcrypt
    if (username.length > 100 || password.length > 256 || !/^[\w.@-]+$/.test(username)) {
      throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 401)
    }

    const ip = req.ip
    loginLimiter.check(ip, username)
    let result
    try {
      result = await authService.login(username, password)
    } catch (err) {
      if (err instanceof AppError && err.code === ErrorCodes.AUTH_INVALID_CREDENTIALS) loginLimiter.fail(ip, username)
      throw err
    }
    loginLimiter.success(ip, username)
    const { token, user } = result
    res.locals.auditUserId = user.id // ให้ audit log ผูกการล็อกอินสำเร็จกับผู้ใช้

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.cookieSecure,
      maxAge: COOKIE_MAX_AGE_MS,
    })
    res.json({ user })
  } catch (err) {
    if (err instanceof AppError && err.code === ErrorCodes.AUTH_TOO_MANY_ATTEMPTS) {
      res.set('Retry-After', String(err.details?.retryAfterSeconds ?? 60))
    }
    next(err)
  }
})

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: env.cookieSecure })
  res.status(204).end()
})

// ผู้ใช้แก้ได้เฉพาะเบอร์โทรและอีเมลของตัวเอง - ชื่อ/แผนกของผู้ใช้ AD มาจาก AD, ส่วนอื่นเป็นหน้าที่ Admin
authRouter.put('/me/phone', requireAuth, async (req, res, next) => {
  try {
    const raw = req.body?.phone
    if (raw !== null && raw !== undefined && typeof raw !== 'string') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    const phone = (raw ?? '').trim()
    if (phone.length > 50) throw new AppError(ErrorCodes.FIELD_TOO_LONG, 400, { field: 'phone', max: 50 })
    if (phone && !isValidPhone(phone)) throw new AppError(ErrorCodes.PHONE_INVALID, 400)

    const user = await authService.updateMyPhone(req.user.id, phone || null)
    res.json({ user })
  } catch (err) {
    next(err)
  }
})

authRouter.put('/me/email', requireAuth, async (req, res, next) => {
  try {
    const raw = req.body?.email
    if (raw !== null && raw !== undefined && typeof raw !== 'string') {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    const email = (raw ?? '').trim()
    if (email.length > 255) throw new AppError(ErrorCodes.FIELD_TOO_LONG, 400, { field: 'email', max: 255 })
    if (email && !isValidEmail(email)) throw new AppError(ErrorCodes.EMAIL_INVALID, 400)

    const user = await authService.updateMyEmail(req.user.id, email || null)
    res.json({ user })
  } catch (err) {
    next(err)
  }
})

// รูปลายเซ็น/ตราประทับสำหรับช่อง Approved by ใน PDF แบบฟอร์มขอรถ - เฉพาะผู้ที่มีระดับอนุมัติ
// ไฟล์ลายเซ็นที่คำขอเก่าอ้างอยู่ (อนุมัติไปแล้ว) ต้องเก็บไว้ - ฟอร์มย้อนหลังต้องพิมพ์ลายเซ็น ณ ตอนอนุมัติ
async function removeSignatureIfUnused(pool, name) {
  if (!name || (await vehicleRequestsRepo.isSignatureReferenced(pool, name))) return
  await removeSignature(name)
}

authRouter.put('/me/signature', requireAuth, uploadSignature, async (req, res, next) => {
  let saved = null
  try {
    const pool = await getPool()
    const me = await usersRepo.findById(pool, req.user.id)
    if (!me?.ApprovalLevel) throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)
    saved = await saveSignature(req.file)
    await usersRepo.setSignatureFile(pool, req.user.id, saved)
    await removeSignatureIfUnused(pool, me.SignatureFile)
    res.json({ user: await authService.getUserById(req.user.id) })
  } catch (err) {
    if (saved) await removeSignature(saved)
    next(err)
  }
})

authRouter.delete('/me/signature', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const me = await usersRepo.findById(pool, req.user.id)
    await usersRepo.setSignatureFile(pool, req.user.id, null)
    await removeSignatureIfUnused(pool, me?.SignatureFile)
    res.json({ user: await authService.getUserById(req.user.id) })
  } catch (err) {
    next(err)
  }
})

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.user.id)
    res.json({ user })
  } catch (err) {
    next(err)
  }
})

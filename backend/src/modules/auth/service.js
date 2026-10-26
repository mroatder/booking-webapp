import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { comparePassword } from './password.js'
import { authenticateWithLdap } from './ldap.js'
import { signToken } from './jwt.js'
import * as usersRepo from '../users/repository.js'

export function toPublicUser(user) {
  return {
    id: user.UserID,
    username: user.Username,
    fullName: user.FullName,
    department: user.Department,
    phone: user.Phone,
    email: user.Email,
    authSource: user.AuthSource,
    role: user.Role,
    approvalLevel: user.ApprovalLevel ?? null, // 1/2/3 = ผู้อนุมัติคำขอรถนอก (migration 028)
    hasSignature: Boolean(user.SignatureFile),
  }
}

/**
 * Login ตาม auth flow ใน ARCHITECTURE.md § 4:
 * ถ้ามี user ในระบบและเป็น Local account ให้เช็ค bcrypt ตรงๆ
 * มิฉะนั้น (ไม่พบ หรือเป็น AD account) ให้ลอง LDAP bind แล้ว sync โปรไฟล์กลับเข้า DB
 */
export async function login(username, password) {
  const pool = await getPool()
  const existing = await usersRepo.findByUsername(pool, username)

  let user

  // รายชื่อที่ไม่ login: ห้ามเข้าระบบ (และไม่ลอง LDAP ด้วย)
  if (existing && existing.AuthSource === 'None') {
    throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 401)
  }

  if (existing && existing.AuthSource === 'Local') {
    const passwordOk = await comparePassword(password, existing.PasswordHash)
    if (!existing.IsActive || !passwordOk) {
      throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 401)
    }
    user = existing
  } else {
    let ldapProfile
    try {
      ldapProfile = await authenticateWithLdap(username, password)
    } catch {
      throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 401)
    }

    user = await usersRepo.upsertFromAd(pool, { username, ...ldapProfile })
    if (!user.IsActive) {
      throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 401)
    }
  }

  const token = signToken({ sub: user.UserID, role: user.Role })
  return { token, user: toPublicUser(user) }
}

/** ผู้ใช้แก้เบอร์โทรของตัวเอง (หน้าโปรไฟล์) - ส่งค่าว่างเพื่อลบเบอร์ได้ */
export async function updateMyPhone(userId, phone) {
  const pool = await getPool()
  const user = await usersRepo.updatePhone(pool, userId, phone)
  if (!user || !user.IsActive) {
    throw new AppError(ErrorCodes.AUTH_UNAUTHENTICATED, 401)
  }
  return toPublicUser(user)
}

/** ผู้ใช้แก้อีเมลของตัวเอง (หน้าโปรไฟล์) - ส่งค่าว่างเพื่อลบอีเมลได้ */
export async function updateMyEmail(userId, email) {
  const pool = await getPool()
  const user = await usersRepo.updateEmail(pool, userId, email)
  if (!user || !user.IsActive) {
    throw new AppError(ErrorCodes.AUTH_UNAUTHENTICATED, 401)
  }
  return toPublicUser(user)
}

export async function getUserById(userId) {
  const pool = await getPool()
  const user = await usersRepo.findById(pool, userId)
  if (!user || !user.IsActive) {
    throw new AppError(ErrorCodes.AUTH_UNAUTHENTICATED, 401)
  }
  return toPublicUser(user)
}

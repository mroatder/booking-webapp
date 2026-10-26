import express from 'express'
import { textField, isValidPhone, isValidEmail } from '../../utils/validation.js'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { directoryScopeFor } from './directoryScope.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { hashPassword } from '../auth/password.js'
import { searchDirectory, lookupDirectoryUsers } from '../auth/ldap.js'
import * as usersRepo from './repository.js'
import { parseRosterWorkbook, validateRosterRows, uploadRosterFile } from './rosterImport.js'
import { buildRosterTemplate } from './rosterTemplate.js'
import * as departmentsRepo from '../departments/repository.js'
import { signaturePath, signatureContentType } from './signature.js'

export const usersRouter = express.Router()

const UNIQUE_VIOLATION_ERROR_NUMBERS = new Set([2627, 2601])

function toPublicUser(user) {
  return {
    id: user.UserID,
    username: user.AuthSource === 'None' ? null : user.Username,
    employeeCode: user.EmployeeCode ?? null,
    fullName: user.FullName,
    fullNameTh: user.FullNameTh ?? null,
    departmentId: user.DepartmentID,
    department: user.Department,
    phone: user.Phone,
    email: user.Email,
    role: user.Role,
    authSource: user.AuthSource,
    isActive: Boolean(user.IsActive),
    approvalLevel: user.ApprovalLevel ?? null,
    hasSignature: Boolean(user.SignatureFile),
  }
}

function optionalPhone(value) {
  const phone = textField(value, { field: 'phone', max: 50, required: false })
  if (phone !== null && !isValidPhone(phone)) throw new AppError(ErrorCodes.PHONE_INVALID, 400)
  return phone
}

function optionalEmail(value) {
  const email = textField(value, { field: 'email', max: 255, required: false })
  if (email !== null && !isValidEmail(email)) throw new AppError(ErrorCodes.EMAIL_INVALID, 400)
  return email
}

function validateProfileInput(body) {
  const fullName = textField(body?.fullName, { field: 'fullName', max: 200 })
  const role = body?.role
  if (!['Employee', 'Supervisor', 'Admin'].includes(role)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }

  // ระดับผู้อนุมัติคำขอรถนอก 1/2/3 (ว่าง = ไม่ใช่ผู้อนุมัติ) - dev 2026-10-05
  const rawLevel = body?.approvalLevel
  const approvalLevel = rawLevel === null || rawLevel === undefined || rawLevel === '' ? null : Number(rawLevel)
  if (approvalLevel !== null && ![1, 2, 3].includes(approvalLevel)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

  return {
    fullName,
    fullNameTh: textField(body?.fullNameTh, { field: 'fullNameTh', max: 200, required: false }),
    role,
    approvalLevel,
    employeeCode: textField(body?.employeeCode, { field: 'employeeCode', max: 50, required: false }),
    departmentId: typeof body?.departmentId === 'number' ? body.departmentId : (body?.departmentId ? parseInt(body.departmentId, 10) : null),
    phone: optionalPhone(body?.phone),
    email: optionalEmail(body?.email),
  }
}

// รายชื่อสำหรับเลือก "พนักงานที่เดินทาง" ในฟอร์มขอรถ - ทุกคนที่ login ใช้ได้ (พนักงานทั่วไปขอรถโอทีให้เพื่อนได้)
// ไม่ใช่ Admin เห็นเฉพาะคนในแผนกหลักของตัวเอง (directoryScope.js)
// ส่งแค่ id/ชื่อ/แผนก ของคนที่ใช้งานอยู่ ไม่มีเบอร์/อีเมล/สิทธิ์ (ต้องประกาศก่อน middleware Admin ด้านล่าง)
usersRouter.get('/directory', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await usersRepo.listDirectory(pool, await directoryScopeFor(pool, req.user))
    res.json({ users: rows.map((u) => ({ id: u.UserID, fullName: u.FullName, department: u.Department ?? null })) })
  } catch (err) {
    next(err)
  }
})

/**
 * ผู้อนุมัติที่ผู้ขอเลือกได้ (ฟอร์มขอรถนอก) - ผู้ใช้ที่มีระดับอนุมัติในแผนกหลักเดียวกัน (Admin เห็นทุกคน)
 * เรียงระดับ 1 → 3 แล้วชื่อ, ไม่รวมตัวเอง
 */
usersRouter.get('/approvers', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await usersRepo.listApprovers(pool, await directoryScopeFor(pool, req.user))
    res.json({
      approvers: rows
        .filter((u) => u.UserID !== req.user.id)
        .map((u) => ({ id: u.UserID, fullName: u.FullName, department: u.Department ?? null, approvalLevel: u.ApprovalLevel })),
    })
  } catch (err) {
    next(err)
  }
})

/** รูปลายเซ็น/ตราของผู้ใช้ - เจ้าของหรือ Admin เท่านั้น (Admin ใช้ตอนพิมพ์ PDF แบบฟอร์มขอรถ) */
usersRouter.get('/:id/signature', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'Admin' && Number(req.params.id) !== req.user.id) throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)
    const pool = await getPool()
    const user = await usersRepo.findById(pool, req.params.id)
    if (!user?.SignatureFile) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.set({ 'Content-Type': signatureContentType(user.SignatureFile), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    res.sendFile(signaturePath(user.SignatureFile), (err) => {
      if (err && !res.headersSent) next(new AppError(ErrorCodes.NOT_FOUND, 404))
    })
  } catch (err) {
    next(err)
  }
})

usersRouter.use(requireAuth, requireRole('Admin'))

usersRouter.get('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const users = await usersRepo.listAll(pool)
    res.json({ users: users.map(toPublicUser) })
  } catch (err) {
    next(err)
  }
})

// ----- เพิ่มผู้ใช้จาก AD โดยตรง (ไม่ต้องรอผู้ใช้ login ครั้งแรก) - ใช้บัญชีบริการ LDAP_BIND_USER -----
const MIN_DIRECTORY_QUERY = 2
const MAX_IMPORT = 50

usersRouter.get('/ad-search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (q.length < MIN_DIRECTORY_QUERY || q.length > 100) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    const found = await searchDirectory(q)
    const pool = await getPool()
    const existing = await usersRepo.findUsernames(
      pool,
      found.map((u) => u.username),
    )
    res.json({
      results: found.map((u) => ({ ...u, alreadyAdded: existing.has(u.username.toLowerCase()) })),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * เพิ่มผู้ใช้ AD ที่เลือก - อ่านโปรไฟล์จาก AD ใหม่ตาม username (ไม่เชื่อข้อมูลจาก frontend)
 * คนที่มีในระบบแล้วจะข้าม (ไม่เปลี่ยนสิทธิ์เดิม), คนที่หาใน AD ไม่เจอ/ถูกปิดบัญชีจะรายงานกลับ
 */
usersRouter.post('/import-ad', async (req, res, next) => {
  try {
    const role = req.body?.role ?? 'Employee'
    const usernames = Array.isArray(req.body?.usernames)
      ? [...new Set(req.body.usernames.filter((u) => typeof u === 'string').map((u) => u.trim()).filter(Boolean))]
      : []
    if (usernames.length === 0 || usernames.length > MAX_IMPORT || !['Employee', 'Supervisor', 'Admin'].includes(role)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }

    const profiles = await lookupDirectoryUsers(usernames)
    const pool = await getPool()
    const added = []
    const skipped = []
    for (const profile of profiles) {
      const user = await usersRepo.insertFromAd(pool, profile, role)
      if (user) added.push(toPublicUser(user))
      else skipped.push(profile.username)
    }
    const foundNames = new Set(profiles.map((p) => p.username.toLowerCase()))
    const notFound = usernames.filter((u) => !foundNames.has(u.toLowerCase()))

    res.status(201).json({ added, skipped, notFound })
  } catch (err) {
    next(err)
  }
})

/** ไฟล์ตัวอย่าง Excel สำหรับนำเข้ารายชื่อ - รายชื่อแผนกดึงจากระบบ ณ ตอนที่ดาวน์โหลด (ไม่ใช่ไฟล์ตายตัว) */
usersRouter.get('/import-roster/template', async (req, res, next) => {
  try {
    const pool = await getPool()
    const buffer = await buildRosterTemplate(await departmentsRepo.listAll(pool))
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="employee-import-template.xlsx"',
      'Cache-Control': 'private, no-store',
    })
    res.send(Buffer.from(buffer))
  } catch (err) {
    next(err)
  }
})

/**
 * นำเข้ารายชื่อพนักงานที่ไม่ login จาก Excel - dryRun=true ตรวจอย่างเดียว (preview), ไม่ใช่ = นำเข้าเฉพาะแถวที่ผ่าน
 * ตรวจซ้ำทุกครั้งที่นำเข้าจริง (ไม่เชื่อผล preview จาก client)
 */
usersRouter.post('/import-roster', uploadRosterFile, async (req, res, next) => {
  try {
    const rows = await parseRosterWorkbook(req.file?.buffer)
    const pool = await getPool()
    const checked = validateRosterRows(rows, {
      departments: await departmentsRepo.listAll(pool),
      existingCodes: await usersRepo.listEmployeeCodes(pool),
    })
    const summary = { total: checked.length, valid: checked.filter((r) => r.errors.length === 0).length }
    summary.invalid = summary.total - summary.valid
    const publicRows = checked.map((r) => ({ ...r, departmentId: undefined }))
    if (req.body?.dryRun === 'true') return res.json({ rows: publicRows, summary, imported: 0 })

    let imported = 0
    for (const r of checked.filter((x) => x.errors.length === 0)) {
      await usersRepo.createRosterUser(pool, {
        fullName: r.fullName,
        fullNameTh: r.fullNameTh,
        departmentId: r.departmentId,
        phone: r.phone || null,
        email: r.email || null,
        employeeCode: r.employeeCode,
      })
      imported++
    }
    res.status(201).json({ rows: publicRows, summary, imported })
  } catch (err) {
    next(err)
  }
})

// รายชื่อพนักงานที่ไม่ login (ไม่มีคอมพิวเตอร์) - ใช้เป็นผู้โดยสาร/ผู้ร่วมเดินทางเท่านั้น
usersRouter.post('/', async (req, res, next) => {
  try {
    if (req.body?.noLogin === true) {
      const profile = validateProfileInput({ ...req.body, role: 'Employee', approvalLevel: null })
      const pool = await getPool()
      const user = await usersRepo.createRosterUser(pool, profile)
      return res.status(201).json({ user: toPublicUser(user) })
    }

    const username = textField(req.body?.username, { field: 'username', max: 100 })
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const profile = validateProfileInput(req.body)

    if (!username || password.length < 8) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }

    const pool = await getPool()
    const passwordHash = await hashPassword(password)
    const user = await usersRepo.createLocalUser(pool, { username, passwordHash, ...profile })
    res.status(201).json({ user: toPublicUser(user) })
  } catch (err) {
    if (UNIQUE_VIOLATION_ERROR_NUMBERS.has(err.number)) {
      return next(new AppError(ErrorCodes.USERNAME_TAKEN, 409))
    }
    next(err)
  }
})

/**
 * กันผู้ดูแลระบบล็อกตัวเองออก / ไม่เหลือ Admin: ห้ามปิดใช้งานหรือลดสิทธิ์บัญชีตัวเอง
 * และห้ามปิดใช้งาน/ลดสิทธิ์ Admin คนสุดท้ายที่ยังใช้งานอยู่
 */
async function assertAdminAccessKept(pool, actingUser, existing, { role, isActive }) {
  const losesAdmin = existing.Role === 'Admin' && existing.IsActive && (role !== 'Admin' || isActive === false)
  if (!losesAdmin) return
  if (existing.UserID === actingUser.id) throw new AppError(ErrorCodes.CANNOT_CHANGE_OWN_ACCESS, 409)
  if ((await usersRepo.countActiveAdmins(pool)) <= 1) throw new AppError(ErrorCodes.LAST_ADMIN, 409)
}

usersRouter.put('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    const existing = await usersRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    // บัญชีไม่ login เป็นได้แค่ Employee ที่ไม่เป็นผู้อนุมัติ (ไม่มีทางเข้าระบบมากดอนุมัติ/จัดการ)
    const body = existing.AuthSource === 'None' ? { ...req.body, role: 'Employee', approvalLevel: null } : req.body
    const profile = validateProfileInput(body)

    // ไม่ส่ง isActive มา = คงสถานะเดิม (เดิมถือว่า true ทำให้ผู้ใช้ที่ถูกปิดไว้ถูกเปิดกลับโดยไม่ตั้งใจ)
    const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : existing.IsActive !== false
    await assertAdminAccessKept(pool, req.user, existing, { role: profile.role, isActive })

    const user = await usersRepo.update(pool, req.params.id, { ...profile, isActive })
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
})

usersRouter.delete('/:id', async (req, res, next) => {
  try {
    const pool = await getPool()
    const existing = await usersRepo.findById(pool, req.params.id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    await assertAdminAccessKept(pool, req.user, existing, { role: existing.Role, isActive: false })

    const user = await usersRepo.setActive(pool, req.params.id, false)
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
})

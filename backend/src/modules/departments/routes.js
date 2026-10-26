import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import * as repo from './repository.js'
import { wouldCreateCycle } from './scope.js'

const router = Router()
router.use(requireAuth)

// เฉพาะ Admin ดูโครงสร้าง แผนกและจัดการได้
router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool()
    const deps = await repo.listAll(pool)
    res.json(deps.map(toPublicDepartment))
  } catch (err) {
    next(err)
  }
})

// error ใช้รูปแบบ { errorCode } เหมือนทั้งระบบ (เดิมส่ง { error } ทำให้หน้าเว็บแสดงข้อความ error ที่ถูกต้องไม่ได้)
function validateInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 200) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const parentDepartmentId = body.parentDepartmentId ? Number(body.parentDepartmentId) : null
  if (parentDepartmentId !== null && (!Number.isInteger(parentDepartmentId) || parentDepartmentId <= 0)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  return { name, parentDepartmentId }
}

/** แผนกแม่ต้องมีจริง และห้ามมีแผนกชื่อเดียวกันใต้แผนกแม่เดียวกัน (excludeId = แผนกที่กำลังแก้) */
async function assertParentAndName(pool, { name, parentDepartmentId }, excludeId = null) {
  if (parentDepartmentId && !(await repo.findById(pool, parentDepartmentId))) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  const same = await repo.findSibling(pool, name, parentDepartmentId)
  if (same && same.DepartmentID !== excludeId) throw new AppError(ErrorCodes.NAME_TAKEN, 409)
}

router.post('/', requireRole('Admin'), async (req, res, next) => {
  try {
    const input = validateInput(req.body)
    const pool = await getPool()
    await assertParentAndName(pool, input)
    const created = await repo.create(pool, input)
    res.status(201).json(toPublicDepartment(created))
  } catch (err) {
    next(err)
  }
})

router.put('/:id', requireRole('Admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    const input = validateInput(req.body)
    const pool = await getPool()
    const existing = await repo.findById(pool, id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    // ห้ามตั้งแผนกแม่เป็นตัวเองหรือแผนกย่อยของตัวเอง (ไม่งั้นหา "แผนกหลัก" ไม่ได้)
    if (input.parentDepartmentId && wouldCreateCycle(await repo.listAll(pool), id, input.parentDepartmentId)) {
      throw new AppError(ErrorCodes.DEPARTMENT_CYCLE, 400)
    }

    await assertParentAndName(pool, input, id)
    const updated = await repo.update(pool, id, input)
    res.json(toPublicDepartment(updated))
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', requireRole('Admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    const pool = await getPool()
    const existing = await repo.findById(pool, id)
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    // ตรวจสอบว่ามีแผนกย่อยหรือไม่
    const deps = await repo.listAll(pool)
    if (deps.some((d) => d.ParentDepartmentID === id)) throw new AppError(ErrorCodes.DEPARTMENT_HAS_CHILDREN, 400)

    // ผู้ใช้ไม่ได้ผูกด้วย FK ที่บล็อกการลบ (ลบแล้วแผนกของผู้ใช้กลายเป็นว่างเงียบๆ) จึงตรวจเอง
    if ((await repo.countUsers(pool, id)) > 0) throw new AppError(ErrorCodes.DEPARTMENT_IN_USE, 400)

    await repo.deleteDepartment(pool, id)
    res.status(204).end()
  } catch (err) {
    // ถ้าติด FK Constraint จาก Users
    if (err.number === 547) return next(new AppError(ErrorCodes.DEPARTMENT_IN_USE, 400))
    next(err)
  }
})

function toPublicDepartment(row) {
  return {
    id: row.DepartmentID,
    name: row.Name,
    parentDepartmentId: row.ParentDepartmentID,
  }
}

export default router

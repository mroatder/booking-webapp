import * as usersRepo from './repository.js'
import * as departmentsRepo from '../departments/repository.js'
import { mainDepartmentScope } from '../departments/scope.js'

/**
 * ขอบเขตรายชื่อที่ผู้ใช้เลือกเป็น "พนักงานที่เดินทาง" ได้ (dev ยืนยัน 2026-09-29)
 * Admin = ทุกคน (คืน undefined), คนอื่น = ตัวเอง + คนในแผนกหลักของตัวเอง (รวมแผนกย่อยทั้งหมด)
 * ผู้ใช้ที่ยังไม่มีแผนก เลือกได้แค่ตัวเอง
 */
export async function directoryScopeFor(pool, user) {
  if (user.role === 'Admin') return undefined
  const [me, departments] = await Promise.all([usersRepo.findById(pool, user.id), departmentsRepo.listAll(pool)])
  return { selfId: user.id, departmentIds: mainDepartmentScope(departments, me?.DepartmentID ?? null) }
}

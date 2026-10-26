import { getPool } from '../../db/pool.js'
import * as usersRepo from '../users/repository.js'

/**
 * สถานะ "ปัจจุบัน" ของผู้ใช้จากฐานข้อมูล - requireAuth ใช้ทุกคำขอ เพื่อให้การปิดใช้งาน/ลดสิทธิ์มีผลทันที
 * (เดิมเชื่อ role ที่ฝังใน JWT ซึ่งอายุ 8 ชั่วโมง ทำให้คนที่ถูกลดสิทธิ์ยังเรียกหน้า Admin ได้จนกว่า token หมดอายุ)
 * @param payload ข้อมูลใน JWT ({ sub, role }) - ใช้ในตัวจำลองของ test เท่านั้น
 * @returns แถวผู้ใช้ (IsActive, Role, ...) หรือ null ถ้าไม่มีผู้ใช้
 */
export async function loadCurrentUser(payload) {
  const pool = await getPool()
  return usersRepo.findById(pool, payload.sub)
}

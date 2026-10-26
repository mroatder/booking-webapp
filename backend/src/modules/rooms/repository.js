import { sql } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

/** ห้องที่ปิดใช้งานไม่แสดง (ยกเว้นหน้าจัดการห้องของ Admin ที่ขอ includeInactive) */
export async function listAll(pool, { includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE IsActive = 1'
  const result = await pool.request().query(`SELECT * FROM Rooms ${where} ORDER BY Name`)
  return result.recordset
}

export async function findById(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM Rooms WHERE RoomID = @id')
  return result.recordset[0] ?? null
}

/** หาห้องจากชื่อ (ไม่สนตัวพิมพ์) - ใช้กันชื่อซ้ำ */
export async function findByName(pool, name) {
  const result = await pool.request().input('name', sql.NVarChar(200), name).query('SELECT TOP 1 * FROM Rooms WHERE Name = @name')
  return result.recordset[0] ?? null
}

export async function create(pool, { name, floor }) {
  const result = await pool
    .request()
    .input('name', sql.NVarChar(200), name)
    .input('floor', sql.NVarChar(100), floor ?? null)
    .query(
      `INSERT INTO Rooms (Name, Floor)
       OUTPUT INSERTED.*
       VALUES (@name, @floor)`,
    )
  return result.recordset[0]
}

export async function update(pool, id, { name, floor }) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(200), name)
    .input('floor', sql.NVarChar(100), floor ?? null)
    .query(`UPDATE Rooms SET Name = @name, Floor = @floor WHERE RoomID = @id`)
  return findById(pool, id)
}

export async function setActive(pool, id, isActive) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('isActive', sql.Bit, isActive)
    .query('UPDATE Rooms SET IsActive = @isActive WHERE RoomID = @id')
  return findById(pool, id)
}

/** การจองที่ยังจะเกิดขึ้น (ยังไม่จบ ไม่ยกเลิก/ปล่อย) - ปิดห้องที่ยังมีคนจองไว้ไม่ได้ ต้องยกเลิกก่อน */
export async function countUpcomingBookings(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT COUNT(*) AS n FROM RoomBookings
       WHERE RoomID = @id AND Status IN ('Booked', 'CheckedIn') AND EndTime > SYSUTCDATETIME()`,
    )
  return result.recordset[0].n
}

/**
 * ลบจริงได้เฉพาะห้องที่ไม่เคยมีการจองเลย (ทุกสถานะ) - ไม่งั้นประวัติการจองหาย → ROOM_IN_USE ให้ปิดใช้งานแทน
 * (dev ยืนยัน 2026-09-29) เดิมลบตรงๆ แล้วชน foreign key กลายเป็น error 500
 */
export async function remove(pool, id) {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const result = await transaction
      .request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) AS n FROM RoomBookings WITH (UPDLOCK, HOLDLOCK) WHERE RoomID = @id')
    const bookings = result.recordset[0].n
    if (bookings > 0) throw new AppError(ErrorCodes.ROOM_IN_USE, 409, { bookings })
    await transaction.request().input('id', sql.Int, id).query('DELETE FROM Rooms WHERE RoomID = @id')
    await transaction.commit()
  } catch (err) {
    await transaction.rollback().catch(() => {})
    if (err.number === 547) throw new AppError(ErrorCodes.ROOM_IN_USE, 409)
    throw err
  }
}

import { sql } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

/**
 * ลบคนขับ / รถ / ผู้ให้บริการ "จริง" ได้เฉพาะรายการที่ไม่มีอะไรผูกอยู่ (dev ยืนยัน 2026-09-29)
 * ถ้าเคยถูกใช้ในคำขอรถ (ทุกสถานะ รวมที่ยกเลิกแล้ว) ต้องเก็บไว้ ไม่งั้นประวัติ "ใครขับ คันไหน" หาย
 * และถ้ายังผูกกับสายรถ/รถประจำ/คนขับ-รถของบริษัทอยู่ ก็ลบไม่ได้ - ให้ Admin เอาออกก่อน หรือปิดใช้งานแทน
 * รายการที่ใช้ไม่ได้แล้วแต่มีประวัติ → ปิดใช้งาน (soft delete) ตามเดิม
 *
 * usage ที่ส่งกลับใน details ของ FLEET_ITEM_IN_USE ให้หน้าเว็บบอกเหตุผล (ไม่ใช่ข้อความแสดงผล)
 */
const USAGE = {
  driver: async (req) => {
    const result = await req.query(
      `SELECT (SELECT COUNT(*) FROM VehicleRequests WHERE AssignedDriverID = @id) AS requests;
       SELECT v.LicensePlate AS plate, r.Name AS route
       FROM Vehicles v LEFT JOIN ShuttleRoutes r ON r.RouteID = v.RouteID
       WHERE v.RegularDriverID = @id`,
    )
    return { requests: result.recordsets[0][0].requests, regularOf: result.recordsets[1] }
  },
  vehicle: async (req) => {
    const result = await req.query(
      `SELECT (SELECT COUNT(*) FROM VehicleRequests WHERE AssignedVehicleID = @id) AS requests,
              (SELECT r.Name FROM Vehicles v JOIN ShuttleRoutes r ON r.RouteID = v.RouteID WHERE v.VehicleID = @id) AS route`,
    )
    const row = result.recordset[0]
    return { requests: row.requests, routes: row.route ? [row.route] : [] }
  },
  provider: async (req) => {
    const result = await req.query(
      `SELECT (SELECT COUNT(*) FROM VehicleRequests WHERE ProviderID = @id) AS requests,
              (SELECT COUNT(*) FROM Drivers WHERE ProviderID = @id) AS drivers,
              (SELECT COUNT(*) FROM Vehicles WHERE ProviderID = @id) AS vehicles,
              (SELECT COUNT(*) FROM ShuttleRoutes WHERE ProviderID = @id) AS routeCount`,
    )
    return result.recordset[0]
  },
  // สายรถลบได้ถ้าไม่มีผู้โดยสารลงทะเบียนอยู่ รถประจำสายจะถูกถอดออกจากสายให้เอง (ตัวรถยังอยู่)
  route: async (req) => {
    const result = await req.query('SELECT COUNT(*) AS passengers FROM ShuttlePassengers WHERE RouteID = @id')
    return { passengers: result.recordset[0].passengers }
  },
}

const BEFORE_DELETE = {
  route: (req) =>
    req.query('UPDATE Vehicles SET RouteID = NULL, RegularDriverID = NULL, UpdatedAt = SYSUTCDATETIME() WHERE RouteID = @id'),
}

const TABLE = {
  driver: ['Drivers', 'DriverID'],
  vehicle: ['Vehicles', 'VehicleID'],
  provider: ['Providers', 'ProviderID'],
  route: ['ShuttleRoutes', 'RouteID'],
}

function isInUse(usage) {
  return Object.values(usage).some((v) => (Array.isArray(v) ? v.length > 0 : v > 0))
}

/** คืน false ถ้าไม่พบ, โยน FLEET_ITEM_IN_USE (409) พร้อม usage ถ้ายังมีอะไรผูกอยู่ */
export async function deleteFleetItem(pool, kind, id) {
  const [table, idColumn] = TABLE[kind]
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const found = await transaction
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT ${idColumn} FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE ${idColumn} = @id`)
    if (found.recordset.length === 0) {
      await transaction.rollback()
      return false
    }
    const usage = await USAGE[kind](transaction.request().input('id', sql.Int, id))
    if (isInUse(usage)) throw new AppError(ErrorCodes.FLEET_ITEM_IN_USE, 409, usage)

    await BEFORE_DELETE[kind]?.(transaction.request().input('id', sql.Int, id))
    await transaction.request().input('id', sql.Int, id).query(`DELETE FROM ${table} WHERE ${idColumn} = @id`)
    await transaction.commit()
    return true
  } catch (err) {
    await transaction.rollback().catch(() => {})
    // มีคำขอ/ข้อมูลใหม่มาผูกระหว่างเช็คกับลบ → foreign key กันไว้อีกชั้น
    if (err.number === 547) throw new AppError(ErrorCodes.FLEET_ITEM_IN_USE, 409)
    throw err
  }
}

import { sql } from '../../db/pool.js'

/**
 * ข้อมูลดิบของรายงาน (M8) - ช่วงเวลาเทียบกับเวลาเริ่ม (การจองห้อง) / เวลาออก (คำขอรถ): from <= เวลา < to
 * การรวม/นับละเอียดทำใน service.js เพื่อให้ทดสอบได้โดยไม่ต้องมี DB
 */

function range(req, from, to) {
  return req.input('from', sql.DateTime2, from).input('to', sql.DateTime2, to)
}

/** การจองห้องทุกสถานะในช่วง พร้อมห้องและแผนกผู้จอง */
export async function roomBookings(pool, from, to) {
  const result = await range(pool.request(), from, to).query(
    `SELECT b.BookingID, b.RoomID, r.Name AS RoomName, r.IsActive AS RoomIsActive, b.Status,
            b.StartTime, b.EndTime, b.SnapUserDepartment AS Department
     FROM RoomBookings b
     JOIN Rooms r ON r.RoomID = b.RoomID
     JOIN Users u ON u.UserID = b.UserID
     LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID
     WHERE b.StartTime >= @from AND b.StartTime < @to`,
  )
  return result.recordset
}

export async function activeRooms(pool) {
  const result = await pool.request().query('SELECT RoomID, Name FROM Rooms WHERE IsActive = 1 ORDER BY Name')
  return result.recordset
}

/** คำขอรถทุกสถานะในช่วง พร้อมผู้ขอ แผนก และรถ/คนขับ/ผู้ให้บริการที่จัด */
export async function vehicleRequests(pool, from, to) {
  const result = await range(pool.request(), from, to).query(
    `SELECT vr.RequestID, vr.RequestNo, vr.RequestType, vr.TripType, vr.Status, vr.DepartTime, vr.ReturnTime,
            vr.PickupLocation, vr.Destination, vr.VehicleType, vr.PassengerCount, vr.CreatedAt,
            CASE WHEN vr.SnapRequesterName IS NOT NULL THEN vr.SnapRequesterName ELSE u.FullName END AS RequesterName,
            CASE WHEN vr.SnapRequesterName IS NOT NULL THEN vr.SnapRequesterDepartment ELSE d.Name END AS Department,
            vr.AssignedDriverID, vr.AssignedVehicleID, vr.LicensePlate, vr.TripDriverName,
            CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapDriverName ELSE dr.Name END AS DriverName,
            CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapProviderName ELSE p.Name END AS ProviderName, p.Kind AS ProviderKind
     FROM VehicleRequests vr
     JOIN Users u ON u.UserID = vr.RequesterUserID
     LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID
     LEFT JOIN Drivers dr ON dr.DriverID = vr.AssignedDriverID
     LEFT JOIN Providers p ON p.ProviderID = vr.ProviderID
     WHERE vr.DepartTime >= @from AND vr.DepartTime < @to
     ORDER BY vr.DepartTime`,
  )
  return result.recordset
}

/**
 * ผู้โดยสารของคำขอโอที (ไม่รวมที่ยกเลิก) กับสาย ณ ตอนส่งคำขอ (สำเนาในคำขอ - ย้ายสายภายหลังไม่กระทบรายงานย้อนหลัง)
 */
export async function shuttleRiders(pool, from, to) {
  const result = await range(pool.request(), from, to).query(
    `SELECT vr.RequestID, vr.DepartTime, vr.ReturnTime, vr.PickupLocation, vr.Destination, vp.UserID,
            vp.RouteName
     FROM VehicleRequests vr
     JOIN VehicleRequestPassengers vp ON vp.RequestID = vr.RequestID
     WHERE vr.RequestType = 'Shuttle' AND vr.Status <> 'Cancelled'
       AND vr.DepartTime >= @from AND vr.DepartTime < @to`,
  )
  return result.recordset
}

/**
 * ผู้ลงชื่อเดินทางกลุ่ม (กิจกรรมที่ยังไม่ถูกลบ) ของกิจกรรมที่วันเดินทางอยู่ในช่วง พร้อมสายรถที่จัดให้ (ถ้ามี)
 */
export async function eventPassengers(pool, from, to) {
  const result = await range(pool.request(), from, to).query(
    `SELECT e.EventID, e.Title, e.Destination, e.EventDate, e.BoardingPublishedAt,
            p.PassengerID, p.Department, p.TripType, p.RouteID, r.RouteName, r.VehicleType
     FROM EventTrips e
     LEFT JOIN EventPassengers p ON p.EventID = e.EventID
     LEFT JOIN EventRoutes r ON r.RouteID = p.RouteID
     WHERE e.IsActive = 1 AND e.EventDate >= @from AND e.EventDate < @to`,
  )
  return result.recordset
}

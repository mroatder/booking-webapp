// รายละเอียดการขึ้นรถ (Admin กรอกหลังบริษัทรถจัดรถแล้ว) - ฟังก์ชันล้วน: แปลงข้อมูล ตรวจข้อมูลที่ส่งมา จัดกลุ่มผู้รับอีเมล
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

export const BOARDING_VEHICLE_TYPES = ['Van', 'Sedan']
export const BOARDING_LIMITS = { routeName: 100, vehiclePlate: 50, driverName: 150, driverPhone: 50 }
const MAX_ROUTES = 50

export function toBoardingPassenger(row) {
  return {
    id: row.PassengerID,
    userId: row.UserID ?? null,
    name: row.PassengerName,
    employeeCode: row.EmployeeCode ?? null,
    department: row.Department ?? null,
    phone: row.PhoneNumber,
    pickupLocation: row.PickupLocation,
    mapUrl: row.GoogleMapUrl ?? null,
    tripType: row.TripType,
    routeId: row.RouteID ?? null,
    boardingAt: row.BoardingAt ? new Date(row.BoardingAt).toISOString() : null,
  }
}

export function toBoardingRoute(row) {
  return {
    id: row.RouteID,
    name: row.RouteName,
    vehicleType: row.VehicleType ?? 'Van',
    vehiclePlate: row.VehiclePlate ?? null,
    driverName: row.DriverName ?? null,
    driverPhone: row.DriverPhone ?? null,
  }
}

/**
 * สายรถที่พนักงานอยู่ - แสดงทั้งสาย: ข้อมูลรถ/คนขับ + ผู้เดินทางทุกคนในสายนั้น (ชื่อ แผนก เบอร์โทร จุดขึ้นรถ เวลา - ไม่ส่งรหัสพนักงาน; เบอร์ให้เพื่อนร่วมสายโทรหากันได้ dev 2026-10-21)
 * rows = แถวจาก listBoardingRoutesForUser (1 แถว = 1 ผู้เดินทางในสายที่ผู้ดูอยู่)
 * mine = รายชื่อของผู้ดูเอง, registeredByMe = คนที่ผู้ดูลงชื่อให้ (ไว้ไฮไลต์แถวในตาราง)
 */
export function groupRoutesForViewer(rows, viewerId) {
  const byRoute = new Map()
  for (const r of rows) {
    if (!byRoute.has(r.RouteID)) {
      byRoute.set(r.RouteID, {
        eventId: r.EventID,
        eventTitle: r.Title,
        destination: r.Destination,
        eventDate: new Date(r.EventDate).toISOString(),
        routeId: r.RouteID,
        routeName: r.RouteName,
        vehicleType: r.VehicleType ?? 'Van',
        vehiclePlate: r.VehiclePlate ?? null,
        driverName: r.DriverName ?? null,
        driverPhone: r.DriverPhone ?? null,
        passengers: [],
      })
    }
    byRoute.get(r.RouteID).passengers.push({
      passengerId: r.PassengerID,
      name: r.PassengerName,
      department: r.Department ?? null,
      phone: r.PhoneNumber ?? null,
      pickupLocation: r.PickupLocation,
      boardingAt: r.BoardingAt ? new Date(r.BoardingAt).toISOString() : null,
      mine: r.UserID === viewerId,
      registeredByMe: r.UserID !== viewerId && r.RegisteredByUserID === viewerId,
    })
  }
  return [...byRoute.values()]
}

const text = (value, field, { required = false } = {}) => {
  const v = typeof value === 'string' ? value.trim() : ''
  if (required && !v) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  if (v.length > BOARDING_LIMITS[field]) throw new AppError(ErrorCodes.EVENT_FIELD_TOO_LONG, 400, { field, max: BOARDING_LIMITS[field] })
  return v || null
}

/**
 * ตรวจข้อมูลที่ Admin บันทึกจากหน้าเว็บ
 * body = { routes: [{ name, vehiclePlate, driverName, driverPhone }], assignments: [{ passengerId, routeIndex|null, boardingAt|null }] }
 * routeIndex = ลำดับในอาร์เรย์ routes (สายใหม่ยังไม่มี id) - คนที่ routeIndex เป็น null = ยังไม่จัดสาย
 */
export function parseBoardingBody(body, validPassengerIds) {
  const rawRoutes = body?.routes
  const rawAssignments = body?.assignments
  if (!Array.isArray(rawRoutes) || rawRoutes.length > MAX_ROUTES || !Array.isArray(rawAssignments)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  const routes = rawRoutes.map((r) => ({
    name: text(r?.name, 'routeName', { required: true }),
    vehicleType: r?.vehicleType === undefined ? 'Van' : r.vehicleType,
    vehiclePlate: text(r?.vehiclePlate, 'vehiclePlate'),
    driverName: text(r?.driverName, 'driverName'),
    driverPhone: text(r?.driverPhone, 'driverPhone'),
  }))

  if (routes.some((r) => !BOARDING_VEHICLE_TYPES.includes(r.vehicleType))) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

  const seen = new Set()
  const assignments = []
  for (const a of rawAssignments) {
    const passengerId = Number(a?.passengerId)
    if (!Number.isInteger(passengerId) || !validPassengerIds.has(passengerId) || seen.has(passengerId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    seen.add(passengerId)
    if (a.routeIndex === null || a.routeIndex === undefined) continue
    const routeIndex = Number(a.routeIndex)
    if (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= routes.length) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    const boardingAt = a.boardingAt ? new Date(a.boardingAt) : null
    if (boardingAt && Number.isNaN(boardingAt.getTime())) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    assignments.push({ passengerId, routeIndex, boardingAt })
  }
  return { routes, assignments }
}

/**
 * จัดกลุ่มรายการขึ้นรถตามผู้รับอีเมล: คนที่ได้รับ = เจ้าของรายชื่อ และคนที่ลงชื่อให้ (เห็นของคนที่ตัวเองลงให้ด้วย)
 * @param rows แถวที่ join แล้ว: PassengerID, UserID, RegisteredByUserID, ...
 * @returns {Map<number, object[]>} userId → แถวที่คนนั้นเห็น (ไม่ซ้ำ)
 */
export function groupByRecipient(rows) {
  const byUser = new Map()
  const add = (userId, row) => {
    if (!userId) return
    const list = byUser.get(userId) ?? []
    if (!list.includes(row)) list.push(row)
    byUser.set(userId, list)
  }
  for (const row of rows) {
    add(row.UserID, row)
    add(row.RegisteredByUserID, row)
  }
  return byUser
}

// ทดสอบจริงกับฐานข้อมูลจริง (booking_project_dev) - ไม่ mock db/pool
// กติกา: ประวัติ (คำขอรถ / การจองห้อง / รายงาน) ต้องเป็นข้อมูล ณ ตอนเกิดเหตุการณ์ (migration 044, 045)
// แก้ข้อมูลหลักภายหลัง (ย้ายแผนก/สาย, เปลี่ยนผู้อนุมัติ/ลายเซ็น, แก้คนขับ/รถ) แล้วคำขอเก่าต้องไม่เปลี่ยน
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, sql } from '../src/db/pool.js'
import { createLocalUser, setSignatureFile } from '../src/modules/users/repository.js'
import { create as createDepartment } from '../src/modules/departments/repository.js'
import { create as createDriver } from '../src/modules/drivers/repository.js'
import { createVehicle, createProvider, createShuttleRoute, upsertShuttlePassenger } from '../src/modules/fleet/repository.js'
import * as vehicleRepo from '../src/modules/vehicle-requests/repository.js'
import * as bookingRepo from '../src/modules/bookings/repository.js'
import * as roomRepo from '../src/modules/rooms/repository.js'
import * as reportsRepo from '../src/modules/reports/repository.js'

const RUN = Date.now()
const SIGNATURE_FILE = '00000000-0000-0000-0000-000000000001.png'

let pool
const ids = { requests: [], users: [], departments: [], drivers: [], vehicles: [], providers: [], routes: [], rooms: [] }
const BASE = Math.floor(Date.now() / 60000) * 60000
const at = (h) => new Date(BASE + h * 3_600_000)

const q = (text, params = {}) => {
  const req = pool.request()
  for (const [k, v] of Object.entries(params)) req.input(k, v)
  return req.query(text)
}

async function user(label, extra = {}) {
  const u = await createLocalUser(pool, { username: `__hist_${label}_${RUN}`, passwordHash: 'x', fullName: `Hist ${label} ${RUN}`, ...extra })
  ids.users.push(u.UserID)
  return u
}

function baseInput(overrides = {}) {
  return {
    contactPhone: '000',
    departTime: at(2000),
    returnTime: at(2001),
    pickupLocation: 'A',
    destination: 'B',
    mapLink: 'https://maps.google.com/?q=test',
    vehicleType: 'Van',
    passengerCount: 1,
    requestType: 'BusinessTrip',
    passengers: [],
    ...overrides,
  }
}

let deptA
let deptB

beforeAll(async () => {
  pool = await getPool()
  deptA = await createDepartment(pool, { name: `__hist_A_${RUN}` })
  deptB = await createDepartment(pool, { name: `__hist_B_${RUN}` })
  ids.departments.push(deptA.DepartmentID, deptB.DepartmentID)
})

afterAll(async () => {
  const del = async (table, column, list) => {
    for (const id of list) await q(`DELETE FROM ${table} WHERE ${column} = @id`, { id })
  }
  await del('VehicleRequests', 'RequestID', ids.requests)
  await q(
    `UPDATE s SET LastNumber = ISNULL((
       SELECT MAX(CAST(RIGHT(vr.RequestNo, LEN(vr.RequestNo) - 8) AS INT)) FROM VehicleRequests vr
       WHERE vr.RequestNo LIKE CONCAT('VR-', s.[Year], '-%')), 0)
     FROM DocumentSequences s WHERE s.Prefix = 'VR'`,
  )
  for (const uid of ids.users) await q('DELETE FROM ShuttlePassengers WHERE UserID = @id', { id: uid })
  await del('RoomBookings', 'RoomID', ids.rooms)
  await del('Rooms', 'RoomID', ids.rooms)
  await del('ShuttleRoutes', 'RouteID', ids.routes)
  await del('Vehicles', 'VehicleID', ids.vehicles)
  await del('Drivers', 'DriverID', ids.drivers)
  await del('Providers', 'ProviderID', ids.providers)
  await del('Users', 'UserID', ids.users)
  await del('Departments', 'DepartmentID', ids.departments)
})

describe('history snapshots (real DB)', () => {
  it('keeps the requester department and name after the requester moves department or is renamed', async () => {
    const requester = await user('req', { departmentId: deptA.DepartmentID })
    const row = await vehicleRepo.create(pool, requester.UserID, baseInput(), [])
    ids.requests.push(row.RequestID)

    await q('UPDATE Users SET DepartmentID = @d, FullName = N\'Renamed\' WHERE UserID = @u', { d: deptB.DepartmentID, u: requester.UserID })

    const after = await vehicleRepo.findById(pool, row.RequestID)
    expect(after.RequesterDepartment).toBe(deptA.Name)
    expect(after.RequesterName).toBe(`Hist req ${RUN}`)
    const report = (await reportsRepo.vehicleRequests(pool, at(1999), at(2002))).find((r) => r.RequestID === row.RequestID)
    expect(report.Department).toBe(deptA.Name)
  })

  it('keeps the approver name, level and signature as they were when approving', async () => {
    const requester = await user('req2')
    const approver = await user('appr', { approvalLevel: 1 })
    await setSignatureFile(pool, approver.UserID, SIGNATURE_FILE)
    const row = await vehicleRepo.create(
      pool,
      requester.UserID,
      baseInput({ departTime: at(2010), returnTime: at(2011), approval: { status: 'Pending', approverId: approver.UserID } }),
      [],
    )
    ids.requests.push(row.RequestID)

    // ยังไม่ตัดสิน: ใช้ข้อมูลปัจจุบันของผู้อนุมัติ
    await q('UPDATE Users SET FullName = N\'Before Decision\' WHERE UserID = @u', { u: approver.UserID })
    expect((await vehicleRepo.findById(pool, row.RequestID)).ApproverName).toBe('Before Decision')

    await q('UPDATE Users SET FullName = N\'Approver At Decision\' WHERE UserID = @u', { u: approver.UserID })
    expect(await vehicleRepo.decideApproval(pool, row.RequestID, approver.UserID, { approve: true })).toBeTruthy()

    // หลังอนุมัติ: เปลี่ยนชื่อ ระดับ และลบลายเซ็น - คำขอเก่าต้องเหมือนเดิม
    await q('UPDATE Users SET FullName = N\'Changed After\', ApprovalLevel = 2 WHERE UserID = @u', { u: approver.UserID })
    await setSignatureFile(pool, approver.UserID, null)

    const after = await vehicleRepo.findById(pool, row.RequestID)
    expect(after.ApproverName).toBe('Approver At Decision')
    expect(after.ApproverLevel).toBe(1)
    expect(Boolean(after.ApproverHasSignature)).toBe(true)
    expect(await vehicleRepo.findApproverSignatureFile(pool, row.RequestID)).toBe(SIGNATURE_FILE)
    // ไฟล์ที่ถูกอ้างอยู่ห้ามถูกลบตอนผู้อนุมัติเปลี่ยนลายเซ็น
    expect(await vehicleRepo.isSignatureReferenced(pool, SIGNATURE_FILE)).toBe(true)
    expect(await vehicleRepo.isSignatureReferenced(pool, '00000000-0000-0000-0000-0000000000ff.png')).toBe(false)
  })

  it('keeps the driver, provider and vehicle details as they were when assigned', async () => {
    const requester = await user('req3')
    const admin = await user('admin', { role: 'Admin' })
    const driver = await createDriver(pool, { name: `__hist_driver_${RUN}`, phone: '02-111-1111', providerId: null })
    ids.drivers.push(driver.DriverID)
    const vehicle = await createVehicle(pool, { licensePlate: `__H${RUN % 100000}`, vehicleType: 'Van', seatCount: 12, description: 'รถตู้เดิม', providerId: null })
    ids.vehicles.push(vehicle.VehicleID)
    const row = await vehicleRepo.create(pool, requester.UserID, baseInput({ departTime: at(2020), returnTime: at(2021) }), [])
    ids.requests.push(row.RequestID)
    await vehicleRepo.assign(pool, row.RequestID, { kind: 'Company', driverId: driver.DriverID, vehicleId: vehicle.VehicleID, assignedByUserId: admin.UserID })

    await q('UPDATE Drivers SET Name = N\'Renamed Driver\', Phone = N\'999\' WHERE DriverID = @id', { id: driver.DriverID })
    await q('UPDATE Vehicles SET Description = N\'รถตู้ใหม่\', SeatCount = 3 WHERE VehicleID = @id', { id: vehicle.VehicleID })

    const after = await vehicleRepo.findById(pool, row.RequestID)
    expect(after.DriverName).toBe(`__hist_driver_${RUN}`)
    expect(after.DriverPhone).toBe('02-111-1111')
    expect(after.AssignedVehicleDescription).toBe('รถตู้เดิม')
    expect(after.AssignedSeatCount).toBe(12)
    const report = (await reportsRepo.vehicleRequests(pool, at(2019), at(2022))).find((r) => r.RequestID === row.RequestID)
    expect(report.DriverName).toBe(`__hist_driver_${RUN}`)
  })

  it('keeps each passenger\'s route, pickup stop and department after they move', async () => {
    const requester = await user('req4')
    const rider = await user('rider', { departmentId: deptA.DepartmentID })
    const provider = await createProvider(pool, { name: `__hist_provider_${RUN}`, kind: 'Rental', phone: null })
    ids.providers.push(provider.ProviderID)
    const route = (name) => createShuttleRoute(pool, { providerId: provider.ProviderID, name, origin: 'จุด 1', destination: 'บริษัท', stopsJson: JSON.stringify(['จุด 2']), morningDepart: null, morningArrive: null, eveningDepart: null, eveningArrive: null, runDays: '1111100' })
    const routeA = await route(`__hist_route_A_${RUN}`)
    const routeB = await route(`__hist_route_B_${RUN}`)
    ids.routes.push(routeA.RouteID, routeB.RouteID)
    await upsertShuttlePassenger(pool, { userId: rider.UserID, routeId: routeA.RouteID, pickupStop: 'จุด 1' })

    const row = await vehicleRepo.create(
      pool,
      requester.UserID,
      baseInput({ requestType: 'Shuttle', departTime: at(2030), returnTime: at(2031), passengers: [rider.UserID], passengerCount: 1 }),
      [],
    )
    ids.requests.push(row.RequestID)

    // ย้ายสาย/จุดขึ้น/แผนก แล้วคำขอเก่าต้องเหมือนเดิม
    await upsertShuttlePassenger(pool, { userId: rider.UserID, routeId: routeB.RouteID, pickupStop: 'จุด 2' })
    await q('UPDATE Users SET DepartmentID = @d WHERE UserID = @u', { d: deptB.DepartmentID, u: rider.UserID })

    const [p] = (await vehicleRepo.listPassengers(pool, [row.RequestID])).get(row.RequestID)
    expect(p.routeName).toBe(`__hist_route_A_${RUN}`)
    expect(p.pickupStop).toBe('จุด 1')
    expect(p.department).toBe(deptA.Name)

    // แก้ไขคำขอ (ผู้โดยสารคนเดิมอยู่ต่อ) ต้องไม่ดึงสายใหม่มาทับ
    await vehicleRepo.update(
      pool,
      row.RequestID,
      baseInput({ requestType: 'Shuttle', departTime: at(2030), returnTime: at(2031), passengers: [rider.UserID], passengerCount: 1, contactPhone: '111' }),
      { allowedStatuses: ['Pending'] },
    )
    const [again] = (await vehicleRepo.listPassengers(pool, [row.RequestID])).get(row.RequestID)
    expect(again.routeName).toBe(`__hist_route_A_${RUN}`)
    expect(again.pickupStop).toBe('จุด 1')

    // คำขอใหม่หลังย้ายแล้ว ใช้สายใหม่
    const next = await vehicleRepo.create(
      pool,
      requester.UserID,
      baseInput({ requestType: 'Shuttle', departTime: at(2040), returnTime: at(2041), passengers: [rider.UserID], passengerCount: 1 }),
      [],
    )
    ids.requests.push(next.RequestID)
    const [fresh] = (await vehicleRepo.listPassengers(pool, [next.RequestID])).get(next.RequestID)
    expect(fresh.routeName).toBe(`__hist_route_B_${RUN}`)
    expect(fresh.pickupStop).toBe('จุด 2')
  })

  it('keeps the booker department on a room booking and in the room report', async () => {
    const booker = await user('booker', { departmentId: deptA.DepartmentID })
    const room = await roomRepo.create(pool, { name: `__hist_room_${RUN}`, floor: null })
    ids.rooms.push(room.RoomID)
    const [booking] = await bookingRepo.create(pool, {
      roomId: room.RoomID,
      userId: booker.UserID,
      title: 'history test',
      occurrences: [{ startTime: at(2050), endTime: at(2051) }],
    })

    await q('UPDATE Users SET DepartmentID = @d WHERE UserID = @u', { d: deptB.DepartmentID, u: booker.UserID })

    const listed = (await bookingRepo.listAll(pool, at(2049), at(2052))).find((b) => b.BookingID === booking.BookingID)
    expect(listed.OwnerDepartment).toBe(deptA.Name)
    const report = (await reportsRepo.roomBookings(pool, at(2049), at(2052))).find((b) => b.BookingID === booking.BookingID)
    expect(report.Department).toBe(deptA.Name)
  })
})

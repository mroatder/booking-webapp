import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import ExcelJS from 'exceljs'

vi.mock('../src/db/pool.js', () => ({ getPool: vi.fn().mockResolvedValue({}), sql: {} }))
vi.mock('../src/modules/reports/repository.js', () => ({
  roomBookings: vi.fn(async () => []),
  activeRooms: vi.fn(async () => []),
  vehicleRequests: vi.fn(async () => []),
  shuttleRiders: vi.fn(async () => []),
  eventPassengers: vi.fn(async () => []),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as repo from '../src/modules/reports/repository.js'
import {
  roomUsageReport,
  vehicleRequestReport,
  driverVehicleReport,
  shuttleRouteReport,
  eventTripReport,
} from '../src/modules/reports/service.js'

const app = createApp()
const cookie = (role = 'Admin') => `token=${jwt.sign({ sub: 1, role }, env.jwtSecret, { expiresIn: '1h' })}`
const table = (report, key) => report.tables.find((t) => t.key === key)
const RANGE = 'from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z'

beforeEach(() => vi.clearAllMocks())

describe('room usage report', () => {
  it('counts per room and department, hours exclude cancelled/released, check-in rate ignores upcoming', () => {
    const b = (Status, h = 1, extra = {}) => ({
      RoomID: 1, RoomName: 'A', Status, StartTime: '2026-10-01T02:00:00Z',
      EndTime: new Date(Date.parse('2026-10-01T02:00:00Z') + h * 3_600_000).toISOString(), Department: 'IT', ...extra,
    })
    const report = roomUsageReport(
      [b('CheckedIn', 2), b('CheckedIn', 1), b('AutoReleased'), b('Cancelled'), b('Booked', 1.5, { Department: null })],
      [{ RoomID: 1, Name: 'A' }, { RoomID: 2, Name: 'B' }],
    )
    const [roomA, roomB] = table(report, 'byRoom').rows
    expect(roomA).toMatchObject({ name: 'A', total: 5, checkedIn: 2, autoReleased: 1, cancelled: 1, hours: 4.5 })
    expect(roomA.checkinRate).toBeCloseTo(66.7)
    expect(roomB).toMatchObject({ name: 'B', total: 0, checkinRate: null })
    expect(table(report, 'byDepartment').rows.map((r) => r.name)).toEqual(['IT', 'ไม่ระบุแผนก'])
  })
})

describe('vehicle request + driver reports', () => {
  const base = { RequestType: 'Shuttle', TripType: 'RoundTrip', PickupLocation: 'บริษัท', Destination: 'บ้าน', VehicleType: 'Van', PassengerCount: 3, Department: 'QC' }
  const at = (h) => new Date(Date.parse('2026-10-01T10:00:00Z') + h * 3_600_000)
  const rows = [
    // โอทีเที่ยวเดียวกัน 2 คำขอ ใช้รถ/คนขับคันเดียวกัน → 1 เที่ยว
    { ...base, RequestID: 1, RequestNo: 'VR-1', Status: 'Assigned', DepartTime: at(0), ReturnTime: at(1), AssignedDriverID: 7, AssignedVehicleID: 9, DriverName: 'มานะ', LicensePlate: '30-1', ProviderName: 'รถเช่า ก', ProviderKind: 'Rental' },
    { ...base, RequestID: 2, RequestNo: 'VR-2', Status: 'Assigned', DepartTime: at(0), ReturnTime: at(1), AssignedDriverID: 7, AssignedVehicleID: 9, DriverName: 'มานะ', LicensePlate: '30-1', ProviderName: 'รถเช่า ก', ProviderKind: 'Rental' },
    { ...base, RequestID: 3, RequestNo: 'VR-3', RequestType: 'BusinessTrip', Status: 'Assigned', DepartTime: at(5), ReturnTime: at(7), AssignedDriverID: 7, AssignedVehicleID: 9, DriverName: 'มานะ', LicensePlate: '30-1', ProviderName: 'รถเช่า ก', ProviderKind: 'Rental' },
    { ...base, RequestID: 4, RequestNo: 'VR-4', RequestType: 'BusinessTrip', Status: 'Assigned', DepartTime: at(5), ReturnTime: at(6), ProviderName: 'Grab', ProviderKind: 'OnDemand', TripDriverName: 'สมศักดิ์', LicensePlate: 'กข 1' },
    { ...base, RequestID: 5, RequestNo: 'VR-5', Status: 'Cancelled', DepartTime: at(8), ReturnTime: at(9) },
    { ...base, RequestID: 6, RequestNo: 'VR-6', Status: 'Pending', DepartTime: at(8), ReturnTime: at(9), Department: null },
  ]

  it('summarises requests by type/status and department, and lists every request', () => {
    const report = vehicleRequestReport(rows)
    expect(table(report, 'summary').rows).toEqual([
      { name: 'รถโอที', total: 4, pending: 1, assigned: 2, cancelled: 1 },
      { name: 'รถไปงานนอก', total: 2, pending: 0, assigned: 2, cancelled: 0 },
    ])
    expect(table(report, 'byDepartment').rows[0]).toMatchObject({ name: 'QC', total: 5, shuttle: 3, businessTrip: 2 })
    const list = table(report, 'list').rows
    expect(list).toHaveLength(6)
    expect(list[3]).toMatchObject({ driver: 'สมศักดิ์', provider: 'Grab', status: 'จัดรถแล้ว' })
  })

  it('counts a shared OT trip once per driver/vehicle, only assigned requests', () => {
    const report = driverVehicleReport(rows)
    expect(table(report, 'byDriver').rows).toEqual([{ name: 'มานะ', kind: 'รถเช่า ก', requests: 3, trips: 2, hours: 3 }])
    expect(table(report, 'byVehicle').rows[0]).toMatchObject({ name: '30-1', trips: 2, hours: 3 })
    expect(table(report, 'byKind').rows).toEqual([
      { name: 'รถบริษัท', requests: 0, trips: 0 },
      { name: 'รถเช่า', requests: 3, trips: 2 },
      { name: 'เรียกรถออนไลน์', requests: 1, trips: 1 },
    ])
  })
})

describe('OT shuttle route report', () => {
  it('groups riders per Thai date and route, counting distinct trips', () => {
    const r = (UserID, RouteName, depart, RequestID = 1) => ({
      RequestID, UserID, RouteName, DepartTime: depart, ReturnTime: new Date(Date.parse(depart) + 3_600_000).toISOString(),
      PickupLocation: 'บริษัท', Destination: 'บ้าน (ตามสายรถพนักงาน)',
    })
    const report = shuttleRouteReport([
      r(1, 'ศรีราชา', '2026-10-01T10:30:00Z'),
      r(2, 'ศรีราชา', '2026-10-01T10:30:00Z', 2),
      r(3, null, '2026-10-01T10:30:00Z'),
      // 18:00 UTC = 01:00 ของวันถัดไปตามเวลาไทย
      r(1, 'ศรีราชา', '2026-10-01T18:00:00Z', 3),
    ])
    expect(table(report, 'byRoute').rows[0]).toEqual({ name: 'ศรีราชา', days: 2, trips: 2, riders: 3 })
    const day = table(report, 'byDay').rows
    expect(day.map((d) => `${d.date} ${d.route} ${d.riders}`)).toEqual([
      '2026-10-01 ศรีราชา 2',
      '2026-10-01 ไม่มีสายประจำ 1',
      '2026-10-02 ศรีราชา 1',
    ])
    expect(day[0]).toMatchObject({ trips: 1, requests: 2, shifts: 'ส่งกลับบ้าน (เย็น)' })
  })
})

describe('/api/reports', () => {
  it('is admin only', async () => {
    expect((await request(app).get(`/api/reports/rooms?${RANGE}`).set('Cookie', cookie('Employee'))).status).toBe(403)
  })

  it.each([['from=x&to=y'], ['from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z'], ['from=2025-01-01T00:00:00Z&to=2026-12-31T00:00:00Z']])(
    'rejects a bad range (%s)',
    async (q) => {
      expect((await request(app).get(`/api/reports/rooms?${q}`).set('Cookie', cookie())).status).toBe(400)
    },
  )

  it('404s for an unknown report', async () => {
    expect((await request(app).get(`/api/reports/nope?${RANGE}`).set('Cookie', cookie())).status).toBe(404)
  })

  it.each(['rooms', 'vehicle-requests', 'drivers', 'shuttle-routes'])('returns the %s report as JSON', async (type) => {
    const res = await request(app).get(`/api/reports/${type}?${RANGE}`).set('Cookie', cookie())
    expect(res.status).toBe(200)
    expect(res.body.report.tables.length).toBeGreaterThan(0)
  })

  it('exports an Excel workbook with a cover sheet and one sheet per table', async () => {
    repo.roomBookings.mockResolvedValue([])
    repo.activeRooms.mockResolvedValue([{ RoomID: 1, Name: 'Meeting Room 1' }])
    const res = await request(app)
      .get(`/api/reports/rooms/export?${RANGE}`)
      .set('Cookie', cookie())
      .buffer(true)
      .parse((r, cb) => {
        const chunks = []
        r.on('data', (c) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('spreadsheetml')
    expect(res.headers['content-disposition']).toContain('room-usage-')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['สรุป', 'แยกตามห้อง', 'แยกตามแผนกผู้จอง'])
    expect(wb.getWorksheet('แยกตามห้อง').getRow(2).getCell(1).value).toBe('Meeting Room 1')
  })
})

describe('group trip report', () => {
  const ev = { EventID: 1, Title: 'Sports day', Destination: 'Rayong', EventDate: '2026-10-10T01:00:00Z', BoardingPublishedAt: null }
  it('counts riders by event, department and trip type; keeps events without riders', () => {
    const r = eventTripReport([
      { ...ev, PassengerID: 1, Department: 'HR', TripType: 'RoundTrip', RouteID: 5 },
      { ...ev, PassengerID: 2, Department: 'HR', TripType: 'GoOnly', RouteID: null },
      { ...ev, PassengerID: 3, Department: null, TripType: 'RoundTrip', RouteID: 5 },
      { EventID: 2, Title: 'Empty', Destination: 'X', EventDate: '2026-10-12T01:00:00Z', BoardingPublishedAt: '2026-10-01T00:00:00Z', PassengerID: null },
    ])
    expect(table(r, 'summary').rows).toEqual([{ events: 2, riders: 3 }])
    const byEvent = table(r, 'byEvent').rows
    expect(byEvent[0]).toMatchObject({ title: 'Empty', registered: 0, published: 'ประกาศแล้ว' })
    expect(byEvent[1]).toMatchObject({ title: 'Sports day', registered: 3, assigned: 2, routes: 1, published: 'ยังไม่ประกาศ' })
    expect(table(r, 'byDepartment').rows).toEqual([
      { name: 'HR', riders: 2 },
      { name: 'ไม่ระบุแผนก', riders: 1 },
    ])
    expect(table(r, 'byTripType').rows.find((x) => x.name === 'ไปอย่างเดียว').riders).toBe(1)
  })

  it('GET /api/reports/group-trips returns the report for admins', async () => {
    const res = await request(app).get(`/api/reports/group-trips?${RANGE}`).set('Cookie', cookie())
    expect(res.status).toBe(200)
    expect(res.body.report.title).toBe('รายงานเดินทางกลุ่ม')
    expect(repo.eventPassengers).toHaveBeenCalled()
  })
})

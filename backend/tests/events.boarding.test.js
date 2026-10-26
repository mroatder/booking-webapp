import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import ExcelJS from 'exceljs'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: { Int: {}, NVarChar: () => {}, DateTime2: {}, VarChar: () => {} },
}))

vi.mock('../src/modules/events/repository.js', () => ({
  listActiveEvents: vi.fn(),
  getEventById: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  addPassenger: vi.fn(),
  removePassenger: vi.fn(),
  getPassengerById: vi.fn(),
  getBoarding: vi.fn(),
  saveBoarding: vi.fn(),
  setBoardingPublished: vi.fn(),
  listBoardingRows: vi.fn(),
  listBoardingRoutesForUser: vi.fn(),
}))

vi.mock('../src/modules/notifications/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  eventBoardingPublished: vi.fn(),
  eventBoardingRetracted: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as eventsRepo from '../src/modules/events/repository.js'
import * as notify from '../src/modules/notifications/service.js'
import { groupByRecipient, groupRoutesForViewer, parseBoardingBody } from '../src/modules/events/boarding.js'
import { eventBoardingDetails } from '../src/modules/notifications/templates.js'
import { boardingSummaryToXlsx, eventReportToXlsx, myRouteToXlsx, routeReportToXlsx } from '../src/modules/events/report.js'

const cookie = (role, id) => `token=${jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })}`
const admin = cookie('Admin', 1)
const employee = cookie('Employee', 10)
const app = createApp()

const event = { EventID: 1, Title: 'สอบ TOEIC', Destination: 'BB Tower', EventDate: '2026-10-15T01:00:00.000Z', passengers: [{ PassengerID: 1 }, { PassengerID: 2 }, { PassengerID: 3 }] }
const emptyBoarding = { routes: [], passengers: [], publishedAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  eventsRepo.getEventById.mockResolvedValue(event)
  eventsRepo.getBoarding.mockResolvedValue(emptyBoarding)
})

describe('boarding details - permissions', () => {
  it.each([
    ['get', '/api/events/1/boarding'],
    ['put', '/api/events/1/boarding'],
    ['post', '/api/events/1/boarding/publish'],
    ['delete', '/api/events/1/boarding/publish'],
  ])('%s %s is admin only', async (method, url) => {
    expect((await request(app)[method](url).send({})).status).toBe(401)
    expect((await request(app)[method](url).set('Cookie', employee).send({})).status).toBe(403)
  })

  const row = (extra) => ({
    EventID: 1, Title: 'สอบ TOEIC', Destination: 'BB Tower', EventDate: '2026-10-15T01:00:00.000Z',
    RouteID: 7, RouteName: 'สาย 1', VehicleType: 'Van', VehiclePlate: 'กท 1234', DriverName: 'ลุงตู้', DriverPhone: '0811111111',
    TripType: 'RoundTrip', Department: 'IT', ...extra,
  })

  it('/boarding/mine needs a login and asks for the viewer\'s routes', async () => {
    expect((await request(app).get('/api/events/boarding/mine')).status).toBe(401)
    eventsRepo.listBoardingRoutesForUser.mockResolvedValue([])
    const res = await request(app).get('/api/events/boarding/mine').set('Cookie', employee)
    expect(res.status).toBe(200)
    expect(eventsRepo.listBoardingRoutesForUser).toHaveBeenCalledWith({}, 10)
    expect(res.body).toEqual({ routes: [] })
  })

  it('shows the whole route: vehicle, driver and every passenger on it - with phone numbers (so mates can call each other) but without employee codes', async () => {
    eventsRepo.listBoardingRoutesForUser.mockResolvedValue([
      row({ PassengerID: 5, UserID: 10, RegisteredByUserID: 10, PassengerName: 'สมชาย', PickupLocation: 'รังสิต', BoardingAt: '2026-10-14T22:30:00.000Z', PhoneNumber: '0800000001', EmployeeCode: 'E5' }),
      row({ PassengerID: 6, UserID: 20, RegisteredByUserID: 10, PassengerName: 'สมหญิง', PickupLocation: 'รังสิต', BoardingAt: '2026-10-14T22:30:00.000Z', PhoneNumber: '0800000002' }),
      row({ PassengerID: 7, UserID: 30, RegisteredByUserID: 1, PassengerName: 'วิชัย', PickupLocation: 'ปากเกร็ด', BoardingAt: '2026-10-14T22:45:00.000Z', PhoneNumber: '0800000003' }),
    ])
    const res = await request(app).get('/api/events/boarding/mine').set('Cookie', employee)
    expect(res.body.routes).toHaveLength(1)
    const [route] = res.body.routes
    expect(route).toMatchObject({ routeName: 'สาย 1', vehicleType: 'Van', vehiclePlate: 'กท 1234', driverName: 'ลุงตู้', driverPhone: '0811111111' })
    expect(route.passengers.map((p) => [p.name, p.mine, p.registeredByMe])).toEqual([
      ['สมชาย', true, false],
      ['สมหญิง', false, true], // หัวหน้า (user 10) ลงชื่อให้
      ['วิชัย', false, false], // เพื่อนร่วมสาย
    ])
    expect(route.passengers.map((p) => p.phone)).toEqual(['0800000001', '0800000002', '0800000003'])
    expect(JSON.stringify(res.body)).not.toContain('E5')
  })

  it('groups rows into one entry per route, keeping each route\'s passengers together', () => {
    const rows = [
      row({ PassengerID: 1, UserID: 10, RegisteredByUserID: 10, PassengerName: 'A', PickupLocation: 'x' }),
      row({ PassengerID: 2, UserID: 11, RegisteredByUserID: 11, PassengerName: 'B', PickupLocation: 'x' }),
      row({ PassengerID: 3, UserID: 12, RegisteredByUserID: 12, PassengerName: 'C', PickupLocation: 'y', RouteID: 8, RouteName: 'สาย 2' }),
    ]
    const routes = groupRoutesForViewer(rows, 10)
    expect(routes.map((r) => [r.routeName, r.passengers.length])).toEqual([['สาย 1', 2], ['สาย 2', 1]])
  })
})

describe('boarding details - saving and announcing', () => {
  const valid = {
    routes: [{ name: 'สาย 1 รังสิต', vehicleType: 'Van', vehiclePlate: 'กท 1234', driverName: 'ลุงตู้', driverPhone: '0811111111' }, { name: 'สาย 2', vehicleType: 'Sedan' }],
    assignments: [
      { passengerId: 1, routeIndex: 0, boardingAt: '2026-10-15T05:30:00' },
      { passengerId: 2, routeIndex: 0, boardingAt: '2026-10-15T05:30:00' },
      { passengerId: 3, routeIndex: null },
    ],
  }

  it('saves routes and assignments (nobody is notified yet)', async () => {
    const res = await request(app).put('/api/events/1/boarding').set('Cookie', admin).send(valid)
    expect(res.status).toBe(200)
    const [, eventId, saved] = eventsRepo.saveBoarding.mock.calls[0]
    expect(eventId).toBe(1)
    expect(saved.routes).toEqual([
      { name: 'สาย 1 รังสิต', vehicleType: 'Van', vehiclePlate: 'กท 1234', driverName: 'ลุงตู้', driverPhone: '0811111111' },
      { name: 'สาย 2', vehicleType: 'Sedan', vehiclePlate: null, driverName: null, driverPhone: null },
    ])
    expect(saved.assignments.map((a) => [a.passengerId, a.routeIndex])).toEqual([[1, 0], [2, 0]])
    expect(notify.eventBoardingPublished).not.toHaveBeenCalled()
  })

  it('rejects a passenger from another event, a bad route index, a blank route name and an over-long plate', async () => {
    const put = (body) => request(app).put('/api/events/1/boarding').set('Cookie', admin).send(body)
    expect((await put({ ...valid, assignments: [{ passengerId: 99, routeIndex: 0 }] })).status).toBe(400)
    expect((await put({ ...valid, assignments: [{ passengerId: 1, routeIndex: 5 }] })).status).toBe(400)
    expect((await put({ ...valid, assignments: [{ passengerId: 1, routeIndex: 0, boardingAt: 'not a date' }] })).status).toBe(400)
    expect((await put({ routes: [{ name: '  ' }], assignments: [] })).status).toBe(400)
    expect((await put({ routes: [{ name: 'x', vehicleType: 'Bus' }], assignments: [] })).status).toBe(400)
    const long = await put({ routes: [{ name: 'x', vehiclePlate: 'ก'.repeat(51) }], assignments: [] })
    expect(long.body).toMatchObject({ errorCode: 'EVENT_FIELD_TOO_LONG', details: { field: 'vehiclePlate', max: 50 } })
    expect(eventsRepo.saveBoarding).not.toHaveBeenCalled()
  })

  it('refuses to announce when nobody is assigned to a route', async () => {
    eventsRepo.getBoarding.mockResolvedValue({ routes: [], passengers: [{ PassengerID: 1, RouteID: null }], publishedAt: null })
    const res = await request(app).post('/api/events/1/boarding/publish').set('Cookie', admin)
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('EVENT_BOARDING_EMPTY')
    expect(eventsRepo.setBoardingPublished).not.toHaveBeenCalled()
    expect(notify.eventBoardingPublished).not.toHaveBeenCalled()
  })

  it('announces: marks it published and triggers the emails', async () => {
    eventsRepo.getBoarding.mockResolvedValue({ routes: [{ RouteID: 7, RouteName: 'สาย 1' }], passengers: [{ PassengerID: 1, RouteID: 7 }], publishedAt: null })
    const res = await request(app).post('/api/events/1/boarding/publish').set('Cookie', admin)
    expect(res.status).toBe(200)
    expect(eventsRepo.setBoardingPublished).toHaveBeenCalledWith({}, 1, expect.any(Date))
    expect(notify.eventBoardingPublished).toHaveBeenCalledWith(1, { update: false })
  })

  it('re-announcing after changes sends the emails as an update', async () => {
    eventsRepo.getBoarding.mockResolvedValue({ routes: [{ RouteID: 7, RouteName: 'สาย 1' }], passengers: [{ PassengerID: 1, RouteID: 7 }], publishedAt: new Date() })
    const res = await request(app).post('/api/events/1/boarding/publish').set('Cookie', admin)
    expect(res.status).toBe(200)
    expect(notify.eventBoardingPublished).toHaveBeenCalledWith(1, { update: true })
  })

  it('un-announcing hides it and emails the people who had received it', async () => {
    eventsRepo.getBoarding.mockResolvedValue({ routes: [], passengers: [], publishedAt: new Date() })
    const res = await request(app).delete('/api/events/1/boarding/publish').set('Cookie', admin)
    expect(res.status).toBe(200)
    expect(eventsRepo.setBoardingPublished).toHaveBeenCalledWith({}, 1, null)
    expect(notify.eventBoardingPublished).not.toHaveBeenCalled()
    expect(notify.eventBoardingRetracted).toHaveBeenCalledWith(1)
  })

  it('un-announcing something that was never announced sends nothing', async () => {
    eventsRepo.getBoarding.mockResolvedValue({ routes: [], passengers: [], publishedAt: null })
    const res = await request(app).delete('/api/events/1/boarding/publish').set('Cookie', admin)
    expect(res.status).toBe(200)
    expect(notify.eventBoardingRetracted).not.toHaveBeenCalled()
  })
})

describe('boarding helpers', () => {
  it('parseBoardingBody keeps unassigned people out of the assignments', () => {
    const parsed = parseBoardingBody({ routes: [{ name: 'A' }], assignments: [{ passengerId: 1, routeIndex: null }, { passengerId: 2, routeIndex: 0, boardingAt: '2026-10-15T05:30:00' }] }, new Set([1, 2]))
    expect(parsed.assignments).toHaveLength(1)
    expect(parsed.assignments[0].boardingAt).toBeInstanceOf(Date)
  })

  it('groups rows per recipient: the passenger and whoever registered them, each exactly once', () => {
    const rows = [
      { PassengerID: 1, UserID: 10, RegisteredByUserID: 10 }, // ลงเอง
      { PassengerID: 2, UserID: 20, RegisteredByUserID: 10 }, // หัวหน้า 10 ลงให้ 20
      { PassengerID: 3, UserID: 30, RegisteredByUserID: 1 }, // Admin ลงให้ 30
    ]
    const groups = groupByRecipient(rows)
    expect(groups.get(10).map((r) => r.PassengerID)).toEqual([1, 2])
    expect(groups.get(20).map((r) => r.PassengerID)).toEqual([2])
    expect(groups.get(30).map((r) => r.PassengerID)).toEqual([3])
    expect(groups.get(1).map((r) => r.PassengerID)).toEqual([3])
  })
})

describe('boarding email and Excel', () => {
  const rows = [
    { PassengerName: 'สมชาย <b>', PickupLocation: 'รังสิต', RouteName: 'สาย 1', VehicleType: 'Van', VehiclePlate: 'กท 1234', DriverName: 'ลุงตู้', DriverPhone: '0811111111', BoardingAt: '2026-10-14T22:30:00.000Z' },
    { PassengerName: 'สมหญิง', PickupLocation: 'บางนา', RouteName: 'สาย 2', VehiclePlate: null, DriverName: null, DriverPhone: null, BoardingAt: null },
  ]
  const ev = { Title: 'สอบ TOEIC', Destination: 'BB Tower', EventDate: '2026-10-15T01:00:00.000Z' }

  it('the email names the route, time (Thai time), plate and driver, and escapes user text', () => {
    const mail = eventBoardingDetails(ev, rows, 'สมชาย')
    expect(mail.subject).toContain('สอบ TOEIC')
    expect(mail.html).toContain('สาย 1')
    expect(mail.html).toContain('15/10/2026 05:30')
    expect(mail.html).toContain('รถตู้')
    expect(mail.html).toContain('กท 1234')
    expect(mail.html).toContain('ลุงตู้')
    expect(mail.html).toContain('0811111111')
    expect(mail.html).not.toContain('<b>')
    expect(mail.text).toContain('สาย 1')
  })

  it('the attached Excel has one row per visible person with the route details', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await boardingSummaryToXlsx(ev, rows))
    const ws = wb.getWorksheet('รายละเอียดการขึ้นรถ')
    const header = ws.getRow(5)
    expect(header.getCell(1).value).toBe('ผู้เดินทาง')
    expect(header.getCell(3).value).toBe('สาย')
    expect(ws.getRow(6).getCell(3).value).toBe('สาย 1')
    expect(ws.getRow(6).getCell(4).value).toBe('รถตู้')
    expect(ws.getRow(6).getCell(5).value).toBe('15/10/2026 05:30')
    expect(ws.getRow(6).getCell(6).value).toBe('กท 1234')
    expect(ws.getRow(7).getCell(6).value ?? '').toBe('')
    expect(ws.rowCount).toBe(7)
  })

  it('the vendor report gains route columns only once routes are assigned', async () => {
    const e = { ...ev, passengers: [{ PassengerID: 1, PassengerName: 'สมชาย', PhoneNumber: '081', PickupLocation: 'รังสิต', TripType: 'RoundTrip' }] }
    const read = async (boarding) => {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await eventReportToXlsx(e, boarding))
      return wb.getWorksheet('รายชื่อผู้เดินทาง')
    }
    const before = await read({ routes: [], passengers: [], publishedAt: null })
    expect(before.getRow(7).getCell(10).value ?? '').toBe('')
    const after = await read({
      routes: [{ RouteID: 7, RouteName: 'สาย 1', VehicleType: 'Sedan', VehiclePlate: 'กท 1234', DriverName: 'ลุงตู้', DriverPhone: '0811111111' }],
      passengers: [{ PassengerID: 1, RouteID: 7, BoardingAt: '2026-10-14T22:30:00.000Z' }],
      publishedAt: null,
    })
    const header = after.getRow(7)
    expect(header.getCell(10).value).toBe('สาย')
    expect(after.getRow(8).getCell(10).value).toBe('สาย 1')
    expect(after.getRow(8).getCell(11).value).toBe('รถเก๋ง')
    expect(after.getRow(8).getCell(12).value).toBe('15/10/2026 05:30')
    expect(after.getRow(8).getCell(13).value).toBe('กท 1234')
  })
})

describe('report grouped by route (Excel)', () => {
  const ev = { EventID: 1, Title: 'สอบ TOEIC', Destination: 'BB Tower', EventDate: '2026-10-15T01:00:00.000Z' }
  const passenger = (id, name, routeId, boardingAt, pickup = 'รังสิต') => ({
    PassengerID: id, PassengerName: name, PhoneNumber: '0812345678', PickupLocation: pickup, TripType: 'RoundTrip',
    EmployeeCode: `E${id}`, Department: 'IT', GoogleMapUrl: id === 1 ? 'https://maps.app.goo.gl/abc' : null, RouteID: routeId, BoardingAt: boardingAt,
  })
  const boarding = {
    routes: [
      { RouteID: 7, RouteName: 'สาย 1: รังสิต', VehicleType: 'Van', VehiclePlate: 'กท 1234', DriverName: 'ลุงตู้', DriverPhone: '0811111111' },
      { RouteID: 8, RouteName: 'สาย 1: รังสิต', VehicleType: 'Sedan', VehiclePlate: null, DriverName: null, DriverPhone: null },
    ],
    passengers: [
      passenger(1, 'สมชาย', 7, '2026-10-14T22:30:00.000Z'), // 05:30
      passenger(2, 'สมหญิง', 7, '2026-10-14T22:00:00.000Z'), // 05:00 → ขึ้นก่อน
      passenger(3, 'วิชัย', 8, null, 'บางนา'),
      passenger(4, 'มานี', null, null, 'ปากเกร็ด'),
    ],
    publishedAt: null,
  }

  const load = async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await routeReportToXlsx(ev, boarding))
    return wb
  }

  it('has a summary sheet, one sheet per route (unique, legal names) and a sheet for the unassigned', async () => {
    const wb = await load()
    const names = wb.worksheets.map((w) => w.name)
    expect(names[0]).toBe('สรุป')
    expect(names).toHaveLength(4)
    expect(names[3]).toBe('ยังไม่จัดสาย')
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(4) // สองสายชื่อเหมือนกัน → ชื่อชีตไม่ซ้ำ
    for (const n of names) expect(n).not.toMatch(/[:\\/?*[\]]/)
  })

  it('summary lists each route with vehicle, plate, driver, head-count and boarding time range', async () => {
    const ws = (await load()).getWorksheet('สรุป')
    const header = ws.getRow(6)
    expect(header.getCell(1).value).toBe('สาย')
    const first = ws.getRow(7)
    expect(first.getCell(2).value).toBe('รถตู้')
    expect(first.getCell(3).value).toBe('กท 1234')
    expect(first.getCell(4).value).toBe('ลุงตู้')
    expect(first.getCell(5).value).toBe('0811111111')
    expect(first.getCell(6).value).toBe(2)
    expect(first.getCell(7).value).toBe('05:00 – 05:30')
    expect(ws.getRow(8).getCell(2).value).toBe('รถเก๋ง')
    expect(ws.getRow(9).getCell(1).value).toBe('ยังไม่จัดสาย')
    expect(ws.getRow(9).getCell(6).value).toBe(1)
  })

  it('a route sheet shows the vehicle and driver, then its passengers ordered by boarding time with map links', async () => {
    const wb = await load()
    const ws = wb.worksheets[1]
    const text = (r, c) => String(ws.getRow(r).getCell(c).value ?? '')
    expect(text(1, 2)).toContain('รถตู้')
    expect(text(2, 2)).toBe('กท 1234')
    expect(text(3, 2)).toBe('ลุงตู้ 0811111111')
    expect(text(7, 2)).toBe('2 คน')
    expect(ws.getRow(9).getCell(3).value).toBe('ชื่อ-นามสกุล')
    expect(ws.getRow(10).getCell(2).value).toBe('05:00')
    expect(ws.getRow(10).getCell(3).value).toBe('สมหญิง')
    expect(ws.getRow(11).getCell(3).value).toBe('สมชาย')
    expect(ws.getRow(11).getCell(8).value.hyperlink).toBe('https://maps.app.goo.gl/abc')
    expect(ws.getRow(10).getCell(6).value).toBe('0812345678')
  })

  it('the unassigned sheet lists who is still missing a route', async () => {
    const ws = (await load()).getWorksheet('ยังไม่จัดสาย')
    expect(ws.getRow(6).getCell(3).value ?? ws.getRow(6).getCell(2).value).toBeTruthy()
    const values = []
    ws.eachRow((row) => values.push(...row.values.map(String)))
    expect(values).toContain('มานี')
  })

  describe('GET /api/events/:id/report/routes', () => {
    it('is admin only', async () => {
      expect((await request(app).get('/api/events/1/report/routes')).status).toBe(401)
      expect((await request(app).get('/api/events/1/report/routes').set('Cookie', employee)).status).toBe(403)
    })

    it('refuses when nobody is assigned to a route yet', async () => {
      eventsRepo.getBoarding.mockResolvedValue({ routes: [], passengers: [{ PassengerID: 1, RouteID: null }], publishedAt: null })
      const res = await request(app).get('/api/events/1/report/routes').set('Cookie', admin)
      expect(res.status).toBe(400)
      expect(res.body.errorCode).toBe('EVENT_BOARDING_EMPTY')
    })

    it('downloads the workbook with a Thai filename', async () => {
      eventsRepo.getBoarding.mockResolvedValue(boarding)
      const res = await request(app)
        .get('/api/events/1/report/routes')
        .set('Cookie', admin)
        .buffer(true)
        .parse((r, cb) => {
          const chunks = []
          r.on('data', (c) => chunks.push(c))
          r.on('end', () => cb(null, Buffer.concat(chunks)))
        })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet')
      expect(res.headers['content-disposition']).toContain('filename="event-1-routes.xlsx"')
      expect(decodeURIComponent(res.headers['content-disposition'])).toContain('สายรถ_สอบ TOEIC.xlsx')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(res.body)
      expect(wb.worksheets.length).toBe(4)
    })
  })
})

describe('export of my route (employee)', () => {
  const myRow = (extra) => ({
    EventID: 1, Title: 'สอบ TOEIC', Destination: 'BB Tower', EventDate: '2026-10-15T01:00:00.000Z',
    RouteID: 7, RouteName: 'สาย 1', VehicleType: 'Van', VehiclePlate: 'กท 1234', DriverName: 'ลุงตู้', DriverPhone: '0811111111',
    Department: 'IT', ...extra,
  })
  const rows = [
    myRow({ PassengerID: 5, UserID: 10, RegisteredByUserID: 10, PassengerName: 'สมชาย', PickupLocation: 'รังสิต', BoardingAt: '2026-10-14T22:30:00.000Z', PhoneNumber: '0800000001' }),
    myRow({ PassengerID: 6, UserID: 20, RegisteredByUserID: 10, PassengerName: 'สมหญิง', PickupLocation: 'ปากเกร็ด', BoardingAt: '2026-10-14T22:45:00.000Z', PhoneNumber: '0800000002' }),
    myRow({ PassengerID: 7, UserID: 30, RegisteredByUserID: 1, PassengerName: 'วิชัย', PickupLocation: 'บางนา', BoardingAt: null, PhoneNumber: '0800000003' }),
  ]

  it('the workbook has the route details and every passenger on it (with phone numbers), marking mine', async () => {
    const [route] = groupRoutesForViewer(rows, 10)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await myRouteToXlsx(route))
    const ws = wb.worksheets[0]
    expect(String(ws.getRow(4).getCell(2).value)).toContain('รถตู้')
    expect(ws.getRow(5).getCell(2).value).toBe('กท 1234')
    expect(ws.getRow(6).getCell(2).value).toBe('ลุงตู้ 0811111111')
    expect(ws.getRow(7).getCell(2).value).toBe('3 คน')
    expect(ws.getRow(9).getCell(3).value).toBe('ชื่อ-นามสกุล')
    expect(ws.getRow(10).getCell(2).value).toBe('05:30')
    expect(ws.getRow(10).getCell(3).value).toBe('สมชาย')
    expect(ws.getRow(9).getCell(5).value).toBe('เบอร์โทร')
    expect(ws.getRow(10).getCell(5).value).toBe('0800000001')
    expect(ws.getRow(11).getCell(5).value).toBe('0800000002')
    expect(ws.getRow(12).getCell(5).value).toBe('0800000003')
    expect(ws.getRow(10).getCell(7).value).toBe('คุณ')
    expect(ws.getRow(11).getCell(7).value).toBe('ลงชื่อให้')
    expect(ws.getRow(12).getCell(7).value ?? '').toBe('')
  })

  it('endpoint: login required, 404 for a route that is not mine, 200 download otherwise', async () => {
    expect((await request(app).get('/api/events/boarding/routes/7/export')).status).toBe(401)
    eventsRepo.listBoardingRoutesForUser.mockResolvedValue(rows)
    expect((await request(app).get('/api/events/boarding/routes/99/export').set('Cookie', employee)).status).toBe(404)
    expect((await request(app).get('/api/events/boarding/routes/abc/export').set('Cookie', employee)).status).toBe(400)

    const res = await request(app)
      .get('/api/events/boarding/routes/7/export')
      .set('Cookie', employee)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = []
        r.on('data', (c) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('filename="boarding-route-7.xlsx"')
    expect(decodeURIComponent(res.headers['content-disposition'])).toContain('สาย 1_สอบ TOEIC.xlsx')
    expect(eventsRepo.listBoardingRoutesForUser).toHaveBeenCalledWith({}, 10)
  })
})

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
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as eventsRepo from '../src/modules/events/repository.js'
import { eventReportToXlsx, sortForReport } from '../src/modules/events/report.js'

const cookie = (role, id = 1) => `token=${jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })}`
const app = createApp()

const longLink = 'https://www.google.com/maps/place/X/@13.7,100.5,17z/data=' + 'a'.repeat(900)
const event = {
  EventID: 1,
  Title: 'สอบ TOEIC กรุงเทพฯ',
  Destination: 'BB Tower',
  EventDate: '2026-10-15T01:00:00.000Z', // 08:00 เวลาไทย
  ReturnDate: '2026-10-15T10:00:00.000Z', // 17:00
  passengers: [
    { PassengerName: 'สมชาย', EmployeeCode: 'E01', Department: 'IT', PhoneNumber: '0812345678', PickupLocation: 'รังสิต', GoogleMapUrl: longLink, TripType: 'RoundTrip', Note: null },
    { PassengerName: 'สมหญิง', PhoneNumber: '0898765432', PickupLocation: 'บางนา', GoogleMapUrl: null, TripType: 'GoOnly', Note: 'ขอที่นั่งหน้า' },
    { PassengerName: 'วิชัย', PhoneNumber: '0800000000', PickupLocation: 'รังสิต', GoogleMapUrl: 'https://maps.app.goo.gl/abc', TripType: 'ReturnOnly' },
  ],
}

async function readSheet(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb.getWorksheet('รายชื่อผู้เดินทาง')
}

beforeEach(() => {
  vi.clearAllMocks()
  eventsRepo.getEventById.mockResolvedValue(event)
  eventsRepo.getBoarding.mockResolvedValue({ routes: [], passengers: [], publishedAt: null })
})

describe('event passenger report (Excel)', () => {
  it('sorts by pickup point (Thai order) then name so people at the same place sit together', () => {
    const sorted = sortForReport(event.passengers).map((p) => `${p.PickupLocation}/${p.PassengerName}`)
    expect(sorted).toEqual(['บางนา/สมหญิง', 'รังสิต/วิชัย', 'รังสิต/สมชาย'])
  })

  it('contains the event header, counts, one row per passenger and clickable map links', async () => {
    const ws = await readSheet(await eventReportToXlsx(event))
    const text = (r, c) => String(ws.getRow(r).getCell(c).value ?? '')
    expect(text(1, 2)).toBe('สอบ TOEIC กรุงเทพฯ')
    expect(text(2, 2)).toBe('BB Tower')
    expect(text(3, 2)).toBe('15/10/2026 08:00')
    expect(text(4, 2)).toBe('15/10/2026 17:00')
    expect(text(5, 2)).toContain('3 คน')
    expect(text(5, 2)).toContain('ขาไป 2 คน')
    expect(text(5, 2)).toContain('ขากลับ 2 คน')

    const header = ws.getRow(8)
    expect(header.getCell(2).value).toBe('ชื่อ-นามสกุล')
    expect(header.getCell(6).value).toBe('จุดขึ้นรถ')
    const rows = [9, 10, 11].map((r) => ws.getRow(r))
    expect(rows.map((r) => r.getCell(2).value)).toEqual(['สมหญิง', 'วิชัย', 'สมชาย'])
    // เบอร์ขึ้นต้นด้วย 0 ต้องยังเป็นข้อความ
    expect(rows[2].getCell(5).value).toBe('0812345678')
    expect(rows[2].getCell(8).value).toBe('ไป-กลับ')
    expect(rows[0].getCell(8).value).toBe('ขาไปอย่างเดียว')
    expect(rows[1].getCell(8).value).toBe('ขากลับอย่างเดียว')
    // ลิงก์ยาวถูกเก็บครบและคลิกได้; ไม่มีลิงก์ = ว่าง
    expect(rows[2].getCell(7).value.hyperlink).toBe(longLink)
    expect(rows[0].getCell(7).value ?? '').toBe('')
    expect(rows[2].getCell(9).value ?? '').toBe('')
  })

  it('still produces a valid file for an event nobody registered for', async () => {
    const ws = await readSheet(await eventReportToXlsx({ ...event, ReturnDate: null, passengers: [] }))
    expect(String(ws.getRow(4).getCell(2).value)).toContain('0 คน')
  })
})

describe('GET /api/events/:id/report', () => {
  it('is admin only', async () => {
    expect((await request(app).get('/api/events/1/report')).status).toBe(401)
    expect((await request(app).get('/api/events/1/report').set('Cookie', cookie('Employee', 10))).status).toBe(403)
  })

  it('returns an .xlsx download with a Thai filename for admins', async () => {
    const res = await request(app)
      .get('/api/events/1/report')
      .set('Cookie', cookie('Admin'))
      .buffer(true)
      .parse((r, cb) => {
        const chunks = []
        r.on('data', (c) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet')
    expect(res.headers['content-disposition']).toContain('filename="event-1-passengers.xlsx"')
    expect(decodeURIComponent(res.headers['content-disposition'])).toContain('รายชื่อผู้เดินทาง_สอบ TOEIC กรุงเทพฯ.xlsx')
    const ws = await readSheet(res.body)
    expect(ws.rowCount).toBeGreaterThan(8)
  })

  it('404 for an unknown event, 400 for a bad id', async () => {
    eventsRepo.getEventById.mockResolvedValue(null)
    expect((await request(app).get('/api/events/9/report').set('Cookie', cookie('Admin'))).status).toBe(404)
    expect((await request(app).get('/api/events/abc/report').set('Cookie', cookie('Admin'))).status).toBe(400)
  })
})

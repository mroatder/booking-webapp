import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

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
  isUserRegistered: vi.fn().mockResolvedValue(false),
  findActiveUserIds: vi.fn(),
  getPassengerById: vi.fn(),
}))

vi.mock('../src/modules/notifications/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  eventRegisteredByOther: vi.fn(),
  eventRegistrationRemoved: vi.fn(),
  eventCreated: vi.fn(),
  eventChanged: vi.fn(),
  eventCancelled: vi.fn(),
}))

vi.mock('../src/modules/users/repository.js', () => ({
  findById: vi.fn(),
  listDirectory: vi.fn(),
}))

vi.mock('../src/modules/users/directoryScope.js', () => ({
  // Admin = ไม่จำกัด (undefined), ผู้ใช้ทั่วไป = จำกัดตามแผนกหลัก
  directoryScopeFor: vi.fn(async (pool, user) => (user.role === 'Admin' ? undefined : { selfId: user.id, departmentIds: new Set([1]) })),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as eventsRepo from '../src/modules/events/repository.js'
import * as usersRepo from '../src/modules/users/repository.js'
import * as notify from '../src/modules/notifications/service.js'
// วันที่ของกิจกรรมที่สร้างใหม่ต้องเป็นอนาคตเสมอ - ใช้วันที่สัมพัทธ์กับวันนี้ ไม่ hardcode (ไม่งั้นเทสต์พังเมื่อเลยวันนั้น)
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

function authCookie(role = 'Employee', id = 10) {
  const token = jwt.sign({ sub: id, role, name: 'User Test', department: 'IT' }, env.jwtSecret, { expiresIn: '1h' })
  return `token=${token}`
}

const app = createApp()

const USERS = {
  1: { UserID: 1, FullName: 'ผู้ดูแลระบบ', EmployeeCode: null, Department: null },
  10: { UserID: 10, FullName: 'สมชาย พนักงาน', EmployeeCode: '0639', Department: 'IT' },
  20: { UserID: 20, FullName: 'สมหญิง ลูกทีม', EmployeeCode: '0702', Department: 'HR' },
  30: { UserID: 30, FullName: 'คนนอกแผนก', EmployeeCode: '0999', Department: 'Sales' },
}

beforeEach(() => {
  vi.clearAllMocks()
  usersRepo.findById.mockImplementation(async (pool, id) => USERS[id] ?? null)
  usersRepo.listDirectory.mockResolvedValue([USERS[10], USERS[20]])
})

describe('Events API Endpoints', () => {
  it('GET /api/events requires auth', async () => {
    const res = await request(app).get('/api/events')
    expect(res.status).toBe(401)
  })

  it('GET /api/events returns list of events when authenticated', async () => {
    eventsRepo.listActiveEvents.mockResolvedValue([
      { EventID: 1, Title: 'TOEIC Exam Bangkok', Destination: 'BB Tower', EventDate: '2026-10-15T08:00:00Z', PassengerCount: 5 },
    ])

    const res = await request(app).get('/api/events').set('Cookie', [authCookie('Employee')])
    expect(res.status).toBe(200)
    expect(res.body.events).toHaveLength(1)
    expect(res.body.events[0].Title).toBe('TOEIC Exam Bangkok')
  })

  it('POST /api/events requires Admin role', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', [authCookie('Employee')])
      .send({ title: 'Party', destination: 'Pattaya', eventDate: FUTURE_DATE })
    expect(res.status).toBe(403)
  })

  it('POST /api/events creates event when Admin', async () => {
    eventsRepo.createEvent.mockResolvedValue({
      EventID: 2,
      Title: 'Company Trip',
      Destination: 'Pattaya',
      EventDate: '2026-10-20T08:00:00Z',
    })

    const res = await request(app)
      .post('/api/events')
      .set('Cookie', [authCookie('Admin')])
      .send({ title: 'Company Trip', destination: 'Pattaya', eventDate: FUTURE_DATE, notify: { mode: 'all' } })
    expect(res.status).toBe(201)
    expect(res.body.event.Title).toBe('Company Trip')
  })

  it('POST /api/events/:id/passengers registers passenger', async () => {
    eventsRepo.getEventById.mockResolvedValue({
      EventID: 1,
      Title: 'TOEIC Exam',
      passengers: [],
    })

    eventsRepo.addPassenger.mockResolvedValue({
      PassengerID: 101,
      PassengerName: 'Somsak',
      PhoneNumber: '0812345678',
      PickupLocation: 'PTT Bangna',
    })

    const res = await request(app)
      .post('/api/events/1/passengers')
      .set('Cookie', [authCookie('Employee', 10)])
      .send({
        isSelf: true,
        passengerName: 'Somsak',
        phoneNumber: '0812345678',
        pickupLocation: 'PTT Bangna',
        googleMapUrl: 'https://maps.app.goo.gl/xyz',
      })

    expect(res.status).toBe(201)
    expect(eventsRepo.addPassenger).toHaveBeenCalled()
  })
  it('POST passengers rejects a field longer than its column with 400 (not a SQL error 500)', async () => {
    eventsRepo.getEventById.mockResolvedValue({ EventID: 1, Title: 'TOEIC Exam', passengers: [] })
    const res = await request(app)
      .post('/api/events/1/passengers')
      .set('Cookie', authCookie())
      .send({ passengers: [{ passengerName: 'ก'.repeat(151), phoneNumber: '0812345678', pickupLocation: 'x' }] })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ errorCode: 'EVENT_FIELD_TOO_LONG', details: { field: 'passengerName', max: 150 } })
    expect(eventsRepo.addPassenger).not.toHaveBeenCalled()
  })

  it('POST passengers accepts a long Google Maps link (up to 2000 chars) and rejects an unknown trip type', async () => {
    eventsRepo.getEventById.mockResolvedValue({ EventID: 1, Title: 'TOEIC Exam', passengers: [] })
    eventsRepo.addPassenger.mockResolvedValue({ PassengerID: 7 })
    const longLink = 'https://www.google.com/maps/place/X/@13.7,100.5,17z/data=' + 'a'.repeat(900)
    const ok = await request(app)
      .post('/api/events/1/passengers')
      .set('Cookie', authCookie())
      .send({ passengers: [{ isSelf: true, passengerName: 'A', phoneNumber: '0812345678', pickupLocation: 'x', googleMapUrl: longLink }] })
    expect(ok.status).toBe(201)
    expect(eventsRepo.addPassenger).toHaveBeenCalledWith({}, 1, expect.objectContaining({ googleMapUrl: longLink }))

    const bad = await request(app)
      .post('/api/events/1/passengers')
      .set('Cookie', authCookie())
      .send({ passengers: [{ passengerName: 'A', phoneNumber: '0812345678', pickupLocation: 'x', tripType: 'OneWay' }] })
    expect(bad.status).toBe(400)
  })

  it('rejects a map link that is not http/https (javascript: would run in the admin browser) and normalizes a valid one', async () => {
    eventsRepo.getEventById.mockResolvedValue({ EventID: 5, Title: 'x', RegistrationDeadline: null })
    usersRepo.findById.mockImplementation(async (pool, id) => USERS[id])
    eventsRepo.addPassenger.mockResolvedValue({ PassengerID: 1 })
    const send = (googleMapUrl) =>
      request(app)
        .post('/api/events/5/passengers')
        .set('Cookie', authCookie('Employee', 10))
        .send({ isSelf: true, phoneNumber: '0812345678', pickupLocation: 'x', googleMapUrl })

    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://x.y/z', 'not a url']) {
      expect((await send(bad)).status).toBe(400)
    }
    expect(eventsRepo.addPassenger).not.toHaveBeenCalled()

    const ok = await send('https://maps.app.goo.gl/abc')
    expect(ok.status).toBe(201)
    expect(eventsRepo.addPassenger.mock.calls[0][2].googleMapUrl).toBe('https://maps.app.goo.gl/abc')
    expect((await send('')).status).toBe(201)
    expect(eventsRepo.addPassenger.mock.calls[1][2].googleMapUrl).toBeNull()
  })

  describe('employee code and department on registration', () => {
    const base = { phoneNumber: '0812345678', pickupLocation: 'บางนา' }
    const registered = () => eventsRepo.addPassenger.mock.calls[0][2]

    beforeEach(() => {
      eventsRepo.getEventById.mockResolvedValue({ EventID: 1, Title: 'TOEIC', passengers: [] })
      eventsRepo.addPassenger.mockResolvedValue({ PassengerID: 1 })
    })

    const post = (role, id, passenger) =>
      request(app).post('/api/events/1/passengers').set('Cookie', authCookie(role, id)).send({ passengers: [passenger] })

    it('registering yourself takes the employee code and department from your user record, not from the form', async () => {
      const res = await post('Employee', 10, { ...base, isSelf: true, passengerName: 'สมชาย พนักงาน', employeeCode: '', department: '' })
      expect(res.status).toBe(201)
      expect(registered()).toMatchObject({ userId: 10, employeeCode: '0639', department: 'IT' })
    })

    it('a supervisor registering a team member picked from the directory gets that member\'s code and department', async () => {
      const res = await post('Employee', 10, { ...base, userId: 20, passengerName: 'สมหญิง ลูกทีม', employeeCode: null, department: null })
      expect(res.status).toBe(201)
      expect(registered()).toMatchObject({ userId: 20, employeeCode: '0702', department: 'HR' })
    })

    it('rejects a person who is not a user in the system (names cannot be typed in)', async () => {
      const res = await post('Employee', 10, { ...base, passengerName: 'พนักงานชั่วคราว', employeeCode: 'T-01' })
      expect(res.status).toBe(400)
      expect(res.body.errorCode).toBe('EVENT_PASSENGER_NOT_IN_SYSTEM')
      expect(eventsRepo.addPassenger).not.toHaveBeenCalled()
    })

    it('uses the system name when only the user is chosen (no typed name)', async () => {
      const res = await post('Employee', 10, { ...base, userId: 20 })
      expect(res.status).toBe(201)
      expect(registered()).toMatchObject({ userId: 20, passengerName: 'สมหญิง ลูกทีม' })
    })

    it('keeps what was typed when the person has no code / department on record', async () => {
      const res = await post('Admin', 1, { ...base, isSelf: true, passengerName: 'ผู้ดูแลระบบ', employeeCode: 'A-1', department: 'Admin' })
      expect(res.status).toBe(201)
      expect(registered()).toMatchObject({ employeeCode: 'A-1', department: 'Admin' })
    })

    it('an employee cannot register someone outside their main department', async () => {
      const res = await post('Employee', 10, { ...base, userId: 30, passengerName: 'คนนอกแผนก' })
      expect(res.status).toBe(400)
      expect(res.body.errorCode).toBe('PASSENGER_OUT_OF_SCOPE')
      expect(eventsRepo.addPassenger).not.toHaveBeenCalled()
    })

    it('an admin can register anyone', async () => {
      const res = await post('Admin', 1, { ...base, userId: 30, passengerName: 'คนนอกแผนก' })
      expect(res.status).toBe(201)
      expect(registered()).toMatchObject({ userId: 30, employeeCode: '0999', department: 'Sales' })
      expect(usersRepo.listDirectory).not.toHaveBeenCalled()
    })
  })
})

describe('emails to people registered / removed by someone else', () => {
  const base = { phoneNumber: '0812345678', pickupLocation: 'บางนา' }
  const ev = { EventID: 1, Title: 'TOEIC', passengers: [] }
  const post = (id, passengers) =>
    request(app).post('/api/events/1/passengers').set('Cookie', authCookie('Employee', id)).send({ passengers })

  beforeEach(() => {
    eventsRepo.getEventById.mockResolvedValue(ev)
    eventsRepo.addPassenger.mockResolvedValue({ PassengerID: 1 })
  })

  it('registering a colleague notifies only that colleague, naming who registered them', async () => {
    const res = await post(10, [{ ...base, userId: 20 }, { ...base, isSelf: true }])
    expect(res.status).toBe(201)
    expect(notify.eventRegisteredByOther).toHaveBeenCalledTimes(1)
    const [event, list, byName] = notify.eventRegisteredByOther.mock.calls[0]
    expect(event).toBe(ev)
    expect(list.map((p) => p.userId)).toEqual([20])
    expect(byName).toBe('สมชาย พนักงาน')
  })

  it('registering yourself sends nothing', async () => {
    await post(10, [{ ...base, isSelf: true }])
    expect(notify.eventRegisteredByOther).not.toHaveBeenCalled()
  })

  it('removing a colleague notifies them; removing yourself does not', async () => {
    eventsRepo.removePassenger.mockResolvedValue(1)
    eventsRepo.getPassengerById.mockResolvedValue({ PassengerID: 5, UserID: 20, RegisteredByUserID: 10, PickupLocation: 'x' })
    const byRegistrar = await request(app).delete('/api/events/1/passengers/5').set('Cookie', authCookie('Employee', 10))
    expect(byRegistrar.status).toBe(200)
    expect(notify.eventRegistrationRemoved).toHaveBeenCalledTimes(1)
    expect(notify.eventRegistrationRemoved.mock.calls[0][1]).toMatchObject({ userId: 20 })
    expect(notify.eventRegistrationRemoved.mock.calls[0][2]).toBe('สมชาย พนักงาน')

    vi.clearAllMocks()
    eventsRepo.removePassenger.mockResolvedValue(1)
    eventsRepo.getEventById.mockResolvedValue(ev)
    usersRepo.findById.mockImplementation(async (pool, id) => USERS[id] ?? null)
    eventsRepo.getPassengerById.mockResolvedValue({ PassengerID: 5, UserID: 20, RegisteredByUserID: 10, PickupLocation: 'x' })
    const bySelf = await request(app).delete('/api/events/1/passengers/5').set('Cookie', authCookie('Employee', 20))
    expect(bySelf.status).toBe(200)
    expect(notify.eventRegistrationRemoved).not.toHaveBeenCalled()
  })
})

describe('emails for event create / change / cancel', () => {
  const admin = () => authCookie('Admin', 1)
  const body = (o = {}) => ({ title: 'T', destination: 'Rayong', eventDate: FUTURE_DATE, ...o })
  const stored = { EventID: 1, Title: 'T', Destination: 'Rayong', EventDate: new Date(FUTURE_DATE), ReturnDate: null }

  const create = (notifyBody) =>
    request(app).post('/api/events').set('Cookie', admin()).send(body({ notify: notifyBody }))

  it('creating an event for everyone emails all employees', async () => {
    eventsRepo.createEvent.mockResolvedValue({ EventID: 1 })
    const res = await create({ mode: 'all' })
    expect(res.status).toBe(201)
    expect(eventsRepo.createEvent.mock.calls[0][1]).toMatchObject({ notifyAll: true, inviteeIds: [] })
    expect(notify.eventCreated).toHaveBeenCalledWith({ EventID: 1 }, { notifyAll: true, inviteeIds: [] })
  })

  it('creating an event for selected people stores and emails only those people', async () => {
    eventsRepo.findActiveUserIds.mockResolvedValue([10, 20])
    eventsRepo.createEvent.mockResolvedValue({ EventID: 1 })
    const res = await create({ mode: 'selected', userIds: [10, 20, 10] })
    expect(res.status).toBe(201)
    expect(eventsRepo.createEvent.mock.calls[0][1]).toMatchObject({ notifyAll: false, inviteeIds: [10, 20] })
    expect(notify.eventCreated).toHaveBeenCalledWith({ EventID: 1 }, { notifyAll: false, inviteeIds: [10, 20] })
  })

  it.each([
    ['no choice made', undefined],
    ['selected without anyone', { mode: 'selected', userIds: [] }],
    ['unknown mode', { mode: 'nobody' }],
    ['bad ids', { mode: 'selected', userIds: ['x'] }],
  ])('refuses to create an event when the notification choice is invalid (%s)', async (_label, notifyBody) => {
    const res = await create(notifyBody)
    expect(res.status).toBe(400)
    expect(eventsRepo.createEvent).not.toHaveBeenCalled()
  })

  it('refuses unknown or inactive people in the list', async () => {
    eventsRepo.findActiveUserIds.mockResolvedValue([10])
    const res = await create({ mode: 'selected', userIds: [10, 999] })
    expect(res.status).toBe(400)
    expect(eventsRepo.createEvent).not.toHaveBeenCalled()
  })

  it('changing the date or destination notifies registrants; changing only the title does not', async () => {
    eventsRepo.getEventById.mockResolvedValue(stored)
    eventsRepo.updateEvent.mockResolvedValue({ ...stored, Destination: 'Pattaya' })
    await request(app).put('/api/events/1').set('Cookie', admin()).send(body({ destination: 'Pattaya' }))
    expect(notify.eventChanged).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    eventsRepo.getEventById.mockResolvedValue(stored)
    eventsRepo.updateEvent.mockResolvedValue({ ...stored, Title: 'New title' })
    await request(app).put('/api/events/1').set('Cookie', admin()).send(body({ title: 'New title' }))
    expect(notify.eventChanged).not.toHaveBeenCalled()
  })

  it('deleting an event notifies registrants', async () => {
    eventsRepo.getEventById.mockResolvedValue(stored)
    const res = await request(app).delete('/api/events/1').set('Cookie', admin())
    expect(res.status).toBe(200)
    expect(notify.eventCancelled).toHaveBeenCalledWith(stored)
  })
})

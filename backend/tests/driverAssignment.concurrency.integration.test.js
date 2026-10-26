// ทดสอบจริงกับฐานข้อมูลจริง (booking_project_dev) - ไม่ mock db/pool
// พิสูจน์ว่า UPDLOCK+HOLDLOCK กันจัดคนขับ/รถคันเดียวกันให้ทริปที่เวลาทับกันได้จริงภายใต้ request พร้อมกัน
// และกฎของการจัดรถ 3 แบบ (รถบริษัท / รถเช่า / เรียกรถออนไลน์) ตาม migration 013
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { getPool, sql } from '../src/db/pool.js'
import { hashPassword } from '../src/modules/auth/password.js'
import { createLocalUser } from '../src/modules/users/repository.js'
import { create as createDriver } from '../src/modules/drivers/repository.js'
import { createProvider, createVehicle } from '../src/modules/fleet/repository.js'
import { create as createRequest } from '../src/modules/vehicle-requests/repository.js'

const app = createApp()
const RUN = Date.now()
const TEST_USERNAME = `__test_fleet_${RUN}`
const TEST_PASSWORD = 'Passw0rd!23'

let pool
let userId
let cookie
const ids = { requests: [], vehicles: [], drivers: [], providers: [] }

// เวลาปัดเป็นนาที - คำขอโอทีเที่ยวเดียวกันต้องมีเวลาตรงกันเป๊ะ (Date.now() ต่างกันทีละ ms ระหว่างการเรียก)
const BASE = Math.floor(Date.now() / 60000) * 60000
function hoursFromBase(h) {
  return new Date(BASE + h * 60 * 60 * 1000)
}

async function makeRequest(departH, returnH, overrides = {}) {
  const row = await createRequest(
    pool,
    userId,
    {
      contactPhone: '000',
      departTime: hoursFromBase(departH),
      returnTime: hoursFromBase(returnH),
      pickupLocation: 'A',
      destination: 'B',
      mapLink: 'https://maps.google.com/?q=test',
      vehicleType: 'Van',
      passengerCount: 1,
      requestType: 'BusinessTrip',
      passengers: [],
      ...overrides,
    },
    [],
  )
  ids.requests.push(row.RequestID)
  return row.RequestID
}

const OT_EVENING = { requestType: 'Shuttle', pickupLocation: 'บริษัท', destination: 'บ้าน (ตามสายรถพนักงาน)', mapLink: null }

let seq = 0
async function companyDriver() {
  const d = await createDriver(pool, { name: `__test_driver_${RUN}_${++seq}`, phone: '02-000-0000', providerId: null })
  ids.drivers.push(d.DriverID)
  return d.DriverID
}
async function vehicle(providerId = null) {
  const v = await createVehicle(pool, {
    licensePlate: `__T${RUN % 100000}-${++seq}`,
    vehicleType: 'Van',
    seatCount: 12,
    description: null,
    providerId,
  })
  ids.vehicles.push(v.VehicleID)
  return v.VehicleID
}
async function provider(kind) {
  const p = await createProvider(pool, { name: `__test_provider_${RUN}_${++seq}`, kind, phone: null })
  ids.providers.push(p.ProviderID)
  return p.ProviderID
}
function assign(requestId, body) {
  return request(app).post(`/api/vehicle-requests/${requestId}/assign`).set('Cookie', cookie).send(body)
}

beforeAll(async () => {
  pool = await getPool()
  const passwordHash = await hashPassword(TEST_PASSWORD)
  const user = await createLocalUser(pool, {
    username: TEST_USERNAME,
    passwordHash,
    fullName: 'Fleet Test Admin',
    role: 'Admin',
  })
  userId = user.UserID
  const loginRes = await request(app).post('/api/auth/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD })
  cookie = loginRes.headers['set-cookie']
})

afterAll(async () => {
  const del = async (table, column, list) => {
    for (const id of list) await pool.request().input('id', sql.Int, id).query(`DELETE FROM ${table} WHERE ${column} = @id`)
  }
  await del('VehicleRequests', 'RequestID', ids.requests)
  // คืนลำดับเลขที่เอกสารที่ test ใช้ไป (test รันกับ DB dev) - ให้เลขถัดไปต่อจากคำขอจริงล่าสุด ไม่มีช่องว่าง
  await pool.request().query(
    `UPDATE s SET LastNumber = ISNULL((
       SELECT MAX(CAST(RIGHT(vr.RequestNo, LEN(vr.RequestNo) - 8) AS INT)) FROM VehicleRequests vr
       WHERE vr.RequestNo LIKE CONCAT('VR-', s.[Year], '-%')), 0)
     FROM DocumentSequences s WHERE s.Prefix = 'VR'`,
  )
  await del('Vehicles', 'VehicleID', ids.vehicles)
  await del('Drivers', 'DriverID', ids.drivers)
  await del('Providers', 'ProviderID', ids.providers)
  if (userId) await pool.request().input('id', sql.Int, userId).query('DELETE FROM Users WHERE UserID = @id')
})

describe('Fleet assignment conflict prevention (real DB, concurrent requests)', () => {
  it('assigns one company driver to only one of several overlapping requests sent at once', async () => {
    const driverId = await companyDriver()
    const requestIds = []
    for (let i = 0; i < 6; i++) requestIds.push(await makeRequest(48 + i, 72 + i))
    // รถคนละคันทุกคำขอ - ชนกันแค่ที่คนขับ
    const vehicleIds = []
    for (let i = 0; i < 6; i++) vehicleIds.push(await vehicle())

    const results = await Promise.all(
      requestIds.map((id, i) => assign(id, { kind: 'Company', driverId, vehicleId: vehicleIds[i] })),
    )
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    const conflicts = results.filter((r) => r.status === 409)
    expect(conflicts).toHaveLength(5)
    conflicts.forEach((r) => expect(r.body.errorCode).toBe('DRIVER_SCHEDULE_CONFLICT'))
  })

  it('assigns one vehicle to only one of several overlapping requests sent at once', async () => {
    const vehicleId = await vehicle()
    const requestIds = []
    const driverIds = []
    for (let i = 0; i < 5; i++) {
      requestIds.push(await makeRequest(600 + i, 610 + i))
      driverIds.push(await companyDriver())
    }
    const results = await Promise.all(
      requestIds.map((id, i) => assign(id, { kind: 'Company', driverId: driverIds[i], vehicleId })),
    )
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    results
      .filter((r) => r.status !== 200)
      .forEach((r) => expect(r.body.errorCode).toBe('VEHICLE_SCHEDULE_CONFLICT'))
  })

  it('allows back-to-back trips that only touch at the boundary', async () => {
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const first = await makeRequest(100, 102)
    const second = await makeRequest(102, 104)
    expect((await assign(first, { kind: 'Company', driverId, vehicleId })).status).toBe(200)
    expect((await assign(second, { kind: 'Company', driverId, vehicleId })).status).toBe(200)
  })

  it('rejects mixing a rental company driver/vehicle into a company assignment and vice versa', async () => {
    const rental = await provider('Rental')
    const rentalDriver = await createDriver(pool, { name: `__test_rental_driver_${RUN}`, phone: null, providerId: rental })
    ids.drivers.push(rentalDriver.DriverID)
    const rentalVehicle = await vehicle(rental)
    const companyVehicle = await vehicle()
    const requestId = await makeRequest(700, 702)

    const mixed = await assign(requestId, { kind: 'Company', driverId: rentalDriver.DriverID, vehicleId: companyVehicle })
    expect(mixed.status).toBe(400)
    const wrongVehicle = await assign(requestId, { kind: 'Rental', providerId: rental, driverId: rentalDriver.DriverID, vehicleId: companyVehicle })
    expect(wrongVehicle.status).toBe(400)

    const ok = await assign(requestId, { kind: 'Rental', providerId: rental, driverId: rentalDriver.DriverID, vehicleId: rentalVehicle })
    expect(ok.status).toBe(200)
    expect(ok.body.request.driver).toMatchObject({ kind: 'Rental', vehicleId: rentalVehicle })
  })

  it('does not check overlaps for on-demand trips and stores the per-trip driver', async () => {
    const grab = await provider('OnDemand')
    const a = await makeRequest(200, 204)
    const b = await makeRequest(201, 203)
    const trip = { kind: 'OnDemand', providerId: grab, tripDriverName: 'สมศักดิ์', tripDriverPhone: '081', licensePlate: '1กข 999' }
    expect((await assign(a, trip)).status).toBe(200)
    const second = await assign(b, trip)
    expect(second.status).toBe(200)
    expect(second.body.request.driver).toMatchObject({ kind: 'OnDemand', name: 'สมศักดิ์', vehicleId: null, id: null })
  })

  it('clears per-trip details when switching from on-demand to a company car, and snapshots the plate', async () => {
    const grab = await provider('OnDemand')
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const requestId = await makeRequest(500, 502)

    await assign(requestId, { kind: 'OnDemand', providerId: grab, tripDriverName: 'a', tripDriverPhone: 'b', licensePlate: 'x' })
    const switched = await assign(requestId, { kind: 'Company', driverId, vehicleId })
    expect(switched.status).toBe(200)

    const stored = await pool
      .request()
      .input('id', sql.Int, requestId)
      .query(
        `SELECT vr.ProviderID, vr.TripDriverName, vr.TripDriverPhone, vr.LicensePlate, v.LicensePlate AS VehiclePlate
         FROM VehicleRequests vr JOIN Vehicles v ON v.VehicleID = vr.AssignedVehicleID WHERE vr.RequestID = @id`,
      )
    const r = stored.recordset[0]
    expect(r).toMatchObject({ ProviderID: null, TripDriverName: null, TripDriverPhone: null })
    expect(r.LicensePlate).toBe(r.VehiclePlate)
  })

  it('lets OT requests of the same trip share one driver and vehicle', async () => {
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const a = await makeRequest(800, 801, OT_EVENING)
    const b = await makeRequest(800, 801, OT_EVENING)
    expect((await assign(a, { kind: 'Company', driverId, vehicleId })).status).toBe(200)
    expect((await assign(b, { kind: 'Company', driverId, vehicleId })).status).toBe(200)

    // ตอนเลือกคนขับให้คำขอ b คันนี้ต้องไม่ขึ้นว่าไม่ว่าง
    const busy = await request(app)
      .get('/api/drivers')
      .query({ busyFrom: hoursFromBase(800).toISOString(), busyTo: hoursFromBase(801).toISOString(), excludeRequestId: b })
      .set('Cookie', cookie)
    expect(busy.body.drivers.find((d) => d.id === driverId).isBusy).toBe(false)
  })

  it('still blocks OT requests at a different time, a different trip type, or a business trip', async () => {
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const base = await makeRequest(820, 821, OT_EVENING)
    const laterStart = await makeRequest(820.25, 821, OT_EVENING)
    const morning = await makeRequest(820, 821, { ...OT_EVENING, pickupLocation: 'บ้าน (ตามสายรถพนักงาน)', destination: 'บริษัท' })
    const trip = await makeRequest(820, 821)
    expect((await assign(base, { kind: 'Company', driverId, vehicleId })).status).toBe(200)
    for (const id of [laterStart, morning, trip]) {
      expect((await assign(id, { kind: 'Company', driverId, vehicleId })).status).toBe(409)
    }
  })

  it('assigns a whole OT trip at once, and refuses requests that are not the same trip', async () => {
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const a = await makeRequest(840, 841, OT_EVENING)
    const b = await makeRequest(840, 841, OT_EVENING)
    const other = await makeRequest(840, 842, OT_EVENING)

    const mixed = await request(app)
      .post('/api/vehicle-requests/assign-trip')
      .set('Cookie', cookie)
      .send({ requestIds: [a, other], kind: 'Company', driverId, vehicleId })
    expect(mixed.status).toBe(400)

    const ok = await request(app)
      .post('/api/vehicle-requests/assign-trip')
      .set('Cookie', cookie)
      .send({ requestIds: [a, b], kind: 'Company', driverId, vehicleId })
    expect(ok.status).toBe(200)
    expect(ok.body.requests.map((r) => r.driver.vehicleId)).toEqual([vehicleId, vehicleId])
  })

  it('rejects a passenger who is already on another overlapping request, and allows it once that one is cancelled', async () => {
    const first = await makeRequest(860, 862, { passengers: [userId] })
    await expect(makeRequest(861, 863, { passengers: [userId] })).rejects.toMatchObject({
      code: 'PASSENGER_DOUBLE_BOOKED',
      details: expect.objectContaining({ userId, requestId: first }),
    })
    // ไม่ทับกัน (ต่อกันพอดี) ได้
    await makeRequest(862, 864, { passengers: [userId] })

    await request(app).delete(`/api/vehicle-requests/${first}`).set('Cookie', cookie)
    await makeRequest(860, 861, { passengers: [userId] })
  })

  it('deletes a driver, vehicle and provider that were never used, but keeps anything with history', async () => {
    const del = (path) => request(app).delete(`/api/${path}`).set('Cookie', cookie)

    // ไม่เคยใช้ → ลบจริงได้
    const unusedDriver = await companyDriver()
    const unusedVehicle = await vehicle()
    const unusedProvider = await provider('OnDemand')
    expect((await del(`drivers/${unusedDriver}`)).status).toBe(204)
    expect((await del(`vehicles/${unusedVehicle}`)).status).toBe(204)
    expect((await del(`providers/${unusedProvider}`)).status).toBe(204)
    const gone = await pool.request().input('id', sql.Int, unusedDriver).query('SELECT 1 FROM Drivers WHERE DriverID = @id')
    expect(gone.recordset).toHaveLength(0)

    // เคยถูกจัดให้คำขอ (แม้ยกเลิกไปแล้ว) → ลบไม่ได้ ประวัติยังอยู่
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const requestId = await makeRequest(900, 901)
    await assign(requestId, { kind: 'Company', driverId, vehicleId })
    await request(app).delete(`/api/vehicle-requests/${requestId}`).set('Cookie', cookie)
    const blockedDriver = await del(`drivers/${driverId}`)
    expect(blockedDriver.status).toBe(409)
    expect(blockedDriver.body).toMatchObject({ errorCode: 'FLEET_ITEM_IN_USE', details: { requests: 1 } })
    expect((await del(`vehicles/${vehicleId}`)).body.details).toMatchObject({ requests: 1 })

    // บริษัทรถเช่าที่ยังมีคนขับลงทะเบียน → ลบไม่ได้
    const rental = await provider('Rental')
    const rentalDriver = await createDriver(pool, { name: `__test_rd_${RUN}`, phone: null, providerId: rental })
    ids.drivers.push(rentalDriver.DriverID)
    expect((await del(`providers/${rental}`)).body).toMatchObject({ errorCode: 'FLEET_ITEM_IN_USE', details: { drivers: 1 } })

    expect((await del('drivers/999999999')).status).toBe(404)
  })

  it('gives every new request the next document number of the year (VR-YYYY-NNNN, no gaps)', async () => {
    const a = await makeRequest(950, 951)
    const b = await makeRequest(952, 953)
    const rows = await pool
      .request()
      .input('a', sql.Int, a)
      .input('b', sql.Int, b)
      .query('SELECT RequestID, RequestNo FROM VehicleRequests WHERE RequestID IN (@a, @b) ORDER BY RequestID')
    const [first, second] = rows.recordset.map((r) => r.RequestNo)
    expect(first).toMatch(/^VR-\d{4}-\d{4,}$/)
    const n = (no) => Number(no.split('-')[2])
    expect(second.slice(0, 8)).toBe(first.slice(0, 8))
    expect(n(second)).toBe(n(first) + 1)
  })

  it('does not use up a number when the request is rejected', async () => {
    const ok = await makeRequest(960, 962, { passengers: [userId] })
    await expect(makeRequest(961, 963, { passengers: [userId] })).rejects.toMatchObject({ code: 'PASSENGER_DOUBLE_BOOKED' })
    const next = await makeRequest(970, 971)
    const rows = await pool
      .request()
      .input('a', sql.Int, ok)
      .input('b', sql.Int, next)
      .query('SELECT RequestNo FROM VehicleRequests WHERE RequestID IN (@a, @b) ORDER BY RequestID')
    const [x, y] = rows.recordset.map((r) => Number(r.RequestNo.split('-')[2]))
    expect(y).toBe(x + 1)
  })

  it('cannot assign a business trip that is still waiting for, or was refused, approval', async () => {
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const pending = await makeRequest(980, 981, { approval: { status: 'Pending', approverId: userId } })
    const res = await assign(pending, { kind: 'Company', driverId, vehicleId })
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('APPROVAL_REQUIRED')

    // อนุมัติต้องมีลายเซ็น - ผู้ใช้ทดสอบยังไม่มี จึงต้องเซ็ตไว้ก่อน
    await pool.request().input('id', sql.Int, userId).query("UPDATE Users SET SignatureFile = 'test-sig.png' WHERE UserID = @id")
    await request(app).post(`/api/vehicle-requests/${pending}/approve`).set('Cookie', cookie)
    expect((await assign(pending, { kind: 'Company', driverId, vehicleId })).status).toBe(200)
  })

  it('frees the driver and vehicle again once the assigned request is cancelled', async () => {
    const driverId = await companyDriver()
    const vehicleId = await vehicle()
    const a = await makeRequest(300, 304)
    const b = await makeRequest(301, 303)

    await assign(a, { kind: 'Company', driverId, vehicleId })
    expect((await assign(b, { kind: 'Company', driverId, vehicleId })).status).toBe(409)
    expect((await request(app).delete(`/api/vehicle-requests/${a}`).set('Cookie', cookie)).status).toBe(200)
    expect((await assign(b, { kind: 'Company', driverId, vehicleId })).status).toBe(200)
  })
})

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { readdir, rm } from 'node:fs/promises'

// ไฟล์แนบเขียนลงโฟลเดอร์ชั่วคราวจริง (ทดสอบการตรวจ magic bytes / ลบไฟล์ตอน rollback ของจริง)
// ต้องตั้งก่อน import config/env.js จึงใช้ vi.hoisted
const uploadDir = vi.hoisted(() => {
  const dir = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/vr-uploads-test-${process.pid}`
  process.env.UPLOAD_DIR = dir
  return dir
})

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/vehicle-requests/repository.js', () => ({
  findById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
  assign: vi.fn(),
  assignTrip: vi.fn(),
  combineTrip: vi.fn(),
  uncombineRequests: vi.fn(),
  decideApproval: vi.fn(),
  listAssignments: vi.fn(),
  listAttachments: vi.fn(async () => new Map()),
  listPassengers: vi.fn(async () => new Map()),
  findAttachment: vi.fn(),
  addAttachments: vi.fn(),
  removeAttachment: vi.fn(),
  ASSIGNMENT_KINDS: ['Company', 'Rental', 'OnDemand', 'Manual'],
}))

vi.mock('../src/modules/notifications/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  vehicleRequestCancelledByRequester: vi.fn(),
  vehicleRequestUpdatedByAdmin: vi.fn(),
}))

vi.mock('../src/modules/drivers/repository.js', () => ({
  listAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../src/modules/fleet/repository.js', () => ({
  listProviders: vi.fn(),
  findProvider: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  countProviderResources: vi.fn(async () => 0),
  listVehicles: vi.fn(),
  findVehicle: vi.fn(),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
  listShuttleRoutes: vi.fn(),
  findShuttleRoute: vi.fn(),
  createShuttleRoute: vi.fn(),
  updateShuttleRoute: vi.fn(),
  listShuttlePassengers: vi.fn(),
  upsertShuttlePassenger: vi.fn(),
  deleteShuttlePassenger: vi.fn(),
  listRouteVehicles: vi.fn(async () => new Map()),
  setRouteVehicles: vi.fn(),
}))

// ผู้ขอ (id 1) อยู่แผนก 10 - เลือกได้เฉพาะ 5/7/9 ในแผนกหลักเดียวกัน (Admin เลือกได้ทุกคน)
vi.mock('../src/modules/fleet/deletion.js', () => ({ deleteFleetItem: vi.fn() }))
vi.mock('../src/modules/users/repository.js', () => ({
  findById: vi.fn(async () => ({ UserID: 1, DepartmentID: 10 })),
  listDirectory: vi.fn(async () => [1, 5, 7, 9].map((id) => ({ UserID: id }))),
  listApprovers: vi.fn(async () => [{ UserID: 20, FullName: 'หัวหน้า', ApprovalLevel: 1 }]),
}))

vi.mock('../src/modules/departments/repository.js', () => ({
  listAll: vi.fn(async () => [{ DepartmentID: 10, ParentDepartmentID: null }]),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { AppError } from '../src/errors/AppError.js'
import * as vrRepo from '../src/modules/vehicle-requests/repository.js'
import * as driversRepo from '../src/modules/drivers/repository.js'
import * as fleetRepo from '../src/modules/fleet/repository.js'
import * as usersRepo from '../src/modules/users/repository.js'
import * as notify from '../src/modules/notifications/service.js'
import { deleteFleetItem } from '../src/modules/fleet/deletion.js'

function authCookie(role = 'Employee', id = 1) {
  const token = jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })
  return `token=${token}`
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
}

function validBody(overrides = {}) {
  return {
    contactPhone: '0812345678',
    departTime: hoursFromNow(24),
    returnTime: hoursFromNow(28),
    pickupLocation: 'สำนักงานใหญ่',
    destination: 'โรงงานระยอง',
    pickupMapLink: 'https://maps.google.com/?q=hq',
    destinationMapLink: 'https://maps.google.com/?q=rayong',
    vehicleType: 'Van',
    passengerCount: 4,
    requestType: 'BusinessTrip',
    reason: 'ประชุมลูกค้า',
    approverUserId: 20,
    ...overrides,
  }
}

const PDF = Buffer.from('%PDF-1.4\n%test\n')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const FAKE_PDF = Buffer.from('<html><script>alert(1)</script></html>')

/** POST แบบ multipart เหมือนที่ frontend ส่ง - ฟิลด์ที่เป็น undefined/null จะไม่ถูกส่ง */
function postRequest(body, files = [{ buffer: PDF, name: 'form.pdf' }], cookie = authCookie()) {
  let req = request(app).post('/api/vehicle-requests').set('Cookie', cookie)
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) req = req.field(k, String(v))
  }
  for (const f of files) req = req.attach('files', f.buffer, f.name)
  return req
}

async function storedFiles() {
  return readdir(uploadDir).catch(() => [])
}

function row(overrides = {}) {
  return {
    RequestID: 10,
    RequesterUserID: 1,
    RequesterName: 'Test',
    ContactPhone: '0812345678',
    DepartTime: new Date(),
    ReturnTime: new Date(),
    PickupLocation: 'A',
    Destination: 'B',
    MapLink: null,
    VehicleType: 'Van',
    PassengerCount: 4,
    RequestType: 'BusinessTrip',
    Status: 'Pending',
    AssignedDriverID: null,
    ...overrides,
  }
}

const app = createApp()

beforeEach(async () => {
  vi.clearAllMocks()
  await rm(uploadDir, { recursive: true, force: true })
})

afterAll(async () => {
  await rm(uploadDir, { recursive: true, force: true })
})

describe('POST /api/vehicle-requests', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/vehicle-requests').send(validBody())
    expect(res.status).toBe(401)
  })

  it('creates a request for the logged-in user with its attachments', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(
      validBody(),
      [
        { buffer: PDF, name: 'แบบฟอร์มขอรถ.pdf' },
        { buffer: PNG, name: 'page2.png' },
      ],
      authCookie('Employee', 7),
    )

    expect(res.status).toBe(201)
    const [, userId, input, attachments] = vrRepo.create.mock.calls[0]
    expect(userId).toBe(7)
    expect(input.passengerCount).toBe(4)
    expect(attachments).toEqual([
      expect.objectContaining({ originalName: 'แบบฟอร์มขอรถ.pdf', contentType: 'application/pdf', size: PDF.length }),
      expect.objectContaining({ originalName: 'page2.png', contentType: 'image/png' }),
    ])
    expect((await storedFiles()).sort()).toEqual(attachments.map((a) => a.storedName).sort())
    expect(res.body.request.status).toBe('Pending')
  })

  it.each([
    ['in the past', { departTime: hoursFromNow(-1), returnTime: hoursFromNow(2) }, 'DATE_IN_PAST'],
    ['beyond 90 days', { departTime: hoursFromNow(24 * 91), returnTime: hoursFromNow(24 * 91 + 2) }, 'DATE_TOO_FAR_AHEAD'],
  ])('tells the user why a departure %s is refused', async (_label, overrides, code) => {
    const res = await postRequest(validBody(overrides))
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe(code)
  })

  it('accepts a multi-day trip', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(validBody({ departTime: hoursFromNow(24), returnTime: hoursFromNow(24 * 3) }))
    expect(res.status).toBe(201)
  })

  it.each([
    ['return before depart', { departTime: hoursFromNow(5), returnTime: hoursFromNow(4) }],
    ['unknown vehicle type', { vehicleType: 'Truck' }],
    ['zero passengers', { passengerCount: 0 }],
    ['missing destination', { destination: '  ' }],
    ['missing pickup location', { pickupLocation: '' }],
    ['missing contact phone', { contactPhone: '' }],
    ['missing passenger count', { passengerCount: undefined }],
    ['missing vehicle type', { vehicleType: undefined }],
    ['missing destination map link', { destinationMapLink: undefined }],
    ['empty destination map link', { destinationMapLink: '   ' }],
    ['javascript: destination map link', { destinationMapLink: 'javascript:alert(1)' }],
    ['missing pickup map link', { pickupMapLink: undefined }],
    ['javascript: pickup map link', { pickupMapLink: 'javascript:alert(1)' }],
  ])('rejects %s', async (_label, overrides) => {
    const res = await postRequest(validBody(overrides))
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('VALIDATION_ERROR')
    expect(vrRepo.create).not.toHaveBeenCalled()
    expect(await storedFiles()).toEqual([])
  })

  it('accepts an OT (Shuttle) request with only employees selected - passengers sent as JSON in multipart', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(
      validBody({ requestType: 'Shuttle', passengerCount: 0, pickupMapLink: undefined, destinationMapLink: undefined, passengers: JSON.stringify([7, 9, 7]) }),
      [],
    )
    expect(res.status).toBe(201)
    const input = vrRepo.create.mock.calls[0][2]
    expect(input.passengers).toEqual([7, 9])
    // PassengerCount = แขก + พนักงาน (ตรงกับ "จำนวนรวมทั้งหมด" บนฟอร์ม)
    expect(input.passengerCount).toBe(2)
  })

  it('counts guests plus selected employees for a business trip', async () => {
    vrRepo.create.mockResolvedValue(row())
    await postRequest(validBody({ passengerCount: 2, passengers: JSON.stringify([5]) }))
    expect(vrRepo.create.mock.calls[0][2]).toMatchObject({ passengerCount: 3, passengers: [5] })
  })

  it('stores a map link for each stop', async () => {
    vrRepo.create.mockResolvedValue(row())
    await postRequest(validBody())
    expect(vrRepo.create.mock.calls[0][2]).toMatchObject({
      pickupLocation: 'สำนักงานใหญ่',
      pickupMapLink: 'https://maps.google.com/?q=hq',
      destination: 'โรงงานระยอง',
      mapLink: 'https://maps.google.com/?q=rayong',
    })
  })

  it('needs no map for a stop ticked as the company, and names it for the requester', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(
      validBody({ pickupAtCompany: 'true', pickupLocation: '', pickupMapLink: undefined }),
    )
    expect(res.status).toBe(201)
    expect(vrRepo.create.mock.calls[0][2]).toMatchObject({ pickupLocation: 'บริษัท', pickupMapLink: null })
  })

  it('keeps an optional gate only for a stop at the company', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(
      validBody({ pickupAtCompany: 'true', pickupLocation: '', pickupMapLink: undefined, pickupGate: '  ประตู 2  ', destinationGate: 'ประตู 9' }),
    )
    expect(res.status).toBe(201)
    // จุดรับที่บริษัท = เก็บประตู (ตัดช่องว่าง), ปลายทางไม่ใช่บริษัท = ทิ้งประตูที่ส่งมา
    expect(vrRepo.create.mock.calls[0][2]).toMatchObject({ pickupGate: 'ประตู 2', destinationGate: null })
  })

  it('rejects a gate longer than 100 characters', async () => {
    const res = await postRequest(validBody({ pickupAtCompany: 'true', pickupLocation: '', pickupMapLink: undefined, pickupGate: 'ก'.repeat(101) }))
    expect(res.status).toBe(400)
    expect(vrRepo.create).not.toHaveBeenCalled()
  })

  it('returns the gates on the request', async () => {
    vrRepo.findById.mockResolvedValue(row({ PickupLocation: 'บริษัท', PickupGate: 'ประตู 2', DestinationGate: null }))
    const res = await request(app).get('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1))
    expect(res.body.request).toMatchObject({ pickupGate: 'ประตู 2', destinationGate: null })
  })

  it('reports which stops are the company', async () => {
    vrRepo.findById.mockResolvedValue(row({ PickupLocation: 'บริษัท', PickupMapLink: null, Destination: 'โรงงานระยอง', MapLink: 'https://x.test/' }))
    const res = await request(app).get('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1))
    expect(res.body.request).toMatchObject({ pickupAtCompany: true, destinationAtCompany: false, destinationMapLink: 'https://x.test/' })
  })

  it('defaults to a round trip and keeps the requested return time', async () => {
    vrRepo.create.mockResolvedValue(row())
    const body = validBody()
    await postRequest(body)
    const input = vrRepo.create.mock.calls[0][2]
    expect(input.tripType).toBe('RoundTrip')
    expect(input.returnTime.toISOString()).toBe(new Date(body.returnTime).toISOString())
  })

  it.each(['OneWay', 'ReturnOnly'])('blocks the driver for 2 hours on a %s trip, ignoring any return time sent', async (tripType) => {
    vrRepo.create.mockResolvedValue(row())
    const body = validBody({ tripType, returnTime: hoursFromNow(500) })
    const res = await postRequest(body)
    expect(res.status).toBe(201)
    const input = vrRepo.create.mock.calls[0][2]
    expect(input.tripType).toBe(tripType)
    expect(input.returnTime.getTime() - input.departTime.getTime()).toBe(2 * 60 * 60 * 1000)
  })

  it('rejects an unknown trip type', async () => {
    const res = await postRequest(validBody({ tripType: 'Teleport' }))
    expect(res.status).toBe(400)
  })

  it('rejects a passenger outside the requester main department (and writes no file)', async () => {
    const res = await postRequest(validBody({ passengers: JSON.stringify([5, 42]) }))
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('PASSENGER_OUT_OF_SCOPE')
    expect(vrRepo.create).not.toHaveBeenCalled()
    expect(await storedFiles()).toEqual([])
  })

  it('lets an admin pick anyone', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(validBody({ passengers: JSON.stringify([42]) }), undefined, authCookie('Admin'))
    expect(res.status).toBe(201)
  })

  it('on edit keeps passengers already on the request, but checks newly added ones', async () => {
    vrRepo.findById.mockResolvedValue(row())
    vrRepo.update.mockResolvedValue(row())
    vrRepo.listPassengers.mockResolvedValue(new Map([[10, [{ id: 42 }]]]))
    const put = (ids) =>
      request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1)).send(validBody({ passengers: ids }))

    expect((await put([42, 5])).status).toBe(200)
    const res = await put([42, 43])
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('PASSENGER_OUT_OF_SCOPE')
    vrRepo.listPassengers.mockResolvedValue(new Map())
  })

  it.each([
    ['no guests and no employees', { requestType: 'Shuttle', passengerCount: 0, pickupMapLink: undefined, destinationMapLink: undefined, passengers: '[]' }],
    ['negative guests', { passengerCount: -1, passengers: JSON.stringify([5]) }],
    ['a non-numeric passenger id', { passengers: JSON.stringify([5, 'x']) }],
    ['an unknown request type', { requestType: 'Taxi' }],
  ])('rejects %s', async (_label, overrides) => {
    const res = await postRequest(validBody(overrides), overrides.requestType === 'Shuttle' ? [] : undefined)
    expect(res.status).toBe(400)
    expect(vrRepo.create).not.toHaveBeenCalled()
  })

  it('no longer requires an attachment (the system PDF + approval replace the paper form)', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(validBody(), [])
    expect(res.status).toBe(201)
  })

  it('requires a reason for a business trip, but not for an OT shuttle', async () => {
    expect((await postRequest(validBody({ reason: '' }))).status).toBe(400)
    vrRepo.create.mockResolvedValue(row())
    const shuttle = await postRequest(
      validBody({ requestType: 'Shuttle', reason: undefined, approverUserId: undefined, passengerCount: 0, passengers: JSON.stringify([5]) }),
      [],
    )
    expect(shuttle.status).toBe(201)
    expect(vrRepo.create.mock.calls.at(-1)[2].approval).toEqual({ status: 'NotRequired' })
  })

  it('rejects a file whose content is not really a PDF/JPG/PNG, and writes nothing', async () => {
    const res = await postRequest(validBody(), [
      { buffer: PDF, name: 'ok.pdf' },
      { buffer: FAKE_PDF, name: 'evil.pdf' },
    ])
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('ATTACHMENT_TYPE_INVALID')
    expect(await storedFiles()).toEqual([])
  })

  it('rejects more than 5 files', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ buffer: PDF, name: `f${i}.pdf` }))
    const res = await postRequest(validBody(), files)
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('ATTACHMENT_COUNT_INVALID')
  })

  it('rejects a file over 10 MB', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)])
    const res = await postRequest(validBody(), [{ buffer: big, name: 'big.pdf' }])
    expect(res.status).toBe(413)
    expect(res.body.errorCode).toBe('ATTACHMENT_TOO_LARGE')
  })

  it('removes the saved files again if the database insert fails', async () => {
    vrRepo.create.mockRejectedValue(new Error('db down'))
    const res = await postRequest(validBody())
    expect(res.status).toBe(500)
    expect(await storedFiles()).toEqual([])
  })

  it('rejects an edit that removes the map link', async () => {
    vrRepo.findById.mockResolvedValue(row())
    const res = await request(app)
      .put('/api/vehicle-requests/10')
      .set('Cookie', authCookie('Employee', 1))
      .send(validBody({ destinationMapLink: '' }))
    expect(res.status).toBe(400)
    expect(vrRepo.update).not.toHaveBeenCalled()
  })
})

describe('approver can only view / approve / reject (not modify) a request', () => {
  const approverCookie = () => authCookie('Employee', 20)
  const asApprover = () => vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 1, ApproverUserID: 20 }))

  it('may open the request', async () => {
    asApprover()
    const res = await request(app).get('/api/vehicle-requests/10').set('Cookie', approverCookie())
    expect(res.status).toBe(200)
  })

  it('cannot edit it', async () => {
    asApprover()
    const res = await request(app).put('/api/vehicle-requests/10').set('Cookie', approverCookie()).send(validBody())
    expect(res.status).toBe(403)
    expect(vrRepo.update).not.toHaveBeenCalled()
  })

  it('cannot cancel it', async () => {
    asApprover()
    const res = await request(app).delete('/api/vehicle-requests/10').set('Cookie', approverCookie())
    expect(res.status).toBe(403)
    expect(vrRepo.cancel).not.toHaveBeenCalled()
  })

  it('cannot add or delete attachments', async () => {
    asApprover()
    const add = await request(app)
      .post('/api/vehicle-requests/10/attachments')
      .set('Cookie', approverCookie())
      .attach('files', PDF, 'form.pdf')
    expect(add.status).toBe(403)
    expect(vrRepo.addAttachments).not.toHaveBeenCalled()
    const del = await request(app).delete('/api/vehicle-requests/10/attachments/1').set('Cookie', approverCookie())
    expect(del.status).toBe(403)
    expect(vrRepo.removeAttachment).not.toHaveBeenCalled()
  })
})

describe('/api/vehicle-requests/:id/attachments', () => {
  it("forbids opening someone else's attachment", async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 99 }))
    const res = await request(app).get('/api/vehicle-requests/10/attachments/1').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(403)
    expect(vrRepo.findAttachment).not.toHaveBeenCalled()
  })

  it('serves the file with its real type and a UTF-8 file name to the owner', async () => {
    vrRepo.create.mockResolvedValue(row())
    await postRequest(validBody(), [{ buffer: PDF, name: 'แบบฟอร์ม.pdf' }])
    const saved = vrRepo.create.mock.calls[0][3][0]

    vrRepo.findById.mockResolvedValue(row())
    vrRepo.findAttachment.mockResolvedValue({
      StoredName: saved.storedName,
      OriginalName: saved.originalName,
      ContentType: saved.contentType,
    })
    const res = await request(app).get('/api/vehicle-requests/10/attachments/1').set('Cookie', authCookie('Employee', 1))

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toBe(`inline; filename*=UTF-8''${encodeURIComponent('แบบฟอร์ม.pdf')}`)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    // object-src 'self' ให้ตัวแสดง PDF ของ browser ทำงาน แต่ยังปิดสคริปต์/อย่างอื่นหมด
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none'; object-src 'self'; img-src 'self'; style-src 'unsafe-inline'",
    )
    expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('refuses a stored name that is not one the server generated', async () => {
    vrRepo.findById.mockResolvedValue(row())
    vrRepo.findAttachment.mockResolvedValue({ StoredName: '../../.env', OriginalName: 'x', ContentType: 'application/pdf' })
    const res = await request(app).get('/api/vehicle-requests/10/attachments/1').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(404)
  })

  it('owner may add files only while Pending, admin while Assigned too', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 1 }))
    vrRepo.addAttachments.mockResolvedValue(true)
    await request(app)
      .post('/api/vehicle-requests/10/attachments')
      .set('Cookie', authCookie('Employee', 1))
      .attach('files', PNG, 'extra.png')
    expect(vrRepo.addAttachments.mock.calls[0][4]).toEqual({ allowedStatuses: ['Pending'], max: 5 })

    await request(app)
      .post('/api/vehicle-requests/10/attachments')
      .set('Cookie', authCookie('Admin', 2))
      .attach('files', PNG, 'extra.png')
    expect(vrRepo.addAttachments.mock.calls[1][4]).toEqual({ allowedStatuses: ['Pending', 'Assigned'], max: 5 })
  })

  it('cleans up uploaded files when adding would exceed the limit', async () => {
    vrRepo.findById.mockResolvedValue(row())
    vrRepo.addAttachments.mockRejectedValue(new AppError('ATTACHMENT_COUNT_INVALID', 400))
    const res = await request(app)
      .post('/api/vehicle-requests/10/attachments')
      .set('Cookie', authCookie('Employee', 1))
      .attach('files', PNG, 'extra.png')
    expect(res.body.errorCode).toBe('ATTACHMENT_COUNT_INVALID')
    expect(await storedFiles()).toEqual([])
  })

  it('refuses to delete the last attachment', async () => {
    vrRepo.findById.mockResolvedValue(row())
    vrRepo.removeAttachment.mockRejectedValue(new AppError('ATTACHMENT_REQUIRED', 400))
    const res = await request(app).delete('/api/vehicle-requests/10/attachments/1').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('ATTACHMENT_REQUIRED')
  })

  it('deletes the file from disk after removing the row', async () => {
    vrRepo.create.mockResolvedValue(row())
    await postRequest(validBody(), [{ buffer: PDF, name: 'a.pdf' }])
    const saved = vrRepo.create.mock.calls[0][3][0]
    expect(await storedFiles()).toEqual([saved.storedName])

    vrRepo.findById.mockResolvedValue(row())
    vrRepo.removeAttachment.mockResolvedValue(saved.storedName)
    const res = await request(app).delete('/api/vehicle-requests/10/attachments/1').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(200)
    expect(await storedFiles()).toEqual([])
  })
})

describe('GET /api/vehicle-requests', () => {
  it('forces employees to see only their own requests', async () => {
    vrRepo.list.mockResolvedValue([])
    await request(app).get('/api/vehicle-requests').set('Cookie', authCookie('Employee', 3))
    expect(vrRepo.list.mock.calls[0][1].userId).toBe(3)
  })

  it('lets admins see everyone', async () => {
    vrRepo.list.mockResolvedValue([])
    await request(app).get('/api/vehicle-requests?status=Pending').set('Cookie', authCookie('Admin', 3))
    expect(vrRepo.list.mock.calls[0][1]).toMatchObject({ userId: undefined, status: 'Pending' })
  })

  it('rejects an unknown status filter', async () => {
    const res = await request(app).get('/api/vehicle-requests?status=Nope').set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/vehicle-requests/:id', () => {
  it("forbids viewing someone else's request", async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 99 }))
    const res = await request(app).get('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1))
    expect(res.status).toBe(403)
  })

  it('returns 404 when missing', async () => {
    vrRepo.findById.mockResolvedValue(null)
    const res = await request(app).get('/api/vehicle-requests/10').set('Cookie', authCookie())
    expect(res.status).toBe(404)
  })
})

describe('PUT / DELETE /api/vehicle-requests/:id - status rules', () => {
  it('owner may only edit while Pending', async () => {
    vrRepo.findById.mockResolvedValue(row())
    vrRepo.update.mockResolvedValue(row())
    await request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1)).send(validBody())
    expect(vrRepo.update.mock.calls[0][3]).toEqual({ allowedStatuses: ['Pending'] })
  })

  it('rejects changing the request type after creation (would skip the attachment rule)', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequestType: 'BusinessTrip' }))
    const res = await request(app)
      .put('/api/vehicle-requests/10')
      .set('Cookie', authCookie('Employee', 1))
      .send(validBody({ requestType: 'Shuttle' }))
    expect(res.status).toBe(400)
    expect(vrRepo.update).not.toHaveBeenCalled()
  })

  it('keeps the stored request type when the body leaves it out', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequestType: 'BusinessTrip' }))
    vrRepo.update.mockResolvedValue(row())
    const body = validBody()
    delete body.requestType
    const res = await request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1)).send(body)
    expect(res.status).toBe(200)
    expect(vrRepo.update.mock.calls[0][2].requestType).toBe('BusinessTrip')
  })

  it('admin may edit Pending or Assigned', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 99 }))
    vrRepo.update.mockResolvedValue(row())
    await request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Admin', 1)).send(validBody())
    expect(vrRepo.update.mock.calls[0][3]).toEqual({ allowedStatuses: ['Pending', 'Assigned'] })
  })

  it('owner may only cancel while Pending (assigned trips are cancelled by Admin)', async () => {
    vrRepo.findById.mockResolvedValue(row({ Status: 'Assigned' }))
    vrRepo.cancel.mockRejectedValue(new AppError('VEHICLE_REQUEST_STATUS_INVALID', 409))
    const res = await request(app).delete('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1))

    expect(vrRepo.cancel.mock.calls[0][2]).toEqual({ allowedStatuses: ['Pending'] })
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('VEHICLE_REQUEST_STATUS_INVALID')
  })

  it('admin may cancel an assigned request', async () => {
    vrRepo.findById.mockResolvedValue(row({ Status: 'Assigned', RequesterUserID: 99 }))
    vrRepo.cancel.mockResolvedValue(row({ Status: 'Cancelled' }))
    const res = await request(app).delete('/api/vehicle-requests/10').set('Cookie', authCookie('Admin', 1))
    expect(res.status).toBe(200)
    expect(vrRepo.cancel.mock.calls[0][2]).toEqual({ allowedStatuses: ['Pending', 'Assigned'] })
  })
})

describe('business trip approval by a supervisor (dev+HR 2026-10-05)', () => {
  it('sends a business trip to the chosen approver', async () => {
    vrRepo.create.mockResolvedValue(row())
    const res = await postRequest(validBody())
    expect(res.status).toBe(201)
    expect(vrRepo.create.mock.calls[0][2].approval).toEqual({ status: 'Pending', approverId: 20 })
    expect(vrRepo.create.mock.calls[0][2].reason).toBe('ประชุมลูกค้า')
  })

  it('requires an approver, and only one from the requester main department (not themselves)', async () => {
    const none = await postRequest(validBody({ approverUserId: undefined }))
    expect(none.body.errorCode).toBe('APPROVER_REQUIRED')
    const outsider = await postRequest(validBody({ approverUserId: 99 }))
    expect(outsider.body.errorCode).toBe('APPROVER_INVALID')
    expect(vrRepo.create).not.toHaveBeenCalled()
  })

  it('auto-approves when the requester is a supervisor or an approver', async () => {
    usersRepo.findById.mockResolvedValueOnce({ UserID: 1, DepartmentID: 10, ApprovalLevel: 2 })
    vrRepo.create.mockResolvedValue(row())
    await postRequest(validBody({ approverUserId: undefined }))
    expect(vrRepo.create.mock.calls[0][2].approval).toMatchObject({ status: 'Approved', approverId: 1, auto: true })
  })

  it('the requester editing a business trip sends it back for approval; an admin edit keeps the decision', async () => {
    vrRepo.findById.mockResolvedValue(row({ ApproverUserID: 20, ApprovalStatus: 'Approved' }))
    vrRepo.update.mockResolvedValue(row())
    await request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1)).send(validBody())
    expect(vrRepo.update.mock.calls[0][2].approval).toEqual({ status: 'Pending', approverId: 20 })

    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 99, ApproverUserID: 20, ApprovalStatus: 'Approved' }))
    await request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Admin', 1)).send(validBody())
    expect(vrRepo.update.mock.calls[1][2].approval).toBeUndefined()
  })

  it('lets only the chosen approver approve or reject (reject needs a note)', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 1, ApproverUserID: 20, ApprovalStatus: 'Pending' }))
    vrRepo.decideApproval.mockResolvedValue(row({ ApprovalStatus: 'Approved' }))
    usersRepo.findById.mockResolvedValueOnce({ UserID: 20, SignatureFile: 'sig.png' })
    const ok = await request(app).post('/api/vehicle-requests/10/approve').set('Cookie', authCookie('Employee', 20))
    expect(ok.status).toBe(200)
    expect(vrRepo.decideApproval).toHaveBeenCalledWith({}, '10', 20, { approve: true })

    const stranger = await request(app).post('/api/vehicle-requests/10/approve').set('Cookie', authCookie('Employee', 33))
    expect(stranger.status).toBe(403)

    const noNote = await request(app).post('/api/vehicle-requests/10/reject').set('Cookie', authCookie('Employee', 20)).send({})
    expect(noNote.status).toBe(400)

    vrRepo.decideApproval.mockResolvedValue(null) // ตัดสินไปแล้ว/ถูกยกเลิก
    const late = await request(app).post('/api/vehicle-requests/10/reject').set('Cookie', authCookie('Employee', 20)).send({ note: 'ไม่จำเป็น' })
    expect(late.body.errorCode).toBe('APPROVAL_NOT_ALLOWED')
  })

  it('refuses to approve without a signature/stamp (the PDF would have an empty Approved by box)', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 1, ApproverUserID: 20, ApprovalStatus: 'Pending' }))
    vrRepo.decideApproval.mockClear()
    usersRepo.findById.mockResolvedValueOnce({ UserID: 20, SignatureFile: null })
    const res = await request(app).post('/api/vehicle-requests/10/approve').set('Cookie', authCookie('Employee', 20))
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('APPROVER_SIGNATURE_REQUIRED')
    expect(vrRepo.decideApproval).not.toHaveBeenCalled()
  })

  it('lists the requests waiting for me as approver', async () => {
    vrRepo.list.mockResolvedValue([])
    await request(app).get('/api/vehicle-requests?approvals=mine').set('Cookie', authCookie('Employee', 20))
    expect(vrRepo.list).toHaveBeenCalledWith({}, expect.objectContaining({ approverId: 20, userId: undefined }))
  })
})

describe('POST /api/vehicle-requests/assign-trip', () => {
  const company = { kind: 'Company', driverId: 3, vehicleId: 4 }

  it('is admin only', async () => {
    const res = await request(app)
      .post('/api/vehicle-requests/assign-trip')
      .set('Cookie', authCookie('Employee', 1))
      .send({ requestIds: [10, 11], ...company })
    expect(res.status).toBe(403)
    expect(vrRepo.assignTrip).not.toHaveBeenCalled()
  })

  it.each([[undefined], [[]], [['x']], [[0]], [Array.from({ length: 51 }, (_, i) => i + 1)]])(
    'rejects requestIds %j',
    async (requestIds) => {
      const res = await request(app)
        .post('/api/vehicle-requests/assign-trip')
        .set('Cookie', authCookie('Admin', 1))
        .send({ requestIds, ...company })
      expect(res.status).toBe(400)
      expect(vrRepo.assignTrip).not.toHaveBeenCalled()
    },
  )

  it('assigns one vehicle to every request of the trip (duplicates removed)', async () => {
    vrRepo.assignTrip.mockResolvedValue([row({ RequestID: 10 }), row({ RequestID: 11 })])
    const res = await request(app)
      .post('/api/vehicle-requests/assign-trip')
      .set('Cookie', authCookie('Admin', 7))
      .send({ requestIds: [10, 11, 10], ...company })
    expect(res.status).toBe(200)
    expect(res.body.requests.map((r) => r.id)).toEqual([10, 11])
    expect(vrRepo.assignTrip).toHaveBeenCalledWith({}, [10, 11], expect.objectContaining({ ...company, assignedByUserId: 7 }))
  })
})

describe('POST /api/vehicle-requests/combine and /uncombine', () => {
  it.each(['combine', 'uncombine'])('%s is admin only', async (action) => {
    const res = await request(app)
      .post(`/api/vehicle-requests/${action}`)
      .set('Cookie', authCookie('Employee', 1))
      .send({ requestIds: [10, 11] })
    expect(res.status).toBe(403)
    expect(vrRepo.combineTrip).not.toHaveBeenCalled()
    expect(vrRepo.uncombineRequests).not.toHaveBeenCalled()
  })

  it.each([[undefined], [[]], [['x']], [[0]], [Array.from({ length: 51 }, (_, i) => i + 1)]])('rejects requestIds %j', async (requestIds) => {
    const res = await request(app).post('/api/vehicle-requests/combine').set('Cookie', authCookie('Admin', 1)).send({ requestIds })
    expect(res.status).toBe(400)
    expect(vrRepo.combineTrip).not.toHaveBeenCalled()
  })

  it('combines the requests (duplicates removed) and returns them with the shared combinedTripId', async () => {
    vrRepo.combineTrip.mockResolvedValue([
      row({ RequestID: 10, CombinedTripID: 3, CombinedTripCode: 'OT-2026-0001' }),
      row({ RequestID: 11, CombinedTripID: 3, CombinedTripCode: 'OT-2026-0001' }),
    ])
    const res = await request(app)
      .post('/api/vehicle-requests/combine')
      .set('Cookie', authCookie('Admin', 7))
      .send({ requestIds: [10, 11, 10] })
    expect(res.status).toBe(200)
    expect(res.body.requests.map((r) => r.combinedTripId)).toEqual([3, 3])
    expect(res.body.requests.map((r) => r.combinedTripCode)).toEqual(['OT-2026-0001', 'OT-2026-0001'])
    expect(vrRepo.combineTrip).toHaveBeenCalledWith({}, [10, 11], 7)
  })

  it('returns 404 when a request does not exist', async () => {
    vrRepo.combineTrip.mockResolvedValue(null)
    const res = await request(app).post('/api/vehicle-requests/combine').set('Cookie', authCookie('Admin', 7)).send({ requestIds: [10] })
    expect(res.status).toBe(404)
  })

  it('uncombines the given requests', async () => {
    vrRepo.uncombineRequests.mockResolvedValue([row({ RequestID: 10, CombinedTripID: null })])
    const res = await request(app).post('/api/vehicle-requests/uncombine').set('Cookie', authCookie('Admin', 7)).send({ requestIds: [10] })
    expect(res.status).toBe(200)
    expect(res.body.requests[0].combinedTripId).toBeNull()
    expect(vrRepo.uncombineRequests).toHaveBeenCalledWith({}, [10])
  })
})

describe('POST /api/vehicle-requests/:id/assign', () => {
  const assign = (body, cookie = authCookie('Admin', 5)) =>
    request(app).post('/api/vehicle-requests/10/assign').set('Cookie', cookie).send(body)

  it('is admin only', async () => {
    const res = await assign({ kind: 'Company', driverId: 1, vehicleId: 1 }, authCookie())
    expect(res.status).toBe(403)
    expect(vrRepo.assign).not.toHaveBeenCalled()
  })

  it('assigns a company driver + company vehicle and returns the vehicle details', async () => {
    vrRepo.assign.mockResolvedValue(
      row({
        Status: 'Assigned',
        AssignedDriverID: 2,
        DriverName: 'สมชาย',
        DriverPhone: '081',
        AssignedVehicleID: 7,
        LicensePlate: 'ฮก 5555',
        AssignedVehicleType: 'Van',
        AssignedSeatCount: 12,
        AssignedVehicleDescription: 'Toyota Commuter สีขาว',
      }),
    )
    const res = await assign({ kind: 'Company', driverId: 2, vehicleId: 7 })

    expect(res.status).toBe(200)
    expect(vrRepo.assign.mock.calls[0][2]).toEqual({
      kind: 'Company',
      providerId: null,
      driverId: 2,
      vehicleId: 7,
      assignedByUserId: 5,
    })
    expect(res.body.request.driver).toMatchObject({
      kind: 'Company',
      name: 'สมชาย',
      phone: '081',
      provider: null,
      licensePlate: 'ฮก 5555',
      vehicle: { type: 'Van', seatCount: 12, description: 'Toyota Commuter สีขาว' },
    })
  })

  it('assigns by typing driver name/phone/plate (Manual) without any registered driver, vehicle or provider', async () => {
    vrRepo.assign.mockResolvedValue(
      row({ Status: 'Assigned', TripDriverName: 'สมศักดิ์', TripDriverPhone: '0811111111', LicensePlate: 'ทด 1234' }),
    )
    const res = await assign({ kind: 'Manual', tripDriverName: ' สมศักดิ์ ', tripDriverPhone: '0811111111', licensePlate: 'ทด 1234' })

    expect(res.status).toBe(200)
    expect(vrRepo.assign.mock.calls[0][2]).toMatchObject({
      kind: 'Manual',
      tripDriverName: 'สมศักดิ์',
      tripDriverPhone: '0811111111',
      licensePlate: 'ทด 1234',
      assignedByUserId: 5,
    })
    expect(res.body.request.driver).toMatchObject({
      kind: 'Manual',
      id: null,
      providerId: null,
      name: 'สมศักดิ์',
      phone: '0811111111',
      licensePlate: 'ทด 1234',
      provider: null,
    })
  })

  it.each([
    [{ kind: 'Manual', tripDriverPhone: '081', licensePlate: 'ทด 1' }],
    [{ kind: 'Manual', tripDriverName: 'ก', licensePlate: 'ทด 1' }],
    [{ kind: 'Manual', tripDriverName: 'ก', tripDriverPhone: '081' }],
    [{ kind: 'Manual', tripDriverName: 'ก', tripDriverPhone: '081', licensePlate: 'ทด 1', driverId: 2 }],
  ])('rejects an incomplete or mixed Manual assignment %j', async (body) => {
    const res = await assign(body)
    expect(res.status).toBe(400)
    expect(vrRepo.assign).not.toHaveBeenCalled()
  })

  it('assigns a rental company driver + vehicle and shows the rental company', async () => {
    vrRepo.assign.mockResolvedValue(
      row({
        Status: 'Assigned',
        ProviderID: 3,
        ProviderName: 'รถเช่าสมใจ',
        ProviderKind: 'Rental',
        ProviderPhone: '02-111-1111',
        AssignedDriverID: 9,
        DriverName: 'มานะ',
        AssignedVehicleID: 8,
        LicensePlate: '30-1234',
      }),
    )
    const res = await assign({ kind: 'Rental', providerId: 3, driverId: 9, vehicleId: 8 })
    expect(res.status).toBe(200)
    expect(res.body.request.driver).toMatchObject({
      kind: 'Rental',
      name: 'มานะ',
      provider: 'รถเช่าสมใจ',
      providerPhone: '02-111-1111',
      licensePlate: '30-1234',
    })
  })

  it('records the per-trip driver for an on-demand service (Grab)', async () => {
    vrRepo.assign.mockResolvedValue(
      row({
        Status: 'Assigned',
        ProviderID: 4,
        ProviderName: 'Grab',
        ProviderKind: 'OnDemand',
        LicensePlate: '1กข 999',
        TripDriverName: 'สมศักดิ์',
        TripDriverPhone: '081-000-0000',
      }),
    )
    const res = await assign({
      kind: 'OnDemand',
      providerId: 4,
      tripDriverName: ' สมศักดิ์ ',
      tripDriverPhone: '081-000-0000',
      licensePlate: '1กข 999',
    })

    expect(vrRepo.assign.mock.calls[0][2]).toMatchObject({ tripDriverName: 'สมศักดิ์', licensePlate: '1กข 999' })
    expect(res.body.request.driver).toMatchObject({
      kind: 'OnDemand',
      name: 'สมศักดิ์',
      phone: '081-000-0000',
      provider: 'Grab',
      providerPhone: null,
      vehicle: null,
    })
  })

  it('accepts a Thai plate with a long province name for on-demand trips', async () => {
    vrRepo.assign.mockResolvedValue(row({ Status: 'Assigned', ProviderID: 4, ProviderKind: 'OnDemand' }))
    const plate = '1กข 9999 พระนครศรีอยุธยา'
    const res = await assign({ kind: 'OnDemand', providerId: 4, tripDriverName: 'a', tripDriverPhone: 'b', licensePlate: plate })
    expect(res.status).toBe(200)
    expect(vrRepo.assign.mock.calls[0][2].licensePlate).toBe(plate)
  })

  it.each([
    ['DRIVER_SCHEDULE_CONFLICT'],
    ['VEHICLE_SCHEDULE_CONFLICT'],
  ])('surfaces %s as 409', async (code) => {
    vrRepo.assign.mockRejectedValue(new AppError(code, 409))
    const res = await assign({ kind: 'Company', driverId: 2, vehicleId: 7 })
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe(code)
  })

  it.each([
    ['an unknown kind', { kind: 'Truck', driverId: 1, vehicleId: 1 }],
    ['company without a vehicle', { kind: 'Company', driverId: 1 }],
    ['company without a driver', { kind: 'Company', vehicleId: 1 }],
    ['company with a provider', { kind: 'Company', driverId: 1, vehicleId: 1, providerId: 3 }],
    ['rental without a provider', { kind: 'Rental', driverId: 1, vehicleId: 1 }],
    ['a bad driverId', { kind: 'Company', driverId: 'x', vehicleId: 1 }],
    ['on-demand without a plate', { kind: 'OnDemand', providerId: 4, tripDriverName: 'a', tripDriverPhone: 'b' }],
    ['on-demand without the driver phone', { kind: 'OnDemand', providerId: 4, tripDriverName: 'a', licensePlate: 'x' }],
    ['on-demand without a provider', { kind: 'OnDemand', tripDriverName: 'a', tripDriverPhone: 'b', licensePlate: 'x' }],
    ['an over-long plate', { kind: 'OnDemand', providerId: 4, tripDriverName: 'a', tripDriverPhone: 'b', licensePlate: 'x'.repeat(51) }],
  ])('rejects %s', async (_label, body) => {
    const res = await assign(body)
    expect(res.status).toBe(400)
    expect(vrRepo.assign).not.toHaveBeenCalled()
  })
})

describe('/api/drivers', () => {
  it('is admin only', async () => {
    const res = await request(app).get('/api/drivers').set('Cookie', authCookie())
    expect(res.status).toBe(403)
  })

  it('creates a company driver (no provider) with a phone', async () => {
    driversRepo.create.mockImplementation(async (_pool, input) => ({ DriverID: 1, Name: input.name, Phone: input.phone, ProviderID: input.providerId, IsActive: true }))
    const res = await request(app).post('/api/drivers').set('Cookie', authCookie('Admin')).send({ name: ' สมชาย ', phone: ' 081 ' })
    expect(res.status).toBe(201)
    expect(driversRepo.create.mock.calls[0][1]).toEqual({ name: 'สมชาย', phone: '081', note: null, providerId: null })
  })

  it('stores a trimmed note saying which manager the driver serves', async () => {
    driversRepo.create.mockImplementation(async (_pool, input) => ({ DriverID: 1, Name: input.name, Note: input.note, ProviderID: input.providerId, IsActive: true }))
    const res = await request(app).post('/api/drivers').set('Cookie', authCookie('Admin')).send({ name: 'สมชาย', note: ' Mr. Tanaka ' })
    expect(res.status).toBe(201)
    expect(driversRepo.create.mock.calls.at(-1)[1].note).toBe('Mr. Tanaka')
    expect(res.body.driver.note).toBe('Mr. Tanaka')
  })

  it('only lets a driver belong to a rental company (not an on-demand service)', async () => {
    fleetRepo.findProvider.mockResolvedValueOnce({ ProviderID: 3, Kind: 'Rental' })
    driversRepo.create.mockImplementation(async (_pool, input) => ({ DriverID: 1, Name: input.name, ProviderID: input.providerId, IsActive: true }))
    const ok = await request(app).post('/api/drivers').set('Cookie', authCookie('Admin')).send({ name: 'มานะ', providerId: 3 })
    expect(ok.status).toBe(201)
    expect(driversRepo.create.mock.calls[0][1].providerId).toBe(3)

    fleetRepo.findProvider.mockResolvedValueOnce({ ProviderID: 4, Kind: 'OnDemand' })
    const bad = await request(app).post('/api/drivers').set('Cookie', authCookie('Admin')).send({ name: 'x', providerId: 4 })
    expect(bad.status).toBe(400)
  })

  it('marks busy drivers (company and rental) in the requested window', async () => {
    driversRepo.listAll.mockResolvedValue([
      { DriverID: 1, Name: 'A', ProviderID: null, IsActive: true },
      { DriverID: 2, Name: 'B', ProviderID: null, IsActive: true },
      { DriverID: 3, Name: 'C', ProviderID: 5, IsActive: true },
    ])
    vrRepo.listAssignments.mockResolvedValue([{ AssignedDriverID: 1 }, { AssignedDriverID: 3 }, { AssignedDriverID: null }])

    const res = await request(app)
      .get(`/api/drivers?busyFrom=${hoursFromNow(1)}&busyTo=${hoursFromNow(3)}&excludeRequestId=10`)
      .set('Cookie', authCookie('Admin'))

    expect(res.status).toBe(200)
    expect(res.body.drivers.map((d) => d.isBusy)).toEqual([true, false, true])
    expect(vrRepo.listAssignments.mock.calls[0][1].excludeRequestId).toBe(10)
  })

  it('serves /schedule rather than treating it as an id', async () => {
    vrRepo.listAssignments.mockResolvedValue([])
    const res = await request(app)
      .get(`/api/drivers/schedule?from=${hoursFromNow(0)}&to=${hoursFromNow(24 * 7)}`)
      .set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(200)
    expect(driversRepo.findById).not.toHaveBeenCalled()
  })

  it('deletes a driver only through the in-use check', async () => {
    deleteFleetItem.mockResolvedValue(true)
    const res = await request(app).delete('/api/drivers/1').set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(204)
    expect(deleteFleetItem).toHaveBeenCalledWith({}, 'driver', 1)
  })

  it('refuses to delete a driver that has history, and says why', async () => {
    deleteFleetItem.mockRejectedValue(new AppError('FLEET_ITEM_IN_USE', 409, { requests: 3, regularOf: [] }))
    const res = await request(app).delete('/api/drivers/1').set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ errorCode: 'FLEET_ITEM_IN_USE', details: { requests: 3, regularOf: [] } })
  })

  it('404s when the driver does not exist', async () => {
    deleteFleetItem.mockResolvedValue(false)
    const res = await request(app).delete('/api/drivers/9').set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(404)
  })

  it.each([['vehicles', 'vehicle'], ['providers', 'provider']])('DELETE /api/%s/:id uses the same in-use check', async (path, kind) => {
    deleteFleetItem.mockResolvedValue(true)
    const res = await request(app).delete(`/api/${path}/5`).set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(204)
    expect(deleteFleetItem).toHaveBeenCalledWith({}, kind, 5)
  })

  it('only admins may delete fleet items', async () => {
    const res = await request(app).delete('/api/vehicles/5').set('Cookie', authCookie('Employee'))
    expect(res.status).toBe(403)
    expect(deleteFleetItem).not.toHaveBeenCalled()
  })
})

describe('/api/providers', () => {
  it('stores a contact phone for a rental company but never for an on-demand service', async () => {
    fleetRepo.createProvider.mockImplementation(async (_pool, input) => ({ ProviderID: 1, Name: input.name, Kind: input.kind, Phone: input.phone, IsActive: true }))
    await request(app).post('/api/providers').set('Cookie', authCookie('Admin')).send({ name: 'รถเช่าสมใจ', kind: 'Rental', phone: '02-111' })
    await request(app).post('/api/providers').set('Cookie', authCookie('Admin')).send({ name: 'Grab', kind: 'OnDemand', phone: '1234' })
    expect(fleetRepo.createProvider.mock.calls[0][1].phone).toBe('02-111')
    expect(fleetRepo.createProvider.mock.calls[1][1].phone).toBeNull()
  })

  it('refuses to turn a rental company with registered drivers/vehicles into an on-demand service', async () => {
    fleetRepo.findProvider.mockResolvedValue({ ProviderID: 1, Kind: 'Rental' })
    fleetRepo.countProviderResources.mockResolvedValueOnce(2)
    const res = await request(app).put('/api/providers/1').set('Cookie', authCookie('Admin')).send({ name: 'x', kind: 'OnDemand' })
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('PROVIDER_HAS_RESOURCES')
    expect(fleetRepo.updateProvider).not.toHaveBeenCalled()
  })

  it('rejects an unknown kind', async () => {
    const res = await request(app).post('/api/providers').set('Cookie', authCookie('Admin')).send({ name: 'x', kind: 'Taxi' })
    expect(res.status).toBe(400)
  })
})

describe('/api/vehicles', () => {
  it('is admin only', async () => {
    const res = await request(app).get('/api/vehicles').set('Cookie', authCookie())
    expect(res.status).toBe(403)
  })

  it('creates a company vehicle with seats and description', async () => {
    fleetRepo.createVehicle.mockImplementation(async (_pool, input) => ({ VehicleID: 1, LicensePlate: input.licensePlate, VehicleType: input.vehicleType, SeatCount: input.seatCount, Description: input.description, ProviderID: input.providerId, IsActive: true }))
    const res = await request(app)
      .post('/api/vehicles')
      .set('Cookie', authCookie('Admin'))
      .send({ licensePlate: ' ฮก 5555 ชลบุรี ', vehicleType: 'Van', seatCount: '12', description: 'Commuter สีขาว' })
    expect(res.status).toBe(201)
    expect(fleetRepo.createVehicle.mock.calls[0][1]).toEqual({
      licensePlate: 'ฮก 5555 ชลบุรี',
      vehicleType: 'Van',
      seatCount: 12,
      description: 'Commuter สีขาว',
      providerId: null,
      routeId: null,
    })
  })

  it.each([
    ['a bus (only van/sedan)', { licensePlate: 'x', vehicleType: 'Bus' }],
    ['zero seats', { licensePlate: 'x', vehicleType: 'Van', seatCount: 0 }],
    ['no plate', { licensePlate: ' ', vehicleType: 'Van' }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).post('/api/vehicles').set('Cookie', authCookie('Admin')).send(body)
    expect(res.status).toBe(400)
    expect(fleetRepo.createVehicle).not.toHaveBeenCalled()
  })

  it('reports a duplicate licence plate as LICENSE_PLATE_TAKEN', async () => {
    fleetRepo.createVehicle.mockRejectedValue(Object.assign(new Error('dup'), { number: 2601 }))
    const res = await request(app).post('/api/vehicles').set('Cookie', authCookie('Admin')).send({ licensePlate: 'x', vehicleType: 'Van' })
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('LICENSE_PLATE_TAKEN')
  })

  it('marks busy vehicles in the requested window', async () => {
    fleetRepo.listVehicles.mockResolvedValue([
      { VehicleID: 1, LicensePlate: 'a', VehicleType: 'Van', IsActive: true },
      { VehicleID: 2, LicensePlate: 'b', VehicleType: 'Sedan', IsActive: true },
    ])
    vrRepo.listAssignments.mockResolvedValue([{ AssignedVehicleID: 2 }])
    const res = await request(app)
      .get(`/api/vehicles?busyFrom=${hoursFromNow(1)}&busyTo=${hoursFromNow(3)}`)
      .set('Cookie', authCookie('Admin'))
    expect(res.body.vehicles.map((v) => v.isBusy)).toEqual([false, true])
  })
})

describe('/api/routes - regular vehicles and drivers', () => {
  const routeRow = { RouteID: 3, ProviderID: 7, ProviderName: 'รถเช่าสมใจ', Name: 'ศรีราชา', Origin: 'ศรีราชา', Destination: 'โรงงาน', StopsJson: null, RunDays: '1111100', IsActive: true }
  const body = (vehicles) => ({ providerId: 7, name: 'ศรีราชา', origin: 'ศรีราชา', destination: 'โรงงาน', runDays: '1111100', vehicles })

  beforeEach(() => {
    fleetRepo.findProvider.mockResolvedValue({ ProviderID: 7, Kind: 'Rental' })
    fleetRepo.findShuttleRoute.mockResolvedValue(routeRow)
    fleetRepo.updateShuttleRoute.mockResolvedValue(routeRow)
    fleetRepo.findVehicle.mockImplementation(async (_pool, id) => ({ VehicleID: Number(id), ProviderID: Number(id) === 99 ? 8 : 7, IsActive: true }))
    driversRepo.findById.mockImplementation(async (_pool, id) => ({ DriverID: Number(id), ProviderID: 7, IsActive: true }))
  })

  it('saves each vehicle with its regular driver', async () => {
    const res = await request(app)
      .put('/api/routes/3')
      .set('Cookie', authCookie('Admin'))
      .send(body([{ vehicleId: 11, driverId: 21 }, { vehicleId: 12, driverId: null }]))
    expect(res.status).toBe(200)
    expect(fleetRepo.setRouteVehicles).toHaveBeenCalledWith(expect.anything(), 3, [
      { vehicleId: 11, driverId: 21 },
      { vehicleId: 12, driverId: null },
    ])
  })

  it('leaves the regular vehicles alone when the list is not sent', async () => {
    await request(app).put('/api/routes/3').set('Cookie', authCookie('Admin')).send(body(undefined))
    expect(fleetRepo.setRouteVehicles).not.toHaveBeenCalled()
  })

  it.each([
    ["a vehicle from another rental company", [{ vehicleId: 99, driverId: 21 }]],
    ['the same vehicle twice', [{ vehicleId: 11, driverId: 21 }, { vehicleId: 11, driverId: 22 }]],
    ['the same driver on two vehicles', [{ vehicleId: 11, driverId: 21 }, { vehicleId: 12, driverId: 21 }]],
  ])('rejects %s', async (_label, vehicles) => {
    const res = await request(app).put('/api/routes/3').set('Cookie', authCookie('Admin')).send(body(vehicles))
    expect(res.status).toBe(400)
    expect(fleetRepo.setRouteVehicles).not.toHaveBeenCalled()
  })

  it('rejects a driver from another rental company', async () => {
    driversRepo.findById.mockResolvedValueOnce({ DriverID: 21, ProviderID: 8, IsActive: true })
    const res = await request(app).put('/api/routes/3').set('Cookie', authCookie('Admin')).send(body([{ vehicleId: 11, driverId: 21 }]))
    expect(res.status).toBe(400)
  })

  it('shows regular drivers to everyone but their phone only to admins', async () => {
    fleetRepo.listShuttleRoutes.mockResolvedValue([routeRow])
    fleetRepo.listRouteVehicles.mockResolvedValue(
      new Map([[3, [{ RouteID: 3, VehicleID: 11, LicensePlate: '30-1234', VehicleType: 'Van', SeatCount: 15, IsActive: true, RegularDriverID: 21, DriverName: 'มานะ', DriverPhone: '086' }]]]),
    )
    const employee = await request(app).get('/api/routes').set('Cookie', authCookie('Employee'))
    expect(employee.body.routes[0].vehicles[0]).toMatchObject({ licensePlate: '30-1234', driverName: 'มานะ' })
    expect(employee.body.routes[0].vehicles[0]).not.toHaveProperty('driverPhone')

    const admin = await request(app).get('/api/routes').set('Cookie', authCookie('Admin'))
    expect(admin.body.routes[0].vehicles[0].driverPhone).toBe('086')
  })
})

describe('GET /api/passengers - pickup stops are scoped like the directory', () => {
  const rows = [5, 42].map((id) => ({ UserID: id, FullName: `u${id}`, RouteID: 3, RouteName: 'ศรีราชา', ProviderID: 7, PickupStop: 'x' }))

  it('shows non-admins only people in their main department', async () => {
    fleetRepo.listShuttlePassengers.mockResolvedValue(rows)
    const res = await request(app).get('/api/passengers').set('Cookie', authCookie('Employee', 1))
    expect(res.body.passengers.map((p) => p.userId)).toEqual([5])
  })

  it('shows admins everyone', async () => {
    fleetRepo.listShuttlePassengers.mockResolvedValue(rows)
    const res = await request(app).get('/api/passengers').set('Cookie', authCookie('Admin', 1))
    expect(res.body.passengers.map((p) => p.userId)).toEqual([5, 42])
  })
})

describe('emails on cancel / edit', () => {
  it('requester cancelling their own request notifies approver/admins; Admin cancelling does not use that email', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 1 }))
    vrRepo.cancel.mockResolvedValue(row({ Status: 'Cancelled', RequesterUserID: 1 }))
    await request(app).delete('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1))
    expect(notify.vehicleRequestCancelledByRequester).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    vrRepo.findById.mockResolvedValue(row({ Status: 'Assigned', RequesterUserID: 99 }))
    vrRepo.cancel.mockResolvedValue(row({ Status: 'Cancelled', RequesterUserID: 99 }))
    await request(app).delete('/api/vehicle-requests/10').set('Cookie', authCookie('Admin', 1))
    expect(notify.vehicleRequestCancelledByRequester).not.toHaveBeenCalled()
  })

  it('Admin editing someone else’s request notifies the requester; the owner editing does not', async () => {
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 99 }))
    vrRepo.update.mockResolvedValue(row())
    await request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Admin', 1)).send(validBody())
    expect(notify.vehicleRequestUpdatedByAdmin).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    vrRepo.findById.mockResolvedValue(row({ RequesterUserID: 1 }))
    vrRepo.update.mockResolvedValue(row())
    await request(app).put('/api/vehicle-requests/10').set('Cookie', authCookie('Employee', 1)).send(validBody())
    expect(notify.vehicleRequestUpdatedByAdmin).not.toHaveBeenCalled()
  })
})

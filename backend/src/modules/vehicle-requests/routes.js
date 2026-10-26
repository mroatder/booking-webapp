import express from 'express'
import { isValidPhone } from '../../utils/validation.js'
import { getPool } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import * as vehicleRequestsRepo from './repository.js'
import * as usersRepo from '../users/repository.js'
import { signaturePath, signatureContentType } from '../users/signature.js'
import { directoryScopeFor } from '../users/directoryScope.js'
import * as notify from '../notifications/service.js'
import { MAX_ATTACHMENTS, uploadAttachments, saveFiles, removeFiles, storedPath } from './attachments.js'

export const vehicleRequestsRouter = express.Router()

/**
 * ไม่ใช่ Admin เลือกผู้เดินทางได้เฉพาะคนในแผนกหลักของตัวเอง (กันยิง API ตรงข้ามฟอร์ม)
 * ตอนแก้ไข คนที่อยู่ในคำขออยู่แล้วเก็บไว้ได้ (เผื่อย้ายแผนก/ปิดบัญชีไปทีหลัง) - ตรวจเฉพาะคนที่เพิ่มใหม่
 */
async function assertPassengersInScope(pool, user, passengerIds, alreadyOnRequest = []) {
  const keep = new Set(alreadyOnRequest)
  const added = passengerIds.filter((id) => !keep.has(id))
  if (added.length === 0) return
  const scope = await directoryScopeFor(pool, user)
  if (!scope) return
  const allowed = new Set((await usersRepo.listDirectory(pool, scope)).map((u) => u.UserID))
  if (added.some((id) => !allowed.has(id))) throw new AppError(ErrorCodes.PASSENGER_OUT_OF_SCOPE, 400)
}

const MAX_ADVANCE_DAYS = 90
const MAX_ADVANCE_MS = MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000
const VEHICLE_TYPES = ['Van', 'Sedan']
const STATUSES = ['Pending', 'Assigned', 'Cancelled']
// รถไปงานนอก: ไป-กลับ / ไปอย่างเดียว / กลับอย่างเดียว (dev ยืนยัน 2026-09-29)
// ไปหรือกลับอย่างเดียวกรอกแค่เวลารับ - ระบบกันคนขับ/รถไว้ ONE_WAY_BLOCK_HOURS ชั่วโมง
export const TRIP_TYPES = ['RoundTrip', 'OneWay', 'ReturnOnly']
export const ONE_WAY_BLOCK_HOURS = 2

function toDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function trimmed(value, maxLength) {
  if (typeof value !== 'string') return ''
  const s = value.trim()
  return s.length <= maxLength ? s : ''
}

/**
 * ลิงก์แผนที่บังคับกรอก (dev ยืนยัน 2026-09-28) และรับเฉพาะ http/https
 * - กันลิงก์ javascript: ถูกเก็บแล้วไปแสดงเป็น <a href> ให้คนอื่นคลิก
 */
function parseMapLink(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol')
    return url.toString()
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
}

/**
 * จุดรับ/จุดส่งของงานนอก (dev ยืนยัน 2026-09-29): ติ๊ก "ที่บริษัท" = ชื่อสถานที่เป็น "บริษัท" ไม่ต้องแนบแผนที่
 * ไม่ติ๊ก = ต้องกรอกชื่อสถานที่ + ลิงก์แผนที่ของจุดนั้น - โอทีไม่มีแผนที่ (ใช้จุดจอดตามสายรถ)
 * multipart ส่ง boolean มาเป็นข้อความ 'true'
 */
export const COMPANY_LOCATION = 'บริษัท'

// ประตูที่ให้รถรับ/ส่ง (ไม่บังคับ) - ใช้เฉพาะเมื่อจุดนั้นเป็นบริษัท
export const MAX_GATE_LENGTH = 100
function parseGate(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim().length > MAX_GATE_LENGTH) throw new AppError(ErrorCodes.FIELD_TOO_LONG, 400, { field: 'gate', max: MAX_GATE_LENGTH })
  return value.trim() || null
}

function parseStop(body, prefix, isShuttle) {
  const location = trimmed(body?.[prefix === 'pickup' ? 'pickupLocation' : 'destination'], 300)
  if (isShuttle) return { location, mapLink: null, gate: null }
  const atCompany = body?.[`${prefix}AtCompany`] === true || body?.[`${prefix}AtCompany`] === 'true'
  if (atCompany) return { location: COMPANY_LOCATION, mapLink: null, gate: parseGate(body?.[`${prefix}Gate`]) }
  return { location, mapLink: parseMapLink(body?.[`${prefix}MapLink`]), gate: null }
}

/**
 * ทริปข้ามหลายวันได้ (REQUIREMENTS: dev ยืนยัน 2026-09-28) - เช็คแค่ว่าเวลากลับหลังเวลาออก
 * เวลาออกต้องไม่อยู่ในอดีต และไม่เกิน 90 วันล่วงหน้า (ใช้กฎเดียวกับการจองห้อง)
 */
/**
 * รายชื่อพนักงานที่เดินทาง (UserID) - ตอนสร้างคำขอส่งมาแบบ multipart จึงมาเป็นข้อความ JSON ('[5,7]')
 * ตอนแก้ไขส่งเป็น JSON body จึงเป็น array - รับได้ทั้งสองแบบ (เดิมรับแค่ array ทำให้รายชื่อหายตอนสร้าง)
 */
function parsePassengerIds(raw) {
  let list = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return []
    try {
      list = JSON.parse(raw)
    } catch {
      list = raw.split(',')
    }
  }
  if (list === undefined || list === null) return []
  if (!Array.isArray(list) || list.length > 100) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const ids = list.map(Number)
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return [...new Set(ids)]
}

const MAX_GUESTS = 100 // แขก/บุคคลภายนอกต่อคำขอ - กันค่าเพี้ยน (รถที่ใหญ่สุดก็ไม่ถึง)

function validateInput(body) {
  const contactPhone = trimmed(body?.contactPhone, 50)
  const departTime = toDate(body?.departTime)
  // โอทีใช้ช่วงเวลาที่ฟอร์มคำนวณให้เหมือนเดิม (ถือเป็นไป-กลับ)
  const tripType = body?.requestType === 'Shuttle' ? 'RoundTrip' : (body?.tripType ?? 'RoundTrip')
  // ไป/กลับอย่างเดียว: ไม่เชื่อเวลากลับจาก client - คำนวณเองเพื่อให้การกันคนขับซ้อนเวลาถูกต้องเสมอ
  const returnTime =
    tripType === 'RoundTrip' || !departTime
      ? toDate(body?.returnTime)
      : new Date(departTime.getTime() + ONE_WAY_BLOCK_HOURS * 60 * 60 * 1000)
  const isShuttle = body?.requestType === 'Shuttle'
  const pickup = parseStop(body, 'pickup', isShuttle)
  const dropoff = parseStop(body, 'destination', isShuttle)
  const pickupLocation = pickup.location
  const destination = dropoff.location
  const vehicleType = body?.vehicleType
  // passengerCount = จำนวนบุคคลภายนอก/แขก (ไม่นับพนักงานที่เลือกชื่อ) - ฟอร์มโอทีไม่มีช่องนี้ จึงเป็น 0 ได้
  const guestCount = body?.passengerCount === undefined || body?.passengerCount === '' ? 0 : Number(body.passengerCount)
  const requestType = body?.requestType
  const passengerIds = parsePassengerIds(body?.passengers)
  // เหตุผลการขอใช้รถ - บังคับสำหรับรถไปงานนอก (ช่อง Reason ในแบบฟอร์ม W-HR-009)
  const reason = requestType === 'Shuttle' ? null : trimmed(body?.reason, 500)

  if (
    !contactPhone ||
    !departTime ||
    !returnTime ||
    returnTime <= departTime ||
    !pickupLocation ||
    !destination ||
    !VEHICLE_TYPES.includes(vehicleType) ||
    !['BusinessTrip', 'Shuttle'].includes(requestType) ||
    !TRIP_TYPES.includes(tripType) ||
    !Number.isInteger(guestCount) ||
    guestCount < 0 ||
    guestCount + passengerIds.length < 1 ||
    (requestType === 'BusinessTrip' && !reason)
  ) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }

  if (!isValidPhone(contactPhone)) throw new AppError(ErrorCodes.PHONE_INVALID, 400)
  if (guestCount > MAX_GUESTS) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, { field: 'passengerCount', max: MAX_GUESTS })

  const now = Date.now()
  if (departTime.getTime() < now) throw new AppError(ErrorCodes.DATE_IN_PAST, 400)
  if (departTime.getTime() > now + MAX_ADVANCE_MS) throw new AppError(ErrorCodes.DATE_TOO_FAR_AHEAD, 400)

  return {
    contactPhone,
    departTime,
    returnTime,
    pickupLocation,
    destination,
    pickupMapLink: pickup.mapLink,
    pickupGate: pickup.gate,
    destinationGate: dropoff.gate,
    // คอลัมน์ MapLink เดิม = แผนที่ปลายทาง
    mapLink: dropoff.mapLink,
    vehicleType,
    requestType,
    tripType,
    // PassengerCount ในฐานข้อมูล = จำนวนผู้โดยสารทั้งหมด (แขก + พนักงาน) ตรงกับ "จำนวนรวมทั้งหมด" บนฟอร์ม
    // และใช้เทียบกับจำนวนที่นั่งตอนจัดรถ
    passengerCount: guestCount + passengerIds.length,
    passengers: passengerIds,
    reason,
  }
}

/**
 * ขั้นอนุมัติของรถไปงานนอก (dev+HR 2026-10-05) - รถโอทีไม่ต้องอนุมัติ
 * - ผู้ขอที่เป็นหัวหน้างาน (role Supervisor หรือมีระดับอนุมัติ) → อนุมัติอัตโนมัติ (ผู้อนุมัติ = ตัวเอง)
 * - คนอื่น: ต้องเลือกผู้อนุมัติ 1 คน จากผู้ที่มีระดับอนุมัติในแผนกหลักเดียวกัน (อนุมัติคนเดียวจบ)
 */
async function resolveApproval(pool, user, requestType, rawApproverId) {
  if (requestType !== 'BusinessTrip') return { status: 'NotRequired' }
  const me = await usersRepo.findById(pool, user.id)
  if (me?.ApprovalLevel || me?.Role === 'Supervisor') {
    return { status: 'Approved', approverId: user.id, approvedAt: new Date(), auto: true }
  }
  const approverId = Number(rawApproverId)
  if (!Number.isInteger(approverId) || approverId <= 0) throw new AppError(ErrorCodes.APPROVER_REQUIRED, 400)
  const approvers = await usersRepo.listApprovers(pool, await directoryScopeFor(pool, user))
  if (approverId === user.id || !approvers.some((a) => a.UserID === approverId)) {
    throw new AppError(ErrorCodes.APPROVER_INVALID, 400)
  }
  return { status: 'Pending', approverId }
}

/**
 * ข้อมูลรถที่จัดให้ (null = ยังไม่จัด) - kind: Company | Rental | OnDemand | Manual (พิมพ์เอง ไม่ผูกกับรายชื่อในระบบ)
 * name/phone = คนที่ขับจริง (คนขับที่ลงทะเบียน หรือที่กรอกรายทริปสำหรับเรียกรถออนไลน์/พิมพ์เอง)
 * provider = ชื่อบริษัทรถเช่า/บริการเรียกรถ (รถบริษัทเป็น null), licensePlate = ทะเบียน ณ ตอนจัด
 */
function toPublicAssignment(row) {
  if (!row.AssignedDriverID && !row.ProviderID && !row.TripDriverName) return null
  const kind = !row.ProviderID ? (row.AssignedDriverID ? 'Company' : 'Manual') : row.ProviderKind === 'Rental' ? 'Rental' : 'OnDemand'
  const typedByAdmin = kind === 'OnDemand' || kind === 'Manual'
  return {
    kind,
    id: row.AssignedDriverID ?? null,
    providerId: row.ProviderID ?? null,
    vehicleId: row.AssignedVehicleID ?? null,
    name: typedByAdmin ? row.TripDriverName : row.DriverName,
    phone: typedByAdmin ? row.TripDriverPhone : row.DriverPhone,
    provider: row.ProviderName ?? null,
    providerPhone: kind === 'Rental' ? (row.ProviderPhone ?? null) : null,
    licensePlate: row.LicensePlate,
    vehicle: row.AssignedVehicleID
      ? {
          type: row.AssignedVehicleType,
          seatCount: row.AssignedSeatCount,
          description: row.AssignedVehicleDescription,
        }
      : null,
  }
}

function toPublicAttachment(a) {
  return { id: a.AttachmentID, name: a.OriginalName, contentType: a.ContentType, size: a.SizeBytes }
}

export function toPublicVehicleRequest(row, attachments = [], passengers = []) {
  return {
    id: row.RequestID,
    requestNo: row.RequestNo, // เลขที่เอกสาร VR-ปี-ลำดับ (แสดงผล) - id ยังใช้อ้างอิงใน API
    requesterUserId: row.RequesterUserID,
    requesterName: row.RequesterName,
    requesterNameTh: row.RequesterNameTh ?? null,
    requesterDepartment: row.RequesterDepartment,
    contactPhone: row.ContactPhone,
    departTime: row.DepartTime,
    returnTime: row.ReturnTime,
    pickupLocation: row.PickupLocation,
    destination: row.Destination,
    pickupMapLink: row.PickupMapLink ?? null,
    pickupGate: row.PickupGate ?? null,
    destinationGate: row.DestinationGate ?? null,
    destinationMapLink: row.MapLink || null,
    pickupAtCompany: row.RequestType !== 'Shuttle' && row.PickupLocation === COMPANY_LOCATION && !row.PickupMapLink,
    destinationAtCompany: row.RequestType !== 'Shuttle' && row.Destination === COMPANY_LOCATION && !row.MapLink,
    vehicleType: row.VehicleType,
    requestType: row.RequestType,
    tripType: row.TripType ?? 'RoundTrip',
    passengerCount: row.PassengerCount,
    reason: row.Reason ?? null,
    status: row.Status,
    // NotRequired | Pending | Approved | Rejected (migration 028)
    approvalStatus: row.ApprovalStatus ?? 'NotRequired',
    combinedTripId: row.CombinedTripID ?? null, // รถโอที: อยู่ในสายรวมกลุ่มไหน (ว่าง = ไม่ได้รวม)
    combinedTripCode: row.CombinedTripCode ?? null, // เลขที่สายรวม OT-ปี-ลำดับ
    approver: row.ApproverUserID
      ? {
          id: row.ApproverUserID,
          name: row.ApproverName,
          nameTh: row.ApproverNameTh ?? null,
          level: row.ApproverLevel ?? null,
          hasSignature: Boolean(row.ApproverHasSignature),
        }
      : null,
    approvedAt: row.ApprovedAt ?? null,
    approvalNote: row.ApprovalNote ?? null,
    driver: toPublicAssignment(row),
    assignedByName: row.AssignedByName ?? null,
    assignedAt: row.AssignedAt,
    createdAt: row.CreatedAt,
    attachments: attachments.map(toPublicAttachment),
    passengers: passengers,
  }
}

async function present(pool, rows) {
  const reqIds = rows.map((r) => r.RequestID)
  const [map, passMap] = await Promise.all([
    vehicleRequestsRepo.listAttachments(pool, reqIds),
    vehicleRequestsRepo.listPassengers(pool, reqIds)
  ])
  return rows.map((r) => toPublicVehicleRequest(r, map.get(r.RequestID) ?? [], passMap.get(r.RequestID) ?? []))
}

async function presentOne(pool, row) {
  return (await present(pool, [row]))[0]
}

function isAdmin(req) {
  return req.user.role === 'Admin'
}

// สิทธิ์แก้ไขรายละเอียด/ไฟล์แนบ/ยกเลิก: เจ้าของได้เฉพาะ Pending, Admin ได้จนกว่าจะถูกยกเลิก
function editableStatuses(req) {
  return isAdmin(req) ? ['Pending', 'Assigned'] : ['Pending']
}

async function loadVisible(req, pool) {
  const row = await vehicleRequestsRepo.findById(pool, req.params.id)
  if (!row) throw new AppError(ErrorCodes.NOT_FOUND, 404)
  if (!isAdmin(req) && row.RequesterUserID !== req.user.id && row.ApproverUserID !== req.user.id) {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)
  }
  return row
}

// สิทธิ์แก้ไข/ยกเลิก/จัดการไฟล์แนบ: เจ้าของคำขอหรือ Admin เท่านั้น - ผู้อนุมัติที่ถูกเลือก "ดู อนุมัติ และไม่อนุมัติ" ได้อย่างเดียว (loadVisible)
async function loadOwned(req, pool) {
  const row = await loadVisible(req, pool)
  if (!isAdmin(req) && row.RequesterUserID !== req.user.id) throw new AppError(ErrorCodes.AUTH_FORBIDDEN, 403)
  return row
}

vehicleRequestsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined
    if (status && !STATUSES.includes(status)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)

    // ?approvals=mine → คำขอที่ฉันเป็นผู้อนุมัติ (หน้ารออนุมัติ)
    const asApprover = req.query.approvals === 'mine'
    const onlyMine = !asApprover && (req.query.mine === 'true' || !isAdmin(req))
    const pool = await getPool()
    const rows = await vehicleRequestsRepo.list(pool, {
      userId: onlyMine ? req.user.id : undefined,
      approverId: asApprover ? req.user.id : undefined,
      status,
      from: toDate(req.query.from),
      to: toDate(req.query.to),
    })
    res.json({ requests: await present(pool, rows) })
  } catch (err) {
    next(err)
  }
})

// multipart/form-data: ฟิลด์ของคำขอ + `files` (แบบฟอร์มขอรถ 1-5 ไฟล์ บังคับแนบ)
vehicleRequestsRouter.post('/', requireAuth, uploadAttachments, async (req, res, next) => {
  let saved = []
  try {
    const input = validateInput(req.body)
    // ไม่บังคับแนบแบบฟอร์มขอรถแล้ว - ใช้ PDF W-HR-009 ที่ระบบสร้าง + การอนุมัติในระบบแทน (dev+HR 2026-10-05)
    const files = req.files ?? []

    const pool = await getPool()
    await assertPassengersInScope(pool, req.user, input.passengers)
    input.approval = await resolveApproval(pool, req.user, input.requestType, req.body?.approverUserId)
    saved = await saveFiles(files)
    const row = await vehicleRequestsRepo.create(pool, req.user.id, input, saved)
    const request = await presentOne(pool, row)
    notify.vehicleRequestSubmitted(request)
    res.status(201).json({ request })
  } catch (err) {
    await removeFiles(saved.map((f) => f.storedName))
    next(err)
  }
})

vehicleRequestsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const row = await loadVisible(req, pool)
    res.json({ request: await presentOne(pool, row) })
  } catch (err) {
    next(err)
  }
})

vehicleRequestsRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    const existing = await loadOwned(req, pool)
    // ประเภทคำขอ (รถนอก/โอที) เปลี่ยนไม่ได้หลังสร้าง - กันเปลี่ยนเป็นโอทีเพื่อเลี่ยงกฎบังคับแนบไฟล์/แผนที่
    if (req.body?.requestType !== undefined && req.body.requestType !== existing.RequestType) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    const input = validateInput({ ...req.body, requestType: existing.RequestType })
    const current = (await vehicleRequestsRepo.listPassengers(pool, [existing.RequestID])).get(existing.RequestID) ?? []
    await assertPassengersInScope(pool, req.user, input.passengers, current.map((p) => p.id))
    // ผู้ขอแก้ไขคำขอรถนอก (รวมแก้หลังถูกไม่อนุมัติ) → ส่งให้ผู้อนุมัติพิจารณาใหม่ - Admin แก้ = คงผลอนุมัติเดิม
    const byRequester = existing.RequesterUserID === req.user.id
    if (byRequester && existing.RequestType === 'BusinessTrip') {
      input.approval = await resolveApproval(pool, req.user, 'BusinessTrip', req.body?.approverUserId ?? existing.ApproverUserID)
    }
    const row = await vehicleRequestsRepo.update(pool, req.params.id, input, {
      allowedStatuses: editableStatuses(req),
    })
    if (!row) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const request = await presentOne(pool, row)
    if (input.approval?.status === 'Pending') notify.vehicleApprovalRequested(request)
    if (!byRequester) notify.vehicleRequestUpdatedByAdmin(request)
    res.json({ request })
  } catch (err) {
    next(err)
  }
})

// เปิด/ดาวน์โหลดไฟล์แนบ - เจ้าของคำขอหรือ Admin เท่านั้น (ไม่มี URL สาธารณะ)
vehicleRequestsRouter.get('/:id/attachments/:attachmentId', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    await loadVisible(req, pool)
    const attachment = await vehicleRequestsRepo.findAttachment(pool, req.params.id, req.params.attachmentId)
    if (!attachment) throw new AppError(ErrorCodes.NOT_FOUND, 404)

    res.set({
      'Content-Type': attachment.ContentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.OriginalName)}`,
      'Cache-Control': 'private, no-store',
      // CSP ปกติของแอปมี object-src 'none' ซึ่งทำให้ตัวแสดง PDF ของ browser ไม่ทำงาน (หน้าขาว)
      // ไฟล์นี้ตรวจแล้วว่าเป็น PDF/JPG/PNG จริง + nosniff จึงเปิดแค่ object/img ของ origin ตัวเอง ที่เหลือปิดหมด
      'Content-Security-Policy': "default-src 'none'; object-src 'self'; img-src 'self'; style-src 'unsafe-inline'",
    })
    res.sendFile(storedPath(attachment.StoredName), (err) => {
      if (err && !res.headersSent) next(new AppError(ErrorCodes.NOT_FOUND, 404))
    })
  } catch (err) {
    next(err)
  }
})

vehicleRequestsRouter.post('/:id/attachments', requireAuth, uploadAttachments, async (req, res, next) => {
  let saved = []
  try {
    const pool = await getPool()
    await loadOwned(req, pool)
    const files = req.files ?? []
    if (files.length === 0) throw new AppError(ErrorCodes.ATTACHMENT_REQUIRED, 400)

    saved = await saveFiles(files)
    const found = await vehicleRequestsRepo.addAttachments(pool, req.params.id, req.user.id, saved, {
      allowedStatuses: editableStatuses(req),
      max: MAX_ATTACHMENTS,
    })
    if (!found) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.status(201).json({ request: await presentOne(pool, await vehicleRequestsRepo.findById(pool, req.params.id)) })
  } catch (err) {
    await removeFiles(saved.map((f) => f.storedName))
    next(err)
  }
})

vehicleRequestsRouter.delete('/:id/attachments/:attachmentId', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    await loadOwned(req, pool)
    const storedName = await vehicleRequestsRepo.removeAttachment(pool, req.params.id, req.params.attachmentId, {
      allowedStatuses: editableStatuses(req),
    })
    if (!storedName) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    await removeFiles([storedName])
    res.json({ request: await presentOne(pool, await vehicleRequestsRepo.findById(pool, req.params.id)) })
  } catch (err) {
    next(err)
  }
})

// หลังจัดคนขับแล้ว ยกเลิกได้เฉพาะ Admin (dev ยืนยัน 2026-09-28: คนขับภายนอกนัดกันนอกระบบ
// ถ้าพนักงานยกเลิกเอง Admin/คนขับจะไม่รู้) - พนักงานยกเลิกเองได้แค่ตอน Pending
vehicleRequestsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    await loadOwned(req, pool)
    const row = await vehicleRequestsRepo.cancel(pool, req.params.id, {
      allowedStatuses: editableStatuses(req),
    })
    if (!row) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const request = await presentOne(pool, row)
    const byAdmin = req.user.id !== row.RequesterUserID
    notify.vehicleRequestCancelled(request, { byAdmin })
    if (!byAdmin) notify.vehicleRequestCancelledByRequester(request)
    res.json({ request })
  } catch (err) {
    next(err)
  }
})

/** รูปลายเซ็นของผู้อนุมัติ ณ ตอนอนุมัติคำขอนี้ (ไม่เปลี่ยนตามลายเซ็นปัจจุบัน) - ผู้เกี่ยวข้องกับคำขอเท่านั้น */
vehicleRequestsRouter.get('/:id/approver-signature', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    await loadVisible(req, pool)
    const name = await vehicleRequestsRepo.findApproverSignatureFile(pool, req.params.id)
    if (!name) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.set({ 'Content-Type': signatureContentType(name), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    res.sendFile(signaturePath(name), (err) => {
      if (err && !res.headersSent) next(new AppError(ErrorCodes.NOT_FOUND, 404))
    })
  } catch (err) {
    next(err)
  }
})

/** ผู้อนุมัติที่ถูกเลือกไว้กดอนุมัติ - แจ้งผู้ขอ และส่งต่อให้ Admin จัดรถ */
vehicleRequestsRouter.post('/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPool()
    await loadVisible(req, pool)
    // อนุมัติต้องมีลายเซ็น/ตราของผู้อนุมัติ - ไม่งั้นช่อง Approved by ในแบบฟอร์ม W-HR-009 จะว่าง
    const me = await usersRepo.findById(pool, req.user.id)
    if (!me?.SignatureFile) throw new AppError(ErrorCodes.APPROVER_SIGNATURE_REQUIRED, 409)
    const row = await vehicleRequestsRepo.decideApproval(pool, req.params.id, req.user.id, { approve: true })
    if (!row) throw new AppError(ErrorCodes.APPROVAL_NOT_ALLOWED, 409)
    const request = await presentOne(pool, row)
    notify.vehicleApproved(request)
    res.json({ request })
  } catch (err) {
    next(err)
  }
})

/** ไม่อนุมัติ - ต้องระบุเหตุผล ผู้ขอแก้ไขแล้วส่งใหม่ได้ */
vehicleRequestsRouter.post('/:id/reject', requireAuth, async (req, res, next) => {
  try {
    const note = trimmed(req.body?.note, 500)
    if (!note) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const pool = await getPool()
    await loadVisible(req, pool)
    const row = await vehicleRequestsRepo.decideApproval(pool, req.params.id, req.user.id, { approve: false, note })
    if (!row) throw new AppError(ErrorCodes.APPROVAL_NOT_ALLOWED, 409)
    const request = await presentOne(pool, row)
    notify.vehicleRejected(request)
    res.json({ request })
  } catch (err) {
    next(err)
  }
})

function optionalId(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return n
}

/**
 * body: { kind: 'Company' | 'Rental' | 'OnDemand', driverId?, vehicleId?, providerId?,
 *         tripDriverName?, tripDriverPhone?, licensePlate? } - ฟิลด์ที่ต้องมีขึ้นกับ kind
 */
function validateAssignInput(body) {
  const kind = body?.kind
  if (!vehicleRequestsRepo.ASSIGNMENT_KINDS.includes(kind)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const input = {
    kind,
    providerId: optionalId(body.providerId),
    driverId: optionalId(body.driverId),
    vehicleId: optionalId(body.vehicleId),
  }
  if (kind === 'Manual') {
    Object.assign(input, {
      licensePlate: trimmed(body.licensePlate, 50),
      tripDriverName: trimmed(body.tripDriverName, 200),
      tripDriverPhone: trimmed(body.tripDriverPhone, 50),
    })
    if (!input.licensePlate || !input.tripDriverName || !input.tripDriverPhone || input.providerId || input.driverId || input.vehicleId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
  } else if (kind === 'OnDemand') {
    Object.assign(input, {
      licensePlate: trimmed(body.licensePlate, 50),
      tripDriverName: trimmed(body.tripDriverName, 200),
      tripDriverPhone: trimmed(body.tripDriverPhone, 50),
    })
    if (!input.providerId || !input.licensePlate || !input.tripDriverName || !input.tripDriverPhone) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
  } else if (!input.driverId || !input.vehicleId || (kind === 'Rental') !== Boolean(input.providerId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  }
  return input
}

/**
 * จัดรถคันเดียวให้ทุกคำขอในเที่ยวโอทีเดียวกัน (มุมมองรวมตามสาย) - body: { requestIds: [..], ...เหมือน /:id/assign }
 * ทุกคำขอต้องเป็นโอทีเวลา/ประเภทเที่ยวเดียวกัน ทำทั้งหมดหรือไม่ทำเลย
 */
vehicleRequestsRouter.post('/assign-trip', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const raw = req.body?.requestIds
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const requestIds = [...new Set(raw.map(optionalId))]
    if (requestIds.includes(null)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    const input = validateAssignInput(req.body)
    const pool = await getPool()
    const rows = await vehicleRequestsRepo.assignTrip(pool, requestIds, { ...input, assignedByUserId: req.user.id })
    if (!rows) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const requests = await present(pool, rows)
    notify.vehicleAssigned(requests)
    res.json({ requests })
  } catch (err) {
    next(err)
  }
})

function parseRequestIds(body) {
  const raw = body?.requestIds
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  const ids = [...new Set(raw.map(optionalId))]
  if (ids.includes(null)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
  return ids
}

/** รวมคำขอโอทีเที่ยวเดียวกันจากหลายสายเป็นสายรวม (ไม่ส่งอีเมล - อีเมลส่งตอนจัดรถ) - Admin เท่านั้น */
vehicleRequestsRouter.post('/combine', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await vehicleRequestsRepo.combineTrip(pool, parseRequestIds(req.body), req.user.id)
    if (!rows) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.json({ requests: await present(pool, rows) })
  } catch (err) {
    next(err)
  }
})

vehicleRequestsRouter.post('/uncombine', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const pool = await getPool()
    const rows = await vehicleRequestsRepo.uncombineRequests(pool, parseRequestIds(req.body))
    if (!rows) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    res.json({ requests: await present(pool, rows) })
  } catch (err) {
    next(err)
  }
})

vehicleRequestsRouter.post('/:id/assign', requireAuth, requireRole('Admin'), async (req, res, next) => {
  try {
    const input = validateAssignInput(req.body)
    const pool = await getPool()
    const row = await vehicleRequestsRepo.assign(pool, req.params.id, { ...input, assignedByUserId: req.user.id })
    if (!row) throw new AppError(ErrorCodes.NOT_FOUND, 404)
    const request = await presentOne(pool, row)
    notify.vehicleAssigned([request])
    res.json({ request })
  } catch (err) {
    next(err)
  }
})

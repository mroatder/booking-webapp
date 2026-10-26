import { sql } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

// การจัดรถ 3 แบบ (migration 013): รถบริษัท / รถเช่า = คนขับ + รถที่ลงทะเบียน, เรียกรถออนไลน์ = กรอกรายทริป
const BASE_SELECT = `
  -- ประวัติอ่านจากสำเนา Snap* ที่บันทึกตอนเกิดเหตุการณ์ (migration 045) - แก้ข้อมูลหลักภายหลังต้องไม่กระทบคำขอเก่า
  -- ตัดสินจาก "เหตุการณ์เกิดแล้วหรือยัง" (ส่งคำขอ / ตัดสินอนุมัติ / จัดรถ) ไม่ใช่จากค่าว่าง - สำเนาที่เป็น NULL ก็คือ NULL ณ ตอนนั้น
  SELECT vr.*,
         CASE WHEN vr.SnapRequesterName IS NOT NULL THEN vr.SnapRequesterName ELSE u.FullName END AS RequesterName,
         CASE WHEN vr.SnapRequesterName IS NOT NULL THEN vr.SnapRequesterNameTh ELSE u.FullNameTh END AS RequesterNameTh,
         CASE WHEN vr.SnapRequesterName IS NOT NULL THEN vr.SnapRequesterDepartment ELSE ud.Name END AS RequesterDepartment,
         CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapDriverName ELSE d.Name END AS DriverName,
         CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapDriverPhone ELSE d.Phone END AS DriverPhone,
         CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapProviderName ELSE p.Name END AS ProviderName, p.Kind AS ProviderKind,
         CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapProviderPhone ELSE p.Phone END AS ProviderPhone,
         CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapVehicleType ELSE v.VehicleType END AS AssignedVehicleType,
         CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapSeatCount ELSE v.SeatCount END AS AssignedSeatCount,
         CASE WHEN vr.AssignedAt IS NOT NULL THEN vr.SnapVehicleDescription ELSE v.Description END AS AssignedVehicleDescription,
         ab.FullName AS AssignedByName,
         CASE WHEN vr.ApprovalStatus IN ('Approved', 'Rejected') THEN vr.SnapApproverName ELSE ap.FullName END AS ApproverName,
         CASE WHEN vr.ApprovalStatus IN ('Approved', 'Rejected') THEN vr.SnapApproverNameTh ELSE ap.FullNameTh END AS ApproverNameTh,
         CASE WHEN vr.ApprovalStatus IN ('Approved', 'Rejected') THEN vr.SnapApproverLevel ELSE ap.ApprovalLevel END AS ApproverLevel,
         CASE WHEN (CASE WHEN vr.ApprovalStatus IN ('Approved', 'Rejected') THEN vr.SnapApproverSignatureFile ELSE ap.SignatureFile END) IS NULL
              THEN 0 ELSE 1 END AS ApproverHasSignature,
         ct.Code AS CombinedTripCode
  FROM VehicleRequests vr
  JOIN Users u ON u.UserID = vr.RequesterUserID
  LEFT JOIN Departments ud ON ud.DepartmentID = u.DepartmentID -- migration 018 ย้ายแผนกไปตาราง Departments
  LEFT JOIN Drivers d ON d.DriverID = vr.AssignedDriverID
  LEFT JOIN Providers p ON p.ProviderID = vr.ProviderID
  LEFT JOIN Vehicles v ON v.VehicleID = vr.AssignedVehicleID
  LEFT JOIN Users ab ON ab.UserID = vr.AssignedByUserID
  LEFT JOIN Users ap ON ap.UserID = vr.ApproverUserID
  LEFT JOIN ShuttleCombinedTrips ct ON ct.CombinedTripID = vr.CombinedTripID
`

export const ASSIGNMENT_KINDS = ['Company', 'Rental', 'OnDemand', 'Manual']

/**
 * เที่ยวรถโอทีเดียวกัน = คำขอโอทีที่เวลาออก/กลับ และจุดรับ/ปลายทาง (ประเภทเที่ยว เช้า/เย็น/วันหยุด) ตรงกันทุกอย่าง
 * ต่างคนต่างขอแต่ขึ้นรถคันเดียวกันได้ จึงไม่นับเป็นงานชน (dev ยืนยัน 2026-09-29) - เวลาต่างกันแม้ 15 นาทีถือเป็นคนละเที่ยว
 * `trip` = { pickupLocation, destination } ของคำขอที่กำลังจัด (null = ไม่ใช่โอที → เช็คชนทุกงานตามปกติ)
 */
function sameShuttleTripClause(alias = '') {
  return `NOT (@shareTrip = 1 AND ${alias}RequestType = 'Shuttle' AND ${alias}DepartTime = @departTime
             AND ${alias}ReturnTime = @returnTime AND ${alias}PickupLocation = @tripPickup AND ${alias}Destination = @tripDestination)`
}

function bindTrip(req, trip) {
  return req
    .input('shareTrip', sql.Bit, trip ? 1 : 0)
    .input('tripPickup', sql.NVarChar(300), trip?.pickupLocation ?? null)
    .input('tripDestination', sql.NVarChar(300), trip?.destination ?? null)
}

/** เที่ยวที่ใช้รถร่วมกันได้ของคำขอนี้ (โอทีเท่านั้น) */
function shuttleTripOf(row) {
  return row.RequestType === 'Shuttle' || row.requestType === 'Shuttle'
    ? { pickupLocation: row.PickupLocation ?? row.pickupLocation, destination: row.Destination ?? row.destination }
    : null
}

/**
 * กันชน: คนขับ/รถที่ลงทะเบียนต้องไม่มีงาน Assigned อื่นทับช่วงเวลา - ล็อกด้วย UPDLOCK+HOLDLOCK
 * ใน transaction เดียวกับการ UPDATE (หลักการเดียวกับกันจองห้องชน ARCHITECTURE.md § 5)
 * เรียกรถออนไลน์ (Grab) ไม่มีคนขับ/รถในระบบจึงไม่เช็ค - คำขอโอทีเที่ยวเดียวกันใช้คนขับ/รถร่วมกันได้
 */
async function assertFree(transaction, column, id, errorCode, { departTime, returnTime, excludeRequestId, trip }) {
  const conflict = await bindTrip(
    transaction
      .request()
      .input('id', sql.Int, id)
      .input('departTime', sql.DateTime2, departTime)
      .input('returnTime', sql.DateTime2, returnTime)
      .input('excludeId', sql.Int, excludeRequestId),
    trip,
  ).query(
    `SELECT TOP 1 RequestID, DepartTime, ReturnTime FROM VehicleRequests WITH (UPDLOCK, HOLDLOCK)
     WHERE ${column} = @id AND Status = 'Assigned' AND RequestID <> @excludeId
       AND DepartTime < @returnTime AND ReturnTime > @departTime
       AND ${sameShuttleTripClause()}`,
  )

  const hit = conflict.recordset[0]
  if (hit) {
    throw new AppError(errorCode, 409, {
      requestId: hit.RequestID,
      departTime: hit.DepartTime,
      returnTime: hit.ReturnTime,
    })
  }
}

async function assertResourcesFree(transaction, { driverId, vehicleId, ...window }) {
  if (driverId) await assertFree(transaction, 'AssignedDriverID', driverId, ErrorCodes.DRIVER_SCHEDULE_CONFLICT, window)
  if (vehicleId) await assertFree(transaction, 'AssignedVehicleID', vehicleId, ErrorCodes.VEHICLE_SCHEDULE_CONFLICT, window)
}

/**
 * พนักงานคนเดียวต้องไม่มีชื่อในคำขอรถอื่น (ที่ยังไม่ยกเลิก) ที่เวลาทับกัน - ไปสองที่พร้อมกันไม่ได้
 * กันกรณีต่างคนต่างขอให้คนเดียวกัน (เลือกผู้โดยสารได้ทั้งแผนกหลัก) จนชื่อซ้ำในใบรายชื่อและนับที่นั่งเกิน (dev ยืนยัน 2026-09-29)
 */
async function assertPassengersFree(transaction, userIds, { departTime, returnTime, excludeRequestId }) {
  if (!userIds || userIds.length === 0) return
  const req = transaction
    .request()
    .input('departTime', sql.DateTime2, departTime)
    .input('returnTime', sql.DateTime2, returnTime)
    .input('excludeId', sql.Int, excludeRequestId ?? 0)
  const params = userIds.map((uid, i) => {
    req.input(`u${i}`, sql.Int, uid)
    return `@u${i}`
  })
  const result = await req.query(
    `SELECT TOP 1 vp.UserID, u.FullName, vr.RequestID, vr.RequestNo, vr.DepartTime, vr.ReturnTime
     FROM VehicleRequestPassengers vp WITH (UPDLOCK, HOLDLOCK)
     JOIN VehicleRequests vr ON vr.RequestID = vp.RequestID
     JOIN Users u ON u.UserID = vp.UserID
     WHERE vp.UserID IN (${params.join(', ')}) AND vr.Status <> 'Cancelled' AND vr.RequestID <> @excludeId
       AND vr.DepartTime < @returnTime AND vr.ReturnTime > @departTime
     ORDER BY vr.DepartTime`,
  )
  const hit = result.recordset[0]
  if (hit) {
    throw new AppError(ErrorCodes.PASSENGER_DOUBLE_BOOKED, 409, {
      userId: hit.UserID,
      fullName: hit.FullName,
      requestId: hit.RequestID,
      requestNo: hit.RequestNo,
      departTime: hit.DepartTime,
      returnTime: hit.ReturnTime,
    })
  }
}

/**
 * ล็อกระดับแอป (sp_getapplock) ให้การจัดรถ/แก้เวลาคำขอทำทีละรายการ - เช็คชนทั้งคนขับและรถ
 * ต้องล็อก 2 ช่วงของ index แล้วเขียนแถวลง index เดิม ถ้าให้หลาย transaction ทำพร้อมกันจะ deadlock
 * กันเอง (เจอจริงใน integration test) งานพวกนี้เป็นงาน Admin ไม่บ่อย การรอคิวกันจึงไม่กระทบอะไร
 */
async function lockFleetAssignments(transaction) {
  const result = await transaction.request().query(
    `DECLARE @r INT
     EXEC @r = sp_getapplock @Resource = 'vehicle-request-assignment', @LockMode = 'Exclusive',
                             @LockOwner = 'Transaction', @LockTimeout = 15000
     SELECT @r AS result`,
  )
  if (result.recordset[0].result < 0) throw new Error('Could not acquire vehicle assignment lock')
}

/** งานที่จัดไว้ล่วงหน้า (ยังไม่จบ) ของคนขับ/รถ - ใช้กันการปิดใช้งานทั้งที่ยังมีงานค้าง */
export async function countUpcomingAssignments(pool, { driverId = null, vehicleId = null }) {
  const result = await pool
    .request()
    .input('driverId', sql.Int, driverId)
    .input('vehicleId', sql.Int, vehicleId)
    .query(`SELECT COUNT(*) AS n FROM VehicleRequests
            WHERE Status = 'Assigned' AND ReturnTime > SYSUTCDATETIME()
              AND ((@driverId IS NOT NULL AND AssignedDriverID = @driverId) OR (@vehicleId IS NOT NULL AND AssignedVehicleID = @vehicleId))`)
  return result.recordset[0].n
}

async function lockRequest(transaction, id) {
  const result = await transaction
    .request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM VehicleRequests WITH (UPDLOCK, HOLDLOCK) WHERE RequestID = @id')
  return result.recordset[0] ?? null
}

async function inTransaction(pool, fn) {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const result = await fn(transaction)
    await transaction.commit()
    return result
  } catch (err) {
    // transaction ที่ SQL Server ยกเลิกไปแล้ว (เช่น deadlock victim) rollback ซ้ำจะ error - ไม่ให้บังข้อผิดพลาดจริง
    await transaction.rollback().catch(() => {})
    throw err
  }
}

export async function findById(pool, id) {
  const result = await pool.request().input('id', sql.Int, id).query(`${BASE_SELECT} WHERE vr.RequestID = @id`)
  return result.recordset[0] ?? null
}

export async function list(pool, { userId, approverId, status, from, to } = {}) {
  const req = pool.request()
  const where = []
  if (userId) {
    req.input('userId', sql.Int, userId)
    where.push('vr.RequesterUserID = @userId')
  }
  if (approverId) {
    req.input('approverId', sql.Int, approverId)
    where.push('vr.ApproverUserID = @approverId')
  }
  if (status) {
    req.input('status', sql.VarChar(20), status)
    where.push('vr.Status = @status')
  }
  if (from) {
    req.input('from', sql.DateTime2, from)
    where.push('vr.ReturnTime > @from')
  }
  if (to) {
    req.input('to', sql.DateTime2, to)
    where.push('vr.DepartTime < @to')
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const result = await req.query(`${BASE_SELECT} ${whereSql} ORDER BY vr.DepartTime DESC`)
  return result.recordset
}

function bindDetails(req, input) {
  return req
    .input('contactPhone', sql.NVarChar(50), input.contactPhone)
    .input('departTime', sql.DateTime2, input.departTime)
    .input('returnTime', sql.DateTime2, input.returnTime)
    .input('pickupLocation', sql.NVarChar(300), input.pickupLocation)
    .input('destination', sql.NVarChar(300), input.destination)
    .input('mapLink', sql.NVarChar(1000), input.mapLink)
    .input('pickupMapLink', sql.NVarChar(1000), input.pickupMapLink ?? null)
    .input('pickupGate', sql.NVarChar(100), input.pickupGate ?? null)
    .input('destinationGate', sql.NVarChar(100), input.destinationGate ?? null)
    .input('vehicleType', sql.VarChar(10), input.vehicleType)
    .input('requestType', sql.VarChar(20), input.requestType)
    .input('tripType', sql.VarChar(20), input.tripType ?? 'RoundTrip')
    .input('passengerCount', sql.Int, input.passengerCount)
    .input('reason', sql.NVarChar(500), input.reason ?? null)
}

/** ผลการอนุมัติที่ route คำนวณให้ (undefined = ไม่เปลี่ยน) */
function bindApproval(req, approval) {
  return req
    .input('approvalStatus', sql.VarChar(20), approval.status)
    .input('approverId', sql.Int, approval.approverId ?? null)
    .input('approvedAt', sql.DateTime2, approval.approvedAt ?? null)
}

async function insertAttachments(transaction, requestId, userId, attachments) {
  for (const a of attachments) {
    await transaction
      .request()
      .input('requestId', sql.Int, requestId)
      .input('originalName', sql.NVarChar(255), a.originalName)
      .input('storedName', sql.VarChar(100), a.storedName)
      .input('contentType', sql.VarChar(50), a.contentType)
      .input('size', sql.Int, a.size)
      .input('userId', sql.Int, userId)
      .query(
        `INSERT INTO VehicleRequestAttachments (RequestID, OriginalName, StoredName, ContentType, SizeBytes, UploadedByUserID)
         VALUES (@requestId, @originalName, @storedName, @contentType, @size, @userId)`,
      )
  }
}

/**
 * เลขที่เอกสาร <prefix>-ปี-ลำดับ (migration 025) - ออกใน transaction เดียวกับการสร้างเอกสาร
 * VR = คำขอรถ, OT = สายรวมโอที (migration 042)
 * ถ้าสร้างไม่สำเร็จ ลำดับถูก rollback ด้วย จึงเรียงต่อกันไม่มีช่องว่าง, ล็อกแถวลำดับของปีนั้นกันออกเลขซ้ำ
 */
async function nextDocumentNo(transaction, prefix) {
  const result = await transaction.request().input('prefix', sql.VarChar(10), prefix).query(
    `DECLARE @y INT = YEAR(DATEADD(HOUR, 7, SYSUTCDATETIME()));
     IF NOT EXISTS (SELECT 1 FROM DocumentSequences WITH (UPDLOCK, HOLDLOCK) WHERE Prefix = @prefix AND [Year] = @y)
       INSERT INTO DocumentSequences (Prefix, [Year], LastNumber) VALUES (@prefix, @y, 0);
     UPDATE DocumentSequences SET LastNumber = LastNumber + 1
     OUTPUT INSERTED.[Year] AS Yr, INSERTED.LastNumber AS N
     WHERE Prefix = @prefix AND [Year] = @y;`,
  )
  const { Yr, N } = result.recordset[0]
  return `${prefix}-${Yr}-${String(N).padStart(4, '0')}`
}

/** สร้างคำขอพร้อมไฟล์แนบใน transaction เดียว (ไฟล์บนดิสก์ route เขียนไว้ก่อนแล้ว และลบทิ้งเองถ้าตรงนี้ fail) */
/** สำเนาชื่อ/แผนกผู้ขอ ณ ตอนส่งคำขอ - ย้ายแผนกภายหลังต้องไม่ทำให้คำขอเก่าเปลี่ยน */
async function snapshotRequester(db, id) {
  await db.request().input('id', sql.Int, id).query(
    `UPDATE vr SET SnapRequesterName = u.FullName, SnapRequesterNameTh = u.FullNameTh, SnapRequesterDepartment = d.Name
     FROM VehicleRequests vr
     JOIN Users u ON u.UserID = vr.RequesterUserID
     LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID
     WHERE vr.RequestID = @id`,
  )
}

/**
 * สำเนาข้อมูลผู้อนุมัติ (ชื่อ ระดับ ไฟล์ลายเซ็น) ณ ตอนตัดสิน - ยังไม่ตัดสิน/ถูกรีเซ็ตให้ล้างสำเนา (ใช้ข้อมูลปัจจุบัน)
 * ต้องเรียกเฉพาะตอนผลอนุมัติเปลี่ยน (ส่ง/แก้ไขคำขอ, อนุมัติ, ไม่อนุมัติ) ไม่ใช่ทุกครั้งที่อ่าน
 */
async function snapshotApprover(db, id) {
  await db.request().input('id', sql.Int, id).query(
    `UPDATE vr SET
       SnapApproverName = CASE WHEN vr.ApprovalStatus IN ('Approved', 'Rejected') THEN ap.FullName END,
       SnapApproverNameTh = CASE WHEN vr.ApprovalStatus IN ('Approved', 'Rejected') THEN ap.FullNameTh END,
       SnapApproverLevel = CASE WHEN vr.ApprovalStatus IN ('Approved', 'Rejected') THEN ap.ApprovalLevel END,
       SnapApproverSignatureFile = CASE WHEN vr.ApprovalStatus = 'Approved' THEN ap.SignatureFile END
     FROM VehicleRequests vr
     LEFT JOIN Users ap ON ap.UserID = vr.ApproverUserID
     WHERE vr.RequestID = @id`,
  )
}

/** ไฟล์ลายเซ็นนี้ยังถูกคำขอที่อนุมัติแล้วอ้างอยู่หรือไม่ - ถ้าอ้างอยู่ห้ามลบไฟล์ (ฟอร์มเก่าต้องพิมพ์ลายเซ็นเดิมได้) */
export async function isSignatureReferenced(pool, fileName) {
  const result = await pool
    .request()
    .input('name', sql.VarChar(100), fileName)
    .query('SELECT TOP 1 1 AS used FROM VehicleRequests WHERE SnapApproverSignatureFile = @name')
  return result.recordset.length > 0
}

/** ไฟล์ลายเซ็นของผู้อนุมัติ ณ ตอนอนุมัติคำขอนี้ (null = ไม่มี) */
export async function findApproverSignatureFile(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT SnapApproverSignatureFile AS name FROM VehicleRequests WHERE RequestID = @id')
  return result.recordset[0]?.name ?? null
}

export async function create(pool, userId, input, attachments) {
  const requestId = await inTransaction(pool, async (transaction) => {
    await lockFleetAssignments(transaction)
    await assertPassengersFree(transaction, input.passengers, input)
    const requestNo = await nextDocumentNo(transaction, 'VR')
    const result = await bindApproval(
      bindDetails(transaction.request().input('userId', sql.Int, userId).input('requestNo', sql.VarChar(20), requestNo), input),
      input.approval ?? { status: 'NotRequired' },
    ).query(
      `INSERT INTO VehicleRequests
         (RequestNo, RequesterUserID, ContactPhone, DepartTime, ReturnTime, PickupLocation, Destination, MapLink, PickupMapLink, PickupGate, DestinationGate,
          VehicleType, RequestType, TripType, PassengerCount, Reason, ApprovalStatus, ApproverUserID, ApprovedAt)
       OUTPUT INSERTED.RequestID
       VALUES (@requestNo, @userId, @contactPhone, @departTime, @returnTime, @pickupLocation, @destination, @mapLink, @pickupMapLink, @pickupGate, @destinationGate,
               @vehicleType, @requestType, @tripType, @passengerCount, @reason, @approvalStatus, @approverId, @approvedAt)`,
    )
    const id = result.recordset[0].RequestID
    await snapshotRequester(transaction, id)
    await snapshotApprover(transaction, id)
    await insertAttachments(transaction, id, userId, attachments)
    await insertPassengers(transaction, id, input.passengers)
    return id
  })
  return findById(pool, requestId)
}

/** ไฟล์แนบของหลายคำขอในครั้งเดียว - คืน Map<RequestID, rows[]> */
export async function listAttachments(pool, requestIds) {
  const map = new Map()
  if (requestIds.length === 0) return map
  const req = pool.request()
  const params = requestIds.map((id, i) => {
    req.input(`id${i}`, sql.Int, id)
    return `@id${i}`
  })
  const result = await req.query(
    `SELECT AttachmentID, RequestID, OriginalName, ContentType, SizeBytes, CreatedAt
     FROM VehicleRequestAttachments WHERE RequestID IN (${params.join(', ')}) ORDER BY AttachmentID`,
  )
  for (const row of result.recordset) {
    if (!map.has(row.RequestID)) map.set(row.RequestID, [])
    map.get(row.RequestID).push(row)
  }
  return map
}

export async function findAttachment(pool, requestId, attachmentId) {
  const result = await pool
    .request()
    .input('requestId', sql.Int, requestId)
    .input('attachmentId', sql.Int, attachmentId)
    .query('SELECT * FROM VehicleRequestAttachments WHERE RequestID = @requestId AND AttachmentID = @attachmentId')
  return result.recordset[0] ?? null
}

async function countAttachments(transaction, requestId) {
  const result = await transaction
    .request()
    .input('requestId', sql.Int, requestId)
    .query('SELECT COUNT(*) AS n FROM VehicleRequestAttachments WITH (UPDLOCK, HOLDLOCK) WHERE RequestID = @requestId')
  return result.recordset[0].n
}

/** เพิ่มไฟล์แนบให้คำขอเดิม - รวมแล้วต้องไม่เกิน `max` ไฟล์ */
export async function addAttachments(pool, id, userId, attachments, { allowedStatuses, max }) {
  return inTransaction(pool, async (transaction) => {
    const existing = await lockRequest(transaction, id)
    if (!existing) return false
    if (!allowedStatuses.includes(existing.Status)) {
      throw new AppError(ErrorCodes.VEHICLE_REQUEST_STATUS_INVALID, 409)
    }
    if ((await countAttachments(transaction, id)) + attachments.length > max) {
      throw new AppError(ErrorCodes.ATTACHMENT_COUNT_INVALID, 400)
    }
    await insertAttachments(transaction, id, userId, attachments)
    return true
  })
}

/** ลบไฟล์แนบ 1 ไฟล์ - ต้องเหลืออย่างน้อย 1 ไฟล์เสมอ (บังคับแนบ) คืน StoredName ให้ route ลบไฟล์บนดิสก์ต่อ */
export async function removeAttachment(pool, id, attachmentId, { allowedStatuses }) {
  return inTransaction(pool, async (transaction) => {
    const existing = await lockRequest(transaction, id)
    if (!existing) return null
    if (!allowedStatuses.includes(existing.Status)) {
      throw new AppError(ErrorCodes.VEHICLE_REQUEST_STATUS_INVALID, 409)
    }
    // ไม่บังคับแนบไฟล์แล้ว (ใช้ PDF แบบฟอร์มจากระบบแทน - dev+HR 2026-10-05) จึงลบไฟล์สุดท้ายได้
    const deleted = await transaction
      .request()
      .input('requestId', sql.Int, id)
      .input('attachmentId', sql.Int, attachmentId)
      .query(
        `DELETE FROM VehicleRequestAttachments
         OUTPUT DELETED.StoredName
         WHERE RequestID = @requestId AND AttachmentID = @attachmentId`,
      )
    return deleted.recordset[0]?.StoredName ?? null
  })
}

/**
 * แก้ไขรายละเอียดคำขอ - ถ้าจัดคนขับภายในไปแล้ว ต้องเช็คชนกับงานอื่นของคนขับด้วยเวลาใหม่
 * `allowedStatuses` ให้ route กำหนดตามสิทธิ์ (เจ้าของแก้ได้เฉพาะ Pending, Admin แก้ได้ทั้ง Pending/Assigned)
 * เช็คสถานะหลังล็อกแถวแล้ว เพื่อไม่ให้ชนกับ Admin ที่กำลังจัดคนขับพร้อมกัน
 */
export async function update(pool, id, input, { allowedStatuses }) {
  const found = await inTransaction(pool, async (transaction) => {
    await lockFleetAssignments(transaction)
    const existing = await lockRequest(transaction, id)
    if (!existing) return false
    if (!allowedStatuses.includes(existing.Status)) {
      throw new AppError(ErrorCodes.VEHICLE_REQUEST_STATUS_INVALID, 409)
    }

    await assertPassengersFree(transaction, input.passengers, { ...input, excludeRequestId: id })

    // เวลาเปลี่ยน → คนขับ/รถที่จัดไว้แล้วต้องยังว่างในช่วงใหม่
    if (existing.Status === 'Assigned') {
      await assertResourcesFree(transaction, {
        driverId: existing.AssignedDriverID,
        vehicleId: existing.AssignedVehicleID,
        departTime: input.departTime,
        returnTime: input.returnTime,
        excludeRequestId: id,
        trip: shuttleTripOf(input),
      })
    }

    await bindDetails(transaction.request().input('id', sql.Int, id), input).query(
      `UPDATE VehicleRequests
       SET ContactPhone = @contactPhone, DepartTime = @departTime, ReturnTime = @returnTime,
           PickupLocation = @pickupLocation, Destination = @destination, MapLink = @mapLink, PickupMapLink = @pickupMapLink,
           PickupGate = @pickupGate, DestinationGate = @destinationGate,
           VehicleType = @vehicleType, RequestType = @requestType, TripType = @tripType, PassengerCount = @passengerCount,
           Reason = @reason, UpdatedAt = SYSUTCDATETIME()
       WHERE RequestID = @id`,
    )
    // ผู้ขอแก้ไขคำขอรถนอก → ต้องอนุมัติใหม่ (route ส่ง approval มา), Admin แก้ = คงผลอนุมัติเดิม
    if (input.approval) {
      await bindApproval(transaction.request().input('id', sql.Int, id), input.approval).query(
        `UPDATE VehicleRequests
         SET ApprovalStatus = @approvalStatus, ApproverUserID = @approverId, ApprovedAt = @approvedAt, ApprovalNote = NULL,
             ApprovalReminderSentAt = NULL
         WHERE RequestID = @id`,
      )
      await snapshotApprover(transaction, id)
    }
    await insertPassengers(transaction, id, input.passengers)
    // แก้เวลา/จุดรับ-ปลายทางจนไม่ตรงเที่ยวเดิม → ออกจากสายรวมอัตโนมัติ (สายรวมต้องเป็นเที่ยวเดียวกันเท่านั้น)
    if (existing.CombinedTripID && !isSameShuttleTrip(existing, input)) await clearCombined(transaction, [id])
    return true
  })
  return found ? findById(pool, id) : null
}

/**
 * ผู้อนุมัติกดอนุมัติ/ไม่อนุมัติ - เปลี่ยนได้เฉพาะคำขอที่ยังรออนุมัติ ยังไม่ยกเลิก และเป็นผู้อนุมัติที่ถูกเลือกไว้
 * เงื่อนไขอยู่ใน WHERE ของ UPDATE เดียว (กันกดซ้ำ/กดพร้อมผู้ขอแก้ไข) - คืน null ถ้าทำไม่ได้
 */
export async function decideApproval(pool, id, approverId, { approve, note }) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('approverId', sql.Int, approverId)
    .input('status', sql.VarChar(20), approve ? 'Approved' : 'Rejected')
    .input('note', sql.NVarChar(500), note ?? null)
    .query(
      `UPDATE VehicleRequests
       SET ApprovalStatus = @status, ApprovedAt = SYSUTCDATETIME(), ApprovalNote = @note, UpdatedAt = SYSUTCDATETIME()
       OUTPUT INSERTED.RequestID
       WHERE RequestID = @id AND ApproverUserID = @approverId AND ApprovalStatus = 'Pending' AND Status = 'Pending'`,
    )
  if (result.recordset.length) await snapshotApprover(pool, id)
  return result.recordset.length ? findById(pool, id) : null
}

export async function cancel(pool, id, { allowedStatuses }) {
  const found = await inTransaction(pool, async (transaction) => {
    await lockFleetAssignments(transaction)
    const existing = await lockRequest(transaction, id)
    if (!existing) return false
    if (!allowedStatuses.includes(existing.Status)) {
      throw new AppError(ErrorCodes.VEHICLE_REQUEST_STATUS_INVALID, 409)
    }
    await transaction
      .request()
      .input('id', sql.Int, id)
      .query(`UPDATE VehicleRequests SET Status = 'Cancelled', UpdatedAt = SYSUTCDATETIME() WHERE RequestID = @id`)
    if (existing.CombinedTripID) await clearCombined(transaction, [id])
    return true
  })
  return found ? findById(pool, id) : null
}

async function loadRow(transaction, table, idColumn, id) {
  const result = await transaction
    .request()
    .input('id', sql.Int, id)
    .query(`SELECT * FROM ${table} WHERE ${idColumn} = @id`)
  const row = result.recordset[0]
  if (!row) throw new AppError(ErrorCodes.NOT_FOUND, 404)
  return row
}

/**
 * จัดรถ (หรือเปลี่ยน) ให้คำขอ - ใช้ได้ทั้ง Pending และ Assigned
 *  - Company : driverId + vehicleId ของบริษัทเอง (ProviderID เป็น NULL ทั้งคู่)
 *  - Rental  : providerId (Kind = Rental) + driverId + vehicleId ที่เป็นของบริษัทรถเช่านั้น
 *  - OnDemand: providerId (Kind = OnDemand) + ชื่อ/เบอร์คนขับ + ทะเบียน กรอกรายทริป
 * รถที่ลงทะเบียนจะ snapshot ทะเบียนลง LicensePlate ไว้ด้วย (ประวัติไม่เปลี่ยนแม้แก้ข้อมูลรถทีหลัง)
 * เช็คความถูกต้องทั้งหมดใน transaction เพราะต้องอ่านข้อมูลคนขับ/รถ/ผู้ให้บริการจาก DB
 */
export async function assign(pool, id, input) {
  const found = await inTransaction(pool, async (transaction) => {
    await lockFleetAssignments(transaction)
    return assignLocked(transaction, id, input)
  })
  return found ? findById(pool, id) : null
}

/**
 * จัดรถคันเดียวให้ทุกคำขอในเที่ยวโอทีเดียวกัน ในครั้งเดียว (ทั้งหมดหรือไม่เลย)
 * ทุกคำขอต้องเป็นโอทีเที่ยวเดียวกันจริง (เวลา + ประเภทเที่ยวตรงกัน) ไม่งั้น VALIDATION_ERROR
 */
export async function assignTrip(pool, ids, input) {
  const found = await inTransaction(pool, async (transaction) => {
    await lockFleetAssignments(transaction)
    const rows = []
    for (const id of ids) {
      const row = await lockRequest(transaction, id)
      if (!row) return false
      rows.push(row)
    }
    const [first] = rows
    const sameTrip = (r) =>
      r.RequestType === 'Shuttle' &&
      r.DepartTime.getTime() === first.DepartTime.getTime() &&
      r.ReturnTime.getTime() === first.ReturnTime.getTime() &&
      r.PickupLocation === first.PickupLocation &&
      r.Destination === first.Destination
    if (!rows.every(sameTrip)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    for (const id of ids) await assignLocked(transaction, id, input)
    return true
  })
  if (!found) return null
  return Promise.all(ids.map((id) => findById(pool, id)))
}

// ---------------- สายรวมโอที (migration 040) ----------------

/** ทั้งสองฝั่งเป็นเที่ยวโอทีเดียวกันไหม (เวลาออก/กลับ + จุดรับ/ปลายทางตรงกัน) - รับได้ทั้งแถว DB และ input ที่ validate แล้ว */
function isSameShuttleTrip(a, b) {
  const pick = (r) => ({
    depart: new Date(r.DepartTime ?? r.departTime).getTime(),
    ret: new Date(r.ReturnTime ?? r.returnTime).getTime(),
    pickup: r.PickupLocation ?? r.pickupLocation,
    dest: r.Destination ?? r.destination,
  })
  const x = pick(a)
  const y = pick(b)
  return x.depart === y.depart && x.ret === y.ret && x.pickup === y.pickup && x.dest === y.dest
}

/** ลบกลุ่มสายรวมที่ไม่เหลือสมาชิก */
async function deleteEmptyCombinedTrips(transaction) {
  await transaction.request().query(
    `DELETE FROM ShuttleCombinedTrips
     WHERE CombinedTripID NOT IN (SELECT CombinedTripID FROM VehicleRequests WHERE CombinedTripID IS NOT NULL)`,
  )
}

async function clearCombined(transaction, ids) {
  for (const id of ids) {
    await transaction.request().input('id', sql.Int, id).query('UPDATE VehicleRequests SET CombinedTripID = NULL WHERE RequestID = @id')
  }
  await deleteEmptyCombinedTrips(transaction)
}

const sameAssignment = (a, b) =>
  a.Status === b.Status &&
  (a.AssignedDriverID ?? null) === (b.AssignedDriverID ?? null) &&
  (a.AssignedVehicleID ?? null) === (b.AssignedVehicleID ?? null) &&
  (a.ProviderID ?? null) === (b.ProviderID ?? null) &&
  (a.LicensePlate ?? null) === (b.LicensePlate ?? null) &&
  (a.TripDriverName ?? null) === (b.TripDriverName ?? null)

/**
 * รวมคำขอโอทีเป็นสายรวมกลุ่มเดียว - ทุกคำขอต้องเป็นโอทีเที่ยวเดียวกัน (เวลา + จุดรับ/ปลายทางตรงกัน), ไม่ยกเลิก
 * และต้องยังไม่จัดรถ หรือจัดรถแบบเดียวกันหมด (กันรวมคำขอที่มีคนขับต่างคันเข้าด้วยกันโดยไม่รู้ตัว)
 * คำขอที่เคยอยู่สายรวมอื่นอยู่แล้วจะถูกรวมทั้งกลุ่มเก่าเข้ามาด้วย
 */
export async function combineTrip(pool, ids, adminId) {
  const target = await inTransaction(pool, async (transaction) => {
    await lockFleetAssignments(transaction)
    const rows = []
    for (const id of ids) {
      const row = await lockRequest(transaction, id)
      if (!row) return null
      rows.push(row)
    }
    const [first] = rows
    if (!rows.every((r) => r.RequestType === 'Shuttle' && r.Status !== 'Cancelled' && isSameShuttleTrip(r, first))) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    if (!rows.every((r) => sameAssignment(r, first))) throw new AppError(ErrorCodes.VEHICLE_REQUEST_STATUS_INVALID, 409)

    const oldGroups = [...new Set(rows.map((r) => r.CombinedTripID).filter(Boolean))]
    let groupId = oldGroups[0]
    if (!groupId) {
      const created = await transaction
        .request()
        .input('adminId', sql.Int, adminId)
        .input('code', sql.VarChar(20), await nextDocumentNo(transaction, 'OT'))
        .query('INSERT INTO ShuttleCombinedTrips (CreatedByUserID, Code) OUTPUT INSERTED.CombinedTripID VALUES (@adminId, @code)')
      groupId = created.recordset[0].CombinedTripID
    } else {
      // สายรวมที่สร้างก่อนมีเลข (Code ว่าง) → ออกเลขให้ตอนนี้
      const existingCode = await transaction.request().input('gid', sql.Int, groupId).query('SELECT Code FROM ShuttleCombinedTrips WHERE CombinedTripID = @gid')
      if (!existingCode.recordset[0]?.Code) {
        await transaction
          .request()
          .input('gid', sql.Int, groupId)
          .input('code', sql.VarChar(20), await nextDocumentNo(transaction, 'OT'))
          .query('UPDATE ShuttleCombinedTrips SET Code = @code WHERE CombinedTripID = @gid')
      }
    }
    const req = transaction.request().input('target', sql.Int, groupId)
    const idParams = ids.map((id, i) => {
      req.input(`id${i}`, sql.Int, id)
      return `@id${i}`
    })
    const groupParams = oldGroups.map((g, i) => {
      req.input(`g${i}`, sql.Int, g)
      return `@g${i}`
    })
    await req.query(
      `UPDATE VehicleRequests SET CombinedTripID = @target, UpdatedAt = SYSUTCDATETIME()
       WHERE RequestID IN (${idParams.join(', ')})${groupParams.length ? ` OR CombinedTripID IN (${groupParams.join(', ')})` : ''}`,
    )
    await deleteEmptyCombinedTrips(transaction)
    return groupId
  })
  if (target === null) return null
  const members = await pool.request().input('cid', sql.Int, target).query('SELECT RequestID FROM VehicleRequests WHERE CombinedTripID = @cid')
  return Promise.all(members.recordset.map((r) => findById(pool, r.RequestID)))
}

/** ถอดคำขอออกจากสายรวม (ส่ง id ของคำขอ) - กลุ่มที่ไม่เหลือสมาชิกถูกลบ */
export async function uncombineRequests(pool, ids) {
  const found = await inTransaction(pool, async (transaction) => {
    await lockFleetAssignments(transaction)
    for (const id of ids) {
      if (!(await lockRequest(transaction, id))) return false
    }
    await clearCombined(transaction, ids)
    return true
  })
  if (!found) return null
  return Promise.all(ids.map((id) => findById(pool, id)))
}

/** ตัวจัดรถจริง - ต้องเรียกใน transaction ที่ lockFleetAssignments แล้ว */
/**
 * รถต้องมีที่นั่งพอสำหรับผู้โดยสารทั้งหมดของเที่ยวนี้ - นับคำขออื่นที่ใช้รถคันเดียวกันในเที่ยวเดียวกัน (โอทีใช้รถร่วมกันได้)
 * ไม่ทราบจำนวนที่นั่ง (SeatCount ว่าง) = ไม่ตรวจ
 */
async function assertSeatsEnough(transaction, vehicle, existing, id) {
  if (vehicle.SeatCount === null || vehicle.SeatCount === undefined) return
  const others = await transaction
    .request()
    .input('vehicleId', sql.Int, vehicle.VehicleID)
    .input('id', sql.Int, id)
    .input('departTime', sql.DateTime2, existing.DepartTime)
    .input('returnTime', sql.DateTime2, existing.ReturnTime)
    .query(`SELECT COALESCE(SUM(PassengerCount), 0) AS n FROM VehicleRequests
            WHERE AssignedVehicleID = @vehicleId AND RequestID <> @id AND Status = 'Assigned'
              AND DepartTime = @departTime AND ReturnTime = @returnTime`)
  const passengers = existing.PassengerCount + others.recordset[0].n
  if (passengers > vehicle.SeatCount) {
    throw new AppError(ErrorCodes.VEHICLE_CAPACITY_EXCEEDED, 409, { seats: vehicle.SeatCount, passengers })
  }
}

async function assignLocked(transaction, id, input) {
  const { kind, providerId, driverId, vehicleId, assignedByUserId } = input
  const existing = await lockRequest(transaction, id)
  if (!existing) return false
  if (existing.Status === 'Cancelled') {
    throw new AppError(ErrorCodes.VEHICLE_REQUEST_STATUS_INVALID, 409)
  }
  // รถนอกต้องผ่านการอนุมัติของหัวหน้าก่อน Admin จึงจัดรถได้ (dev 2026-10-05)
  if (existing.ApprovalStatus === 'Pending' || existing.ApprovalStatus === 'Rejected') {
    throw new AppError(ErrorCodes.APPROVAL_REQUIRED, 409)
  }

  let values
  if (kind === 'Manual') {
    // พิมพ์เอง: ชื่อ/เบอร์คนขับ + ทะเบียนเป็นข้อความรายเที่ยว ไม่ผูกกับคนขับ/รถ/ผู้ให้บริการในระบบ (จึงไม่เช็คคนขับชน/ที่นั่ง)
    if (!input.tripDriverName || !input.tripDriverPhone || !input.licensePlate) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    values = {
      providerId: null,
      driverId: null,
      vehicleId: null,
      licensePlate: input.licensePlate,
      tripDriverName: input.tripDriverName,
      tripDriverPhone: input.tripDriverPhone,
    }
  } else if (kind === 'OnDemand') {
    const provider = await loadRow(transaction, 'Providers', 'ProviderID', providerId)
    if (provider.Kind !== 'OnDemand') throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    if (!provider.IsActive) throw new AppError(ErrorCodes.PROVIDER_INACTIVE, 409)
    if (!input.tripDriverName || !input.tripDriverPhone || !input.licensePlate) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    values = {
      providerId,
      driverId: null,
      vehicleId: null,
      licensePlate: input.licensePlate,
      tripDriverName: input.tripDriverName,
      tripDriverPhone: input.tripDriverPhone,
    }
  } else {
    const expectedProviderId = kind === 'Rental' ? providerId : null
    if (kind === 'Rental') {
      const provider = await loadRow(transaction, 'Providers', 'ProviderID', providerId)
      if (provider.Kind !== 'Rental') throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
      if (!provider.IsActive) throw new AppError(ErrorCodes.PROVIDER_INACTIVE, 409)
    }
    const driver = await loadRow(transaction, 'Drivers', 'DriverID', driverId)
    const vehicle = await loadRow(transaction, 'Vehicles', 'VehicleID', vehicleId)
    // คนขับ/รถต้องเป็นของบริษัทเรา (Company) หรือของบริษัทรถเช่าที่เลือก (Rental) เท่านั้น
    if ((driver.ProviderID ?? null) !== expectedProviderId || (vehicle.ProviderID ?? null) !== expectedProviderId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 400)
    }
    if (!driver.IsActive) throw new AppError(ErrorCodes.DRIVER_INACTIVE, 409)
    if (!vehicle.IsActive) throw new AppError(ErrorCodes.VEHICLE_INACTIVE, 409)
    await assertSeatsEnough(transaction, vehicle, existing, id)

    await assertResourcesFree(transaction, {
      driverId,
      vehicleId,
      departTime: existing.DepartTime,
      returnTime: existing.ReturnTime,
      excludeRequestId: id,
      trip: shuttleTripOf(existing),
    })
    values = {
      providerId: expectedProviderId,
      driverId,
      vehicleId,
      licensePlate: vehicle.LicensePlate,
      tripDriverName: null,
      tripDriverPhone: null,
    }
  }

  await transaction
    .request()
    .input('id', sql.Int, id)
    .input('assignedBy', sql.Int, assignedByUserId)
    .input('providerId', sql.Int, values.providerId)
    .input('driverId', sql.Int, values.driverId)
    .input('vehicleId', sql.Int, values.vehicleId)
    .input('licensePlate', sql.NVarChar(50), values.licensePlate)
    .input('tripDriverName', sql.NVarChar(200), values.tripDriverName)
    .input('tripDriverPhone', sql.NVarChar(50), values.tripDriverPhone)
    .query(
      `UPDATE VehicleRequests
       SET Status = 'Assigned', AssignedByUserID = @assignedBy, ProviderID = @providerId,
           AssignedDriverID = @driverId, AssignedVehicleID = @vehicleId, LicensePlate = @licensePlate,
           TripDriverName = @tripDriverName, TripDriverPhone = @tripDriverPhone,
           AssignedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
       WHERE RequestID = @id`,
    )
  // สำเนาคนขับ/ผู้ให้บริการ/รถ ณ ตอนจัดรถ (จัดซ้ำ = เขียนใหม่; คนขับ/รถแบบพิมพ์เองไม่มีข้อมูลหลักจึงเป็น NULL)
  await transaction.request().input('id', sql.Int, id).query(
    `UPDATE vr SET
       SnapDriverName = d.Name, SnapDriverPhone = d.Phone,
       SnapProviderName = p.Name, SnapProviderPhone = p.Phone,
       SnapVehicleType = v.VehicleType, SnapSeatCount = v.SeatCount, SnapVehicleDescription = v.Description
     FROM VehicleRequests vr
     LEFT JOIN Drivers d ON d.DriverID = vr.AssignedDriverID
     LEFT JOIN Providers p ON p.ProviderID = vr.ProviderID
     LEFT JOIN Vehicles v ON v.VehicleID = vr.AssignedVehicleID
     WHERE vr.RequestID = @id`,
  )
  return true
}

/** งานที่มอบหมายแล้วในช่วงเวลา - ใช้ทำปฏิทินคนขับ และดูว่าคนขับ/รถคันไหนไม่ว่างตอนจัดรถ */
export async function listAssignments(pool, { from, to, driverId, excludeRequestId } = {}) {
  const req = pool.request().input('from', sql.DateTime2, from).input('to', sql.DateTime2, to)
  let where = `vr.Status = 'Assigned' AND vr.DepartTime < @to AND vr.ReturnTime > @from`
  if (driverId) {
    req.input('driverId', sql.Int, driverId)
    where += ' AND vr.AssignedDriverID = @driverId'
  }
  if (excludeRequestId) {
    req.input('excludeId', sql.Int, excludeRequestId)
    where += ' AND vr.RequestID <> @excludeId'
    // คำขอที่กำลังจัดเป็นโอที → งานของเที่ยวเดียวกันใช้รถร่วมกันได้ ไม่นับว่าไม่ว่าง (ตรงกับ assertFree)
    where += ` AND NOT EXISTS (
      SELECT 1 FROM VehicleRequests me
      WHERE me.RequestID = @excludeId AND me.RequestType = 'Shuttle' AND vr.RequestType = 'Shuttle'
        AND me.DepartTime = vr.DepartTime AND me.ReturnTime = vr.ReturnTime
        AND me.PickupLocation = vr.PickupLocation AND me.Destination = vr.Destination)`
  }
  const result = await req.query(`${BASE_SELECT} WHERE ${where} ORDER BY vr.DepartTime`)
  return result.recordset
}

// สายรถ/จุดขึ้นรถเก็บเป็นสำเนา ณ ตอนส่งคำขอ - ผู้โดยสารที่อยู่ในคำขออยู่แล้วตอนแก้ไขคงค่าเดิมไว้
// (ย้ายสายภายหลังต้องไม่ทำให้คำขอเก่าเปลี่ยน) เฉพาะคนที่เพิ่งเพิ่มเข้ามาจึงอ่านสายปัจจุบัน
async function insertPassengers(transaction, requestId, userIds) {
  const previous = await transaction
    .request()
    .input('requestId', sql.Int, requestId)
    .query('SELECT UserID, RouteID, RouteName, PickupStop, Department FROM VehicleRequestPassengers WHERE RequestID = @requestId')
  const kept = new Map(previous.recordset.map((r) => [r.UserID, r]))
  await transaction.request().input('requestId', sql.Int, requestId).query('DELETE FROM VehicleRequestPassengers WHERE RequestID = @requestId')
  if (!userIds || userIds.length === 0) return
  for (const uid of userIds) {
    const old = kept.get(uid)
    const request = transaction.request().input('requestId', sql.Int, requestId).input('userId', sql.Int, uid)
    if (old) {
      await request
        .input('routeId', sql.Int, old.RouteID)
        .input('routeName', sql.NVarChar(100), old.RouteName)
        .input('pickupStop', sql.NVarChar(200), old.PickupStop)
        .input('department', sql.NVarChar(200), old.Department)
        .query(
          'INSERT INTO VehicleRequestPassengers (RequestID, UserID, RouteID, RouteName, PickupStop, Department) VALUES (@requestId, @userId, @routeId, @routeName, @pickupStop, @department)',
        )
    } else {
      await request.query(
        `INSERT INTO VehicleRequestPassengers (RequestID, UserID, RouteID, RouteName, PickupStop, Department)
         SELECT @requestId, @userId, sp.RouteID, sr.Name, sp.PickupStop, dep.Name
         FROM (SELECT 1 AS one) d
         LEFT JOIN ShuttlePassengers sp ON sp.UserID = @userId
         LEFT JOIN ShuttleRoutes sr ON sr.RouteID = sp.RouteID
         LEFT JOIN Users pu ON pu.UserID = @userId
         LEFT JOIN Departments dep ON dep.DepartmentID = pu.DepartmentID`,
      )
    }
  }
}

export async function listPassengers(pool, requestIds) {
  const map = new Map()
  if (requestIds.length === 0) return map
  const req = pool.request()
  const params = requestIds.map((id, i) => {
    req.input(`id${i}`, sql.Int, id)
    return `@id${i}`
  })
  const result = await req.query(
    `SELECT vp.RequestID, u.UserID, CASE WHEN u.AuthSource = 'None' THEN NULL ELSE u.Username END AS Username, u.EmployeeCode, u.FullName, u.FullNameTh, u.Phone, vp.Department AS Department, vp.RouteID, vp.RouteName, vp.PickupStop
     FROM VehicleRequestPassengers vp
     JOIN Users u ON u.UserID = vp.UserID
     LEFT JOIN Departments dep ON dep.DepartmentID = u.DepartmentID
     WHERE vp.RequestID IN (${params.join(', ')})
     ORDER BY u.FullName`
  )
  for (const row of result.recordset) {
    if (!map.has(row.RequestID)) map.set(row.RequestID, [])
    map.get(row.RequestID).push({
      id: row.UserID,
      username: row.EmployeeCode || row.Username,
      employeeCode: row.EmployeeCode || null, // รหัสพนักงานจริงเท่านั้น (username ไม่ใช่รหัส) - ใช้ในใบจัดรถ
      fullName: row.FullName,
      fullNameTh: row.FullNameTh ?? null,
      phone: row.Phone,
      department: row.Department,
      // สายและจุดขึ้นรถ ณ ตอนส่งคำขอ (ไม่เปลี่ยนตามการย้ายสายภายหลัง)
      routeId: row.RouteID ?? null,
      routeName: row.RouteName ?? null,
      pickupStop: row.PickupStop ?? null,
    })
  }
  return map
}

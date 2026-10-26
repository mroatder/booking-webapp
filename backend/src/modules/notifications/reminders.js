import * as vehicleRequestsRepo from '../vehicle-requests/repository.js'
import { toPublicVehicleRequest } from '../vehicle-requests/routes.js'
import * as notify from './service.js'

/**
 * อีเมลเตือนอัตโนมัติ (รันจาก jobs/reminders.js ทุก 15 นาที) - ทุกอย่างส่งครั้งเดียวต่อรายการ:
 * "จองสิทธิ์" ด้วย UPDATE ... OUTPUT ตั้งธงก่อนส่ง (เหมือนเตือนใกล้หมดเวลาห้อง) กันส่งซ้ำแม้รันซ้อนกัน
 */

async function toPublic(pool, requestId) {
  const row = await vehicleRequestsRepo.findById(pool, requestId)
  if (!row) return null
  const passengers = (await vehicleRequestsRepo.listPassengers(pool, [requestId])).get(requestId) ?? []
  return toPublicVehicleRequest(row, [], passengers)
}

/** คำขอรถนอกที่ผู้อนุมัติยังไม่ตัดสินเกิน 24 ชม. (นับจากส่ง/ส่งใหม่ล่าสุด) */
export async function claimApprovalReminders(pool) {
  const result = await pool.request().query(
    `UPDATE VehicleRequests
     SET ApprovalReminderSentAt = SYSUTCDATETIME()
     OUTPUT INSERTED.RequestID
     WHERE Status = 'Pending' AND ApprovalStatus = 'Pending' AND ApprovalReminderSentAt IS NULL
       AND COALESCE(UpdatedAt, CreatedAt) <= DATEADD(hour, -24, SYSUTCDATETIME())`,
  )
  return result.recordset.map((r) => r.RequestID)
}

/** รถที่จัดแล้วและจะออกเดินทางภายใน 24 ชม. (ข้ามที่เพิ่งจัดภายใน 3 ชม. - เพิ่งได้อีเมลจัดรถ) */
export async function claimTripReminders(pool) {
  const result = await pool.request().query(
    `UPDATE VehicleRequests
     SET TripReminderSentAt = SYSUTCDATETIME()
     OUTPUT INSERTED.RequestID
     WHERE Status = 'Assigned' AND TripReminderSentAt IS NULL
       AND DepartTime > SYSUTCDATETIME() AND DepartTime <= DATEADD(hour, 24, SYSUTCDATETIME())
       AND (AssignedAt IS NULL OR AssignedAt <= DATEADD(hour, -3, SYSUTCDATETIME()))`,
  )
  return result.recordset.map((r) => r.RequestID)
}

/** กิจกรรมเดินทางกลุ่มที่จะปิดรับลงชื่อภายใน 24 ชม. (ส่งถึงผู้รับแจ้งเตือนที่ยังไม่ลงชื่อ) */
export async function claimEventDeadlineReminders(pool) {
  const result = await pool.request().query(
    `UPDATE EventTrips
     SET DeadlineReminderSentAt = SYSUTCDATETIME()
     OUTPUT INSERTED.EventID, INSERTED.Title, INSERTED.Destination, INSERTED.Description, INSERTED.EventDate,
            INSERTED.ReturnDate, INSERTED.RegistrationDeadline, INSERTED.NotifyAll
     WHERE IsActive = 1 AND DeadlineReminderSentAt IS NULL AND RegistrationDeadline IS NOT NULL
       AND RegistrationDeadline > SYSUTCDATETIME() AND RegistrationDeadline <= DATEADD(hour, 24, SYSUTCDATETIME())`,
  )
  return result.recordset
}

export async function runReminders(pool) {
  for (const id of await claimApprovalReminders(pool)) {
    const request = await toPublic(pool, id)
    if (request?.approver) notify.vehicleApprovalReminder(request)
  }
  for (const id of await claimTripReminders(pool)) {
    const request = await toPublic(pool, id)
    if (request) notify.vehicleTripReminder(request)
  }
  for (const event of await claimEventDeadlineReminders(pool)) notify.eventDeadlineSoon(event)
}

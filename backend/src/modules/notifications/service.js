import { env } from '../../config/env.js'
import { getPool, sql } from '../../db/pool.js'
import { getTransporter, isMailConfigured } from './mailer.js'
import * as templates from './templates.js'
import { listBoardingRows } from '../events/repository.js'
import { groupByRecipient } from '../events/boarding.js'
import { boardingSummaryToXlsx } from '../events/report.js'

/**
 * แจ้งเตือนทางอีเมล (M7 - อีเมลอย่างเดียว, dev 2026-09-30)
 * - ส่งแบบ best-effort หลังตอบ API แล้ว: ส่งไม่สำเร็จ/SMTP ล่ม ต้องไม่ทำให้การจอง/จัดรถล้มเหลว (REQUIREMENTS กฎระบบ 4)
 * - ผู้ส่ง = SMTP_FROM (booking@...), ปิดเองตอนรัน test และตอนยังไม่ได้ตั้งค่า SMTP
 * - คำขอรถใหม่ส่งถึงผู้ใช้ที่เป็น Admin ทุกคน (ที่เปิดใช้งานและมีอีเมล) - dev 2026-09-30
 */

function isEnabled() {
  return env.nodeEnv !== 'test' && isMailConfigured()
}

async function deliver(to, mail) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))]
  if (recipients.length === 0) return
  // MAIL_REDIRECT_TO (dev): ส่งเข้ากล่องเดียว หัวเรื่องบอกว่าตัวจริงจะส่งถึงใคร
  const redirect = env.smtp.redirectTo
  await getTransporter().sendMail({
    from: env.smtp.from,
    to: redirect || recipients,
    subject: redirect ? `[DEV → ${recipients.join(', ')}] ${mail.subject}` : mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: mail.attachments,
  })
}

/** ส่งให้ผู้ร่วมเดินทางทีละคน - คนหนึ่งส่งไม่สำเร็จต้องไม่ทำให้คนอื่นไม่ได้รับ */
async function toPassengers(pool, request, build) {
  for (const c of await passengerContacts(pool, request)) {
    try {
      await deliver(c.email, build(c))
    } catch (err) {
      console.error(`[notify] passenger email for ${request.requestNo} failed:`, err?.message ?? err)
    }
  }
}

/** ส่งเบื้องหลัง ไม่รอผล - error เขียน log อย่างเดียว */
function later(label, task) {
  if (!isEnabled()) return
  setImmediate(async () => {
    try {
      await task(await getPool())
    } catch (err) {
      console.error(`[notify] ${label} failed:`, err?.message ?? err)
    }
  })
}

async function userContact(pool, userId) {
  const result = await pool
    .request()
    .input('id', sql.Int, userId)
    .query('SELECT FullName, Email FROM Users WHERE UserID = @id')
  const row = result.recordset[0]
  return { name: row?.FullName ?? null, email: row?.Email ?? null }
}

/**
 * ผู้ร่วมเดินทางของคำขอรถไปงานนอก (ไม่รวมผู้ขอ) ที่มีอีเมล - รถโอทีไม่ส่ง (ผู้โดยสารจำนวนมากและเป็นงานประจำ)
 */
async function passengerContacts(pool, request) {
  if (request.requestType !== 'BusinessTrip') return []
  const ids = (request.passengers ?? []).map((p) => p.id).filter((id) => id && id !== request.requesterUserId)
  const contacts = []
  for (const id of new Set(ids)) {
    const c = await userContact(pool, id)
    if (c.email) contacts.push(c)
  }
  return contacts
}

async function adminEmails(pool) {
  const result = await pool
    .request()
    .query(`SELECT Email FROM Users WHERE Role = 'Admin' AND IsActive = 1 AND Email IS NOT NULL AND Email <> ''`)
  return result.recordset.map((r) => r.Email)
}

// ---------------- ห้องประชุม (อีเมลภาษาอังกฤษ) ----------------

/** rows = การจองที่เพิ่งสร้าง (1 แถว หรือหลายแถวถ้าจองซ้ำรายสัปดาห์) */
export function roomBooked(rows, roomName) {
  const [first] = rows
  if (!first) return
  later('room booked', async (pool) => {
    const owner = await userContact(pool, first.UserID)
    await deliver(
      owner.email,
      templates.roomBooked({
        roomName,
        title: first.Title,
        ownerName: owner.name,
        startTime: first.StartTime,
        endTime: first.EndTime,
        occurrences: rows.length,
      }),
    )
  })
}

/** booking = แถวจาก findById (มี RoomName), byAdmin = Admin ยกเลิกของคนอื่น */
export function roomBookingCancelled(booking, { byAdmin }) {
  later('room cancelled', async (pool) => {
    const owner = await userContact(pool, booking.UserID)
    await deliver(
      owner.email,
      templates.roomBookingCancelled(
        { roomName: booking.RoomName, title: booking.Title, ownerName: owner.name, startTime: booking.StartTime, endTime: booking.EndTime },
        { byAdmin },
      ),
    )
  })
}

/** Admin แก้ไขการจองของผู้อื่น - booking = แถวหลังแก้ (UserID, Title, StartTime, EndTime), roomName จากแถวเดิม */
export function roomBookingUpdatedByAdmin(booking, roomName) {
  later('room updated by admin', async (pool) => {
    const owner = await userContact(pool, booking.UserID)
    await deliver(
      owner.email,
      templates.roomBookingUpdatedByAdmin({
        roomName,
        title: booking.Title,
        ownerName: owner.name,
        startTime: booking.StartTime,
        endTime: booking.EndTime,
      }),
    )
  })
}

/** released = แถวที่ job ปล่อยห้อง (BookingID, RoomID, UserID, Title, StartTime, EndTime) */
export function roomsAutoReleased(released) {
  for (const b of released) {
    later(`room released #${b.BookingID}`, async (pool) => {
      const [owner, room] = await Promise.all([
        userContact(pool, b.UserID),
        pool.request().input('id', sql.Int, b.RoomID).query('SELECT Name FROM Rooms WHERE RoomID = @id'),
      ])
      await deliver(
        owner.email,
        templates.roomAutoReleased({
          roomName: room.recordset[0]?.Name,
          title: b.Title,
          ownerName: owner.name,
          startTime: b.StartTime,
          endTime: b.EndTime,
        }),
      )
    })
  }
}

/** claimed = แถวจาก claimEndingSoonBookings - เตือนเจ้าของการจองว่าอีก 5 นาทีหมดเวลาและมีคนจองต่อ */
export function roomsEndingSoon(claimed, findNextBooking) {
  for (const b of claimed) {
    later(`room ending soon #${b.BookingID}`, async (pool) => {
      const next = await findNextBooking(pool, b.RoomID, b.EndTime)
      if (!next) return
      const owner = await userContact(pool, b.UserID)
      await deliver(
        owner.email,
        templates.roomEndingSoon(
          { roomName: next.RoomName, title: b.Title, ownerName: owner.name, startTime: b.StartTime, endTime: b.EndTime },
          { title: next.Title, startTime: next.StartTime, endTime: next.EndTime },
        ),
      )
    })
  }
}

// ---------------- รถ (อีเมลภาษาไทย) - request = คำขอรูปแบบ public (toPublicVehicleRequest) ----------------

/**
 * ส่งคำขอแล้ว - รถนอกที่ต้องอนุมัติ: แจ้งผู้ขอ + ผู้อนุมัติ (Admin ได้รับเมื่ออนุมัติแล้ว)
 * รถโอที / หัวหน้าขอเอง (อนุมัติอัตโนมัติ): แจ้งผู้ขอ + Admin ทุกคนทันที
 */
export function vehicleRequestSubmitted(request) {
  later(`vehicle submitted ${request.requestNo}`, async (pool) => {
    const requester = await userContact(pool, request.requesterUserId)
    await deliver(requester.email, templates.vehicleRequestSubmitted(request))
    if (request.approvalStatus === 'Pending') {
      const approver = await userContact(pool, request.approver.id)
      await deliver(approver.email, templates.vehicleApprovalRequested(request))
    } else {
      await deliver(await adminEmails(pool), templates.vehicleRequestNewForAdmin(request))
    }
  })
}

/** ผู้ขอแก้ไขคำขอรถนอก → แจ้งผู้อนุมัติให้พิจารณาใหม่ */
export function vehicleApprovalRequested(request) {
  later(`vehicle approval requested ${request.requestNo}`, async (pool) => {
    const approver = await userContact(pool, request.approver.id)
    await deliver(approver.email, templates.vehicleApprovalRequested(request))
  })
}

/**
 * หัวหน้าอนุมัติแล้ว → ส่งต่อให้ Admin เท่านั้น (Admin ส่งแบบฟอร์มให้บริษัทรถ แล้วจัดรถเมื่อรู้คนขับ)
 * ไม่แจ้งผู้ขอตอนนี้ - ผู้ขอได้อีเมลเมื่อจัดรถ+คนขับแล้ว (vehicleAssigned) เท่านั้น ไม่ให้เข้าใจผิดว่าได้รถแล้ว (dev 2026-10-05)
 */
export function vehicleApproved(request) {
  later(`vehicle approved ${request.requestNo}`, async (pool) => {
    await deliver(await adminEmails(pool), templates.vehicleRequestNewForAdmin(request))
  })
}

export function vehicleRejected(request) {
  later(`vehicle rejected ${request.requestNo}`, async (pool) => {
    const requester = await userContact(pool, request.requesterUserId)
    await deliver(requester.email, templates.vehicleRejected(request))
  })
}

export function vehicleAssigned(requests) {
  for (const request of requests) {
    later(`vehicle assigned ${request.requestNo}`, async (pool) => {
      const requester = await userContact(pool, request.requesterUserId)
      await deliver(requester.email, templates.vehicleAssigned(request, requester.name))
      await toPassengers(pool, request, (c) => templates.vehicleAssigned(request, c.name, { passenger: true }))
    })
  }
}

export function vehicleRequestCancelled(request, { byAdmin }) {
  later(`vehicle cancelled ${request.requestNo}`, async (pool) => {
    const requester = await userContact(pool, request.requesterUserId)
    await deliver(requester.email, templates.vehicleRequestCancelled(request, { byAdmin }))
    await toPassengers(pool, request, (c) =>
      templates.vehicleRequestCancelled(request, { byAdmin, passenger: true, recipientName: c.name }),
    )
  })
}

/**
 * ผู้ขอยกเลิกคำขอเอง → แจ้งฝ่ายที่รับรู้คำขอไปแล้ว: รออนุมัติ = ผู้อนุมัติ, อนุมัติแล้ว/ไม่ต้องอนุมัติ = Admin ทุกคน
 * (ไม่อนุมัติแล้ว = ไม่มีใครต้องรู้)
 */
export function vehicleRequestCancelledByRequester(request) {
  later(`vehicle cancelled by requester ${request.requestNo}`, async (pool) => {
    if (request.approvalStatus === 'Pending' && request.approver) {
      const approver = await userContact(pool, request.approver.id)
      await deliver(approver.email, templates.vehicleRequestCancelledByRequester(request, approver.name))
    } else if (request.approvalStatus !== 'Rejected') {
      await deliver(await adminEmails(pool), templates.vehicleRequestCancelledByRequester(request))
    }
  })
}

/** Admin แก้ไขคำขอของผู้อื่น → แจ้งผู้ขอ */
export function vehicleRequestUpdatedByAdmin(request) {
  later(`vehicle updated by admin ${request.requestNo}`, async (pool) => {
    const requester = await userContact(pool, request.requesterUserId)
    await deliver(requester.email, templates.vehicleRequestUpdatedByAdmin(request))
    await toPassengers(pool, request, (c) =>
      templates.vehicleRequestUpdatedByAdmin(request, { passenger: true, recipientName: c.name }),
    )
  })
}

// ---------------- เดินทางกลุ่ม (อีเมลภาษาไทย) ----------------

/**
 * Admin ประกาศรายละเอียดการขึ้นรถ → อีเมลถึงเจ้าของรายชื่อและคนที่ลงชื่อให้ (คนละ 1 ฉบับ แนบ Excel สรุปเฉพาะแถวที่คนนั้นเห็น)
 * คนที่ไม่มีอีเมลในระบบจะถูกข้าม (ยังเห็นในหน้าเว็บ) - คนหนึ่งส่งไม่สำเร็จต้องไม่ทำให้คนอื่นไม่ได้รับ
 */
export function eventBoardingPublished(eventId, { update = false } = {}) {
  later(`event boarding ${eventId}`, async (pool) => {
    const rows = await listBoardingRows(pool, { eventId })
    if (rows.length === 0) return
    const event = { Title: rows[0].Title, Destination: rows[0].Destination, EventDate: rows[0].EventDate }
    for (const [userId, list] of groupByRecipient(rows)) {
      try {
        const person = await userContact(pool, userId)
        if (!person.email) continue
        const attachment = await boardingSummaryToXlsx(event, list)
        await deliver(person.email, {
          ...templates.eventBoardingDetails(event, list, person.name, { update }),
          attachments: [{ filename: 'รายละเอียดการขึ้นรถ.xlsx', content: Buffer.from(attachment) }],
        })
      } catch (err) {
        console.error(`[notify] event boarding ${eventId} to user ${userId} failed:`, err?.message ?? err)
      }
    }
  })
}

/** Admin ยกเลิกประกาศ → อีเมลถึงทุกคนที่เคยได้รับ (เจ้าของรายชื่อและคนที่ลงชื่อให้) ว่าข้อมูลเดิมใช้ไม่ได้แล้ว */
export function eventBoardingRetracted(eventId) {
  later(`event boarding retracted ${eventId}`, async (pool) => {
    const rows = await listBoardingRows(pool, { eventId })
    if (rows.length === 0) return
    const event = { Title: rows[0].Title, Destination: rows[0].Destination, EventDate: rows[0].EventDate }
    for (const userId of groupByRecipient(rows).keys()) {
      try {
        const person = await userContact(pool, userId)
        await deliver(person.email, templates.eventBoardingRetracted(event, person.name))
      } catch (err) {
        console.error(`[notify] event boarding retracted ${eventId} to user ${userId} failed:`, err?.message ?? err)
      }
    }
  })
}

/**
 * ลงชื่อให้คนอื่น → อีเมลถึงคนที่ถูกลงชื่อ (ถ้ามีอีเมลในระบบ) - ลงชื่อตัวเองไม่ส่ง
 * passengers = [{ userId, pickupLocation, phoneNumber, tripType }]
 */
export function eventRegisteredByOther(event, passengers, byName) {
  for (const p of passengers) {
    later(`event registered ${event.EventID} user ${p.userId}`, async (pool) => {
      const person = await userContact(pool, p.userId)
      if (!person.email) return
      await deliver(person.email, templates.eventRegisteredByOther(event, p, byName, person.name))
    })
  }
}

/** ผู้อื่นยกเลิกการลงชื่อให้ → อีเมลถึงผู้เดินทาง (ถ้ามีอีเมล) - ยกเลิกของตัวเองไม่ส่ง */
export function eventRegistrationRemoved(event, passenger, byName) {
  later(`event registration removed ${event.EventID} user ${passenger.userId}`, async (pool) => {
    const person = await userContact(pool, passenger.userId)
    if (!person.email) return
    await deliver(person.email, templates.eventRegistrationRemoved(event, passenger, byName, person.name))
  })
}

/** ส่งให้ทีละคน - error รายคนเขียน log อย่างเดียว */
async function eachUser(pool, label, users, build) {
  for (const u of users) {
    try {
      if (u.Email) await deliver(u.Email, build(u.FullName))
    } catch (err) {
      console.error(`[notify] ${label} to user ${u.UserID} failed:`, err?.message ?? err)
    }
  }
}

/** ผู้ใช้ที่เปิดใช้งานและมีอีเมลทุกคน */
async function activeUsers(pool) {
  const result = await pool
    .request()
    .query(`SELECT UserID, FullName, Email FROM Users WHERE IsActive = 1 AND Email IS NOT NULL AND Email <> ''`)
  return result.recordset
}

/** ผู้ที่ลงชื่อไว้ในกิจกรรม (ไม่ซ้ำ) */
async function eventRegistrants(pool, eventId) {
  const result = await pool
    .request()
    .input('eventId', sql.Int, eventId)
    .query(
      `SELECT DISTINCT u.UserID, u.FullName, u.Email FROM EventPassengers p JOIN Users u ON u.UserID = p.UserID
       WHERE p.EventID = @eventId AND u.Email IS NOT NULL AND u.Email <> ''`,
    )
  return result.recordset
}

/** ผู้รับแจ้งเตือนที่ Admin เลือกไว้ตอนสร้างกิจกรรม (ที่ใช้งานอยู่และมีอีเมล) */
async function invitees(pool, eventId) {
  const result = await pool
    .request()
    .input('eventId', sql.Int, eventId)
    .query(
      `SELECT u.UserID, u.FullName, u.Email FROM EventInvitees i JOIN Users u ON u.UserID = i.UserID
       WHERE i.EventID = @eventId AND u.IsActive = 1 AND u.Email IS NOT NULL AND u.Email <> ''`,
    )
  return result.recordset
}

/**
 * Admin สร้างกิจกรรมใหม่ → แจ้งผู้รับที่เลือกไว้: audience = { notifyAll } (พนักงานทุกคนที่มีอีเมล) หรือ { inviteeIds } (เฉพาะรายคน)
 */
export function eventCreated(event, audience) {
  later(`event created ${event.EventID}`, async (pool) => {
    const users = audience.notifyAll ? await activeUsers(pool) : await invitees(pool, event.EventID)
    await eachUser(pool, `event created ${event.EventID}`, users, (name) => templates.eventCreated(event, name))
  })
}

/** Admin แก้วันเดินทาง/ปลายทาง → แจ้งผู้ที่ลงชื่อไว้ */
export function eventChanged(event) {
  later(`event changed ${event.EventID}`, async (pool) => {
    await eachUser(pool, `event changed ${event.EventID}`, await eventRegistrants(pool, event.EventID), (name) =>
      templates.eventChanged(event, name),
    )
  })
}

/** Admin ลบ/ยกเลิกกิจกรรม → แจ้งผู้ที่ลงชื่อไว้ */
export function eventCancelled(event) {
  later(`event cancelled ${event.EventID}`, async (pool) => {
    await eachUser(pool, `event cancelled ${event.EventID}`, await eventRegistrants(pool, event.EventID), (name) =>
      templates.eventCancelled(event, name),
    )
  })
}

/** เตือนใกล้ปิดรับ (จาก job) → ผู้รับแจ้งเตือนของกิจกรรมนั้นที่ยังไม่ลงชื่อ (event.NotifyAll = ทุกคน) */
export function eventDeadlineSoon(event) {
  later(`event deadline ${event.EventID}`, async (pool) => {
    const registered = new Set((await eventRegistrants(pool, event.EventID)).map((u) => u.UserID))
    const audience = event.NotifyAll ? await activeUsers(pool) : await invitees(pool, event.EventID)
    await eachUser(
      pool,
      `event deadline ${event.EventID}`,
      audience.filter((u) => !registered.has(u.UserID)),
      (name) => templates.eventDeadlineSoon(event, name),
    )
  })
}

/** เตือนผู้อนุมัติ (จาก job) */
export function vehicleApprovalReminder(request) {
  later(`vehicle approval reminder ${request.requestNo}`, async (pool) => {
    const approver = await userContact(pool, request.approver.id)
    await deliver(approver.email, templates.vehicleApprovalReminder(request, approver.name))
  })
}

/** เตือนก่อนวันเดินทาง (จาก job) → ผู้ขอ + ผู้ร่วมเดินทาง (รถนอกเท่านั้น) */
export function vehicleTripReminder(request) {
  later(`vehicle trip reminder ${request.requestNo}`, async (pool) => {
    const requester = await userContact(pool, request.requesterUserId)
    await deliver(requester.email, templates.vehicleTripReminder(request, requester.name))
    await toPassengers(pool, request, (c) => templates.vehicleTripReminder(request, c.name, { passenger: true }))
  })
}

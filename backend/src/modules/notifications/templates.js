import { renderEmail, appUrl } from './layout.js'

/**
 * อีเมลแต่ละเหตุการณ์ - ทุกฉบับใช้แม่แบบกลาง (layout.js) เปลี่ยนแค่ป้าย/หัวเรื่อง/ข้อความ/รายละเอียด
 * ภาษา: ห้องประชุม = อังกฤษ, จองรถ = ไทย (dev 2026-09-30)
 * วันที่แบบไทย DD/MM/YYYY ปี ค.ศ. เวลา 24 ชม. เวลาไทย (ตรงกับหน้าเว็บ)
 */

const pad = (n) => String(n).padStart(2, '0')
function bangkok(date) {
  // แปลงเป็นเวลาไทย (UTC+7) โดยไม่พึ่ง timezone ของเครื่องเซิร์ฟเวอร์
  const d = new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000)
  return {
    date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  }
}
export function bangkokTime(date) {
  return bangkok(date).time
}
export function formatDateTime(date) {
  const b = bangkok(date)
  return `${b.date} ${b.time}`
}
/** ช่วงเวลา - วันเดียวกัน: 30/09/2026 09:00 – 10:30, ข้ามวัน: แสดงวันที่ทั้งสองฝั่ง */
export function formatRange(start, end) {
  const a = bangkok(start)
  const b = bangkok(end)
  return a.date === b.date ? `${a.date} ${a.time} – ${b.time}` : `${a.date} ${a.time} – ${b.date} ${b.time}`
}

const dear = (name) => (name ? `เรียน คุณ${name}` : undefined)

const REQUEST_TYPE = { BusinessTrip: 'รถไปงานนอก', Shuttle: 'รถโอที' }
const TRIP_TYPE = { RoundTrip: 'ไป-กลับ', OneWay: 'ไปอย่างเดียว', ReturnOnly: 'กลับอย่างเดียว' }
const VEHICLE_TYPE = { Van: 'รถตู้', Sedan: 'รถเก๋ง' }

// ---------- รถ: แถบสรุป + หมวดรายละเอียด ----------
function vehicleSummary(r) {
  return [
    ['เลขที่คำขอ', r.requestNo],
    ['วันเวลา', formatRange(r.departTime, r.returnTime)],
  ]
}

// จุดที่เป็นบริษัทอาจระบุประตูที่ให้รถรับ/ส่ง
const withGate = (place, gate) => (gate ? `${place} (${gate})` : place)

function tripSection(r) {
  return {
    title: 'รายละเอียดการเดินทาง',
    rows: [
      ['ประเภท', [REQUEST_TYPE[r.requestType], r.requestType === 'BusinessTrip' ? TRIP_TYPE[r.tripType] : null].filter(Boolean).join(' • ')],
      ['จุดรับ', withGate(r.pickupLocation, r.pickupGate)],
      ['ปลายทาง', withGate(r.destination, r.destinationGate)],
      ['รถที่ขอ', VEHICLE_TYPE[r.vehicleType] ?? r.vehicleType],
      ['จำนวนผู้โดยสาร', `${r.passengerCount} คน`],
    ],
  }
}

function requesterSection(r) {
  return {
    title: 'ผู้ขอ',
    rows: [
      ['ชื่อ', r.requesterName],
      ['แผนก', r.requesterDepartment],
      ['เบอร์ติดต่อ', r.contactPhone],
    ],
  }
}

function assignmentSection(a) {
  return {
    title: 'รถและคนขับ',
    rows: a
      ? [
          ['คนขับ', a.name],
          ['เบอร์คนขับ', a.phone],
          ['ทะเบียนรถ', a.licensePlate],
          ['ผู้ให้บริการ', a.provider],
        ]
      : [],
  }
}

// ---------------- ห้องประชุม - ภาษาอังกฤษ (dev 2026-09-30) ----------------

const hello = (name) => (name ? `Dear ${name},` : undefined)

function roomSummary(b) {
  return [
    ['Room', b.roomName],
    ['Date & time', formatRange(b.startTime, b.endTime)],
  ]
}

export function roomBooked(b) {
  return renderEmail({
    lang: 'en',
    subject: `Room booked: ${b.roomName} - ${formatRange(b.startTime, b.endTime)}`,
    label: 'Meeting Room Booking',
    tone: 'success',
    status: 'Confirmed',
    title: 'Your meeting room booking is confirmed',
    greeting: hello(b.ownerName),
    paragraphs: ['Your meeting room booking has been recorded. The details are below.'],
    summary: roomSummary(b),
    sections: [
      {
        title: 'Booking details',
        rows: [
          ['Meeting', b.title],
          ['Room', b.roomName],
          ['Date & time', formatRange(b.startTime, b.endTime)],
          ['Repeats', b.occurrences > 1 ? `Weekly, ${b.occurrences} occurrences` : null],
        ],
      },
    ],
    action: { label: 'View my bookings', url: appUrl('/bookings/rooms/mine') },
    note: 'Please check in within 10 minutes after the start time. Otherwise the room will be released automatically.',
  })
}

/** Admin แก้ไขการจองของผู้อื่น (หัวข้อ/เวลา) */
export function roomBookingUpdatedByAdmin(b) {
  return renderEmail({
    lang: 'en',
    subject: `Booking updated: ${b.roomName} - ${formatRange(b.startTime, b.endTime)}`,
    label: 'Meeting Room Booking',
    tone: 'warning',
    status: 'Updated',
    title: 'Your booking was updated by an administrator',
    greeting: hello(b.ownerName),
    paragraphs: ['A system administrator changed the booking below. Please check the latest details. Contact the administrator if you have any questions.'],
    summary: roomSummary(b),
    sections: [{ title: 'Booking details', rows: [['Meeting', b.title]] }],
    action: { label: 'View my bookings', url: appUrl('/bookings/rooms/mine') },
  })
}

export function roomBookingCancelled(b, { byAdmin } = {}) {
  return renderEmail({
    lang: 'en',
    subject: `Booking cancelled: ${b.roomName} - ${formatRange(b.startTime, b.endTime)}`,
    label: 'Meeting Room Booking',
    tone: 'neutral',
    status: 'Cancelled',
    title: byAdmin ? 'Your booking was cancelled by an administrator' : 'Your booking has been cancelled',
    greeting: hello(b.ownerName),
    paragraphs: [
      byAdmin
        ? 'The booking below was cancelled by a system administrator. Please contact the administrator if you have any questions.'
        : 'The booking below has been cancelled.',
    ],
    summary: roomSummary(b),
    sections: [{ title: 'Booking details', rows: [['Meeting', b.title]] }],
    action: { label: 'Book a room', url: appUrl('/bookings/rooms/new') },
  })
}

export function roomAutoReleased(b) {
  return renderEmail({
    lang: 'en',
    subject: `Room released: ${b.roomName} (no check-in)`,
    label: 'Meeting Room Booking',
    tone: 'warning',
    status: 'Released',
    title: 'Your room was released because nobody checked in',
    greeting: hello(b.ownerName),
    paragraphs: ['Nobody checked in within 10 minutes after the start time, so the room has been released for others to book.'],
    summary: roomSummary(b),
    sections: [{ title: 'Booking details', rows: [['Meeting', b.title]] }],
    action: { label: 'Book a room', url: appUrl('/bookings/rooms/new') },
  })
}

/**
 * เตือนผู้จองก่อนหมดเวลา 5 นาที เมื่อมีคนจองห้องต่อ (dev 2026-10-05 เลือกแบบนี้ - REQUIREMENTS กฎห้องข้อ 7)
 * current = การจองที่ใกล้หมดเวลา, next = การจองถัดไปของห้องเดียวกัน
 */
export function roomEndingSoon(current, next) {
  return renderEmail({
    lang: 'en',
    subject: `${current.roomName}: your meeting ends at ${bangkokTime(current.endTime)} - next booking at ${bangkokTime(next.startTime)}`,
    label: 'Meeting Room Booking',
    tone: 'warning',
    status: 'Ending soon',
    title: 'Your meeting ends in 5 minutes',
    greeting: hello(current.ownerName),
    paragraphs: [
      'Another meeting is booked in this room right after yours. Please wrap up on time and leave the room ready for the next group.',
    ],
    summary: [
      ['Room', current.roomName],
      ['Your booking ends', bangkokTime(current.endTime)],
    ],
    sections: [
      {
        title: 'Schedule',
        rows: [
          ['Your meeting', `${current.title}\n${formatRange(current.startTime, current.endTime)}`],
          ['Next booking', `${next.title}\n${formatRange(next.startTime, next.endTime)}`],
        ],
      },
    ],
    action: { label: 'View my bookings', url: appUrl('/bookings/rooms/mine') },
  })
}

// ---------------- รถ - ภาษาไทย ----------------

/** ถึงผู้ขอ: ยืนยันว่าส่งคำขอแล้ว */
export function vehicleRequestSubmitted(r) {
  return renderEmail({
    lang: 'th',
    subject: `ได้รับคำขอรถ ${r.requestNo} แล้ว`,
    label: 'คำขอใช้รถ',
    tone: 'info',
    status: r.approvalStatus === 'Pending' ? 'รออนุมัติ' : 'รอดำเนินการ',
    title: 'ได้รับคำขอใช้รถของท่านแล้ว',
    greeting: dear(r.requesterName),
    paragraphs: [
      r.approvalStatus === 'Pending'
        ? `ระบบได้รับคำขอใช้รถของท่านแล้ว และส่งให้ ${r.approver?.name ?? 'ผู้อนุมัติ'} พิจารณาอนุมัติ - ระบบจะแจ้งให้ทราบอีกครั้งเมื่อจัดรถและคนขับเรียบร้อยแล้ว (หรือหากคำขอไม่ได้รับการอนุมัติ)`
        : 'ระบบได้รับคำขอใช้รถของท่านเรียบร้อยแล้ว และจะแจ้งให้ทราบอีกครั้งเมื่อผู้ดูแลระบบจัดรถและคนขับ',
    ],
    summary: vehicleSummary(r),
    sections: [tripSection(r)],
    action: { label: 'ดูคำขอของฉัน', url: appUrl('/requests/vehicles/mine') },
    note: 'ท่านสามารถแก้ไขหรือยกเลิกคำขอได้ขณะยังรอดำเนินการ หลังจัดรถแล้วกรุณาติดต่อผู้ดูแลระบบ',
  })
}

/** ถึงผู้อนุมัติ: มีคำขอรถนอกรอการอนุมัติ (dev+HR 2026-10-05) */
export function vehicleApprovalRequested(r) {
  return renderEmail({
    lang: 'th',
    subject: `ขออนุมัติใช้รถ ${r.requestNo} - ${r.requesterName}`,
    label: 'คำขอใช้รถ',
    tone: 'warning',
    status: 'รออนุมัติ',
    title: 'มีคำขอใช้รถรอการอนุมัติจากท่าน',
    greeting: dear(r.approver?.name),
    paragraphs: [`${r.requesterName} ขอใช้รถไปงานนอก และเลือกท่านเป็นผู้อนุมัติ กรุณาพิจารณาในระบบ`],
    summary: vehicleSummary(r),
    sections: [
      { title: 'เหตุผลการขอใช้รถ', rows: [['เหตุผล', r.reason]] },
      tripSection(r),
      requesterSection(r),
    ],
    action: { label: 'พิจารณาคำขอ', url: appUrl('/requests/vehicles/approvals') },
  })
}

/** ถึงผู้ขอ: ไม่อนุมัติ พร้อมเหตุผล */
export function vehicleRejected(r) {
  return renderEmail({
    lang: 'th',
    subject: `คำขอรถ ${r.requestNo} ไม่ได้รับการอนุมัติ`,
    label: 'คำขอใช้รถ',
    tone: 'danger',
    status: 'ไม่อนุมัติ',
    title: 'คำขอใช้รถของท่านไม่ได้รับการอนุมัติ',
    greeting: dear(r.requesterName),
    paragraphs: [`${r.approver?.name ?? 'ผู้อนุมัติ'} ไม่อนุมัติคำขอของท่าน ท่านสามารถแก้ไขคำขอแล้วส่งพิจารณาใหม่ หรือยกเลิกคำขอได้`],
    summary: vehicleSummary(r),
    sections: [{ title: 'เหตุผลที่ไม่อนุมัติ', rows: [['เหตุผล', r.approvalNote]] }, tripSection(r)],
    action: { label: 'ดูคำขอของฉัน', url: appUrl('/requests/vehicles/mine') },
  })
}

/** ถึง Admin: มีคำขอรถใหม่รอจัด */
export function vehicleRequestNewForAdmin(r) {
  return renderEmail({
    lang: 'th',
    subject: `คำขอรถใหม่ ${r.requestNo} - ${formatRange(r.departTime, r.returnTime)}`,
    label: 'คำขอใช้รถ',
    tone: 'warning',
    status: 'รอจัดรถ',
    title: 'มีคำขอใช้รถใหม่รอการจัดรถ',
    paragraphs: [`${r.requesterName} ส่งคำขอใช้รถ กรุณาตรวจสอบและจัดรถพร้อมคนขับ`],
    summary: vehicleSummary(r),
    sections: [tripSection(r), requesterSection(r)],
    action: { label: 'ไปหน้าจัดการคำขอรถ', url: appUrl('/requests/vehicles/manage') },
  })
}

/** ถึงผู้ขอ: จัดรถแล้ว */
export function vehicleAssigned(r, recipientName, { passenger = false } = {}) {
  return renderEmail({
    lang: 'th',
    subject: `${passenger ? 'ท่านร่วมเดินทาง: ' : ''}จัดรถให้คำขอ ${r.requestNo} แล้ว - ${formatRange(r.departTime, r.returnTime)}`,
    label: 'คำขอใช้รถ',
    tone: 'success',
    status: 'จัดรถแล้ว',
    title: 'จัดรถและคนขับเรียบร้อยแล้ว',
    greeting: dear(recipientName ?? r.requesterName),
    paragraphs: [
      passenger
        ? `${r.requesterName} ขอใช้รถ และท่านมีรายชื่อเป็นผู้ร่วมเดินทาง ผู้ดูแลระบบได้จัดรถและคนขับแล้ว รายละเอียดดังนี้`
        : 'ผู้ดูแลระบบได้จัดรถและคนขับสำหรับการเดินทางของท่านแล้ว รายละเอียดดังนี้',
    ],
    summary: vehicleSummary(r),
    sections: [assignmentSection(r.driver), tripSection(r)],
    // ผู้ร่วมเดินทางเปิดคำขอในระบบไม่ได้ (เห็นเฉพาะผู้ขอ/ผู้อนุมัติ/Admin) จึงไม่มีปุ่ม
    action: passenger ? undefined : { label: 'ดูรายละเอียดคำขอ', url: appUrl('/requests/vehicles/mine') },
    note: 'หากต้องการยกเลิกหรือเปลี่ยนแปลงการเดินทาง กรุณาติดต่อผู้ดูแลระบบ',
  })
}

/**
 * ประกาศรายละเอียดการขึ้นรถของเดินทางกลุ่ม - ถึงเจ้าของรายชื่อและคนที่ลงชื่อให้ (แต่ละคนเห็นเฉพาะแถวของตัวเอง/คนที่ตัวเองลงให้)
 * rows = แถวจาก listBoardingRows
 */
export function eventBoardingDetails(event, rows, recipientName, { update = false } = {}) {
  const many = rows.length > 1
  return renderEmail({
    lang: 'th',
    subject: `${update ? 'อัปเดต: ' : ''}รายละเอียดการขึ้นรถ - ${event.Title} (${bangkok(event.EventDate).date})`,
    label: 'เดินทางกลุ่ม',
    tone: update ? 'warning' : 'success',
    status: update ? 'อัปเดต' : 'ประกาศแล้ว',
    title: update ? 'รายละเอียดการขึ้นรถมีการเปลี่ยนแปลง' : 'รายละเอียดการขึ้นรถ',
    greeting: dear(recipientName),
    paragraphs: [
      update
        ? 'ผู้ดูแลระบบได้แก้ไขรายละเอียดการขึ้นรถ กรุณาตรวจสอบข้อมูลล่าสุดด้านล่าง (ใช้แทนข้อมูลในอีเมลฉบับก่อน) - มีไฟล์ Excel สรุปแนบมากับอีเมลนี้'
        : 'ผู้ดูแลระบบได้ประกาศสายรถ เวลา และรถสำหรับการเดินทางด้านล่างแล้ว กรุณาไปถึงจุดขึ้นรถก่อนเวลาเล็กน้อย - มีไฟล์ Excel สรุปแนบมากับอีเมลนี้',
    ],
    summary: [
      ['กิจกรรม', event.Title],
      ['ปลายทาง', event.Destination],
      ['วันเดินทาง', formatDateTime(event.EventDate)],
    ],
    sections: rows.map((r) => ({
      title: many ? `ผู้เดินทาง: ${r.PassengerName}` : 'รายละเอียดการขึ้นรถ',
      rows: [
        ['สายรถ', r.RouteName],
        ['ประเภทรถ', VEHICLE_TYPE[r.VehicleType]],
        ['เวลาขึ้นรถ', r.BoardingAt ? formatDateTime(r.BoardingAt) : null],
        ['จุดขึ้นรถ', r.PickupLocation],
        ['ทะเบียนรถ', r.VehiclePlate],
        ['คนขับ', r.DriverName],
        ['เบอร์คนขับ', r.DriverPhone],
      ],
    })),
    action: { label: 'ดูรายละเอียดการขึ้นรถในระบบ', url: appUrl('/requests/vehicles/events?tab=boarding') },
    note: 'หากข้อมูลไม่ถูกต้องหรือต้องการเปลี่ยนแปลง กรุณาติดต่อผู้ดูแลระบบ',
  })
}

export function vehicleRequestCancelled(r, { byAdmin, passenger = false, recipientName } = {}) {
  return renderEmail({
    lang: 'th',
    subject: `ยกเลิกคำขอรถ ${r.requestNo}`,
    label: 'คำขอใช้รถ',
    tone: 'danger',
    status: 'ยกเลิก',
    title: passenger
      ? 'คำขอใช้รถที่ท่านร่วมเดินทางถูกยกเลิก'
      : byAdmin
        ? 'ผู้ดูแลระบบยกเลิกคำขอใช้รถของท่าน'
        : 'ยกเลิกคำขอใช้รถเรียบร้อยแล้ว',
    greeting: dear(recipientName ?? r.requesterName),
    paragraphs: [
      passenger
        ? `คำขอใช้รถของ ${r.requesterName} ที่ท่านมีรายชื่อเป็นผู้ร่วมเดินทางถูกยกเลิกแล้ว ไม่ต้องเดินทางตามรายการด้านล่าง`
        : byAdmin
          ? 'คำขอด้านล่างถูกยกเลิกโดยผู้ดูแลระบบ หากมีข้อสงสัยกรุณาติดต่อผู้ดูแลระบบ'
          : 'คำขอด้านล่างถูกยกเลิกเรียบร้อยแล้ว',
    ],
    summary: vehicleSummary(r),
    sections: [tripSection(r)],
    action: passenger ? undefined : { label: 'ดูคำขอของฉัน', url: appUrl('/requests/vehicles/mine') },
  })
}

/** ผู้ดูแลระบบยกเลิกการประกาศรายละเอียดการขึ้นรถ - ข้อมูลในอีเมลก่อนหน้าใช้ไม่ได้แล้ว */
export function eventBoardingRetracted(event, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `ยกเลิกประกาศรายละเอียดการขึ้นรถ - ${event.Title} (${bangkok(event.EventDate).date})`,
    label: 'เดินทางกลุ่ม',
    tone: 'danger',
    status: 'ยกเลิกประกาศ',
    title: 'ยกเลิกประกาศรายละเอียดการขึ้นรถ',
    greeting: dear(recipientName),
    paragraphs: [
      'ผู้ดูแลระบบยกเลิกการประกาศรายละเอียดการขึ้นรถของการเดินทางนี้ กรุณาอย่าใช้ข้อมูลสายรถ/เวลาจากอีเมลฉบับก่อน - จะแจ้งให้ทราบอีกครั้งเมื่อประกาศใหม่',
    ],
    summary: [
      ['กิจกรรม', event.Title],
      ['ปลายทาง', event.Destination],
      ['วันเดินทาง', formatDateTime(event.EventDate)],
    ],
    action: { label: 'ดูการเดินทางกลุ่มในระบบ', url: appUrl('/requests/vehicles/events') },
    note: 'หากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ',
  })
}

/** ผู้ขอยกเลิกคำขอเอง - ถึงผู้อนุมัติ (กำลังรออนุมัติ) หรือ Admin (อนุมัติแล้ว/ไม่ต้องอนุมัติ) */
export function vehicleRequestCancelledByRequester(r, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `${r.requesterName} ยกเลิกคำขอรถ ${r.requestNo}`,
    label: 'คำขอใช้รถ',
    tone: 'neutral',
    status: 'ยกเลิก',
    title: 'ผู้ขอยกเลิกคำขอใช้รถ',
    greeting: dear(recipientName),
    paragraphs: [`${r.requesterName} ยกเลิกคำขอใช้รถด้านล่างแล้ว ไม่ต้องดำเนินการต่อ`],
    summary: vehicleSummary(r),
    sections: [tripSection(r), requesterSection(r)],
  })
}

/** Admin แก้ไขคำขอของผู้อื่น - แจ้งผู้ขอพร้อมข้อมูลล่าสุด (และรถ/คนขับถ้าจัดแล้ว) */
export function vehicleRequestUpdatedByAdmin(r, { passenger = false, recipientName } = {}) {
  return renderEmail({
    lang: 'th',
    subject: `คำขอรถ ${r.requestNo} ถูกแก้ไขโดยผู้ดูแลระบบ`,
    label: 'คำขอใช้รถ',
    tone: 'warning',
    status: 'แก้ไขแล้ว',
    title: passenger ? 'คำขอใช้รถที่ท่านร่วมเดินทางถูกแก้ไข' : 'ผู้ดูแลระบบแก้ไขคำขอใช้รถของท่าน',
    greeting: dear(recipientName ?? r.requesterName),
    paragraphs: [
      passenger
        ? `ผู้ดูแลระบบได้แก้ไขรายละเอียดคำขอใช้รถของ ${r.requesterName} ที่ท่านร่วมเดินทาง กรุณาตรวจสอบข้อมูลล่าสุดด้านล่าง`
        : 'ผู้ดูแลระบบได้แก้ไขรายละเอียดคำขอของท่าน กรุณาตรวจสอบข้อมูลล่าสุดด้านล่าง',
    ],
    summary: vehicleSummary(r),
    sections: [tripSection(r), ...(r.driver ? [assignmentSection(r.driver)] : [])],
    action: passenger ? undefined : { label: 'ดูคำขอของฉัน', url: appUrl('/requests/vehicles/mine') },
    note: 'หากไม่ถูกต้องหรือมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ',
  })
}


const TRIP_TYPE_EVENT = { RoundTrip: 'ไป-กลับ', GoOnly: 'ไปอย่างเดียว', ReturnOnly: 'กลับอย่างเดียว' }

function eventSummary(event) {
  return [
    ['กิจกรรม', event.Title],
    ['ปลายทาง', event.Destination],
    ['วันเดินทาง', formatDateTime(event.EventDate)],
  ]
}

/** ถึงผู้เดินทางที่คนอื่นลงชื่อให้ (ไม่ใช่ตัวเองลงเอง) */
export function eventRegisteredByOther(event, p, byName, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `ท่านถูกลงชื่อเดินทางกลุ่ม - ${event.Title} (${bangkok(event.EventDate).date})`,
    label: 'เดินทางกลุ่ม',
    tone: 'info',
    status: 'ลงชื่อแล้ว',
    title: 'ท่านถูกลงชื่อในการเดินทางกลุ่ม',
    greeting: dear(recipientName),
    paragraphs: [`${byName ?? 'ผู้ใช้อื่น'} ได้ลงชื่อท่านเข้าร่วมการเดินทางด้านล่างแล้ว กรุณาตรวจสอบข้อมูล หากไม่ถูกต้องหรือไม่ได้ไป สามารถยกเลิกการลงชื่อในระบบได้`],
    summary: eventSummary(event),
    sections: [
      {
        title: 'ข้อมูลที่ลงชื่อไว้',
        rows: [
          ['จุดขึ้นรถ', p.pickupLocation],
          ['เบอร์ติดต่อ', p.phoneNumber],
          ['รูปแบบการเดินทาง', TRIP_TYPE_EVENT[p.tripType]],
          ['ลงชื่อโดย', byName],
        ],
      },
    ],
    action: { label: 'ดูการเดินทางกลุ่มในระบบ', url: appUrl('/requests/vehicles/events') },
  })
}

/** ถึงผู้เดินทางที่ถูกคนอื่น (Admin / ผู้ที่ลงชื่อให้) ยกเลิกการลงชื่อ */
export function eventRegistrationRemoved(event, p, byName, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `ยกเลิกการลงชื่อเดินทางกลุ่ม - ${event.Title} (${bangkok(event.EventDate).date})`,
    label: 'เดินทางกลุ่ม',
    tone: 'danger',
    status: 'ยกเลิกการลงชื่อ',
    title: 'การลงชื่อเดินทางกลุ่มของท่านถูกยกเลิก',
    greeting: dear(recipientName),
    paragraphs: [`${byName ?? 'ผู้ใช้อื่น'} ได้ยกเลิกการลงชื่อของท่านในการเดินทางด้านล่าง หากยังต้องการไป กรุณาลงชื่อใหม่ในระบบ`],
    summary: eventSummary(event),
    sections: [{ title: 'ข้อมูลที่ยกเลิก', rows: [['จุดขึ้นรถ', p.pickupLocation], ['ยกเลิกโดย', byName]] }],
    action: { label: 'ดูการเดินทางกลุ่มในระบบ', url: appUrl('/requests/vehicles/events') },
  })
}

// ---------------- เดินทางกลุ่ม: กิจกรรม ----------------

const EVENT_LINK = '/requests/vehicles/events'

function eventDetailsSection(event) {
  return {
    title: 'รายละเอียดกิจกรรม',
    rows: [
      ['กิจกรรม', event.Title],
      ['ปลายทาง', event.Destination],
      ['วันเดินทาง', formatDateTime(event.EventDate)],
      ['วันกลับ', event.ReturnDate ? formatDateTime(event.ReturnDate) : null],
      ['ปิดรับลงชื่อ', event.RegistrationDeadline ? formatDateTime(event.RegistrationDeadline) : null],
      ['รายละเอียดเพิ่มเติม', event.Description],
    ],
  }
}

/** กิจกรรมใหม่เปิดให้ลงชื่อ - ถึงพนักงานทุกคน */
export function eventCreated(event, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `เปิดลงชื่อเดินทางกลุ่ม - ${event.Title} (${bangkok(event.EventDate).date})`,
    label: 'เดินทางกลุ่ม',
    tone: 'info',
    status: 'เปิดลงชื่อ',
    title: 'มีกิจกรรมเดินทางกลุ่มใหม่เปิดให้ลงชื่อ',
    greeting: dear(recipientName),
    paragraphs: ['ผู้ดูแลระบบเปิดให้ลงชื่อเดินทางกลุ่มตามรายละเอียดด้านล่าง หากต้องการไป กรุณาลงชื่อพร้อมจุดขึ้นรถในระบบ'],
    summary: [
      ['กิจกรรม', event.Title],
      ['วันเดินทาง', formatDateTime(event.EventDate)],
    ],
    sections: [eventDetailsSection(event)],
    action: { label: 'ลงชื่อในระบบ', url: appUrl(EVENT_LINK) },
  })
}

/** ใกล้ปิดรับลงชื่อ - ถึงคนที่ยังไม่ลงชื่อ */
export function eventDeadlineSoon(event, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `ใกล้ปิดรับลงชื่อ - ${event.Title} (ปิด ${formatDateTime(event.RegistrationDeadline)})`,
    label: 'เดินทางกลุ่ม',
    tone: 'warning',
    status: 'ใกล้ปิดรับ',
    title: 'ใกล้ปิดรับลงชื่อเดินทางกลุ่ม',
    greeting: dear(recipientName),
    paragraphs: ['กิจกรรมด้านล่างจะปิดรับลงชื่อภายใน 24 ชั่วโมง หากต้องการไปและยังไม่ได้ลงชื่อ กรุณาลงชื่อก่อนปิดรับ'],
    summary: [
      ['กิจกรรม', event.Title],
      ['ปิดรับลงชื่อ', formatDateTime(event.RegistrationDeadline)],
    ],
    sections: [eventDetailsSection(event)],
    action: { label: 'ลงชื่อในระบบ', url: appUrl(EVENT_LINK) },
  })
}

/** กิจกรรมถูกยกเลิก - ถึงผู้ที่ลงชื่อไว้ */
export function eventCancelled(event, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `ยกเลิกกิจกรรมเดินทางกลุ่ม - ${event.Title} (${bangkok(event.EventDate).date})`,
    label: 'เดินทางกลุ่ม',
    tone: 'danger',
    status: 'ยกเลิก',
    title: 'กิจกรรมเดินทางกลุ่มที่ท่านลงชื่อถูกยกเลิก',
    greeting: dear(recipientName),
    paragraphs: ['ผู้ดูแลระบบยกเลิกกิจกรรมด้านล่าง ไม่ต้องเดินทางตามรายการนี้ หากมีข้อสงสัยกรุณาติดต่อผู้ดูแลระบบ'],
    summary: [
      ['กิจกรรม', event.Title],
      ['วันเดินทาง', formatDateTime(event.EventDate)],
    ],
    sections: [{ title: 'รายละเอียดกิจกรรม', rows: [['ปลายทาง', event.Destination]] }],
  })
}

/** วัน/ปลายทางของกิจกรรมเปลี่ยน - ถึงผู้ที่ลงชื่อไว้ */
export function eventChanged(event, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `กิจกรรมเดินทางกลุ่มมีการเปลี่ยนแปลง - ${event.Title}`,
    label: 'เดินทางกลุ่ม',
    tone: 'warning',
    status: 'เปลี่ยนแปลง',
    title: 'กิจกรรมเดินทางกลุ่มที่ท่านลงชื่อมีการเปลี่ยนแปลง',
    greeting: dear(recipientName),
    paragraphs: ['ผู้ดูแลระบบแก้ไขวันเดินทางหรือปลายทางของกิจกรรม กรุณาตรวจสอบข้อมูลล่าสุดด้านล่าง'],
    summary: [
      ['กิจกรรม', event.Title],
      ['วันเดินทาง', formatDateTime(event.EventDate)],
    ],
    sections: [eventDetailsSection(event)],
    action: { label: 'ดูการเดินทางกลุ่มในระบบ', url: appUrl(EVENT_LINK) },
  })
}

// ---------------- เตือนอัตโนมัติ (รถ) ----------------

/** ผู้อนุมัติยังไม่ตัดสินคำขอเกิน 24 ชม. */
export function vehicleApprovalReminder(r, recipientName) {
  return renderEmail({
    lang: 'th',
    subject: `เตือน: คำขอรถ ${r.requestNo} ยังรอการอนุมัติจากท่าน`,
    label: 'คำขอใช้รถ',
    tone: 'warning',
    status: 'รออนุมัติ',
    title: 'มีคำขอใช้รถที่ยังรอการอนุมัติจากท่าน',
    greeting: dear(recipientName),
    paragraphs: [`คำขอของ ${r.requesterName} ส่งมาเกิน 24 ชั่วโมงแล้วและยังไม่มีการพิจารณา กรุณาอนุมัติหรือไม่อนุมัติในระบบ`],
    summary: vehicleSummary(r),
    sections: [{ title: 'เหตุผลการขอใช้รถ', rows: [['เหตุผล', r.reason]] }, tripSection(r), requesterSection(r)],
    action: { label: 'พิจารณาคำขอ', url: appUrl('/requests/vehicles/approvals') },
  })
}

/** ก่อนวันเดินทาง (ภายใน 24 ชม.) ของรถที่จัดแล้ว - ถึงผู้ขอและผู้ร่วมเดินทาง */
export function vehicleTripReminder(r, recipientName, { passenger = false } = {}) {
  return renderEmail({
    lang: 'th',
    subject: `เตือนการเดินทาง ${formatDateTime(r.departTime)} - คำขอรถ ${r.requestNo}`,
    label: 'คำขอใช้รถ',
    tone: 'info',
    status: 'ใกล้ถึงเวลา',
    title: 'การเดินทางของท่านจะเริ่มภายใน 24 ชั่วโมง',
    greeting: dear(recipientName),
    paragraphs: [
      passenger
        ? `ท่านมีรายชื่อเป็นผู้ร่วมเดินทางในคำขอของ ${r.requesterName} กรุณาเตรียมตัวและไปถึงจุดรับตามเวลา`
        : 'กรุณาเตรียมตัวและให้ผู้ร่วมเดินทางไปถึงจุดรับตามเวลา รายละเอียดรถและคนขับดังนี้',
    ],
    summary: vehicleSummary(r),
    sections: [assignmentSection(r.driver), tripSection(r)],
    action: passenger ? undefined : { label: 'ดูรายละเอียดคำขอ', url: appUrl('/requests/vehicles/mine') },
  })
}

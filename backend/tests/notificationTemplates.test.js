import { describe, it, expect } from 'vitest'
import { renderEmail } from '../src/modules/notifications/layout.js'
import {
  vehicleAssigned,
  roomBooked,
  roomEndingSoon,
  formatRange,
  eventBoardingDetails,
  eventBoardingRetracted,
  eventRegisteredByOther,
  eventRegistrationRemoved,
  eventCreated,
  eventDeadlineSoon,
  eventCancelled,
  eventChanged,
  roomBookingUpdatedByAdmin,
  vehicleApprovalReminder,
  vehicleTripReminder,
  vehicleRequestCancelled,
  vehicleRequestCancelledByRequester,
  vehicleRequestUpdatedByAdmin,
} from '../src/modules/notifications/templates.js'
import { env } from '../src/config/env.js'

describe('notification safety', () => {
  it('runs tests with NODE_ENV=test so route/integration tests never send real email', () => {
    expect(env.nodeEnv).toBe('test')
  })
})

describe('email template (shared layout)', () => {
  it('escapes user-provided text in the HTML', () => {
    const mail = renderEmail({
      subject: 's',
      label: 'x',
      title: '<script>alert(1)</script>',
      rows: [['หัวข้อ', '<img src=x onerror=alert(1)>']],
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img src=x')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('prefixes the subject, skips empty rows and always has a plain-text version', () => {
    const mail = renderEmail({ subject: 'ทดสอบ', label: 'ป้าย', title: 'หัวเรื่อง', rows: [['มีค่า', 'A'], ['ว่าง', ''], ['null', null]] })
    expect(mail.subject).toBe('[ระบบจองห้องประชุมและรถ] ทดสอบ')
    expect(mail.text).toContain('มีค่า: A')
    expect(mail.text).not.toContain('ว่าง:')
    expect(mail.html).not.toContain('>null<')
  })

  it('shows the action button only when there is a URL', () => {
    expect(renderEmail({ subject: 's', label: 'l', title: 't', action: { label: 'เปิด', url: null } }).html).not.toContain('<a ')
    expect(renderEmail({ subject: 's', label: 'l', title: 't', action: { label: 'เปิด', url: 'http://x/y' } }).html).toContain('href="http://x/y"')
  })
})

describe('event emails', () => {
  it('room emails are in English, vehicle emails in Thai (subject prefix, header, footer)', () => {
    const room = roomBooked({ roomName: 'A', title: 'T', ownerName: 'X', startTime: '2026-10-01T02:00:00Z', endTime: '2026-10-01T03:00:00Z' })
    expect(room.subject.startsWith('[Room & Vehicle Booking System]')).toBe(true)
    expect(room.html).toContain('<html lang="en">')
    expect(room.text).toContain('Dear X,')
    expect(room.text).not.toMatch(/[\u0E00-\u0E7F]/) // ไม่มีอักษรไทยปน (ยกเว้นข้อมูลที่ผู้ใช้พิมพ์)
    const car = vehicleAssigned({ requestNo: 'VR-2026-0001', requestType: 'Shuttle', departTime: '2026-10-02T10:00:00Z', returnTime: '2026-10-02T11:00:00Z', routeSummary: 'ศรีราชา', vehicleType: 'Van', passengerCount: 5, requesterName: 'ก' })
    expect(car.subject.startsWith('[ระบบจองห้องประชุมและรถ]')).toBe(true)
    expect(car.html).toContain('<html lang="th">')
  })

  it('formats dates in Thai time, DD/MM/YYYY 24h, and across days', () => {
    expect(formatRange('2026-10-01T02:00:00Z', '2026-10-01T03:30:00Z')).toBe('01/10/2026 09:00 – 10:30')
    expect(formatRange('2026-10-01T16:30:00Z', '2026-10-02T02:00:00Z')).toBe('01/10/2026 23:30 – 02/10/2026 09:00')
  })

  it('vehicle assigned: request number, driver and plate', () => {
    const mail = vehicleAssigned({
      requestNo: 'VR-2026-0008', requestType: 'BusinessTrip', tripType: 'OneWay', departTime: '2026-10-02T01:00:00Z',
      returnTime: '2026-10-02T03:00:00Z', pickupLocation: 'บริษัท', destination: 'ชลบุรี', vehicleType: 'Van',
      passengerCount: 3, requesterName: 'สมชาย', driver: { name: 'มานะ', phone: '081', licensePlate: '30-1234' },
    })
    expect(mail.subject).toContain('VR-2026-0008')
    expect(mail.text).toContain('ประเภท: รถไปงานนอก • ไปอย่างเดียว')
    expect(mail.text).toContain('คนขับ: มานะ')
    expect(mail.text).toContain('เบอร์คนขับ: 081')
    expect(mail.text).toContain('ทะเบียนรถ: 30-1234')
  })

  it('room booked: mentions the weekly series only when there is one', () => {
    const base = { roomName: 'A', title: 'T', ownerName: 'X', startTime: '2026-10-01T02:00:00Z', endTime: '2026-10-01T03:00:00Z' }
    expect(roomBooked({ ...base, occurrences: 1 }).text).not.toContain('Repeats')
    expect(roomBooked({ ...base, occurrences: 4 }).text).toContain('Repeats: Weekly, 4 occurrences')
  })

  it('ending soon: English reminder with the end time and the next booking', () => {
    const mail = roomEndingSoon(
      { roomName: 'Meeting Room 1', title: 'Budget', ownerName: 'Somchai', startTime: '2026-10-05T02:00:00Z', endTime: '2026-10-05T03:00:00Z' },
      { title: 'Weekly Sync', startTime: '2026-10-05T03:00:00Z', endTime: '2026-10-05T04:00:00Z' },
    )
    expect(mail.subject).toContain('ends at 10:00 - next booking at 10:00')
    expect(mail.text).toContain('Dear Somchai,')
    expect(mail.text).toContain('Weekly Sync')
  })
})

describe('cancel / update / retract emails', () => {
  const req = {
    requestNo: 'VR-1',
    requesterName: 'สมหญิง',
    requesterDepartment: 'HR',
    contactPhone: '081',
    departTime: '2026-10-10T01:00:00Z',
    returnTime: '2026-10-10T05:00:00Z',
    requestType: 'BusinessTrip',
    tripType: 'RoundTrip',
    pickupLocation: 'บริษัท',
    destination: 'ลูกค้า',
    vehicleType: 'Van',
    passengerCount: 2,
    driver: { name: 'ลุงตู้', phone: '089', licensePlate: 'กท 1', provider: 'บริษัท' },
  }
  const ev = { Title: 'กีฬาสี', Destination: 'ระยอง', EventDate: '2026-10-10T01:00:00Z' }

  it('requester cancel email names the requester and has no stray action when no base URL', () => {
    const mail = vehicleRequestCancelledByRequester(req, 'หัวหน้า')
    expect(mail.subject).toContain('สมหญิง ยกเลิกคำขอรถ VR-1')
    expect(mail.text).toContain('หัวหน้า')
  })

  it('admin-update email shows the latest details and the assignment when assigned', () => {
    expect(vehicleRequestUpdatedByAdmin(req).text).toContain('ลุงตู้')
    expect(vehicleRequestUpdatedByAdmin({ ...req, driver: null }).text).not.toContain('ลุงตู้')
  })

  it('boarding email says update when re-announced; retract email tells people to ignore the old one', () => {
    const rows = [{ PassengerName: 'A', RouteName: 'สาย 1', PickupLocation: 'x' }]
    expect(eventBoardingDetails(ev, rows, 'A').subject).not.toContain('อัปเดต')
    expect(eventBoardingDetails(ev, rows, 'A', { update: true }).subject).toContain('อัปเดต: ')
    const retract = eventBoardingRetracted(ev, 'A')
    expect(retract.subject).toContain('ยกเลิกประกาศ')
    expect(retract.text).toContain('กีฬาสี')
  })
})

describe('group trip registration emails', () => {
  const ev = { Title: 'กีฬาสี', Destination: 'ระยอง', EventDate: '2026-10-10T01:00:00Z' }
  const p = { pickupLocation: 'บางนา', phoneNumber: '0812345678', tripType: 'GoOnly' }

  it('tells the person who registered them and what was entered', () => {
    const mail = eventRegisteredByOther(ev, p, 'สมชาย', 'สมหญิง')
    expect(mail.subject).toContain('ท่านถูกลงชื่อเดินทางกลุ่ม')
    expect(mail.text).toContain('สมชาย')
    expect(mail.text).toContain('บางนา')
    expect(mail.text).toContain('ไปอย่างเดียว')
  })

  it('tells the person who removed them', () => {
    const mail = eventRegistrationRemoved(ev, p, 'ผู้ดูแลระบบ', 'สมหญิง')
    expect(mail.subject).toContain('ยกเลิกการลงชื่อ')
    expect(mail.text).toContain('ผู้ดูแลระบบ')
  })
})

describe('passenger / reminder / event lifecycle emails', () => {
  const req = {
    requestNo: 'VR-9',
    requesterName: 'สมหญิง',
    requesterDepartment: 'HR',
    contactPhone: '081',
    departTime: '2026-10-10T01:00:00Z',
    returnTime: '2026-10-10T05:00:00Z',
    requestType: 'BusinessTrip',
    tripType: 'RoundTrip',
    pickupLocation: 'บริษัท',
    destination: 'ลูกค้า',
    vehicleType: 'Van',
    passengerCount: 2,
    reason: 'ประชุม',
    driver: { name: 'ลุงตู้', phone: '089', licensePlate: 'กท 1', provider: 'บริษัท' },
  }
  const ev = {
    Title: 'กีฬาสี',
    Destination: 'ระยอง',
    EventDate: '2026-10-10T01:00:00Z',
    ReturnDate: '2026-10-11T01:00:00Z',
    RegistrationDeadline: '2026-10-05T01:00:00Z',
    Description: 'พาทัวร์',
  }
  const withLink = () => {
    env.appBaseUrl = 'http://app.test'
  }

  it('passenger versions name the requester and carry no link (passengers cannot open the request)', () => {
    withLink()
    const cancelled = vehicleRequestCancelled(req, { passenger: true, recipientName: 'สมชาย' })
    expect(cancelled.text).toContain('เรียน คุณสมชาย')
    expect(cancelled.text).toContain('สมหญิง')
    expect(cancelled.html).not.toContain('href="http://app.test')
    expect(vehicleAssigned(req, 'สมชาย', { passenger: true }).html).not.toContain('href="http://app.test')
    expect(vehicleAssigned(req, 'สมหญิง').html).toContain('href="http://app.test')
    expect(vehicleRequestUpdatedByAdmin(req, { passenger: true, recipientName: 'สมชาย' }).text).toContain('สมชาย')
    env.appBaseUrl = ''
  })

  it('reminders and event lifecycle emails render with their key facts', () => {
    expect(vehicleApprovalReminder(req, 'หัวหน้า').subject).toContain('VR-9')
    expect(vehicleTripReminder(req, 'สมหญิง').text).toContain('ลุงตู้')
    expect(eventCreated(ev, 'A').text).toContain('พาทัวร์')
    expect(eventDeadlineSoon(ev, 'A').subject).toContain('ใกล้ปิดรับลงชื่อ')
    expect(eventCancelled(ev, 'A').subject).toContain('ยกเลิกกิจกรรม')
    expect(eventChanged(ev, 'A').subject).toContain('เปลี่ยนแปลง')
  })

  it('room admin-edit email is in English and names the room', () => {
    const mail = roomBookingUpdatedByAdmin({ roomName: 'Room A', title: 'Sync', ownerName: 'Bob', startTime: ev.EventDate, endTime: '2026-10-10T02:00:00Z' })
    expect(mail.subject).toContain('Booking updated: Room A')
    expect(mail.text).toContain('Dear Bob')
  })
})

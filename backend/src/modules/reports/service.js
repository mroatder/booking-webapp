/**
 * รวมข้อมูลรายงาน (M8, dev 2026-10-05: เอาทั้ง 4 รายงาน) - ฟังก์ชันล้วน รับแถวจาก repository คืนตารางพร้อมแสดง/ส่งออก
 * ทุกรายงาน: { title, tables: [{ key, title, columns: [{ key, label, type? }], rows: [...] }] }
 * type: 'number' | 'hours' | 'percent' | 'datetime' | 'date' (ใช้จัดรูปแบบทั้งหน้าเว็บและ Excel)
 */

const hours = (ms) => Math.round((ms / 3_600_000) * 10) / 10
const durationMs = (a, b) => Math.max(0, new Date(b) - new Date(a))
const NO_DEPT = 'ไม่ระบุแผนก'
const NO_ROUTE = 'ไม่มีสายประจำ'

/** วันที่ตามเวลาไทย (YYYY-MM-DD) ไม่ขึ้นกับ timezone ของเซิร์ฟเวอร์ */
export function bangkokDate(date) {
  return new Date(new Date(date).getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
}

function otTypeOf(pickup, destination) {
  if (destination === 'บริษัท') return 'รับมาบริษัท (เช้า)'
  if (pickup === 'บริษัท') return 'ส่งกลับบ้าน (เย็น)'
  return 'ไป-กลับ (วันหยุด)'
}

const REQUEST_TYPE = { BusinessTrip: 'รถไปงานนอก', Shuttle: 'รถโอที' }
const TRIP_TYPE = { RoundTrip: 'ไป-กลับ', OneWay: 'ไปอย่างเดียว', ReturnOnly: 'กลับอย่างเดียว' }
const STATUS = { Pending: 'รอดำเนินการ', Assigned: 'จัดรถแล้ว', Cancelled: 'ยกเลิก' }
const VEHICLE_TYPE = { Van: 'รถตู้', Sedan: 'รถเก๋ง' }
const KIND = { Company: 'รถบริษัท', Rental: 'รถเช่า', OnDemand: 'เรียกรถออนไลน์' }

function kindOf(r) {
  if (!r.ProviderKind) return 'Company'
  return r.ProviderKind === 'Rental' ? 'Rental' : 'OnDemand'
}

function sortBy(rows, key, dir = -1) {
  return rows.sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0))
}

// ---------------- 1. การใช้ห้องประชุม ----------------

function roomCounters() {
  return { total: 0, checkedIn: 0, booked: 0, autoReleased: 0, cancelled: 0, ms: 0 }
}
function addBooking(c, b) {
  c.total++
  if (b.Status === 'CheckedIn') c.checkedIn++
  if (b.Status === 'Booked') c.booked++
  if (b.Status === 'AutoReleased') c.autoReleased++
  if (b.Status === 'Cancelled') c.cancelled++
  // ชั่วโมงที่ใช้ = การจองที่ไม่ได้ยกเลิก/ไม่ถูกปล่อย
  if (b.Status === 'CheckedIn' || b.Status === 'Booked') c.ms += durationMs(b.StartTime, b.EndTime)
}
function finishRoom(c) {
  const decided = c.checkedIn + c.autoReleased
  return {
    total: c.total,
    checkedIn: c.checkedIn,
    autoReleased: c.autoReleased,
    cancelled: c.cancelled,
    hours: hours(c.ms),
    // อัตราเช็คอิน = เช็คอิน / (เช็คอิน + ปล่อยอัตโนมัติ) - ไม่นับที่ยังไม่ถึงเวลาและที่ยกเลิก
    checkinRate: decided ? Math.round((c.checkedIn / decided) * 1000) / 10 : null,
  }
}

export function roomUsageReport(bookings, activeRooms) {
  const byRoom = new Map(activeRooms.map((r) => [r.RoomID, { name: r.Name, c: roomCounters() }]))
  const byDept = new Map()
  for (const b of bookings) {
    if (!byRoom.has(b.RoomID)) byRoom.set(b.RoomID, { name: `${b.RoomName} (ปิดใช้งาน)`, c: roomCounters() })
    addBooking(byRoom.get(b.RoomID).c, b)
    const dept = b.Department ?? NO_DEPT
    if (!byDept.has(dept)) byDept.set(dept, roomCounters())
    addBooking(byDept.get(dept), b)
  }
  const cols = [
    { key: 'total', label: 'การจองทั้งหมด', type: 'number' },
    { key: 'hours', label: 'ชั่วโมงที่ใช้', type: 'hours' },
    { key: 'checkedIn', label: 'เช็คอิน', type: 'number' },
    { key: 'autoReleased', label: 'ปล่อยอัตโนมัติ', type: 'number' },
    { key: 'cancelled', label: 'ยกเลิก', type: 'number' },
    { key: 'checkinRate', label: 'อัตราเช็คอิน (%)', type: 'percent' },
  ]
  return {
    title: 'รายงานการใช้ห้องประชุม',
    tables: [
      {
        key: 'byRoom',
        title: 'แยกตามห้อง',
        columns: [{ key: 'name', label: 'ห้อง' }, ...cols],
        rows: [...byRoom.values()].map((r) => ({ name: r.name, ...finishRoom(r.c) })),
      },
      {
        key: 'byDepartment',
        title: 'แยกตามแผนกผู้จอง',
        columns: [{ key: 'name', label: 'แผนก' }, ...cols],
        rows: sortBy([...byDept].map(([name, c]) => ({ name, ...finishRoom(c) })), 'total'),
      },
    ],
  }
}

// ---------------- 2. คำขอรถ ----------------

export function vehicleRequestReport(requests) {
  const summary = new Map()
  const byDept = new Map()
  for (const r of requests) {
    const type = REQUEST_TYPE[r.RequestType] ?? r.RequestType
    if (!summary.has(type)) summary.set(type, { name: type, total: 0, pending: 0, assigned: 0, cancelled: 0 })
    const s = summary.get(type)
    s.total++
    s[r.Status === 'Assigned' ? 'assigned' : r.Status === 'Cancelled' ? 'cancelled' : 'pending']++

    const dept = r.Department ?? NO_DEPT
    if (!byDept.has(dept)) byDept.set(dept, { name: dept, total: 0, businessTrip: 0, shuttle: 0, cancelled: 0 })
    const d = byDept.get(dept)
    d.total++
    d[r.RequestType === 'Shuttle' ? 'shuttle' : 'businessTrip']++
    if (r.Status === 'Cancelled') d.cancelled++
  }
  return {
    title: 'รายงานคำขอรถ',
    tables: [
      {
        key: 'summary',
        title: 'สรุปตามประเภทและสถานะ',
        columns: [
          { key: 'name', label: 'ประเภท' },
          { key: 'total', label: 'ทั้งหมด', type: 'number' },
          { key: 'pending', label: 'รอดำเนินการ', type: 'number' },
          { key: 'assigned', label: 'จัดรถแล้ว', type: 'number' },
          { key: 'cancelled', label: 'ยกเลิก', type: 'number' },
        ],
        rows: [...summary.values()],
      },
      {
        key: 'byDepartment',
        title: 'แยกตามแผนกผู้ขอ',
        columns: [
          { key: 'name', label: 'แผนก' },
          { key: 'total', label: 'ทั้งหมด', type: 'number' },
          { key: 'businessTrip', label: 'รถไปงานนอก', type: 'number' },
          { key: 'shuttle', label: 'รถโอที', type: 'number' },
          { key: 'cancelled', label: 'ยกเลิก', type: 'number' },
        ],
        rows: sortBy([...byDept.values()], 'total'),
      },
      {
        key: 'list',
        title: 'รายการคำขอ',
        columns: [
          { key: 'requestNo', label: 'เลขที่' },
          { key: 'departTime', label: 'วันเวลาออก', type: 'datetime' },
          { key: 'returnTime', label: 'วันเวลากลับ', type: 'datetime' },
          { key: 'type', label: 'ประเภท' },
          { key: 'requester', label: 'ผู้ขอ' },
          { key: 'department', label: 'แผนก' },
          { key: 'route', label: 'จุดรับ → ปลายทาง' },
          { key: 'vehicleType', label: 'รถที่ขอ' },
          { key: 'passengers', label: 'ผู้โดยสาร', type: 'number' },
          { key: 'status', label: 'สถานะ' },
          { key: 'driver', label: 'คนขับ' },
          { key: 'plate', label: 'ทะเบียน' },
          { key: 'provider', label: 'ผู้ให้บริการ' },
        ],
        rows: requests.map((r) => ({
          requestNo: r.RequestNo,
          departTime: r.DepartTime,
          returnTime: r.ReturnTime,
          type: [REQUEST_TYPE[r.RequestType], r.RequestType === 'BusinessTrip' ? TRIP_TYPE[r.TripType] : null].filter(Boolean).join(' • '),
          requester: r.RequesterName,
          department: r.Department ?? '',
          route: `${r.PickupLocation} → ${r.Destination}`,
          vehicleType: VEHICLE_TYPE[r.VehicleType] ?? r.VehicleType,
          passengers: r.PassengerCount,
          status: STATUS[r.Status] ?? r.Status,
          driver: r.DriverName ?? r.TripDriverName ?? '',
          plate: r.LicensePlate ?? '',
          provider: r.Status === 'Assigned' ? r.ProviderName ?? KIND.Company : '',
        })),
      },
    ],
  }
}

// ---------------- 3. การใช้รถและคนขับ ----------------

/**
 * นับเฉพาะคำขอที่จัดรถแล้ว - คำขอโอทีหลายใบที่ใช้รถคันเดียวกันในเที่ยวเดียวกัน นับเป็น 1 เที่ยว
 */
export function driverVehicleReport(requests) {
  const assigned = requests.filter((r) => r.Status === 'Assigned')
  const tripKey = (r, id) => `${id}|${new Date(r.DepartTime).getTime()}|${new Date(r.ReturnTime).getTime()}`

  function tally(keyOf, labelOf, extra) {
    const map = new Map()
    for (const r of assigned) {
      const id = keyOf(r)
      if (id === null || id === undefined) continue
      if (!map.has(id)) map.set(id, { name: labelOf(r), ...extra(r), trips: new Map(), requests: 0 })
      const row = map.get(id)
      row.requests++
      row.trips.set(tripKey(r, id), durationMs(r.DepartTime, r.ReturnTime))
    }
    return sortBy(
      [...map.values()].map(({ trips, ...row }) => ({
        ...row,
        trips: trips.size,
        hours: hours([...trips.values()].reduce((a, b) => a + b, 0)),
      })),
      'trips',
    )
  }

  const byKind = new Map(Object.keys(KIND).map((k) => [k, { name: KIND[k], requests: 0, trips: new Set() }]))
  for (const r of assigned) {
    const k = byKind.get(kindOf(r))
    k.requests++
    k.trips.add(tripKey(r, r.AssignedVehicleID ?? `od-${r.RequestID}`))
  }

  return {
    title: 'รายงานการใช้รถและคนขับ',
    tables: [
      {
        key: 'byKind',
        title: 'แยกตามแบบการจัดรถ',
        columns: [
          { key: 'name', label: 'แบบ' },
          { key: 'trips', label: 'จำนวนเที่ยว', type: 'number' },
          { key: 'requests', label: 'จำนวนคำขอ', type: 'number' },
        ],
        rows: [...byKind.values()].map(({ trips, ...r }) => ({ ...r, trips: trips.size })),
      },
      {
        key: 'byDriver',
        title: 'แยกตามคนขับ (รถบริษัท/รถเช่า)',
        columns: [
          { key: 'name', label: 'คนขับ' },
          { key: 'kind', label: 'สังกัด' },
          { key: 'trips', label: 'จำนวนเที่ยว', type: 'number' },
          { key: 'hours', label: 'ชั่วโมงงาน', type: 'hours' },
          { key: 'requests', label: 'จำนวนคำขอ', type: 'number' },
        ],
        rows: tally(
          (r) => r.AssignedDriverID,
          (r) => r.DriverName,
          (r) => ({ kind: r.ProviderName ?? KIND.Company }),
        ),
      },
      {
        key: 'byVehicle',
        title: 'แยกตามรถ (รถบริษัท/รถเช่า)',
        columns: [
          { key: 'name', label: 'ทะเบียน' },
          { key: 'kind', label: 'สังกัด' },
          { key: 'trips', label: 'จำนวนเที่ยว', type: 'number' },
          { key: 'hours', label: 'ชั่วโมงใช้งาน', type: 'hours' },
          { key: 'requests', label: 'จำนวนคำขอ', type: 'number' },
        ],
        rows: tally(
          (r) => r.AssignedVehicleID,
          (r) => r.LicensePlate,
          (r) => ({ kind: r.ProviderName ?? KIND.Company }),
        ),
      },
    ],
  }
}

// ---------------- 4. รถโอทีตามสาย ----------------

export function shuttleRouteReport(riders) {
  const byDay = new Map()
  const byRoute = new Map()
  for (const r of riders) {
    const route = r.RouteName ?? NO_ROUTE
    const date = bangkokDate(r.DepartTime)
    const trip = `${new Date(r.DepartTime).getTime()}|${new Date(r.ReturnTime).getTime()}|${r.PickupLocation}|${r.Destination}`
    const dayKey = `${date}|${route}`
    if (!byDay.has(dayKey)) byDay.set(dayKey, { date, route, trips: new Set(), riders: 0, requests: new Set(), shifts: new Set() })
    const d = byDay.get(dayKey)
    d.trips.add(trip)
    d.riders++
    d.requests.add(r.RequestID)
    d.shifts.add(otTypeOf(r.PickupLocation, r.Destination))

    if (!byRoute.has(route)) byRoute.set(route, { name: route, trips: new Set(), riders: 0, days: new Set() })
    const t = byRoute.get(route)
    t.trips.add(`${date}|${trip}`)
    t.riders++
    t.days.add(date)
  }
  return {
    title: 'รายงานรถโอทีตามสาย',
    note: 'สายรถอ้างอิงสายประจำปัจจุบันของพนักงาน',
    tables: [
      {
        key: 'byRoute',
        title: 'สรุปตามสาย',
        columns: [
          { key: 'name', label: 'สาย' },
          { key: 'days', label: 'จำนวนวัน', type: 'number' },
          { key: 'trips', label: 'จำนวนเที่ยว', type: 'number' },
          { key: 'riders', label: 'จำนวนคน (รวม)', type: 'number' },
        ],
        rows: sortBy(
          [...byRoute.values()].map((r) => ({ name: r.name, days: r.days.size, trips: r.trips.size, riders: r.riders })),
          'riders',
        ),
      },
      {
        key: 'byDay',
        title: 'รายวันตามสาย',
        columns: [
          { key: 'date', label: 'วันที่', type: 'date' },
          { key: 'route', label: 'สาย' },
          { key: 'shifts', label: 'รอบ' },
          { key: 'trips', label: 'จำนวนเที่ยว', type: 'number' },
          { key: 'riders', label: 'จำนวนคน', type: 'number' },
          { key: 'requests', label: 'จำนวนคำขอ', type: 'number' },
        ],
        rows: [...byDay.values()]
          .map((d) => ({
            date: d.date,
            route: d.route,
            shifts: [...d.shifts].join(', '),
            trips: d.trips.size,
            riders: d.riders,
            requests: d.requests.size,
          }))
          // เรียงวัน → สาย (คนไม่มีสายประจำไว้ท้ายของวัน)
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              (a.route === NO_ROUTE) - (b.route === NO_ROUTE) ||
              a.route.localeCompare(b.route, 'th'),
          ),
      },
    ],
  }
}

// ---------------- 5. เดินทางกลุ่ม ----------------

const EVENT_TRIP_TYPE = { RoundTrip: 'ไป-กลับ', GoOnly: 'ไปอย่างเดียว', ReturnOnly: 'กลับอย่างเดียว' }

/** รับแถว (กิจกรรม × ผู้ลงชื่อ) - กิจกรรมที่ไม่มีผู้ลงชื่อมาเป็นแถวเดียวที่ PassengerID เป็น null */
export function eventTripReport(rows) {
  const events = new Map()
  const byDept = new Map()
  const byType = new Map(Object.values(EVENT_TRIP_TYPE).map((name) => [name, { name, riders: 0 }]))
  for (const r of rows) {
    if (!events.has(r.EventID)) {
      events.set(r.EventID, {
        title: r.Title,
        destination: r.Destination,
        date: bangkokDate(r.EventDate),
        registered: 0,
        assigned: 0,
        routes: new Set(),
        published: r.BoardingPublishedAt ? 'ประกาศแล้ว' : 'ยังไม่ประกาศ',
      })
    }
    if (r.PassengerID === null || r.PassengerID === undefined) continue
    const e = events.get(r.EventID)
    e.registered++
    if (r.RouteID) {
      e.assigned++
      e.routes.add(r.RouteID)
    }
    const dept = r.Department || NO_DEPT
    byDept.set(dept, (byDept.get(dept) ?? 0) + 1)
    const type = EVENT_TRIP_TYPE[r.TripType]
    if (type) byType.get(type).riders++
  }
  const total = [...events.values()].reduce((a, e) => a + e.registered, 0)
  return {
    title: 'รายงานเดินทางกลุ่ม',
    tables: [
      {
        key: 'summary',
        title: 'สรุปรวม',
        columns: [
          { key: 'events', label: 'จำนวนกิจกรรม', type: 'number' },
          { key: 'riders', label: 'ผู้ลงชื่อรวม', type: 'number' },
        ],
        rows: [{ events: events.size, riders: total }],
      },
      {
        key: 'byEvent',
        title: 'แยกตามกิจกรรม',
        columns: [
          { key: 'date', label: 'วันเดินทาง', type: 'date' },
          { key: 'title', label: 'กิจกรรม' },
          { key: 'destination', label: 'ปลายทาง' },
          { key: 'registered', label: 'ผู้ลงชื่อ', type: 'number' },
          { key: 'assigned', label: 'จัดลงสายแล้ว', type: 'number' },
          { key: 'routes', label: 'จำนวนสายรถ', type: 'number' },
          { key: 'published', label: 'รายละเอียดการขึ้นรถ' },
        ],
        rows: [...events.values()]
          .map(({ routes, ...e }) => ({ ...e, routes: routes.size }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      },
      {
        key: 'byDepartment',
        title: 'แยกตามแผนกผู้ลงชื่อ',
        columns: [
          { key: 'name', label: 'แผนก' },
          { key: 'riders', label: 'ผู้ลงชื่อ', type: 'number' },
        ],
        rows: sortBy([...byDept].map(([name, riders]) => ({ name, riders })), 'riders'),
      },
      {
        key: 'byTripType',
        title: 'แยกตามรูปแบบการเดินทาง',
        columns: [
          { key: 'name', label: 'รูปแบบ' },
          { key: 'riders', label: 'ผู้ลงชื่อ', type: 'number' },
        ],
        rows: [...byType.values()],
      },
    ],
  }
}

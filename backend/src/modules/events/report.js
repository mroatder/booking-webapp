import ExcelJS from 'exceljs'

/**
 * รายงานรายชื่อผู้เดินทางของกิจกรรมเดินทางกลุ่ม (Excel) - Admin ดาวน์โหลดไปส่งให้บริษัทรถ ซึ่งจะจัดรถเอง
 * มีแค่ ชื่อ/เบอร์/จุดขึ้นรถ/ลิงก์แผนที่ (คลิกได้)/เที่ยว - ไม่มีพิกัดและไม่มีการจัดสาย
 * เรียงตามจุดขึ้นรถเพื่อให้บริษัทรถเห็นคนที่ขึ้นแถวเดียวกันอยู่ติดกัน
 */
export const TRIP_TYPE_LABELS = {
  RoundTrip: 'ไป-กลับ',
  GoOnly: 'ขาไปอย่างเดียว',
  ReturnOnly: 'ขากลับอย่างเดียว',
}

const pad = (n) => String(n).padStart(2, '0')

/** วัน-เวลาตามเวลาไทย DD/MM/YYYY HH:mm (ค.ศ., 24 ชม.) */
function bangkok(date) {
  const d = new Date(new Date(date).getTime() + 7 * 3_600_000)
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

const COLUMNS = [
  { header: 'ลำดับ', key: 'no', width: 8 },
  { header: 'ชื่อ-นามสกุล', key: 'name', width: 28 },
  { header: 'รหัสพนักงาน', key: 'code', width: 14 },
  { header: 'แผนก', key: 'department', width: 20 },
  { header: 'เบอร์โทรศัพท์', key: 'phone', width: 16 },
  { header: 'จุดขึ้นรถ', key: 'pickup', width: 36 },
  { header: 'ลิงก์แผนที่ (Google Maps)', key: 'map', width: 48 },
  { header: 'เที่ยวการเดินทาง', key: 'trip', width: 18 },
  { header: 'หมายเหตุ', key: 'note', width: 28 },
]

const VEHICLE_LABELS = { Van: 'รถตู้', Sedan: 'รถเก๋ง' }

const BOARDING_COLUMNS = [
  { header: 'สาย', key: 'route', width: 18 },
  { header: 'ประเภทรถ', key: 'vehicleType', width: 12 },
  { header: 'เวลาขึ้นรถ', key: 'boardingAt', width: 18 },
  { header: 'ทะเบียนรถ', key: 'plate', width: 16 },
  { header: 'คนขับ', key: 'driver', width: 22 },
  { header: 'เบอร์คนขับ', key: 'driverPhone', width: 16 },
]

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  row.alignment = { vertical: 'middle' }
}

/**
 * ไฟล์สรุปการขึ้นรถที่แนบไปกับอีเมลประกาศ - แต่ละคนได้เฉพาะแถวที่ตัวเองมีสิทธิ์เห็น (ของตัวเอง + คนที่ตัวเองลงชื่อให้)
 * @param rows แถวจาก listBoardingRows (PascalCase)
 */
export async function boardingSummaryToXlsx(event, rows) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ระบบจองห้องประชุมและรถ'
  wb.created = new Date()
  const ws = wb.addWorksheet('รายละเอียดการขึ้นรถ')
  const columns = [
    { header: 'ผู้เดินทาง', key: 'name', width: 28 },
    { header: 'จุดขึ้นรถ', key: 'pickup', width: 36 },
    ...BOARDING_COLUMNS,
  ]
  ws.columns = columns.map(({ key, width }) => ({ key, width }))
  ;[
    ['กิจกรรม', event.Title],
    ['ปลายทาง', event.Destination],
    ['วันเดินทาง', bangkok(event.EventDate)],
  ].forEach(([label, value], i) => {
    const row = ws.addRow([label, value])
    row.getCell(1).font = { bold: true }
    if (i === 0) row.getCell(2).font = { bold: true, size: 13 }
    ws.mergeCells(row.number, 2, row.number, columns.length)
  })
  ws.addRow([])
  const header = ws.addRow(columns.map((c) => c.header))
  styleHeader(header)
  for (const r of rows) {
    const row = ws.addRow({
      name: r.PassengerName,
      pickup: r.PickupLocation,
      route: r.RouteName,
      vehicleType: VEHICLE_LABELS[r.VehicleType] ?? '',
      boardingAt: r.BoardingAt ? bangkok(r.BoardingAt) : '',
      plate: r.VehiclePlate ?? '',
      driver: r.DriverName ?? '',
      driverPhone: r.DriverPhone ?? '',
    })
    row.getCell('driverPhone').numFmt = '@'
  }
  ws.views = [{ state: 'frozen', ySplit: header.number }]
  return wb.xlsx.writeBuffer()
}

function boardingColumns(entry, routeOf) {
  const route = entry ? routeOf.get(entry.RouteID) : null
  return {
    route: route?.RouteName ?? '',
    vehicleType: VEHICLE_LABELS[route?.VehicleType] ?? '',
    boardingAt: entry?.BoardingAt ? bangkok(entry.BoardingAt) : '',
    plate: route?.VehiclePlate ?? '',
    driver: route?.DriverName ?? '',
    driverPhone: route?.DriverPhone ?? '',
  }
}

export function sortForReport(passengers) {
  return [...passengers].sort(
    (a, b) =>
      String(a.PickupLocation ?? '').localeCompare(String(b.PickupLocation ?? ''), 'th') ||
      String(a.PassengerName ?? '').localeCompare(String(b.PassengerName ?? ''), 'th'),
  )
}

/**
 * @param event กิจกรรม + passengers
 * @param boarding (ถ้ามี) { routes, passengers } จาก getBoarding - เติมคอลัมน์ สาย/เวลาขึ้นรถ/ทะเบียน/คนขับ เมื่อ Admin จัดสายแล้ว
 */
export async function eventReportToXlsx(event, boarding = null) {
  const passengers = sortForReport(event.passengers ?? [])
  const routeOf = new Map((boarding?.routes ?? []).map((r) => [r.RouteID, r]))
  const boardingOf = new Map((boarding?.passengers ?? []).filter((p) => p.RouteID).map((p) => [p.PassengerID, p]))
  const withBoarding = boardingOf.size > 0
  const columns = withBoarding ? [...COLUMNS, ...BOARDING_COLUMNS] : COLUMNS
  const goCount = passengers.filter((p) => p.TripType !== 'ReturnOnly').length
  const returnCount = passengers.filter((p) => p.TripType !== 'GoOnly').length

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ระบบจองห้องประชุมและรถ'
  wb.created = new Date()
  const ws = wb.addWorksheet('รายชื่อผู้เดินทาง')
  ws.columns = columns.map(({ key, width }) => ({ key, width }))

  const meta = [
    ['กิจกรรม', event.Title],
    ['ปลายทาง', event.Destination],
    ['วันเดินทาง', bangkok(event.EventDate)],
    ...(event.ReturnDate ? [['วันเดินทางกลับ', bangkok(event.ReturnDate)]] : []),
    ['จำนวนผู้เดินทางทั้งหมด', `${passengers.length} คน (ขาไป ${goCount} คน / ขากลับ ${returnCount} คน)`],
    ['ออกรายงานเมื่อ', bangkok(new Date())],
  ]
  meta.forEach(([label, value], i) => {
    const row = ws.addRow([label, value])
    row.getCell(1).font = { bold: true }
    if (i === 0) row.getCell(2).font = { bold: true, size: 13 }
    ws.mergeCells(row.number, 2, row.number, columns.length)
  })
  ws.addRow([])

  const headerRow = ws.addRow(columns.map((c) => c.header))
  styleHeader(headerRow)

  passengers.forEach((p, i) => {
    const row = ws.addRow({
      no: i + 1,
      name: p.PassengerName,
      code: p.EmployeeCode ?? '',
      department: p.Department ?? '',
      phone: p.PhoneNumber,
      pickup: p.PickupLocation,
      map: p.GoogleMapUrl ? { text: p.GoogleMapUrl, hyperlink: p.GoogleMapUrl } : '',
      trip: TRIP_TYPE_LABELS[p.TripType] ?? p.TripType,
      note: p.Note ?? '',
      ...(withBoarding ? boardingColumns(boardingOf.get(p.PassengerID), routeOf) : {}),
    })
    row.getCell('phone').numFmt = '@' // เบอร์ที่ขึ้นต้นด้วย 0 ต้องไม่ถูกแปลงเป็นตัวเลข
    row.getCell('no').alignment = { horizontal: 'center' }
    if (p.GoogleMapUrl) row.getCell('map').font = { color: { argb: 'FF2563EB' }, underline: true }
  })

  ws.views = [{ state: 'frozen', ySplit: headerRow.number }]
  if (passengers.length) {
    ws.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: columns.length } }
  }
  return wb.xlsx.writeBuffer()
}

// ---------- รายงานแยกตามสายรถ ----------

// ชื่อชีตของ Excel: ไม่เกิน 31 ตัวอักษร ห้าม : \ / ? * [ ] และห้ามซ้ำ
function uniqueSheetName(raw, used) {
  const base = String(raw ?? '').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'สาย'
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})`
  used.add(name.toLowerCase())
  return name
}

const ROUTE_TABLE_COLUMNS = [
  { header: 'ลำดับ', key: 'no', width: 8 },
  { header: 'เวลาขึ้นรถ', key: 'time', width: 14 },
  { header: 'ชื่อ-นามสกุล', key: 'name', width: 28 },
  { header: 'รหัสพนักงาน', key: 'code', width: 14 },
  { header: 'แผนก', key: 'department', width: 20 },
  { header: 'เบอร์โทรศัพท์', key: 'phone', width: 16 },
  { header: 'จุดขึ้นรถ', key: 'pickup', width: 36 },
  { header: 'ลิงก์แผนที่ (Google Maps)', key: 'map', width: 48 },
  { header: 'เที่ยวการเดินทาง', key: 'trip', width: 18 },
]

function addPassengerTable(ws, list, { withTime }) {
  const columns = withTime ? ROUTE_TABLE_COLUMNS : ROUTE_TABLE_COLUMNS.filter((c) => c.key !== 'time')
  ws.columns = columns.map(({ key, width }) => ({ key, width }))
  const header = ws.addRow(columns.map((c) => c.header))
  styleHeader(header)
  list.forEach((p, i) => {
    const row = ws.addRow({
      no: i + 1,
      time: p.BoardingAt ? bangkok(p.BoardingAt).slice(11) : '',
      name: p.PassengerName,
      code: p.EmployeeCode ?? '',
      department: p.Department ?? '',
      phone: p.PhoneNumber,
      pickup: p.PickupLocation,
      map: p.GoogleMapUrl ? { text: p.GoogleMapUrl, hyperlink: p.GoogleMapUrl } : '',
      trip: TRIP_TYPE_LABELS[p.TripType] ?? p.TripType,
    })
    row.getCell('phone').numFmt = '@'
    row.getCell('no').alignment = { horizontal: 'center' }
    if (p.GoogleMapUrl) row.getCell('map').font = { color: { argb: 'FF2563EB' }, underline: true }
  })
  return header
}

/** ลำดับในสาย: เวลาขึ้นรถก่อน (ไม่มีเวลาไว้ท้าย) แล้วจุดขึ้นรถ/ชื่อ */
function sortWithinRoute(passengers) {
  const at = (p) => (p.BoardingAt ? new Date(p.BoardingAt).getTime() : Infinity)
  return [...passengers].sort(
    (a, b) =>
      (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1) ||
      String(a.PickupLocation ?? '').localeCompare(String(b.PickupLocation ?? ''), 'th') ||
      String(a.PassengerName ?? '').localeCompare(String(b.PassengerName ?? ''), 'th'),
  )
}

function addMeta(ws, rows, span) {
  rows.forEach(([label, value], i) => {
    const row = ws.addRow([label, value])
    row.getCell(1).font = { bold: true }
    if (i === 0) row.getCell(2).font = { bold: true, size: 13 }
    ws.mergeCells(row.number, 2, row.number, span)
  })
}

/**
 * รายงานแยกตามสายรถ (Excel): ชีต "สรุป" รวมทุกสาย + 1 ชีตต่อ 1 สาย (ข้อมูลรถ/คนขับ + รายชื่อ) + ชีต "ยังไม่จัดสาย" ถ้ามี
 * เอาไปส่งบริษัทรถ/คนขับของแต่ละคันได้เลย
 * @param boarding { routes, passengers } จาก getBoarding
 */
export async function routeReportToXlsx(event, boarding) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ระบบจองห้องประชุมและรถ'
  wb.created = new Date()
  const used = new Set(['สรุป', 'ยังไม่จัดสาย'].map((n) => n.toLowerCase()))

  const byRoute = new Map(boarding.routes.map((r) => [r.RouteID, []]))
  const unassigned = []
  for (const p of boarding.passengers) (byRoute.get(p.RouteID) ?? unassigned).push(p)

  const meta = [
    ['กิจกรรม', event.Title],
    ['ปลายทาง', event.Destination],
    ['วันเดินทาง', bangkok(event.EventDate)],
  ]

  // --- สรุป ---
  const summary = wb.addWorksheet('สรุป')
  const summaryColumns = [
    { header: 'สาย', key: 'route', width: 22 },
    { header: 'ประเภทรถ', key: 'type', width: 12 },
    { header: 'ทะเบียนรถ', key: 'plate', width: 16 },
    { header: 'คนขับ', key: 'driver', width: 24 },
    { header: 'เบอร์คนขับ', key: 'phone', width: 16 },
    { header: 'จำนวนผู้เดินทาง', key: 'count', width: 16 },
    { header: 'เวลาขึ้นรถ', key: 'times', width: 18 },
  ]
  summary.columns = summaryColumns.map(({ key, width }) => ({ key, width }))
  addMeta(summary, [...meta, ['ออกรายงานเมื่อ', bangkok(new Date())]], summaryColumns.length)
  summary.addRow([])
  const summaryHeader = summary.addRow(summaryColumns.map((c) => c.header))
  styleHeader(summaryHeader)

  const perRoute = []
  for (const route of boarding.routes) {
    const list = sortWithinRoute(byRoute.get(route.RouteID))
    const times = [...new Set(list.map((p) => (p.BoardingAt ? bangkok(p.BoardingAt).slice(11) : null)).filter(Boolean))].sort()
    const row = summary.addRow({
      route: route.RouteName,
      type: VEHICLE_LABELS[route.VehicleType] ?? '',
      plate: route.VehiclePlate ?? '',
      driver: route.DriverName ?? '',
      phone: route.DriverPhone ?? '',
      count: list.length,
      times: times.length > 1 ? `${times[0]} – ${times[times.length - 1]}` : (times[0] ?? ''),
    })
    row.getCell('phone').numFmt = '@'
    row.getCell('count').alignment = { horizontal: 'right' }
    perRoute.push({ route, list })
  }
  if (unassigned.length) {
    const row = summary.addRow({ route: 'ยังไม่จัดสาย', count: unassigned.length })
    row.getCell('route').font = { italic: true, color: { argb: 'FFB45309' } }
    row.getCell('count').alignment = { horizontal: 'right' }
  }
  summary.views = [{ state: 'frozen', ySplit: summaryHeader.number }]

  // --- 1 ชีตต่อ 1 สาย ---
  for (const { route, list } of perRoute) {
    const ws = wb.addWorksheet(uniqueSheetName(route.RouteName, used))
    ws.columns = ROUTE_TABLE_COLUMNS.map(({ key, width }) => ({ key, width }))
    addMeta(
      ws,
      [
        ['สาย', `${route.RouteName} • ${VEHICLE_LABELS[route.VehicleType] ?? ''}`],
        ['ทะเบียนรถ', route.VehiclePlate ?? '-'],
        ['คนขับ', [route.DriverName, route.DriverPhone].filter(Boolean).join(' ') || '-'],
        ...meta,
        ['จำนวนผู้เดินทาง', `${list.length} คน`],
      ],
      ROUTE_TABLE_COLUMNS.length,
    )
    ws.addRow([])
    const header = addPassengerTable(ws, list, { withTime: true })
    ws.views = [{ state: 'frozen', ySplit: header.number }]
  }

  // --- ยังไม่จัดสาย ---
  if (unassigned.length) {
    const ws = wb.addWorksheet('ยังไม่จัดสาย')
    ws.columns = ROUTE_TABLE_COLUMNS.filter((c) => c.key !== 'time').map(({ key, width }) => ({ key, width }))
    addMeta(ws, [...meta, ['จำนวน', `${unassigned.length} คน`]], ROUTE_TABLE_COLUMNS.length - 1)
    ws.addRow([])
    const header = addPassengerTable(ws, sortForReport(unassigned), { withTime: false })
    ws.views = [{ state: 'frozen', ySplit: header.number }]
  }

  return wb.xlsx.writeBuffer()
}

/**
 * ไฟล์ Excel ของ "สายรถที่ฉันอยู่" (พนักงานกดส่งออกจากหน้าการขึ้นรถของฉัน) - ข้อมูลรถ/คนขับ + ผู้เดินทางทุกคนในสาย
 * มีเบอร์โทรของเพื่อนร่วมสาย (ให้โทรหากันได้) แต่ไม่มีรหัสพนักงาน - เหมือนที่แสดงในหน้าเว็บ
 * @param route รูปแบบจาก groupRoutesForViewer
 */
export async function myRouteToXlsx(route) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ระบบจองห้องประชุมและรถ'
  wb.created = new Date()
  const ws = wb.addWorksheet(uniqueSheetName(route.routeName, new Set()))
  const columns = [
    { header: 'ลำดับ', key: 'no', width: 8 },
    { header: 'เวลาขึ้นรถ', key: 'time', width: 14 },
    { header: 'ชื่อ-นามสกุล', key: 'name', width: 28 },
    { header: 'แผนก', key: 'department', width: 22 },
    { header: 'เบอร์โทร', key: 'phone', width: 16 },
    { header: 'จุดขึ้นรถ', key: 'pickup', width: 40 },
    { header: 'หมายเหตุ', key: 'note', width: 14 },
  ]
  ws.columns = columns.map(({ key, width }) => ({ key, width }))
  addMeta(
    ws,
    [
      ['กิจกรรม', route.eventTitle],
      ['ปลายทาง', route.destination],
      ['วันเดินทาง', bangkok(route.eventDate)],
      ['สายรถ', `${route.routeName} • ${VEHICLE_LABELS[route.vehicleType] ?? ''}`],
      ['ทะเบียนรถ', route.vehiclePlate ?? '-'],
      ['คนขับ', [route.driverName, route.driverPhone].filter(Boolean).join(' ') || '-'],
      ['จำนวนผู้เดินทาง', `${route.passengers.length} คน`],
    ],
    columns.length,
  )
  ws.addRow([])
  const header = ws.addRow(columns.map((c) => c.header))
  styleHeader(header)
  route.passengers.forEach((p, i) => {
    const row = ws.addRow({
      no: i + 1,
      time: p.boardingAt ? bangkok(p.boardingAt).slice(11) : '',
      name: p.name,
      department: p.department ?? '',
      phone: p.phone ?? '',
      pickup: p.pickupLocation,
      note: p.mine ? 'คุณ' : p.registeredByMe ? 'ลงชื่อให้' : '',
    })
    row.getCell('no').alignment = { horizontal: 'center' }
    if (p.mine || p.registeredByMe) row.font = { bold: true }
  })
  ws.views = [{ state: 'frozen', ySplit: header.number }]
  return wb.xlsx.writeBuffer()
}

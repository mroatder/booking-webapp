// สร้างข้อมูลสมมติสำหรับ demo / ถ่ายภาพหน้าจอ (ทุกชื่อและเบอร์เป็นข้อมูลสมมติ)
// ใช้กับฐานข้อมูลเปล่าที่ migrate แล้วเท่านั้น: DB_NAME=booking_demo node scripts/seed-demo.js
// ทุกบัญชีใช้รหัสผ่านเดียวกัน (DEMO_PASSWORD) - ห้ามใช้กับระบบจริง
import { getPool, closePool } from '../src/db/pool.js'
import { hashPassword } from '../src/modules/auth/password.js'

const DEMO_PASSWORD = 'Demo@1234'

// เวลาท้องถิ่นของเครื่อง -> Date (driver แปลงเป็น UTC ให้เอง)
const at = (dayOffset, hh, mm = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hh, mm, 0, 0)
  return d
}

async function run() {
  const pool = await getPool()
  const q = async (text, params = {}) => {
    const r = pool.request()
    for (const [k, v] of Object.entries(params)) r.input(k, v)
    return (await r.query(text)).recordset
  }

  const existing = await q('SELECT COUNT(*) AS n FROM Users')
  if (existing[0].n > 0) throw new Error('database is not empty - refusing to seed demo data')

  // ---- departments ----
  const deptNames = ['Engineering', 'Sales', 'Human Resources', 'Production', 'Finance', 'Logistics']
  const dept = {}
  for (const name of deptNames) {
    dept[name] = (await q('INSERT INTO Departments (Name) OUTPUT INSERTED.DepartmentID AS id VALUES (@n)', { n: name }))[0].id
  }

  // ---- users ----
  const hash = await hashPassword(DEMO_PASSWORD)
  const users = [
    ['admin', 'Somchai Wattana', 'สมชาย วัฒนา', 'Admin', 'Engineering', '0810000001', 3],
    ['supervisor', 'Napat Srisuk', 'ณภัทร ศรีสุข', 'Supervisor', 'Sales', '0810000002', 2],
    ['employee', 'Kanya Boonmee', 'กัญญา บุญมี', 'Employee', 'Human Resources', '0810000003', null],
    ['pim', 'Pimchanok Rattana', 'พิมพ์ชนก รัตนา', 'Employee', 'Production', '0810000004', null],
    ['arthit', 'Arthit Chaiyo', 'อาทิตย์ ไชโย', 'Employee', 'Engineering', '0810000005', null],
    ['malee', 'Malee Suksan', 'มาลี สุขสันต์', 'Employee', 'Finance', '0810000006', null],
    ['wichai', 'Wichai Thongdee', 'วิชัย ทองดี', 'Employee', 'Logistics', '0810000007', null],
    ['ploy', 'Ploy Anan', 'พลอย อนันต์', 'Employee', 'Sales', '0810000008', null],
  ]
  const uid = {}
  let n = 1
  for (const [username, fullName, fullNameTh, role, d, phone, level] of users) {
    uid[username] = (
      await q(
        `INSERT INTO Users (Username, PasswordHash, FullName, FullNameTh, Phone, Email, Role, AuthSource, DepartmentID, EmployeeCode, ApprovalLevel)
         OUTPUT INSERTED.UserID AS id
         VALUES (@u, @h, @f, @t, @p, @e, @r, 'Local', @d, @c, @l)`,
        { u: username, h: hash, f: fullName, t: fullNameTh, p: phone, e: `${username}@example.com`, r: role, d: dept[d], c: `E${String(1000 + n)}`, l: level },
      )
    )[0].id
    n += 1
  }

  // ---- rooms ----
  const roomDefs = [['Meeting Room 1', '2F'], ['Meeting Room 2', '2F'], ['Meeting Room 3', '3F'], ['Training Room', '3F'], ['Board Room', '4F'], ['Canteen Room', '1F']]
  const room = {}
  for (const [name, floor] of roomDefs) {
    room[name] = (await q('INSERT INTO Rooms (Name, Floor) OUTPUT INSERTED.RoomID AS id VALUES (@n, @f)', { n: name, f: floor }))[0].id
  }

  // ---- room bookings: ครอบคลุมเดือนปัจจุบัน (ย้อนหลัง/ล่วงหน้า) ----
  const titles = ['Weekly sync', 'Sprint planning', 'Customer review', 'Safety briefing', 'Budget meeting', 'Interview', 'Product demo', 'Vendor call', 'Training session', 'Quarterly report', 'Design review', 'Team lunch & learn']
  const people = Object.keys(uid)
  const roomNames = Object.keys(room)
  const slots = [[9, 0, 10, 30], [10, 0, 11, 0], [13, 0, 14, 0], [13, 30, 15, 0], [15, 0, 16, 30], [16, 0, 17, 0]]
  let seed = 7
  const rnd = (m) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % m)
  for (let day = -14; day <= 21; day += 1) {
    const dow = at(day, 12).getUTCDay()
    if (dow === 0 || dow === 6) continue
    const count = 1 + rnd(4)
    const usedSlots = new Set()
    for (let i = 0; i < count; i += 1) {
      const slotIdx = rnd(slots.length)
      const rName = roomNames[rnd(roomNames.length)]
      const key = `${rName}-${slotIdx}`
      if (usedSlots.has(key)) continue
      usedSlots.add(key)
      const [sh, sm, eh, em] = slots[slotIdx]
      const who = people[rnd(people.length)]
      await q(
        `INSERT INTO RoomBookings (RoomID, UserID, Title, StartTime, EndTime, Status, SnapUserDepartment)
         VALUES (@r, @u, @t, @s, @e, @st, (SELECT d.Name FROM Users u JOIN Departments d ON d.DepartmentID = u.DepartmentID WHERE u.UserID = @u))`,
        { r: room[rName], u: uid[who], t: titles[rnd(titles.length)], s: at(day, sh, sm), e: at(day, eh, em), st: day < 0 ? 'CheckedIn' : 'Booked' },
      )
    }
  }
  // วันนี้: ให้ห้อง Meeting Room 1 มีการประชุมต่อเนื่องเห็นชัดบนปฏิทิน
  for (const [h, t] of [[9, 'Morning stand-up'], [11, 'Customer review'], [14, 'Product demo']]) {
    await q('INSERT INTO RoomBookings (RoomID, UserID, Title, StartTime, EndTime, Status) VALUES (@r, @u, @t, @s, @e, \'Booked\')', {
      r: room['Meeting Room 1'], u: uid.employee, t, s: at(0, h), e: at(0, h + 1),
    })
  }

  // ---- providers / drivers / vehicles ----
  const prov = (
    await q("INSERT INTO Providers (Name, Kind, Phone) OUTPUT INSERTED.ProviderID AS id VALUES ('City Shuttle Co.', 'OnDemand', '021110001'), ('Easy Rent Cars', 'Rental', '021110002')")
  ).map((r) => r.id)
  const drv = []
  for (const [name, phone] of [['Somsak Jaidee', '0820000001'], ['Prasert Meechai', '0820000002'], ['Wanchai Kongthong', '0820000003']]) {
    drv.push((await q('INSERT INTO Drivers (Name, Phone) OUTPUT INSERTED.DriverID AS id VALUES (@n, @p)', { n: name, p: phone }))[0].id)
  }
  await q(
    `INSERT INTO Vehicles (LicensePlate, VehicleType, SeatCount, Description, ProviderID)
     VALUES (N'1กก 1234', 'Sedan', 4, 'Company sedan', NULL), (N'2ขข 5678', 'Van', 12, 'Company van', NULL), (N'3คค 9012', 'Van', 14, 'Rental van', @p)`,
    { p: prov[1] },
  )

  // ---- vehicle requests (หลายสถานะ) ----
  const sequence = { n: 0 }
  const reqs = [
    ['employee', 'Customer site visit', 'Rayong Industrial Estate', 'Sedan', 3, 2, 'Assigned', 'Approved'],
    ['pim', 'Supplier audit', 'Bangkok Head Office', 'Van', 8, 3, 'Pending', 'Pending'],
    ['arthit', 'Equipment pickup', 'Laem Chabang Port', 'Van', 5, 5, 'Pending', 'Pending'],
    ['malee', 'Bank & tax office', 'Chonburi City Hall', 'Sedan', 2, -2, 'Assigned', 'Approved'],
    ['ploy', 'Trade show', 'Bangkok BITEC', 'Van', 10, 8, 'Assigned', 'Approved'],
    ['wichai', 'Warehouse inspection', 'Amata City Warehouse', 'Sedan', 2, 1, 'Pending', 'Pending'],
  ]
  for (const [who, reason, dest, vtype, pax, dayOff, status, approval] of reqs) {
    sequence.n += 1
    const assigned = status === 'Assigned'
    await q(
      `INSERT INTO VehicleRequests (RequesterUserID, ContactPhone, DepartTime, ReturnTime, PickupLocation, Destination, VehicleType, PassengerCount,
         Status, AssignedDriverID, AssignedByUserID, AssignedAt, LicensePlate, RequestType, TripType, RequestNo, Reason, ApprovalStatus, ApproverUserID, ApprovedAt)
       VALUES (@u, @ph, @d, @r, 'Main gate', @dest, @vt, @pax, @st, @drv, @adm, @asg, @plate, 'BusinessTrip', 'RoundTrip', @no, @reason, @ap, @apu, @apt)`,
      {
        u: uid[who], ph: '08100000' + sequence.n, d: at(dayOff, 8, 30), r: at(dayOff, 17, 0), dest, vt: vtype, pax, st: status,
        drv: assigned ? drv[sequence.n % drv.length] : null, adm: assigned ? uid.admin : null, asg: assigned ? at(dayOff - 1, 10) : null,
        plate: assigned ? (vtype === 'Van' ? '2ขข 5678' : '1กก 1234') : null,
        no: `VR-${new Date().getFullYear()}-${String(sequence.n).padStart(4, '0')}`, reason, ap: approval,
        apu: approval === 'Approved' ? uid.supervisor : null, apt: approval === 'Approved' ? at(dayOff - 2, 9) : null,
      },
    )
  }
  await q('INSERT INTO DocumentSequences (Prefix, [Year], LastNumber) VALUES (\'VR\', @y, @n)', { y: new Date().getFullYear(), n: sequence.n })

  // ---- group trip event ----
  await q(
    `INSERT INTO EventTrips (Title, Description, Destination, EventDate, ReturnDate, RegistrationDeadline, CreatedByUserID)
     VALUES ('Annual Company Seminar', 'Two-day seminar at the beach resort - register to take the company van.', 'Sunrise Beach Resort, Pattaya', @d, @r, @dl, @a)`,
    { d: at(12, 8), r: at(12, 17), dl: at(7, 17), a: uid.admin },
  )

  // ---- shuttle route ----
  await q(
    `INSERT INTO ShuttleRoutes (ProviderID, Name, Origin, Destination, StopsJson, MorningDepart, MorningArrive, EveningDepart, EveningArrive, RunDays)
     VALUES (@p, 'Route A - Chonburi', 'Chonburi City', 'Factory', @stops, '06:30', '07:45', '17:15', '18:30', '1111100')`,
    { p: prov[0], stops: JSON.stringify(['Chonburi Market', 'Bang Saen Beach', 'Laem Chabang Gate']) },
  )

  console.log(`[seed-demo] done. login: admin / supervisor / employee, password: ${DEMO_PASSWORD}`)
  await closePool()
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

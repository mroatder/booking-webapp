import { randomUUID } from 'node:crypto'
import { sql } from '../../db/pool.js'

export async function findByUsername(pool, username) {
  const result = await pool
    .request()
    .input('username', sql.NVarChar(100), username)
    .query('SELECT u.*, d.Name AS Department FROM Users u LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID WHERE u.Username = @username')
  return result.recordset[0] ?? null
}

export async function findById(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT u.*, d.Name AS Department FROM Users u LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID WHERE u.UserID = @id')
  return result.recordset[0] ?? null
}

/**
 * สร้างหรืออัปเดตผู้ใช้จากข้อมูล AD หลัง bind สำเร็จ (sync โปรไฟล์ล่าสุดทุกครั้งที่ login)
 * ไม่มีการกำหนด role จาก AD เลย (ไม่มี admin group ให้เช็ค) - ผู้ใช้ AD ที่มีอยู่แล้ว
 * จะคง Role เดิมไว้เสมอ (กัน Admin ที่ตั้งเองผ่านหน้าเว็บถูกเปลี่ยนกลับ), ผู้ใช้ AD คนใหม่
 * เริ่มต้นเป็น Employee เสมอ - Admin เป็นผู้กำหนด role ให้ทีหลังผ่านหน้าจัดการผู้ใช้
 * ไม่แตะ Phone และ Email เลย: เบอร์โทรไม่ได้มาจาก AD (AD ของบริษัทไม่มี) ส่วนอีเมลไม่ดึงจาก AD แล้ว
 * (dev 2026-10-08) - ผู้ใช้/Admin กรอกเองในระบบและ AD sync จะไม่เขียนทับ
 */
export async function upsertFromAd(pool, { username, fullName }) {
  const existing = await findByUsername(pool, username)

  if (existing) {
    await pool
      .request()
      .input('id', sql.Int, existing.UserID)
      .input('fullName', sql.NVarChar(200), fullName)
      .query(
        `UPDATE Users
         SET FullName = @fullName
         WHERE UserID = @id`,
      )
    return findById(pool, existing.UserID)
  }

  const result = await pool
    .request()
    .input('username', sql.NVarChar(100), username)
    .input('fullName', sql.NVarChar(200), fullName)
    .query(
      `INSERT INTO Users (Username, FullName, Role, AuthSource, IsActive)
       OUTPUT INSERTED.*
       VALUES (@username, @fullName, 'Employee', 'AD', 1)`,
    )
  // Retrieve with Department string mapping for consistency
  return findById(pool, result.recordset[0].UserID)
}

/** username (ตัวเล็ก) ที่มีในระบบแล้ว จากรายชื่อที่ให้มา - ใช้ติดป้าย "มีในระบบแล้ว" ตอนค้นหา AD */
export async function findUsernames(pool, usernames) {
  if (usernames.length === 0) return new Set()
  const req = pool.request()
  const params = usernames.map((u, i) => {
    req.input(`u${i}`, sql.NVarChar(100), u)
    return `@u${i}`
  })
  const result = await req.query(`SELECT Username FROM Users WHERE Username IN (${params.join(', ')})`)
  return new Set(result.recordset.map((r) => r.Username.toLowerCase()))
}

/**
 * เพิ่มผู้ใช้ AD ที่ Admin เลือกจากการค้นหา - ถ้ามี username นี้อยู่แล้วคืน null (ไม่แตะของเดิม)
 * เงื่อนไข NOT EXISTS อยู่ใน INSERT เดียวกัน กันกดเพิ่มซ้ำพร้อมกัน (UNIQUE constraint กันอีกชั้น)
 */
export async function insertFromAd(pool, { username, fullName }, role) {
  try {
    const result = await pool
      .request()
      .input('username', sql.NVarChar(100), username)
      .input('fullName', sql.NVarChar(200), fullName)
      .input('role', sql.VarChar(20), role)
      .query(
        `INSERT INTO Users (Username, FullName, Role, AuthSource, IsActive)
         OUTPUT INSERTED.UserID
         SELECT @username, @fullName, @role, 'AD', 1
         WHERE NOT EXISTS (SELECT 1 FROM Users WHERE Username = @username)`,
      )
    return result.recordset[0] ? findById(pool, result.recordset[0].UserID) : null
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) return null
    throw err
  }
}

/** แก้อีเมลของผู้ใช้ (ใช้ได้ทั้ง AD และ Local) - null = ลบอีเมล */
export async function updateEmail(pool, id, email) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('email', sql.NVarChar(255), email)
    .query('UPDATE Users SET Email = @email WHERE UserID = @id')
  return findById(pool, id)
}

/** แก้เบอร์โทรของผู้ใช้ (ใช้ได้ทั้ง AD และ Local) - null = ลบเบอร์ */
export async function updatePhone(pool, id, phone) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('phone', sql.NVarChar(50), phone)
    .query('UPDATE Users SET Phone = @phone WHERE UserID = @id')
  return findById(pool, id)
}

export async function createLocalUser(
  pool,
  { username, passwordHash, fullName, fullNameTh, departmentId, phone, email, employeeCode, role, approvalLevel },
) {
  const result = await pool
    .request()
    .input('username', sql.NVarChar(100), username)
    .input('passwordHash', sql.NVarChar(255), passwordHash)
    .input('fullName', sql.NVarChar(200), fullName)
    .input('fullNameTh', sql.NVarChar(200), fullNameTh ?? null)
    .input('departmentId', sql.Int, departmentId ?? null)
    .input('phone', sql.NVarChar(50), phone ?? null)
    .input('email', sql.NVarChar(255), email ?? null)
    .input('employeeCode', sql.NVarChar(50), employeeCode ?? null)
    .input('role', sql.VarChar(20), role ?? 'Employee')
    .input('approvalLevel', sql.TinyInt, approvalLevel ?? null)
    .query(
      `INSERT INTO Users (Username, PasswordHash, FullName, FullNameTh, DepartmentID, Phone, Email, EmployeeCode, Role, ApprovalLevel, AuthSource, IsActive)
       OUTPUT INSERTED.UserID
       VALUES (@username, @passwordHash, @fullName, @fullNameTh, @departmentId, @phone, @email, @employeeCode, @role, @approvalLevel, 'Local', 1)`,
    )
  return findById(pool, result.recordset[0].UserID)
}

/**
 * สร้างรายชื่อพนักงานที่ไม่ login (AuthSource = 'None') - ไม่มีรหัสผ่าน, role Employee, ไม่เป็นผู้อนุมัติ
 * Username เป็นค่าภายในที่ระบบสร้างเอง (nologin-xxxx) ไม่แสดงในหน้าจอ
 */
export async function createRosterUser(pool, { fullName, fullNameTh, departmentId, phone, email, employeeCode }) {
  const result = await pool
    .request()
    .input('username', sql.NVarChar(100), `nologin-${randomUUID().replace(/-/g, '').slice(0, 12)}`)
    .input('fullName', sql.NVarChar(200), fullName)
    .input('fullNameTh', sql.NVarChar(200), fullNameTh ?? null)
    .input('departmentId', sql.Int, departmentId ?? null)
    .input('phone', sql.NVarChar(50), phone ?? null)
    .input('email', sql.NVarChar(255), email ?? null)
    .input('employeeCode', sql.NVarChar(50), employeeCode ?? null)
    .query(
      `INSERT INTO Users (Username, FullName, FullNameTh, DepartmentID, Phone, Email, EmployeeCode, Role, AuthSource, IsActive)
       OUTPUT INSERTED.UserID
       VALUES (@username, @fullName, @fullNameTh, @departmentId, @phone, @email, @employeeCode, 'Employee', 'None', 1)`,
    )
  return findById(pool, result.recordset[0].UserID)
}

/** รายชื่อพนักงานที่ใช้งานอยู่ แบบข้อมูลน้อยที่สุด (id/ชื่อ/แผนก) - ให้ทุกคนใช้ค้นหาเพื่อนร่วมเดินทางในฟอร์มขอรถ */
/**
 * รายชื่อผู้ใช้ที่ใช้งานอยู่ สำหรับเลือก "พนักงานที่เดินทาง"
 * scope ไม่ส่ง = ทุกคน (Admin); ส่ง { selfId, departmentIds } = ตัวเอง + คนในแผนกที่กำหนด
 */
export async function listDirectory(pool, scope) {
  const req = pool.request()
  let where = 'u.IsActive = 1'
  if (scope) {
    req.input('selfId', sql.Int, scope.selfId)
    const params = [...scope.departmentIds].map((id, i) => {
      req.input(`dep${i}`, sql.Int, id)
      return `@dep${i}`
    })
    where += ` AND (u.UserID = @selfId${params.length ? ` OR u.DepartmentID IN (${params.join(', ')})` : ''})`
  }
  const result = await req.query(
    `SELECT u.UserID, u.FullName, u.DepartmentID, d.Name AS Department
     FROM Users u LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID
     WHERE ${where} ORDER BY u.FullName`,
  )
  return result.recordset
}

/** ผู้อนุมัติ (มีระดับ 1-3, ใช้งานอยู่) ในขอบเขตแผนกหลัก - scope ว่าง = ทุกแผนก (Admin) */
export async function listApprovers(pool, scope) {
  const req = pool.request()
  let where = 'u.IsActive = 1 AND u.ApprovalLevel IS NOT NULL'
  if (scope) {
    const params = [...scope.departmentIds].map((id, i) => {
      req.input(`dep${i}`, sql.Int, id)
      return `@dep${i}`
    })
    where += params.length ? ` AND u.DepartmentID IN (${params.join(', ')})` : ' AND 1 = 0'
  }
  const result = await req.query(
    `SELECT u.UserID, u.FullName, u.ApprovalLevel, d.Name AS Department
     FROM Users u LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID
     WHERE ${where} ORDER BY u.ApprovalLevel, u.FullName`,
  )
  return result.recordset
}

export async function setSignatureFile(pool, id, name) {
  await pool.request().input('id', sql.Int, id).input('name', sql.VarChar(100), name).query('UPDATE Users SET SignatureFile = @name WHERE UserID = @id')
}

/** รหัสพนักงาน (ตัวพิมพ์เล็ก) ที่มีในระบบแล้ว - ใช้กันนำเข้ารายชื่อซ้ำ */
export async function listEmployeeCodes(pool) {
  const result = await pool.request().query("SELECT EmployeeCode FROM Users WHERE EmployeeCode IS NOT NULL AND EmployeeCode <> ''")
  return new Set(result.recordset.map((r) => r.EmployeeCode.trim().toLowerCase()))
}

export async function listAll(pool) {
  const result = await pool.request().query('SELECT u.*, d.Name AS Department FROM Users u LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID ORDER BY u.FullName')
  return result.recordset
}

/**
 * แก้ไขโปรไฟล์/role/สถานะของผู้ใช้ (ใช้ได้ทั้ง Local และ AD account)
 * EmployeeCode เป็นค่าที่ Admin กำหนดเองเพื่อใช้เป็นรหัสพนักงานจริง
 */
export async function update(pool, id, { fullName, fullNameTh, departmentId, phone, email, employeeCode, role, isActive, approvalLevel }) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('fullName', sql.NVarChar(200), fullName)
    .input('fullNameTh', sql.NVarChar(200), fullNameTh ?? null)
    .input('departmentId', sql.Int, departmentId ?? null)
    .input('phone', sql.NVarChar(50), phone ?? null)
    .input('email', sql.NVarChar(255), email ?? null)
    .input('employeeCode', sql.NVarChar(50), employeeCode ?? null)
    .input('role', sql.VarChar(20), role)
    .input('isActive', sql.Bit, isActive)
    .input('approvalLevel', sql.TinyInt, approvalLevel ?? null)
    .query(
      `UPDATE Users
       SET FullName = @fullName, FullNameTh = @fullNameTh, DepartmentID = @departmentId, Phone = @phone, Email = @email,
           EmployeeCode = @employeeCode, Role = @role, IsActive = @isActive, ApprovalLevel = @approvalLevel
       WHERE UserID = @id`,
    )
  return findById(pool, id)
}

/** จำนวนผู้ดูแลระบบที่ยังใช้งานอยู่ - ใช้กันการลดสิทธิ์/ปิดใช้งาน Admin คนสุดท้าย */
export async function countActiveAdmins(pool) {
  const result = await pool.request().query("SELECT COUNT(*) AS Total FROM Users WHERE Role = 'Admin' AND IsActive = 1")
  return result.recordset[0].Total
}

export async function setActive(pool, id, isActive) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('isActive', sql.Bit, isActive)
    .query('UPDATE Users SET IsActive = @isActive WHERE UserID = @id')
  return findById(pool, id)
}

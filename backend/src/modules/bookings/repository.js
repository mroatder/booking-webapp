import { randomUUID } from 'node:crypto'
import { sql } from '../../db/pool.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

const ACTIVE_STATUSES = "('Booked', 'CheckedIn')"

async function insertOccurrence(transaction, { roomId, userId, title, startTime, endTime, recurrenceGroupId }) {
  const conflict = await transaction
    .request()
    .input('roomId', sql.Int, roomId)
    .input('startTime', sql.DateTime2, startTime)
    .input('endTime', sql.DateTime2, endTime)
    .query(
      `SELECT 1 FROM RoomBookings WITH (UPDLOCK, HOLDLOCK)
       WHERE RoomID = @roomId AND Status IN ${ACTIVE_STATUSES}
         AND StartTime < @endTime AND EndTime > @startTime`,
    )

  if (conflict.recordset.length > 0) {
    throw new AppError(ErrorCodes.ROOM_BOOKING_CONFLICT, 409, { startTime, endTime })
  }

  const result = await transaction
    .request()
    .input('roomId', sql.Int, roomId)
    .input('userId', sql.Int, userId)
    .input('title', sql.NVarChar(300), title)
    .input('startTime', sql.DateTime2, startTime)
    .input('endTime', sql.DateTime2, endTime)
    .input('recurrenceGroupId', sql.VarChar(36), recurrenceGroupId)
    .query(
      // SnapUserDepartment = แผนกผู้จอง ณ ตอนจอง (ย้ายแผนกภายหลังต้องไม่ทำให้ประวัติ/รายงานเปลี่ยน)
      `INSERT INTO RoomBookings (RoomID, UserID, Title, StartTime, EndTime, RecurrenceGroupID, SnapUserDepartment)
       OUTPUT INSERTED.*
       SELECT @roomId, @userId, @title, @startTime, @endTime, @recurrenceGroupId, d.Name
       FROM (SELECT 1 AS one) x
       LEFT JOIN Users u ON u.UserID = @userId
       LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID`,
    )

  return result.recordset[0]
}

/**
 * สร้างการจอง (ครั้งเดียวหรือหลาย occurrence ถ้าเป็น recurring) - ทุก occurrence เช็ค
 * conflict + insert อยู่ใน transaction เดียวกัน (all-or-nothing): ถ้า occurrence ไหนชน
 * ทั้งชุดจะ rollback หมด ไม่สร้างบางส่วนทิ้งไว้
 */
export async function create(pool, { roomId, userId, title, occurrences }) {
  const recurrenceGroupId = occurrences.length > 1 ? randomUUID() : null
  const transaction = pool.transaction()
  await transaction.begin()

  try {
    const created = []
    for (const occ of occurrences) {
      created.push(
        await insertOccurrence(transaction, {
          roomId,
          userId,
          title,
          startTime: occ.startTime,
          endTime: occ.endTime,
          recurrenceGroupId,
        }),
      )
    }
    await transaction.commit()
    return created
  } catch (err) {
    await transaction.rollback()
    throw err
  }
}

export async function findById(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT b.*, r.Name AS RoomName FROM RoomBookings b
       JOIN Rooms r ON r.RoomID = b.RoomID
       WHERE b.BookingID = @id`,
    )
  return result.recordset[0] ?? null
}

export async function listMine(pool, userId, from, to) {
  const req = pool.request().input('userId', sql.Int, userId)
  let sqlQuery = `SELECT b.*, r.Name AS RoomName FROM RoomBookings b JOIN Rooms r ON r.RoomID = b.RoomID WHERE b.UserID = @userId`
  
  if (from) {
    req.input('from', sql.DateTime2, from)
    sqlQuery += ` AND b.EndTime > @from`
  }
  if (to) {
    req.input('to', sql.DateTime2, to)
    sqlQuery += ` AND b.StartTime < @to`
  }
  
  sqlQuery += ` ORDER BY b.StartTime DESC`
  const result = await req.query(sqlQuery)
  return result.recordset
}

/**
 * การจองทุกคน (Admin) ในช่วงเวลา - พร้อมข้อมูลผู้จอง (ชื่อ/แผนก/เบอร์/อีเมล) ให้ Admin รู้ว่าใครจองอะไร เมื่อไหร่
 * กรองเพิ่มได้ตามห้อง/สถานะ (ทุกสถานะรวมที่ยกเลิก/ปล่อยห้อง)
 */
export async function listAll(pool, from, to, { roomId, status } = {}) {
  const req = pool.request().input('from', sql.DateTime2, from).input('to', sql.DateTime2, to)
  let where = 'b.StartTime < @to AND b.EndTime > @from'
  if (roomId) {
    req.input('roomId', sql.Int, roomId)
    where += ' AND b.RoomID = @roomId'
  }
  if (status) {
    req.input('status', sql.VarChar(20), status)
    where += ' AND b.Status = @status'
  }
  const result = await req.query(
    `SELECT b.*, r.Name AS RoomName, u.FullName AS OwnerName, b.SnapUserDepartment AS OwnerDepartment,
            u.Phone AS OwnerPhone, u.Email AS OwnerEmail
     FROM RoomBookings b
     JOIN Rooms r ON r.RoomID = b.RoomID
     JOIN Users u ON u.UserID = b.UserID
     LEFT JOIN Departments d ON d.DepartmentID = u.DepartmentID
     WHERE ${where}
     ORDER BY b.StartTime`,
  )
  return result.recordset
}

/**
 * ช่วงเวลาที่มีการจองของห้อง - ค่าเริ่มต้นคืนเฉพาะที่ยังกันห้องอยู่ (Booked/CheckedIn)
 * `includeReleased: true` จะรวม AutoReleased มาด้วย (ใช้แสดงประวัติบนปฏิทินเท่านั้น ไม่ใช่เช็คห้องว่าง)
 */
export async function listBusyRanges(pool, roomId, from, to, { includeReleased = false } = {}) {
  const statuses = includeReleased ? "('Booked', 'CheckedIn', 'AutoReleased')" : ACTIVE_STATUSES
  const result = await pool
    .request()
    .input('roomId', sql.Int, roomId)
    .input('from', sql.DateTime2, from)
    .input('to', sql.DateTime2, to)
    .query(
      `SELECT BookingID, StartTime, EndTime, Title, Status FROM RoomBookings
       WHERE RoomID = @roomId AND Status IN ${statuses}
         AND StartTime < @to AND EndTime > @from
       ORDER BY StartTime`,
    )
  return result.recordset
}

/** แก้ไข occurrence เดียว (ไม่รองรับแก้ทั้งชุด recurring พร้อมกัน) พร้อมเช็ค conflict ใหม่ */
export async function updateSingle(pool, id, { title, startTime, endTime }) {
  const transaction = pool.transaction()
  await transaction.begin()

  try {
    const existingResult = await transaction
      .request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM RoomBookings WITH (UPDLOCK, HOLDLOCK) WHERE BookingID = @id')
    const existing = existingResult.recordset[0]

    if (!existing) {
      await transaction.commit()
      return null
    }

    const conflict = await transaction
      .request()
      .input('roomId', sql.Int, existing.RoomID)
      .input('bookingId', sql.Int, id)
      .input('startTime', sql.DateTime2, startTime)
      .input('endTime', sql.DateTime2, endTime)
      .query(
        `SELECT 1 FROM RoomBookings WITH (UPDLOCK, HOLDLOCK)
         WHERE RoomID = @roomId AND BookingID <> @bookingId AND Status IN ${ACTIVE_STATUSES}
           AND StartTime < @endTime AND EndTime > @startTime`,
      )

    if (conflict.recordset.length > 0) {
      throw new AppError(ErrorCodes.ROOM_BOOKING_CONFLICT, 409)
    }

    await transaction
      .request()
      .input('id', sql.Int, id)
      .input('title', sql.NVarChar(300), title)
      .input('startTime', sql.DateTime2, startTime)
      .input('endTime', sql.DateTime2, endTime)
      .query(
        `UPDATE RoomBookings
         SET Title = @title, StartTime = @startTime, EndTime = @endTime, UpdatedAt = SYSUTCDATETIME()
         WHERE BookingID = @id`,
      )

    await transaction.commit()
    return findById(pool, id)
  } catch (err) {
    await transaction.rollback()
    throw err
  }
}

export async function cancel(pool, id, scope) {
  const existing = await findById(pool, id)
  if (!existing) return null

  if (scope === 'series' && existing.RecurrenceGroupID) {
    await pool
      .request()
      .input('groupId', sql.VarChar(36), existing.RecurrenceGroupID)
      .query(
        `UPDATE RoomBookings SET Status = 'Cancelled', UpdatedAt = SYSUTCDATETIME()
         WHERE RecurrenceGroupID = @groupId AND Status IN ${ACTIVE_STATUSES}`,
      )
  } else {
    await pool
      .request()
      .input('id', sql.Int, id)
      .query(
        `UPDATE RoomBookings SET Status = 'Cancelled', UpdatedAt = SYSUTCDATETIME()
         WHERE BookingID = @id`,
      )
  }

  return findById(pool, id)
}

export async function checkin(pool, id) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `UPDATE RoomBookings
       SET Status = 'CheckedIn', CheckedInAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
       WHERE BookingID = @id AND Status = 'Booked'`,
    )
  return findById(pool, id)
}

/**
 * การจองที่จะหมดเวลาภายใน 5 นาที และมีคนจองห้องเดียวกันต่อภายใน 15 นาทีหลังเวลาจบ - ยังไม่เคยเตือน
 * ทำเครื่องหมาย EndingReminderSentAt ใน UPDATE เดียวกับที่เลือก จึงเตือนครั้งเดียวต่อการจอง
 * คืนข้อมูลการจองถัดไปด้วย (สำหรับเนื้อหาอีเมล)
 */
export async function claimEndingSoonBookings(pool) {
  const result = await pool.request().query(
    `UPDATE b
     SET EndingReminderSentAt = SYSUTCDATETIME()
     OUTPUT INSERTED.BookingID, INSERTED.RoomID, INSERTED.UserID, INSERTED.Title, INSERTED.StartTime, INSERTED.EndTime
     FROM RoomBookings b
     WHERE b.Status IN ('Booked', 'CheckedIn')
       AND b.EndingReminderSentAt IS NULL
       AND b.EndTime > SYSUTCDATETIME()
       AND b.EndTime <= DATEADD(minute, 5, SYSUTCDATETIME())
       AND EXISTS (
         SELECT 1 FROM RoomBookings n
         WHERE n.RoomID = b.RoomID AND n.BookingID <> b.BookingID AND n.Status IN ('Booked', 'CheckedIn')
           AND n.StartTime >= b.EndTime AND n.StartTime < DATEADD(minute, 15, b.EndTime))`,
  )
  return result.recordset
}

/** การจองถัดไปของห้อง (ที่ยังใช้งานอยู่) หลังเวลาที่กำหนด */
export async function findNextBooking(pool, roomId, after) {
  const result = await pool
    .request()
    .input('roomId', sql.Int, roomId)
    .input('after', sql.DateTime2, after)
    .query(
      `SELECT TOP 1 b.*, r.Name AS RoomName FROM RoomBookings b JOIN Rooms r ON r.RoomID = b.RoomID
       WHERE b.RoomID = @roomId AND b.Status IN ('Booked', 'CheckedIn') AND b.StartTime >= @after
       ORDER BY b.StartTime`,
    )
  return result.recordset[0] ?? null
}

export async function releaseOverdueBookings(pool) {
  const result = await pool.request().query(
    `UPDATE RoomBookings
     SET Status = 'AutoReleased', UpdatedAt = SYSUTCDATETIME()
     OUTPUT INSERTED.BookingID, INSERTED.RoomID, INSERTED.UserID, INSERTED.Title, INSERTED.StartTime, INSERTED.EndTime
     WHERE Status = 'Booked'
       AND SYSUTCDATETIME() > DATEADD(minute, 10, StartTime)`,
  )
  return result.recordset
}

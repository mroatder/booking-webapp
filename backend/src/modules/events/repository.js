import { sql } from '../../db/pool.js'
import { MAP_URL_MAX } from './limits.js'

export async function listActiveEvents(pool) {
  const result = await pool.request().query(`
    SELECT 
      e.EventID,
      e.Title,
      e.Description,
      e.Destination,
      e.EventDate,
      e.ReturnDate,
      e.RegistrationDeadline,
      e.CreatedByUserID,
      e.IsActive,
      e.CreatedAt,
      e.UpdatedAt,
      u.FullName AS CreatorName,
      (SELECT COUNT(1) FROM EventPassengers p WHERE p.EventID = e.EventID) AS PassengerCount
    FROM EventTrips e
    LEFT JOIN Users u ON e.CreatedByUserID = u.UserID
    WHERE e.IsActive = 1
    ORDER BY e.EventDate DESC
  `)
  return result.recordset
}

export async function getEventById(pool, eventId) {
  const eventRes = await pool.request()
    .input('eventId', sql.Int, eventId)
    .query(`
      SELECT 
        e.*,
        u.FullName AS CreatorName,
        (SELECT COUNT(1) FROM EventPassengers p WHERE p.EventID = e.EventID) AS PassengerCount
      FROM EventTrips e
      LEFT JOIN Users u ON e.CreatedByUserID = u.UserID
      WHERE e.EventID = @eventId AND e.IsActive = 1
    `)

  if (!eventRes.recordset[0]) return null
  const event = eventRes.recordset[0]

  const passRes = await pool.request()
    .input('eventId', sql.Int, eventId)
    .query(`
      SELECT
        p.PassengerID, p.EventID, p.UserID, p.PassengerName, p.PhoneNumber, p.PickupLocation, p.GoogleMapUrl,
        p.TripType, p.Note, p.RegisteredByUserID, p.CreatedAt, p.UpdatedAt,
        -- ค่าที่บันทึกตอนลงชื่อว่าง (ลงชื่อไว้ก่อนแก้บั๊ก) → ใช้ข้อมูลปัจจุบันของผู้ใช้
        COALESCE(NULLIF(p.EmployeeCode, ''), pu.EmployeeCode) AS EmployeeCode,
        COALESCE(NULLIF(p.Department, ''), pd.Name) AS Department,
        reg.FullName AS RegisteredByName
      FROM EventPassengers p
      LEFT JOIN Users reg ON p.RegisteredByUserID = reg.UserID
      LEFT JOIN Users pu ON p.UserID = pu.UserID
      LEFT JOIN Departments pd ON pd.DepartmentID = pu.DepartmentID
      WHERE p.EventID = @eventId
      ORDER BY p.CreatedAt ASC, p.PassengerID ASC
    `)

  event.passengers = passRes.recordset
  return event
}

export async function createEvent(
  pool,
  { title, description, destination, eventDate, returnDate, registrationDeadline, createdByUserId, notifyAll = false, inviteeIds = [] },
) {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const event = await insertEvent(transaction, {
      title, description, destination, eventDate, returnDate, registrationDeadline, createdByUserId, notifyAll,
    })
    for (const userId of inviteeIds) {
      await transaction
        .request()
        .input('eventId', sql.Int, event.EventID)
        .input('userId', sql.Int, userId)
        .query('INSERT INTO EventInvitees (EventID, UserID) VALUES (@eventId, @userId)')
    }
    await transaction.commit()
    return event
  } catch (err) {
    await transaction.rollback().catch(() => {})
    throw err
  }
}

async function insertEvent(
  runner,
  { title, description, destination, eventDate, returnDate, registrationDeadline, createdByUserId, notifyAll },
) {
  const result = await runner.request()
    .input('title', sql.NVarChar(200), title)
    .input('description', sql.NVarChar(sql.MAX), description ?? null)
    .input('destination', sql.NVarChar(200), destination)
    .input('eventDate', sql.DateTime2, new Date(eventDate))
    .input('returnDate', sql.DateTime2, returnDate ? new Date(returnDate) : null)
    .input('registrationDeadline', sql.DateTime2, registrationDeadline ? new Date(registrationDeadline) : null)
    .input('createdByUserId', sql.Int, createdByUserId)
    .input('notifyAll', sql.Bit, notifyAll ? 1 : 0)
    .query(`
      INSERT INTO EventTrips (Title, Description, Destination, EventDate, ReturnDate, RegistrationDeadline, CreatedByUserID, NotifyAll)
      OUTPUT INSERTED.*
      VALUES (@title, @description, @destination, @eventDate, @returnDate, @registrationDeadline, @createdByUserId, @notifyAll)
    `)
  return result.recordset[0]
}

export async function updateEvent(pool, eventId, { title, description, destination, eventDate, returnDate, registrationDeadline }) {
  await pool.request()
    .input('eventId', sql.Int, eventId)
    .input('title', sql.NVarChar(200), title)
    .input('description', sql.NVarChar(sql.MAX), description ?? null)
    .input('destination', sql.NVarChar(200), destination)
    .input('eventDate', sql.DateTime2, new Date(eventDate))
    .input('returnDate', sql.DateTime2, returnDate ? new Date(returnDate) : null)
    .input('registrationDeadline', sql.DateTime2, registrationDeadline ? new Date(registrationDeadline) : null)
    .query(`
      UPDATE EventTrips
      SET 
        Title = @title,
        Description = @description,
        Destination = @destination,
        EventDate = @eventDate,
        ReturnDate = @returnDate,
        RegistrationDeadline = @registrationDeadline,
        UpdatedAt = SYSUTCDATETIME()
      WHERE EventID = @eventId AND IsActive = 1
    `)
  return getEventById(pool, eventId)
}

export async function deleteEvent(pool, eventId) {
  await pool.request()
    .input('eventId', sql.Int, eventId)
    .query('UPDATE EventTrips SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE EventID = @eventId')
}

export async function addPassenger(pool, eventId, { userId, passengerName, employeeCode, department, phoneNumber, pickupLocation, googleMapUrl, tripType, note, registeredByUserId }) {
  const result = await pool.request()
    .input('eventId', sql.Int, eventId)
    .input('userId', sql.Int, userId ?? null)
    .input('passengerName', sql.NVarChar(150), passengerName)
    .input('employeeCode', sql.NVarChar(50), employeeCode ?? null)
    .input('department', sql.NVarChar(100), department ?? null)
    .input('phoneNumber', sql.NVarChar(50), phoneNumber)
    .input('pickupLocation', sql.NVarChar(250), pickupLocation)
    .input('googleMapUrl', sql.NVarChar(MAP_URL_MAX), googleMapUrl ?? null)
    .input('tripType', sql.VarChar(20), tripType || 'RoundTrip')
    .input('note', sql.NVarChar(500), note ?? null)
    .input('registeredByUserId', sql.Int, registeredByUserId)
    .query(`
      INSERT INTO EventPassengers (
        EventID, UserID, PassengerName, EmployeeCode, Department, PhoneNumber, PickupLocation, GoogleMapUrl, TripType, Note, RegisteredByUserID
      )
      OUTPUT INSERTED.*
      VALUES (
        @eventId, @userId, @passengerName, @employeeCode, @department, @phoneNumber, @pickupLocation, @googleMapUrl, @tripType, @note, @registeredByUserId
      )
    `)
  return result.recordset[0]
}

/** ผู้ใช้คนนี้ลงชื่อกิจกรรมนี้อยู่แล้วหรือไม่ */
export async function isUserRegistered(pool, eventId, userId) {
  const result = await pool.request()
    .input('eventId', sql.Int, eventId)
    .input('userId', sql.Int, userId)
    .query('SELECT TOP 1 1 AS found FROM EventPassengers WHERE EventID = @eventId AND UserID = @userId')
  return result.recordset.length > 0
}

export async function removePassenger(pool, passengerId) {
  const res = await pool.request()
    .input('passengerId', sql.Int, passengerId)
    .query('DELETE FROM EventPassengers OUTPUT DELETED.EventID WHERE PassengerID = @passengerId')
  return res.recordset[0]?.EventID ?? null
}

export async function getPassengerById(pool, passengerId) {
  const res = await pool.request()
    .input('passengerId', sql.Int, passengerId)
    .query('SELECT * FROM EventPassengers WHERE PassengerID = @passengerId')
  return res.recordset[0] ?? null
}

// ---------- รายละเอียดการขึ้นรถ (Admin กรอกหลังบริษัทรถจัดรถแล้ว) ----------

/** สายรถ + ผู้เดินทางของกิจกรรม (พร้อมสายและเวลาขึ้นรถที่กรอกไว้) + เวลาที่ประกาศ - ไว้ให้หน้า Admin แก้ไข */
export async function getBoarding(pool, eventId) {
  const request = () => pool.request().input('eventId', sql.Int, eventId)
  const [routes, passengers, event] = await Promise.all([
    request().query(
      'SELECT RouteID, RouteNo, RouteName, VehicleType, VehiclePlate, DriverName, DriverPhone FROM EventRoutes WHERE EventID = @eventId ORDER BY RouteNo',
    ),
    request().query(`
      SELECT p.PassengerID, p.UserID, p.PassengerName, p.PhoneNumber, p.PickupLocation, p.GoogleMapUrl, p.TripType,
             p.RouteID, p.BoardingAt,
             COALESCE(NULLIF(p.EmployeeCode, ''), pu.EmployeeCode) AS EmployeeCode,
             COALESCE(NULLIF(p.Department, ''), pd.Name) AS Department
      FROM EventPassengers p
      LEFT JOIN Users pu ON pu.UserID = p.UserID
      LEFT JOIN Departments pd ON pd.DepartmentID = pu.DepartmentID
      WHERE p.EventID = @eventId
      ORDER BY p.PickupLocation, p.PassengerName
    `),
    request().query('SELECT BoardingPublishedAt FROM EventTrips WHERE EventID = @eventId AND IsActive = 1'),
  ])
  return {
    routes: routes.recordset,
    passengers: passengers.recordset,
    publishedAt: event.recordset[0]?.BoardingPublishedAt ?? null,
  }
}

/**
 * แทนที่สายรถและการจัดคนลงสายทั้งชุด (สำเร็จทั้งชุดหรือไม่ทำเลย)
 * @param routes [{ name, vehiclePlate, driverName, driverPhone }]  @param assignments [{ passengerId, routeIndex, boardingAt }]
 */
export async function saveBoarding(pool, eventId, { routes, assignments }) {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    await transaction
      .request()
      .input('eventId', sql.Int, eventId)
      .query('UPDATE EventPassengers SET RouteID = NULL, BoardingAt = NULL WHERE EventID = @eventId')
    await transaction.request().input('eventId', sql.Int, eventId).query('DELETE FROM EventRoutes WHERE EventID = @eventId')

    const routeIds = []
    for (const [i, r] of routes.entries()) {
      const created = await transaction
        .request()
        .input('eventId', sql.Int, eventId)
        .input('routeNo', sql.Int, i + 1)
        .input('name', sql.NVarChar(100), r.name)
        .input('vehicleType', sql.VarChar(20), r.vehicleType)
        .input('plate', sql.NVarChar(50), r.vehiclePlate)
        .input('driverName', sql.NVarChar(150), r.driverName)
        .input('driverPhone', sql.NVarChar(50), r.driverPhone)
        .query(
          `INSERT INTO EventRoutes (EventID, RouteNo, RouteName, VehicleType, VehiclePlate, DriverName, DriverPhone)
           OUTPUT INSERTED.RouteID VALUES (@eventId, @routeNo, @name, @vehicleType, @plate, @driverName, @driverPhone)`,
        )
      routeIds.push(created.recordset[0].RouteID)
    }
    for (const a of assignments) {
      await transaction
        .request()
        .input('eventId', sql.Int, eventId)
        .input('passengerId', sql.Int, a.passengerId)
        .input('routeId', sql.Int, routeIds[a.routeIndex])
        .input('boardingAt', sql.DateTime2, a.boardingAt)
        .query(
          'UPDATE EventPassengers SET RouteID = @routeId, BoardingAt = @boardingAt WHERE PassengerID = @passengerId AND EventID = @eventId',
        )
    }
    await transaction.commit()
  } catch (err) {
    await transaction.rollback().catch(() => {})
    throw err
  }
}

export async function setBoardingPublished(pool, eventId, publishedAt) {
  await pool
    .request()
    .input('eventId', sql.Int, eventId)
    .input('publishedAt', sql.DateTime2, publishedAt)
    .query('UPDATE EventTrips SET BoardingPublishedAt = @publishedAt, UpdatedAt = SYSUTCDATETIME() WHERE EventID = @eventId AND IsActive = 1')
}

/**
 * ผู้เดินทางทุกคนที่ถูกจัดสายแล้วของกิจกรรม พร้อมข้อมูลสาย/รถ/คนขับ - ไว้ส่งอีเมลตอนประกาศ (คนละฉบับตามสิทธิ์การเห็น)
 */
export async function listBoardingRows(pool, { eventId }) {
  const result = await pool
    .request()
    .input('eventId', sql.Int, eventId)
    .query(`
      SELECT p.PassengerID, p.EventID, p.UserID, p.RegisteredByUserID, p.PassengerName, p.PickupLocation, p.TripType, p.BoardingAt,
             r.RouteName, r.VehicleType, r.VehiclePlate, r.DriverName, r.DriverPhone, e.Title, e.Destination, e.EventDate
      FROM EventPassengers p
      JOIN EventRoutes r ON r.RouteID = p.RouteID
      JOIN EventTrips e ON e.EventID = p.EventID
      WHERE e.IsActive = 1 AND p.EventID = @eventId
      ORDER BY e.EventDate, r.RouteNo, p.BoardingAt, p.PassengerName
    `)
  return result.recordset
}

/**
 * สายรถที่ผู้ใช้อยู่ (เป็นเจ้าของรายชื่อหรือคนที่ลงชื่อให้) พร้อมผู้เดินทางทุกคนในสายนั้น - เฉพาะกิจกรรมที่ประกาศแล้ว
 */
export async function listBoardingRoutesForUser(pool, userId) {
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT p.PassengerID, p.EventID, p.UserID, p.RegisteredByUserID, p.PassengerName, p.PhoneNumber, p.PickupLocation, p.BoardingAt,
             COALESCE(NULLIF(p.Department, ''), pd.Name) AS Department,
             r.RouteID, r.RouteName, r.VehicleType, r.VehiclePlate, r.DriverName, r.DriverPhone,
             e.Title, e.Destination, e.EventDate
      FROM EventPassengers p
      JOIN EventRoutes r ON r.RouteID = p.RouteID
      JOIN EventTrips e ON e.EventID = p.EventID
      LEFT JOIN Users pu ON pu.UserID = p.UserID
      LEFT JOIN Departments pd ON pd.DepartmentID = pu.DepartmentID
      WHERE e.IsActive = 1 AND e.BoardingPublishedAt IS NOT NULL
        AND p.RouteID IN (
          SELECT m.RouteID
          FROM EventPassengers m
          JOIN EventTrips me ON me.EventID = m.EventID
          WHERE m.RouteID IS NOT NULL AND me.IsActive = 1 AND me.BoardingPublishedAt IS NOT NULL
            AND (m.UserID = @userId OR m.RegisteredByUserID = @userId)
        )
      ORDER BY e.EventDate, e.EventID, r.RouteNo, p.BoardingAt, p.PassengerName
    `)
  return result.recordset
}

/** ผู้ใช้ที่ใช้งานอยู่ตาม id ที่ส่งมา - ใช้ตรวจรายชื่อผู้รับแจ้งเตือนก่อนสร้างกิจกรรม */
export async function findActiveUserIds(pool, ids) {
  if (ids.length === 0) return []
  const req = pool.request()
  const params = ids.map((id, i) => {
    req.input(`u${i}`, sql.Int, id)
    return `@u${i}`
  })
  const result = await req.query(`SELECT UserID FROM Users WHERE IsActive = 1 AND UserID IN (${params.join(', ')})`)
  return result.recordset.map((r) => r.UserID)
}

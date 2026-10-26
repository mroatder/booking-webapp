import { sql } from '../../db/pool.js'

// ข้อมูลรถ/คนขับ/ผู้ให้บริการ (ดูโครงสร้างที่ migration 013_fleet_model.sql)

// ---------------- Providers (บริษัทรถเช่า / เรียกรถออนไลน์) ----------------

export async function listProviders(pool, { includeInactive = false } = {}) {
  const result = await pool
    .request()
    .query(`SELECT * FROM Providers ${includeInactive ? '' : 'WHERE IsActive = 1'} ORDER BY Kind DESC, Name`)
  return result.recordset
}

export async function findProvider(pool, id) {
  const result = await pool.request().input('id', sql.Int, id).query('SELECT * FROM Providers WHERE ProviderID = @id')
  return result.recordset[0] ?? null
}

export async function createProvider(pool, { name, kind, phone }) {
  const result = await pool
    .request()
    .input('name', sql.NVarChar(200), name)
    .input('kind', sql.VarChar(10), kind)
    .input('phone', sql.NVarChar(50), phone)
    .query(`INSERT INTO Providers (Name, Kind, Phone) OUTPUT INSERTED.* VALUES (@name, @kind, @phone)`)
  return result.recordset[0]
}

export async function updateProvider(pool, id, { name, kind, phone, isActive }) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(200), name)
    .input('kind', sql.VarChar(10), kind)
    .input('phone', sql.NVarChar(50), phone)
    .input('isActive', sql.Bit, isActive)
    .query(
      `UPDATE Providers SET Name = @name, Kind = @kind, Phone = @phone, IsActive = @isActive, UpdatedAt = SYSUTCDATETIME()
       WHERE ProviderID = @id`,
    )
  return findProvider(pool, id)
}

/** จำนวนคนขับ/รถที่ยังผูกกับผู้ให้บริการนี้ - ใช้กันเปลี่ยนบริษัทรถเช่าเป็นเรียกรถออนไลน์ทั้งที่ยังมีรายชื่ออยู่ */
export async function countProviderResources(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT (SELECT COUNT(*) FROM Drivers WHERE ProviderID = @id AND IsActive = 1)
            + (SELECT COUNT(*) FROM Vehicles WHERE ProviderID = @id AND IsActive = 1) AS n`,
    )
  return result.recordset[0].n
}

// ---------------- Vehicles (รถที่ลงทะเบียน: รถบริษัท + รถของบริษัทรถเช่า) ----------------

const VEHICLE_SELECT = `
  SELECT v.*, p.Name AS ProviderName, r.Name AS RouteName
  FROM Vehicles v 
  LEFT JOIN Providers p ON p.ProviderID = v.ProviderID
  LEFT JOIN ShuttleRoutes r ON r.RouteID = v.RouteID`

export async function listVehicles(pool, { includeInactive = false } = {}) {
  const result = await pool
    .request()
    .query(`${VEHICLE_SELECT} ${includeInactive ? '' : 'WHERE v.IsActive = 1'} ORDER BY p.Name, v.LicensePlate`)
  return result.recordset
}

export async function findVehicle(pool, id) {
  const result = await pool.request().input('id', sql.Int, id).query(`${VEHICLE_SELECT} WHERE v.VehicleID = @id`)
  return result.recordset[0] ?? null
}

function bindVehicle(req, { licensePlate, vehicleType, seatCount, description, providerId, routeId }) {
  return req
    .input('licensePlate', sql.NVarChar(50), licensePlate)
    .input('vehicleType', sql.VarChar(10), vehicleType)
    .input('seatCount', sql.Int, seatCount)
    .input('description', sql.NVarChar(200), description)
    .input('providerId', sql.Int, providerId)
    .input('routeId', sql.Int, routeId)
}

export async function createVehicle(pool, input) {
  const result = await bindVehicle(pool.request(), input).query(
    `INSERT INTO Vehicles (LicensePlate, VehicleType, SeatCount, Description, ProviderID, RouteID)
     OUTPUT INSERTED.VehicleID
     VALUES (@licensePlate, @vehicleType, @seatCount, @description, @providerId, @routeId)`,
  )
  return findVehicle(pool, result.recordset[0].VehicleID)
}

export async function updateVehicle(pool, id, input) {
  await bindVehicle(pool.request().input('id', sql.Int, id), input)
    .input('isActive', sql.Bit, input.isActive)
    .query(
      `UPDATE Vehicles
       SET LicensePlate = @licensePlate, VehicleType = @vehicleType, SeatCount = @seatCount,
           Description = @description, ProviderID = @providerId, RouteID = @routeId, IsActive = @isActive,
           -- เอารถออกจากสายจากหน้า "รถ" → คนขับประจำของสายนั้นหลุดไปด้วย (คนขับประจำผูกกับการวิ่งสาย)
           RegularDriverID = CASE WHEN @routeId IS NULL OR @routeId <> ISNULL(RouteID, -1) THEN NULL ELSE RegularDriverID END,
           UpdatedAt = SYSUTCDATETIME()
       WHERE VehicleID = @id`,
    )
  return findVehicle(pool, id)
}

// ---------------- Shuttle Routes (สายรถรับส่งพนักงานของบริษัทรถเช่า) ----------------

export async function listShuttleRoutes(pool, { includeInactive = false } = {}) {
  const result = await pool
    .request()
    .query(`SELECT r.*, p.Name AS ProviderName FROM ShuttleRoutes r JOIN Providers p ON p.ProviderID = r.ProviderID ${includeInactive ? '' : 'WHERE r.IsActive = 1'} ORDER BY p.Name, r.Name`)
  return result.recordset
}

export async function findShuttleRoute(pool, id) {
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT r.*, p.Name AS ProviderName FROM ShuttleRoutes r JOIN Providers p ON p.ProviderID = r.ProviderID WHERE r.RouteID = @id')
  return result.recordset[0] ?? null
}

function bindShuttleRoute(req, { providerId, name, origin, destination, stopsJson, morningDepart, morningArrive, eveningDepart, eveningArrive, runDays }) {
  return req
    .input('providerId', sql.Int, providerId)
    .input('name', sql.NVarChar(100), name)
    .input('origin', sql.NVarChar(200), origin)
    .input('destination', sql.NVarChar(200), destination)
    .input('stopsJson', sql.NVarChar(2000), stopsJson)
    .input('morningDepart', sql.Char(5), morningDepart)
    .input('morningArrive', sql.Char(5), morningArrive)
    .input('eveningDepart', sql.Char(5), eveningDepart)
    .input('eveningArrive', sql.Char(5), eveningArrive)
    .input('runDays', sql.Char(7), runDays)
}

export async function createShuttleRoute(pool, input) {
  const result = await bindShuttleRoute(pool.request(), input).query(
    `INSERT INTO ShuttleRoutes (ProviderID, Name, Origin, Destination, StopsJson, MorningDepart, MorningArrive, EveningDepart, EveningArrive, RunDays)
     OUTPUT INSERTED.RouteID
     VALUES (@providerId, @name, @origin, @destination, @stopsJson, @morningDepart, @morningArrive, @eveningDepart, @eveningArrive, @runDays)`
  )
  return findShuttleRoute(pool, result.recordset[0].RouteID)
}

export async function updateShuttleRoute(pool, id, input) {
  await bindShuttleRoute(pool.request().input('id', sql.Int, id), input)
    .input('isActive', sql.Bit, input.isActive)
    .query(
      `UPDATE ShuttleRoutes
       SET ProviderID = @providerId, Name = @name, Origin = @origin, Destination = @destination, StopsJson = @stopsJson,
           MorningDepart = @morningDepart, MorningArrive = @morningArrive, EveningDepart = @eveningDepart, EveningArrive = @eveningArrive,
           RunDays = @runDays, IsActive = @isActive, UpdatedAt = SYSUTCDATETIME()
       WHERE RouteID = @id`
    )
  return findShuttleRoute(pool, id)
}

/** รถประจำสาย + คนขับประจำ ของหลายสายในครั้งเดียว - คืน Map<RouteID, rows[]> */
export async function listRouteVehicles(pool, routeIds) {
  const map = new Map()
  if (routeIds.length === 0) return map
  const req = pool.request()
  const params = routeIds.map((id, i) => {
    req.input(`r${i}`, sql.Int, id)
    return `@r${i}`
  })
  const result = await req.query(
    `SELECT v.RouteID, v.VehicleID, v.LicensePlate, v.VehicleType, v.SeatCount, v.IsActive,
            v.RegularDriverID, d.Name AS DriverName, d.Phone AS DriverPhone
     FROM Vehicles v LEFT JOIN Drivers d ON d.DriverID = v.RegularDriverID
     WHERE v.RouteID IN (${params.join(', ')})
     ORDER BY v.LicensePlate`,
  )
  for (const row of result.recordset) {
    if (!map.has(row.RouteID)) map.set(row.RouteID, [])
    map.get(row.RouteID).push(row)
  }
  return map
}

/**
 * ตั้งรถประจำสาย (แทนที่ของเดิมทั้งชุด) - pairs: [{ vehicleId, driverId|null }] ที่ route ตรวจแล้ว
 * รถที่เคยอยู่สายนี้แต่ไม่อยู่ในรายการใหม่ → ออกจากสาย, คนขับที่ย้ายมาจากรถคันอื่น → ถอดจากคันเดิมก่อน
 * (คนขับประจำได้คันเดียว - unique index UX_Vehicles_RegularDriver) ทำทั้งหมดใน transaction เดียว
 */
export async function setRouteVehicles(pool, routeId, pairs) {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const keep = pairs.map((p) => p.vehicleId)
    const req = transaction.request().input('routeId', sql.Int, routeId)
    const keepParams = keep.map((id, i) => {
      req.input(`k${i}`, sql.Int, id)
      return `@k${i}`
    })
    await req.query(
      `UPDATE Vehicles SET RouteID = NULL, RegularDriverID = NULL, UpdatedAt = SYSUTCDATETIME()
       WHERE RouteID = @routeId ${keep.length ? `AND VehicleID NOT IN (${keepParams.join(', ')})` : ''}`,
    )
    for (const { vehicleId, driverId } of pairs) {
      if (driverId) {
        await transaction
          .request()
          .input('driverId', sql.Int, driverId)
          .input('vehicleId', sql.Int, vehicleId)
          .query('UPDATE Vehicles SET RegularDriverID = NULL WHERE RegularDriverID = @driverId AND VehicleID <> @vehicleId')
      }
      await transaction
        .request()
        .input('routeId', sql.Int, routeId)
        .input('vehicleId', sql.Int, vehicleId)
        .input('driverId', sql.Int, driverId)
        .query(
          `UPDATE Vehicles SET RouteID = @routeId, RegularDriverID = @driverId, UpdatedAt = SYSUTCDATETIME()
           WHERE VehicleID = @vehicleId`,
        )
    }
    await transaction.commit()
  } catch (err) {
    await transaction.rollback().catch(() => {})
    throw err
  }
}

// ---------------- Shuttle Passengers (พนักงานที่ใช้รถรับส่ง) ----------------

export async function listShuttlePassengers(pool) {
  const result = await pool
    .request()
    .query(`
      SELECT p.*, u.FullName, d.Name AS Department, r.Name AS RouteName, r.ProviderID 
      FROM ShuttlePassengers p
      JOIN Users u ON u.UserID = p.UserID
      LEFT JOIN Departments d ON u.DepartmentID = d.DepartmentID
      JOIN ShuttleRoutes r ON r.RouteID = p.RouteID
      ORDER BY r.Name, u.FullName
    `)
  return result.recordset
}

export async function findShuttlePassenger(pool, userId) {
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT p.*, u.FullName, d.Name AS Department, r.Name AS RouteName, r.ProviderID 
      FROM ShuttlePassengers p
      JOIN Users u ON u.UserID = p.UserID
      LEFT JOIN Departments d ON u.DepartmentID = d.DepartmentID
      JOIN ShuttleRoutes r ON r.RouteID = p.RouteID
      WHERE p.UserID = @userId
    `)
  return result.recordset[0] ?? null
}

export async function upsertShuttlePassenger(pool, { userId, routeId, pickupStop }) {
  await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('routeId', sql.Int, routeId)
    .input('pickupStop', sql.NVarChar(200), pickupStop)
    .query(`
      MERGE ShuttlePassengers AS t
      USING (SELECT @userId AS UserID, @routeId AS RouteID, @pickupStop AS PickupStop) AS s
      ON t.UserID = s.UserID
      WHEN MATCHED THEN 
        UPDATE SET RouteID = s.RouteID, PickupStop = s.PickupStop, UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN 
        INSERT (UserID, RouteID, PickupStop) VALUES (s.UserID, s.RouteID, s.PickupStop);
    `)
  return findShuttlePassenger(pool, userId)
}

export async function deleteShuttlePassenger(pool, userId) {
  await pool
    .request()
    .input('userId', sql.Int, userId)
    .query('DELETE FROM ShuttlePassengers WHERE UserID = @userId')
}

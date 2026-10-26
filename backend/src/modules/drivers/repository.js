import { sql } from '../../db/pool.js'

// คนขับที่ลงทะเบียนไว้: ProviderID = NULL คือคนขับของบริษัท, มีค่า = คนขับของบริษัทรถเช่านั้น
// (ผู้ให้บริการเรียกรถออนไลน์ไม่มีรายชื่อคนขับ - กรอกรายทริปตอนจัดรถ)
const SELECT = `
  SELECT d.*, p.Name AS ProviderName
  FROM Drivers d LEFT JOIN Providers p ON p.ProviderID = d.ProviderID`

export async function listAll(pool, { includeInactive = false } = {}) {
  const result = await pool
    .request()
    .query(`${SELECT} ${includeInactive ? '' : 'WHERE d.IsActive = 1'} ORDER BY p.Name, d.Name`)
  return result.recordset
}

export async function findById(pool, id) {
  const result = await pool.request().input('id', sql.Int, id).query(`${SELECT} WHERE d.DriverID = @id`)
  return result.recordset[0] ?? null
}

export async function create(pool, { name, phone, providerId, note }) {
  const result = await pool
    .request()
    .input('name', sql.NVarChar(200), name)
    .input('phone', sql.NVarChar(50), phone ?? null)
    .input('providerId', sql.Int, providerId ?? null)
    .input('note', sql.NVarChar(200), note ?? null)
    .query(
      `INSERT INTO Drivers (Name, Phone, ProviderID, Note)
       OUTPUT INSERTED.DriverID
       VALUES (@name, @phone, @providerId, @note)`,
    )
  return findById(pool, result.recordset[0].DriverID)
}

export async function update(pool, id, { name, phone, providerId, note, isActive }) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(200), name)
    .input('phone', sql.NVarChar(50), phone ?? null)
    .input('providerId', sql.Int, providerId ?? null)
    .input('note', sql.NVarChar(200), note ?? null)
    .input('isActive', sql.Bit, isActive)
    .query(
      `UPDATE Drivers
       SET Name = @name, Phone = @phone, ProviderID = @providerId, Note = @note, IsActive = @isActive, UpdatedAt = SYSUTCDATETIME()
       WHERE DriverID = @id`,
    )
  return findById(pool, id)
}

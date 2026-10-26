import { randomBytes } from 'node:crypto'
import { sql } from '../../db/pool.js'

// อุปกรณ์ = จอ tablet หน้าห้อง (migration 024) - token ใน URL ของจอ เข้าได้โดยไม่ต้อง login
function generateToken() {
  return randomBytes(24).toString('base64url')
}

const SELECT = `
  SELECT d.*, r.Name AS RoomName, r.Floor AS RoomFloor, r.IsActive AS RoomIsActive
  FROM Devices d LEFT JOIN Rooms r ON r.RoomID = d.RoomID`

export async function listAll(pool) {
  const result = await pool.request().query(`${SELECT} ORDER BY r.Name, d.Name`)
  return result.recordset
}

export async function findById(pool, id) {
  const result = await pool.request().input('id', sql.Int, id).query(`${SELECT} WHERE d.DeviceID = @id`)
  return result.recordset[0] ?? null
}

export async function findByToken(pool, token) {
  const result = await pool.request().input('token', sql.VarChar(64), token).query(`${SELECT} WHERE d.Token = @token`)
  return result.recordset[0] ?? null
}

export async function create(pool, { name, roomId }) {
  const result = await pool
    .request()
    .input('name', sql.NVarChar(200), name)
    .input('roomId', sql.Int, roomId)
    .input('token', sql.VarChar(64), generateToken())
    .query('INSERT INTO Devices (Name, RoomID, Token) OUTPUT INSERTED.DeviceID VALUES (@name, @roomId, @token)')
  return findById(pool, result.recordset[0].DeviceID)
}

export async function update(pool, id, { name, roomId }) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(200), name)
    .input('roomId', sql.Int, roomId)
    .query('UPDATE Devices SET Name = @name, RoomID = @roomId WHERE DeviceID = @id')
  return findById(pool, id)
}

/** ลบได้เสมอ - อุปกรณ์ไม่มีประวัติที่ข้อมูลอื่นอ้างถึง ลบแล้ว token ใช้ไม่ได้ทันที */
export async function remove(pool, id) {
  await pool.request().input('id', sql.Int, id).query('DELETE FROM Devices WHERE DeviceID = @id')
}

/** ออก token ใหม่ - ลิงก์เดิมของจอใช้ไม่ได้ทันที (เช่น tablet หาย) */
export async function regenerateToken(pool, id) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('token', sql.VarChar(64), generateToken())
    .query('UPDATE Devices SET Token = @token WHERE DeviceID = @id')
  return findById(pool, id)
}

export async function touchLastSeen(pool, id) {
  await pool
    .request()
    .input('id', sql.Int, id)
    .query('UPDATE Devices SET LastSeenAt = SYSUTCDATETIME() WHERE DeviceID = @id')
}

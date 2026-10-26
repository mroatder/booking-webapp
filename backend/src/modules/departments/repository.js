import { sql } from '../../db/pool.js'

export async function listAll(pool) {
  const result = await pool.request().query('SELECT * FROM Departments ORDER BY Name')
  return result.recordset
}

export async function findById(pool, id) {
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM Departments WHERE DepartmentID = @id')
  return result.recordset[0] ?? null
}

/** แผนกชื่อเดียวกันภายใต้แผนกแม่เดียวกัน (ใช้กันชื่อซ้ำ) */
export async function findSibling(pool, name, parentDepartmentId) {
  const result = await pool.request()
    .input('name', sql.NVarChar(200), name)
    .input('parentId', sql.Int, parentDepartmentId ?? null)
    .query('SELECT TOP 1 * FROM Departments WHERE Name = @name AND ((ParentDepartmentID IS NULL AND @parentId IS NULL) OR ParentDepartmentID = @parentId)')
  return result.recordset[0] ?? null
}

export async function create(pool, { name, parentDepartmentId }) {
  const result = await pool.request()
    .input('name', sql.NVarChar(200), name)
    .input('parentId', sql.Int, parentDepartmentId ?? null)
    .query(`
      INSERT INTO Departments (Name, ParentDepartmentID)
      OUTPUT INSERTED.*
      VALUES (@name, @parentId)
    `)
  return result.recordset[0]
}

export async function update(pool, id, { name, parentDepartmentId }) {
  await pool.request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(200), name)
    .input('parentId', sql.Int, parentDepartmentId ?? null)
    .query(`
      UPDATE Departments 
      SET Name = @name, ParentDepartmentID = @parentId
      WHERE DepartmentID = @id
    `)
  return findById(pool, id)
}

/** จำนวนผู้ใช้ที่สังกัดแผนกนี้ (รวมที่ปิดใช้งาน) - ใช้กันการลบแผนกที่ยังมีคนอยู่ */
export async function countUsers(pool, id) {
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT COUNT(*) AS Total FROM Users WHERE DepartmentID = @id')
  return result.recordset[0].Total
}

export async function deleteDepartment(pool, id) {
  await pool.request()
    .input('id', sql.Int, id)
    .query('DELETE FROM Departments WHERE DepartmentID = @id')
}

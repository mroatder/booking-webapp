import { sql } from '../../db/pool.js'

export async function insert(pool, e) {
  await pool
    .request()
    .input('userId', sql.Int, e.userId ?? null)
    .input('actor', sql.NVarChar(100), e.actor ?? null)
    .input('action', sql.VarChar(80), e.action)
    .input('entityType', sql.VarChar(40), e.entityType ?? null)
    .input('entityId', sql.Int, e.entityId ?? null)
    .input('method', sql.VarChar(10), e.method ?? null)
    .input('path', sql.NVarChar(300), e.path ?? null)
    .input('statusCode', sql.Int, e.statusCode ?? null)
    .input('ip', sql.VarChar(64), e.ip ?? null)
    .input('details', sql.NVarChar(sql.MAX), e.details ?? null)
    .query(`
      INSERT INTO AuditLogs (UserID, Actor, Action, EntityType, EntityID, Method, Path, StatusCode, IpAddress, Details)
      VALUES (@userId, @actor, @action, @entityType, @entityId, @method, @path, @statusCode, @ip, @details)
    `)
}

// escape ตัวอักษรพิเศษของ LIKE ใน SQL Server (% _ [) ให้ค้นหาเป็นข้อความตรงๆ - ไม่ escape ] เพราะ [] ] ใช้ไม่ได้ใน T-SQL และ ] เดี่ยวๆ เป็นตัวอักษรปกติอยู่แล้ว
const likeEscape = (s) => s.replace(/[%_[]/g, (c) => `[${c}]`)

/**
 * @param filters { from?: Date, to?: Date (exclusive), userId?, action?, entityType?, entityId?, q? }
 * @returns { items, total }
 */
export async function list(pool, filters, { limit, offset }) {
  const where = ['1 = 1']
  const bind = (req) => {
    if (filters.from) req.input('from', sql.DateTime2, filters.from)
    if (filters.to) req.input('to', sql.DateTime2, filters.to)
    if (filters.userId) req.input('userId', sql.Int, filters.userId)
    if (filters.action) req.input('action', sql.VarChar(80), filters.action)
    if (filters.entityType) req.input('entityType', sql.VarChar(40), filters.entityType)
    if (filters.entityId) req.input('entityId', sql.Int, filters.entityId)
    if (filters.q) req.input('q', sql.NVarChar(200), `%${likeEscape(filters.q)}%`)
    return req
  }
  if (filters.from) where.push('a.CreatedAt >= @from')
  if (filters.to) where.push('a.CreatedAt < @to')
  if (filters.userId) where.push('a.UserID = @userId')
  if (filters.action) where.push('a.Action = @action')
  if (filters.entityType) where.push('a.EntityType = @entityType')
  if (filters.entityId) where.push('a.EntityID = @entityId')
  if (filters.q) {
    where.push(`(a.Actor LIKE @q OR u.Username LIKE @q OR u.FullName LIKE @q OR a.Path LIKE @q OR a.Details LIKE @q)`)
  }
  const whereSql = where.join(' AND ')
  const from = `FROM AuditLogs a LEFT JOIN Users u ON u.UserID = a.UserID WHERE ${whereSql}`

  const totalResult = await bind(pool.request()).query(`SELECT COUNT_BIG(*) AS Total ${from}`)
  const rows = await bind(pool.request())
    .input('limit', sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(`
      SELECT a.AuditLogID, a.CreatedAt, a.UserID, a.Actor, a.Action, a.EntityType, a.EntityID,
             a.Method, a.Path, a.StatusCode, a.IpAddress, a.Details, u.Username, u.FullName
      ${from}
      ORDER BY a.CreatedAt DESC, a.AuditLogID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `)
  return { items: rows.recordset, total: Number(totalResult.recordset[0].Total) }
}

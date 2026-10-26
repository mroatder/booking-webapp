import sql from 'mssql'
import { env } from '../config/env.js'

/** @type {sql.ConnectionPool | null} */
let pool = null

export async function getPool() {
  if (pool) return pool

  // ถ้าระบุ instance name (เช่น SQLEXPRESS) จะเชื่อมผ่าน SQL Browser service (ต้องเปิด UDP 1434)
  // แทนการระบุ port ตรงๆ - เลือกใช้ทางใดทางหนึ่ง
  const useNamedInstance = Boolean(env.db.instance)

  pool = await new sql.ConnectionPool({
    server: env.db.host,
    port: useNamedInstance ? undefined : env.db.port,
    database: env.db.database,
    user: env.db.user,
    password: env.db.password,
    options: {
      instanceName: useNamedInstance ? env.db.instance : undefined,
      encrypt: env.db.encrypt,
      trustServerCertificate: env.db.trustServerCertificate,
    },
  }).connect()

  pool.on('error', (err) => {
    console.error('[db] pool error', err)
  })

  return pool
}

export async function closePool() {
  if (pool) {
    await pool.close()
    pool = null
  }
}

export { sql }

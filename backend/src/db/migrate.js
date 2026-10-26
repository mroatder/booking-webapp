import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from './pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

async function ensureMigrationsTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SchemaMigrations')
    CREATE TABLE SchemaMigrations (
      Name NVARCHAR(255) NOT NULL PRIMARY KEY,
      AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    )
  `)
}

async function getAppliedMigrations(pool) {
  const result = await pool.request().query('SELECT Name FROM SchemaMigrations')
  return new Set(result.recordset.map((row) => row.Name))
}

async function run() {
  const pool = await getPool()
  await ensureMigrationsTable(pool)
  const applied = await getAppliedMigrations(pool)

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue

    const sqlText = await readFile(path.join(MIGRATIONS_DIR, file), 'utf-8')
    console.log(`[migrate] applying ${file}...`)

    const transaction = pool.transaction()
    await transaction.begin()
    try {
      // แยกรันทีละ batch คั่นด้วย GO (มาตรฐานไฟล์ SQL Server script)
      const batches = sqlText
        .split(/^\s*GO\s*$/im)
        .map((b) => b.trim())
        .filter(Boolean)

      for (const batch of batches) {
        await transaction.request().query(batch)
      }

      await transaction
        .request()
        .input('name', file)
        .query('INSERT INTO SchemaMigrations (Name) VALUES (@name)')

      await transaction.commit()
      console.log(`[migrate] applied ${file}`)
    } catch (err) {
      await transaction.rollback()
      console.error(`[migrate] failed on ${file}:`, err.message)
      throw err
    }
  }

  if (files.length === 0 || files.every((f) => applied.has(f))) {
    console.log('[migrate] no pending migrations')
  }

  await closePool()
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

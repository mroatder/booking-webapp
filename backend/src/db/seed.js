import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getPool, closePool } from './pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEEDS_DIR = path.join(__dirname, 'seeds')

async function run() {
  const pool = await getPool()

  const files = (await readdir(SEEDS_DIR)).filter((f) => f.endsWith('.js')).sort()

  if (files.length === 0) {
    console.log('[seed] ไม่มีไฟล์ seed ใน src/db/seeds - ข้ามการ seed')
  }

  for (const file of files) {
    console.log(`[seed] running ${file}...`)
    const mod = await import(pathToFileURL(path.join(SEEDS_DIR, file)).href)
    await mod.seed(pool)
    console.log(`[seed] done ${file}`)
  }

  await closePool()
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

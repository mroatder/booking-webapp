// สคริปต์ช่วยสร้าง local account (ใช้สร้าง Super Admin คนแรกของระบบ หรือ local user อื่นๆ)
// ใช้งาน: node src/db/create-local-user.js --username admin --password "Passw0rd!" --fullName "ผู้ดูแลระบบ" --role Admin
import { getPool, closePool } from './pool.js'
import { hashPassword } from '../modules/auth/password.js'
import { createLocalUser } from '../modules/users/repository.js'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      args[key] = argv[i + 1]
      i += 1
    }
  }
  return args
}

async function run() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.username || !args.password || !args.fullName) {
    console.error(
      'Usage: node src/db/create-local-user.js --username <u> --password <p> --fullName "<ชื่อ>" [--role Admin|Employee] [--department <d>] [--phone <p>] [--email <e>]',
    )
    process.exitCode = 1
    return
  }

  const pool = await getPool()
  const passwordHash = await hashPassword(args.password)

  const user = await createLocalUser(pool, {
    username: args.username,
    passwordHash,
    fullName: args.fullName,
    department: args.department,
    phone: args.phone,
    email: args.email,
    role: args.role ?? 'Employee',
  })

  console.log(`[create-local-user] created user "${user.Username}" (Role: ${user.Role})`)
  await closePool()
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

import { Client } from 'ldapts'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'

// AD ส่งค่าว่างมาเป็น "" ได้ (เช่น department ที่ไม่ได้กรอก) - เก็บเป็น null ให้เหมือนไม่มีข้อมูล
function toStringOrNull(value) {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  return s || null
}

/**
 * Escape ค่าที่จะใส่ใน LDAP search filter ตาม RFC 4515 - กัน LDAP injection
 * (เช่น Admin พิมพ์ `*)(objectClass=*` ในช่องค้นหา)
 */
export function escapeFilterValue(value) {
  return String(value).replace(/[\\*()\0]/g, (ch) => `\\${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

// เฉพาะบัญชีผู้ใช้ที่เป็นคนจริงและยังเปิดใช้งานอยู่ (บิต 2 ของ userAccountControl = ACCOUNTDISABLE)
const ACTIVE_PERSON = '(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))'
const DIRECTORY_ATTRIBUTES = ['userPrincipalName', 'sAMAccountName', 'displayName', 'department']
export const MAX_DIRECTORY_RESULTS = 25

/**
 * username ในระบบ = ส่วนหน้า @ ของ userPrincipalName เพราะตอน login ระบบ bind ด้วย `${username}@${LDAP_DOMAIN}`
 * (ถ้าไม่มี UPN หรือ domain ไม่ตรง จะ login ไม่ได้อยู่แล้ว จึงข้ามบัญชีนั้น)
 */
function toDirectoryUser(entry) {
  const upn = toStringOrNull(entry.userPrincipalName)
  if (!upn) return null
  const [username, domain] = upn.split('@')
  if (!username || domain?.toLowerCase() !== env.ldap.domain.toLowerCase()) return null
  return {
    username,
    fullName: toStringOrNull(entry.displayName) ?? username,
    department: toStringOrNull(entry.department),
  }
}

async function withServiceAccount(fn) {
  if (!env.ldap.url || !env.ldap.bindUser || !env.ldap.bindPassword) {
    throw new AppError(ErrorCodes.LDAP_NOT_CONFIGURED, 503)
  }
  const client = new Client({ url: env.ldap.url, timeout: 10000, connectTimeout: 5000 })
  try {
    try {
      await client.bind(env.ldap.bindUser, env.ldap.bindPassword)
    } catch {
      throw new AppError(ErrorCodes.LDAP_UNAVAILABLE, 502)
    }
    return await fn(client)
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(ErrorCodes.LDAP_UNAVAILABLE, 502)
  } finally {
    await client.unbind().catch(() => {})
  }
}

/** ค้นหาผู้ใช้ใน AD ด้วยบัญชีบริการ - จับคู่ username, ชื่อ แบบมีคำนี้อยู่ในข้อความ */
export async function searchDirectory(query) {
  const q = escapeFilterValue(query.trim())
  const filter = `(&${ACTIVE_PERSON}(|(sAMAccountName=*${q}*)(userPrincipalName=*${q}*)(displayName=*${q}*)))`
  return withServiceAccount(async (client) => {
    const { searchEntries } = await client.search(env.ldap.baseDn, {
      scope: 'sub',
      filter,
      attributes: DIRECTORY_ATTRIBUTES,
    })
    return searchEntries
      .map(toDirectoryUser)
      .filter(Boolean)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'th'))
      .slice(0, MAX_DIRECTORY_RESULTS)
  })
}

/**
 * ดึงข้อมูลผู้ใช้ตาม username (ตรงตัว) - ใช้ตอนกดเพิ่ม: อ่านจาก AD ใหม่ทุกครั้ง
 * ไม่เชื่อชื่อ/แผนกที่ frontend ส่งมา
 */
export async function lookupDirectoryUsers(usernames) {
  return withServiceAccount(async (client) => {
    const found = []
    for (const username of usernames) {
      const upn = `${username}@${env.ldap.domain}`
      const { searchEntries } = await client.search(env.ldap.baseDn, {
        scope: 'sub',
        filter: `(&${ACTIVE_PERSON}(userPrincipalName=${escapeFilterValue(upn)}))`,
        attributes: DIRECTORY_ATTRIBUTES,
      })
      const user = searchEntries[0] ? toDirectoryUser(searchEntries[0]) : null
      if (user) found.push(user)
    }
    return found
  })
}

/**
 * Bind ต่อ Active Directory ด้วย username/password ของผู้ใช้ (LDAP plain ตาม requirement)
 * แล้วดึงข้อมูลโปรไฟล์กลับมา โยน error ถ้า bind ไม่สำเร็จ (username/password ผิด)
 *
 * หมายเหตุ: ไม่มีการเช็ค AD group เพื่อกำหนด Admin อัตโนมัติ เพราะ AD ของบริษัทไม่มี
 * group สำหรับเรื่องนี้ - ผู้ใช้จาก AD ทุกคนเริ่มต้นเป็น Employee เสมอ แล้ว Admin
 * เป็นผู้กำหนด role เองผ่านหน้าจัดการผู้ใช้ในเว็บ (ดู modules/users)
 *
 * ไม่ดึงเบอร์โทรจาก AD (dev ยืนยัน 2026-09-28: AD ของบริษัทไม่มีเบอร์) - เบอร์กรอกในระบบเอง
 * โดยผู้ใช้ (หน้าโปรไฟล์) หรือ Admin และ AD sync จะไม่เขียนทับ
 *
 * ไม่ดึงอีเมลจาก AD เช่นกัน (dev 2026-10-08) - อีเมลกรอก/แก้ในเว็บเอง
 */
export async function authenticateWithLdap(username, password) {
  const client = new Client({ url: env.ldap.url })
  const userPrincipalName = `${username}@${env.ldap.domain}`

  try {
    await client.bind(userPrincipalName, password)

    const { searchEntries } = await client.search(env.ldap.baseDn, {
      scope: 'sub',
      filter: `(userPrincipalName=${escapeFilterValue(userPrincipalName)})`,
      attributes: ['displayName', 'department'],
    })

    const entry = searchEntries[0]

    return {
      fullName: toStringOrNull(entry?.displayName) ?? username,
      department: toStringOrNull(entry?.department),
    }
  } finally {
    await client.unbind().catch(() => {})
  }
}

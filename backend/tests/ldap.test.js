import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// จำลอง ldapts Client เพื่อตรวจ filter ที่ส่งไป AD จริง (ไม่ต่อ AD)
const client = vi.hoisted(() => ({
  bind: vi.fn(),
  search: vi.fn(),
  unbind: vi.fn(async () => {}),
}))
vi.mock('ldapts', () => ({
  Client: vi.fn(function Client() {
    return client
  }),
}))

import { env } from '../src/config/env.js'
import { escapeFilterValue, searchDirectory, lookupDirectoryUsers } from '../src/modules/auth/ldap.js'

const saved = { ...env.ldap }

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(env.ldap, {
    url: 'ldap://ad.test:389',
    baseDn: 'DC=corp,DC=test',
    domain: 'corp.test',
    bindUser: 'svc@corp.test',
    bindPassword: 'secret',
  })
  client.bind.mockResolvedValue()
})

afterEach(() => {
  Object.assign(env.ldap, saved)
})

describe('escapeFilterValue', () => {
  it('escapes RFC 4515 special characters', () => {
    expect(escapeFilterValue('*)(objectClass=*')).toBe('\\2a\\29\\28objectClass=\\2a')
    expect(escapeFilterValue('a\\b')).toBe('a\\5cb')
    expect(escapeFilterValue('สมชาย')).toBe('สมชาย')
  })
})

describe('searchDirectory', () => {
  it('binds with the service account and escapes the query inside the filter', async () => {
    client.search.mockResolvedValue({ searchEntries: [] })
    await searchDirectory(' x*)(uid=*  ')

    expect(client.bind).toHaveBeenCalledWith('svc@corp.test', 'secret')
    const { filter } = client.search.mock.calls[0][1]
    expect(filter).toContain('(sAMAccountName=*x\\2a\\29\\28uid=\\2a*)')
    expect(filter).not.toContain('(uid=*)')
    // บัญชีที่ถูกปิด (ACCOUNTDISABLE) ต้องไม่ถูกดึงมา
    expect(filter).toContain('(!(userAccountControl:1.2.840.113556.1.4.803:=2))')
    expect(client.unbind).toHaveBeenCalled()
  })

  it('uses the UPN prefix as username and skips accounts from another domain', async () => {
    client.search.mockResolvedValue({
      searchEntries: [
        { userPrincipalName: 'somchai.j@CORP.TEST', displayName: 'สมชาย', department: 'IT', mail: 's@corp.test' },
        { userPrincipalName: 'other@elsewhere.test', displayName: 'ข้าม' },
        { sAMAccountName: 'noupn', displayName: 'ไม่มี UPN' },
      ],
    })
    const results = await searchDirectory('som')
    expect(results).toEqual([{ username: 'somchai.j', fullName: 'สมชาย', department: 'IT' }])
    // อีเมลไม่ดึงจาก AD แล้ว - ต้องไม่หลุดออกมาแม้ AD ส่ง mail มา
    expect(results[0]).not.toHaveProperty('email')
  })

  it('turns empty AD attributes into null', async () => {
    client.search.mockResolvedValue({
      searchEntries: [{ userPrincipalName: 'x@corp.test', displayName: 'X', department: '', mail: '  ' }],
    })
    const [user] = await searchDirectory('x')
    expect(user).toMatchObject({ department: null })
  })

  it('caps the number of results at 25', async () => {
    client.search.mockResolvedValue({
      searchEntries: Array.from({ length: 40 }, (_, i) => ({ userPrincipalName: `u${i}@corp.test`, displayName: `U${i}` })),
    })
    expect(await searchDirectory('u')).toHaveLength(25)
  })

  it('refuses to run without a service account', async () => {
    env.ldap.bindPassword = ''
    await expect(searchDirectory('som')).rejects.toMatchObject({ code: 'LDAP_NOT_CONFIGURED', statusCode: 503 })
    expect(client.bind).not.toHaveBeenCalled()
  })

  it('reports a failed service-account bind as LDAP_UNAVAILABLE', async () => {
    client.bind.mockRejectedValue(new Error('invalid credentials'))
    await expect(searchDirectory('som')).rejects.toMatchObject({ code: 'LDAP_UNAVAILABLE', statusCode: 502 })
  })
})

describe('lookupDirectoryUsers', () => {
  it('looks each username up by exact, escaped UPN', async () => {
    client.search.mockResolvedValue({ searchEntries: [{ userPrincipalName: 'a*b@corp.test', displayName: 'A' }] })
    const found = await lookupDirectoryUsers(['a*b'])
    expect(client.search.mock.calls[0][1].filter).toContain('(userPrincipalName=a\\2ab@corp.test)')
    expect(found).toEqual([{ username: 'a*b', fullName: 'A', department: null }])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
}))

vi.mock('../src/modules/auth/ldap.js', () => ({
  authenticateWithLdap: vi.fn(),
}))

vi.mock('../src/modules/users/repository.js', () => ({
  findByUsername: vi.fn(),
  upsertFromAd: vi.fn(),
  findById: vi.fn(),
}))

import { login, getUserById } from '../src/modules/auth/service.js'
import { authenticateWithLdap } from '../src/modules/auth/ldap.js'
import * as usersRepo from '../src/modules/users/repository.js'
import { hashPassword } from '../src/modules/auth/password.js'
import { ErrorCodes } from '../src/errors/codes.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('auth service - login (local account)', () => {
  it('logs in successfully with the correct password', async () => {
    const passwordHash = await hashPassword('Passw0rd!')
    usersRepo.findByUsername.mockResolvedValue({
      UserID: 1,
      Username: 'jane',
      PasswordHash: passwordHash,
      FullName: 'Jane Doe',
      Department: 'IT',
      Role: 'Employee',
      AuthSource: 'Local',
      IsActive: true,
    })

    const { token, user } = await login('jane', 'Passw0rd!')

    expect(token).toEqual(expect.any(String))
    expect(user).toEqual({
      id: 1,
      username: 'jane',
      fullName: 'Jane Doe',
      department: 'IT',
      authSource: 'Local',
      role: 'Employee',
      approvalLevel: null,
      hasSignature: false,
    })
    expect(authenticateWithLdap).not.toHaveBeenCalled()
  })

  it('rejects a wrong password without falling back to LDAP', async () => {
    const passwordHash = await hashPassword('Correct!')
    usersRepo.findByUsername.mockResolvedValue({
      UserID: 1,
      Username: 'jane',
      PasswordHash: passwordHash,
      AuthSource: 'Local',
      IsActive: true,
    })

    await expect(login('jane', 'Wrong!')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
      statusCode: 401,
    })
    expect(authenticateWithLdap).not.toHaveBeenCalled()
  })

  it('rejects a disabled local account even with the correct password', async () => {
    const passwordHash = await hashPassword('Passw0rd!')
    usersRepo.findByUsername.mockResolvedValue({
      UserID: 1,
      Username: 'jane',
      PasswordHash: passwordHash,
      AuthSource: 'Local',
      IsActive: false,
    })

    await expect(login('jane', 'Passw0rd!')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
    })
  })
})

describe('auth service - login (AD fallback)', () => {
  it('binds against LDAP when the user has no local account, and syncs the profile', async () => {
    usersRepo.findByUsername.mockResolvedValue(null)
    authenticateWithLdap.mockResolvedValue({
      fullName: 'John AD',
      department: 'Sales',
    })
    usersRepo.upsertFromAd.mockResolvedValue({
      UserID: 2,
      Username: 'john',
      FullName: 'John AD',
      Department: 'Sales',
      Role: 'Employee',
      AuthSource: 'AD',
      IsActive: true,
    })

    const { user } = await login('john', 'whatever')

    expect(authenticateWithLdap).toHaveBeenCalledWith('john', 'whatever')
    expect(usersRepo.upsertFromAd).toHaveBeenCalledWith(expect.anything(), {
      username: 'john',
      fullName: 'John AD',
      department: 'Sales',
    })
    // เบอร์โทรไม่ได้มาจาก AD - ต้องไม่ถูกส่งไปเขียนทับเบอร์ที่ผู้ใช้/Admin กรอกไว้
    expect(usersRepo.upsertFromAd.mock.calls[0][1]).not.toHaveProperty('phone')
    expect(usersRepo.upsertFromAd.mock.calls[0][1]).not.toHaveProperty('email')
    // ไม่มี admin group ใน AD ให้เช็ค - ผู้ใช้ AD คนใหม่ต้องเริ่มต้นเป็น Employee เสมอ
    expect(user.role).toBe('Employee')
  })

  it('rejects when LDAP bind fails', async () => {
    usersRepo.findByUsername.mockResolvedValue(null)
    authenticateWithLdap.mockRejectedValue(new Error('bind failed'))

    await expect(login('unknown', 'bad')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
      statusCode: 401,
    })
  })

  it('preserves a role granted manually via the web UI on subsequent AD logins', async () => {
    usersRepo.findByUsername.mockResolvedValue({
      UserID: 3,
      Username: 'john',
      AuthSource: 'AD',
      Role: 'Admin', // ตั้งไว้ก่อนหน้านี้ผ่านหน้าจัดการผู้ใช้ ไม่ใช่จาก AD
      IsActive: true,
    })
    authenticateWithLdap.mockResolvedValue({
      fullName: 'John AD',
      department: 'Sales',
    })
    usersRepo.upsertFromAd.mockResolvedValue({
      UserID: 3,
      Username: 'john',
      FullName: 'John AD',
      Role: 'Admin',
      AuthSource: 'AD',
      IsActive: true,
    })

    const { user } = await login('john', 'whatever')

    expect(authenticateWithLdap).toHaveBeenCalled()
    expect(user.role).toBe('Admin')
  })
})

describe('auth service - login (no-login roster user)', () => {
  it('rejects without trying LDAP', async () => {
    usersRepo.findByUsername.mockResolvedValue({ UserID: 9, Username: 'nologin-abc', AuthSource: 'None', Role: 'Employee', IsActive: true })

    await expect(login('nologin-abc', 'whatever')).rejects.toMatchObject({ code: ErrorCodes.AUTH_INVALID_CREDENTIALS })
    expect(authenticateWithLdap).not.toHaveBeenCalled()
  })
})

describe('auth service - getUserById', () => {
  it('returns the public user shape when found and active', async () => {
    usersRepo.findById.mockResolvedValue({
      UserID: 1,
      Username: 'jane',
      FullName: 'Jane Doe',
      Department: 'IT',
      Role: 'Employee',
      IsActive: true,
    })

    const user = await getUserById(1)
    expect(user).toEqual({
      id: 1,
      username: 'jane',
      fullName: 'Jane Doe',
      department: 'IT',
      role: 'Employee',
      approvalLevel: null,
      hasSignature: false,
    })
  })

  it('throws AUTH_UNAUTHENTICATED when the user no longer exists or is disabled', async () => {
    usersRepo.findById.mockResolvedValue(null)
    await expect(getUserById(999)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_UNAUTHENTICATED,
    })
  })
})

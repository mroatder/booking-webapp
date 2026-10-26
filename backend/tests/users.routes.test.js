import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/users/repository.js', () => ({
  listAll: vi.fn(),
  listDirectory: vi.fn(),
  findById: vi.fn(),
  findByUsername: vi.fn(),
  createLocalUser: vi.fn(),
  createRosterUser: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  upsertFromAd: vi.fn(),
  findUsernames: vi.fn(async () => new Set()),
  insertFromAd: vi.fn(),
  countActiveAdmins: vi.fn(),
  listEmployeeCodes: vi.fn(async () => new Set()),
}))

vi.mock('../src/modules/departments/repository.js', () => ({
  listAll: vi.fn(async () => [
    { DepartmentID: 1, ParentDepartmentID: null },
    { DepartmentID: 2, ParentDepartmentID: 1 },
    { DepartmentID: 3, ParentDepartmentID: 2 },
    { DepartmentID: 5, ParentDepartmentID: null },
  ]),
}))

vi.mock('../src/modules/auth/ldap.js', () => ({
  authenticateWithLdap: vi.fn(),
  searchDirectory: vi.fn(),
  lookupDirectoryUsers: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { AppError } from '../src/errors/AppError.js'
import * as usersRepo from '../src/modules/users/repository.js'
import * as ldap from '../src/modules/auth/ldap.js'
import * as departmentsRepo from '../src/modules/departments/repository.js'
import ExcelJS from 'exceljs'

function authCookie(role = 'Admin', id = 1) {
  const token = jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: '1h' })
  return `token=${token}`
}

const app = createApp()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/users/directory', () => {
  it('lets any logged-in employee list colleagues, exposing only id/name/department', async () => {
    usersRepo.listDirectory.mockResolvedValue([
      { UserID: 5, FullName: 'สมศรี', Department: 'บัญชี', Phone: '081', Email: 'x@y', Role: 'Admin' },
    ])
    const res = await request(app).get('/api/users/directory').set('Cookie', authCookie('Employee'))
    expect(res.status).toBe(200)
    expect(res.body.users).toEqual([{ id: 5, fullName: 'สมศรี', department: 'บัญชี' }])
  })

  it('limits non-admins to their main department (including every sub-department)', async () => {
    usersRepo.findById.mockResolvedValue({ UserID: 8, DepartmentID: 3 })
    usersRepo.listDirectory.mockResolvedValue([])
    await request(app).get('/api/users/directory').set('Cookie', authCookie('Supervisor', 8))
    expect(usersRepo.listDirectory).toHaveBeenCalledWith(expect.anything(), { selfId: 8, departmentIds: new Set([1, 2, 3]) })
  })

  it('lets admins see everyone', async () => {
    usersRepo.listDirectory.mockResolvedValue([])
    await request(app).get('/api/users/directory').set('Cookie', authCookie('Admin'))
    expect(usersRepo.listDirectory).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it('requires login', async () => {
    const res = await request(app).get('/api/users/directory')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/users', () => {
  it('rejects non-Admin users', async () => {
    const res = await request(app).get('/api/users').set('Cookie', authCookie('Employee'))
    expect(res.status).toBe(403)
  })

  it('lists users for Admin without leaking the password hash', async () => {
    usersRepo.listAll.mockResolvedValue([
      {
        UserID: 1,
        Username: 'jane',
        PasswordHash: 'secret-hash',
        FullName: 'Jane',
        Department: 'IT',
        Phone: null,
        Email: null,
        Role: 'Employee',
        AuthSource: 'Local',
        IsActive: true,
      },
    ])

    const res = await request(app).get('/api/users').set('Cookie', authCookie('Admin'))

    expect(res.status).toBe(200)
    expect(res.body.users[0]).not.toHaveProperty('passwordHash')
    expect(res.body.users[0]).toEqual({
      id: 1,
      username: 'jane',
      employeeCode: null,
      fullName: 'Jane',
      fullNameTh: null,
      department: 'IT',
      phone: null,
      email: null,
      role: 'Employee',
      authSource: 'Local',
      isActive: true,
      approvalLevel: null,
      hasSignature: false,
    })
  })
})

describe('POST /api/users', () => {
  it('validates required fields (short password, empty name)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie('Admin'))
      .send({ username: '', password: 'short', fullName: '', role: 'Employee' })

    expect(res.status).toBe(400)
    expect(usersRepo.createLocalUser).not.toHaveBeenCalled()
  })

  it('creates a local user as Admin', async () => {
    usersRepo.createLocalUser.mockResolvedValue({
      UserID: 2,
      Username: 'newuser',
      FullName: 'New User',
      Department: null,
      Phone: null,
      Email: null,
      Role: 'Employee',
      AuthSource: 'Local',
      IsActive: true,
    })

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie('Admin'))
      .send({ username: 'newuser', password: 'Passw0rd!', fullName: 'New User', role: 'Employee' })

    expect(res.status).toBe(201)
    expect(res.body.user.username).toBe('newuser')
  })

  it('creates a no-login roster user without username/password, forcing Employee and no approval level', async () => {
    usersRepo.createRosterUser.mockResolvedValue({
      UserID: 9,
      Username: 'nologin-abc123',
      FullName: 'สมชาย ใจดี',
      Role: 'Employee',
      AuthSource: 'None',
      IsActive: true,
    })

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie('Admin'))
      .send({ noLogin: true, fullName: 'สมชาย ใจดี', role: 'Admin', approvalLevel: 1 })

    expect(res.status).toBe(201)
    expect(usersRepo.createLocalUser).not.toHaveBeenCalled()
    expect(usersRepo.createRosterUser).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fullName: 'สมชาย ใจดี' }))
    expect(res.body.user.username).toBeNull()
    expect(res.body.user.authSource).toBe('None')
  })

  it('requires a name for a no-login roster user', async () => {
    const res = await request(app).post('/api/users').set('Cookie', authCookie('Admin')).send({ noLogin: true, fullName: '' })

    expect(res.status).toBe(400)
    expect(usersRepo.createRosterUser).not.toHaveBeenCalled()
  })

  it('returns USERNAME_TAKEN when the SQL unique constraint fires', async () => {
    const err = new Error('Violation of UNIQUE KEY constraint')
    err.number = 2627
    usersRepo.createLocalUser.mockRejectedValue(err)

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie('Admin'))
      .send({ username: 'dup', password: 'Passw0rd!', fullName: 'Dup User', role: 'Employee' })

    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('USERNAME_TAKEN')
  })
})

describe('DELETE /api/users/:id', () => {
  it('deactivates a user instead of hard-deleting (soft delete)', async () => {
    usersRepo.findById.mockResolvedValue({ UserID: 3, IsActive: true })
    usersRepo.setActive.mockResolvedValue({
      UserID: 3,
      Username: 'toDisable',
      FullName: 'X',
      Department: null,
      Phone: null,
      Email: null,
      Role: 'Employee',
      AuthSource: 'Local',
      IsActive: false,
    })

    const res = await request(app).delete('/api/users/3').set('Cookie', authCookie('Admin'))

    expect(res.status).toBe(200)
    expect(res.body.user.isActive).toBe(false)
    expect(usersRepo.setActive).toHaveBeenCalledWith(expect.anything(), '3', false)
  })

  it('returns 404 for a non-existent user', async () => {
    usersRepo.findById.mockResolvedValue(null)
    const res = await request(app).delete('/api/users/999').set('Cookie', authCookie('Admin'))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/users/ad-search', () => {
  it('is admin only', async () => {
    const res = await request(app).get('/api/users/ad-search?q=som').set('Cookie', authCookie('Employee'))
    expect(res.status).toBe(403)
    expect(ldap.searchDirectory).not.toHaveBeenCalled()
  })

  it('requires at least 2 characters', async () => {
    const res = await request(app).get('/api/users/ad-search?q=s').set('Cookie', authCookie())
    expect(res.status).toBe(400)
    expect(ldap.searchDirectory).not.toHaveBeenCalled()
  })

  it('flags people who are already in the system (case-insensitive)', async () => {
    ldap.searchDirectory.mockResolvedValue([
      { username: 'Somchai.J', fullName: 'สมชาย', department: 'IT', email: null },
      { username: 'somsak', fullName: 'สมศักดิ์', department: null, email: null },
    ])
    usersRepo.findUsernames.mockResolvedValue(new Set(['somchai.j']))

    const res = await request(app).get('/api/users/ad-search?q=som').set('Cookie', authCookie())
    expect(res.status).toBe(200)
    expect(res.body.results.map((r) => [r.username, r.alreadyAdded])).toEqual([
      ['Somchai.J', true],
      ['somsak', false],
    ])
  })

  it('reports a missing service account as 503', async () => {
    ldap.searchDirectory.mockRejectedValue(new AppError('LDAP_NOT_CONFIGURED', 503))
    const res = await request(app).get('/api/users/ad-search?q=som').set('Cookie', authCookie())
    expect(res.status).toBe(503)
    expect(res.body.errorCode).toBe('LDAP_NOT_CONFIGURED')
  })
})

describe('POST /api/users/import-ad', () => {
  it('re-reads profiles from AD and adds only new users with the chosen role', async () => {
    ldap.lookupDirectoryUsers.mockResolvedValue([
      { username: 'somsak', fullName: 'สมศักดิ์ (จาก AD)', department: 'ขาย', email: null },
      { username: 'existing', fullName: 'มีแล้ว', department: null, email: null },
    ])
    usersRepo.insertFromAd.mockImplementation(async (_pool, profile, role) =>
      profile.username === 'existing'
        ? null
        : { UserID: 50, Username: profile.username, FullName: profile.fullName, Role: role, AuthSource: 'AD', IsActive: true },
    )

    const res = await request(app)
      .post('/api/users/import-ad')
      .set('Cookie', authCookie())
      .send({ usernames: ['somsak', 'existing', 'ghost', 'somsak'], role: 'Admin', fullName: 'forged' })

    expect(res.status).toBe(201)
    expect(ldap.lookupDirectoryUsers).toHaveBeenCalledWith(['somsak', 'existing', 'ghost'])
    expect(usersRepo.insertFromAd.mock.calls[0][1].fullName).toBe('สมศักดิ์ (จาก AD)')
    expect(usersRepo.insertFromAd.mock.calls[0][2]).toBe('Admin')
    expect(res.body.added.map((u) => u.username)).toEqual(['somsak'])
    expect(res.body.skipped).toEqual(['existing'])
    expect(res.body.notFound).toEqual(['ghost'])
  })

  it.each([
    ['no usernames', { usernames: [] }],
    ['a bad role', { usernames: ['a'], role: 'Root' }],
    ['more than 50 people', { usernames: Array.from({ length: 51 }, (_, i) => `u${i}`) }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).post('/api/users/import-ad').set('Cookie', authCookie()).send(body)
    expect(res.status).toBe(400)
    expect(ldap.lookupDirectoryUsers).not.toHaveBeenCalled()
  })

  it('is admin only', async () => {
    const res = await request(app)
      .post('/api/users/import-ad')
      .set('Cookie', authCookie('Employee'))
      .send({ usernames: ['a'] })
    expect(res.status).toBe(403)
  })
})

describe('admin lockout protection', () => {
  const body = (extra = {}) => ({ fullName: 'ผู้ดูแล', role: 'Admin', ...extra })
  const admin = (id, extra = {}) => ({ UserID: id, FullName: 'A', Username: 'a' + id, Role: 'Admin', IsActive: true, AuthSource: 'Local', ...extra })

  it('does not let an admin deactivate their own account', async () => {
    usersRepo.findById.mockResolvedValue(admin(1))
    usersRepo.countActiveAdmins.mockResolvedValue(3)
    const res = await request(app).delete('/api/users/1').set('Cookie', authCookie('Admin', 1))
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('CANNOT_CHANGE_OWN_ACCESS')
    expect(usersRepo.setActive).not.toHaveBeenCalled()
  })

  it('does not let an admin demote themselves', async () => {
    usersRepo.findById.mockResolvedValue(admin(1))
    usersRepo.countActiveAdmins.mockResolvedValue(3)
    const res = await request(app).put('/api/users/1').set('Cookie', authCookie('Admin', 1)).send(body({ role: 'Employee' }))
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('CANNOT_CHANGE_OWN_ACCESS')
    expect(usersRepo.update).not.toHaveBeenCalled()
  })

  it('does not let the last active admin be demoted or deactivated by someone else', async () => {
    usersRepo.findById.mockResolvedValue(admin(2))
    usersRepo.countActiveAdmins.mockResolvedValue(1)
    const demote = await request(app).put('/api/users/2').set('Cookie', authCookie('Admin', 1)).send(body({ role: 'Employee' }))
    expect(demote.status).toBe(409)
    expect(demote.body.errorCode).toBe('LAST_ADMIN')
    const off = await request(app).delete('/api/users/2').set('Cookie', authCookie('Admin', 1))
    expect(off.body.errorCode).toBe('LAST_ADMIN')
  })

  it('allows demoting another admin when other admins remain', async () => {
    usersRepo.findById.mockResolvedValue(admin(2))
    usersRepo.countActiveAdmins.mockResolvedValue(2)
    usersRepo.update.mockResolvedValue(admin(2, { Role: 'Employee' }))
    const res = await request(app).put('/api/users/2').set('Cookie', authCookie('Admin', 1)).send(body({ role: 'Employee' }))
    expect(res.status).toBe(200)
  })

  it('keeps the current active state when isActive is not sent (does not silently re-activate)', async () => {
    usersRepo.findById.mockResolvedValue({ UserID: 7, FullName: 'x', Role: 'Employee', IsActive: false, AuthSource: 'Local' })
    usersRepo.update.mockResolvedValue({ UserID: 7, FullName: 'y', Role: 'Employee', IsActive: false, AuthSource: 'Local' })
    await request(app).put('/api/users/7').set('Cookie', authCookie('Admin', 1)).send({ fullName: 'y', role: 'Employee' })
    expect(usersRepo.update).toHaveBeenCalledWith(expect.anything(), '7', expect.objectContaining({ isActive: false }))
  })
})

describe('POST /api/users/import-roster', () => {
  async function workbookBuffer(rows) {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Employees')
    ws.addRow(['code', 'en', 'th', 'dept', 'phone', 'email'])
    rows.forEach((r) => ws.addRow(r))
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  const rows = [
    ['0001', 'Somchai Jaidee', 'สมชาย ใจดี', 'IT', '0812345678', 'a@b.co'],
    ['0002', 'No Dept', 'ไม่มีแผนก', 'Nowhere', '', ''],
    ['0003', 'Existing', 'มีแล้ว', 'IT', '', ''],
    ['0001', 'Dup In File', 'ซ้ำ', 'IT', '', ''],
  ]

  beforeEach(() => {
    departmentsRepo.listAll.mockResolvedValue([{ DepartmentID: 7, Name: 'IT', ParentDepartmentID: null }])
    usersRepo.listEmployeeCodes.mockResolvedValue(new Set(['0003']))
  })

  it('previews per-row problems without creating anyone (dryRun)', async () => {
    const res = await request(app)
      .post('/api/users/import-roster')
      .set('Cookie', authCookie('Admin'))
      .field('dryRun', 'true')
      .attach('file', await workbookBuffer(rows), 'employees.xlsx')

    expect(res.status).toBe(200)
    expect(res.body.summary).toEqual({ total: 4, valid: 1, invalid: 3 })
    expect(res.body.rows.map((r) => r.errors)).toEqual([[], ['DEPARTMENT_UNKNOWN'], ['CODE_EXISTS'], ['CODE_DUPLICATE_IN_FILE']])
    expect(usersRepo.createRosterUser).not.toHaveBeenCalled()
  })

  it('imports only the valid rows as no-login roster users with both names', async () => {
    usersRepo.createRosterUser.mockResolvedValue({})
    const res = await request(app)
      .post('/api/users/import-roster')
      .set('Cookie', authCookie('Admin'))
      .attach('file', await workbookBuffer(rows), 'employees.xlsx')

    expect(res.status).toBe(201)
    expect(res.body.imported).toBe(1)
    expect(usersRepo.createRosterUser).toHaveBeenCalledTimes(1)
    expect(usersRepo.createRosterUser).toHaveBeenCalledWith(expect.anything(), {
      fullName: 'Somchai Jaidee',
      fullNameTh: 'สมชาย ใจดี',
      departmentId: 7,
      phone: '0812345678',
      email: 'a@b.co',
      employeeCode: '0001',
    })
  })

  it('rejects a file that is not an xlsx', async () => {
    const res = await request(app)
      .post('/api/users/import-roster')
      .set('Cookie', authCookie('Admin'))
      .attach('file', Buffer.from('not a spreadsheet'), 'x.xlsx')

    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('IMPORT_FILE_INVALID')
  })

  it('is Admin only', async () => {
    const res = await request(app)
      .post('/api/users/import-roster')
      .set('Cookie', authCookie('Employee', 2))
      .attach('file', await workbookBuffer(rows), 'employees.xlsx')

    expect(res.status).toBe(403)
  })
})

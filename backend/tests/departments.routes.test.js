import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn().mockResolvedValue({}),
  sql: {},
}))

vi.mock('../src/modules/departments/repository.js', () => ({
  listAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteDepartment: vi.fn(),
  countUsers: vi.fn(),
}))

import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import * as repo from '../src/modules/departments/repository.js'

const cookie = (role = 'Admin') => `token=${jwt.sign({ sub: 1, role }, env.jwtSecret, { expiresIn: '1h' })}`
const app = createApp()

beforeEach(() => {
  vi.clearAllMocks()
  repo.findById.mockResolvedValue({ DepartmentID: 5, Name: 'x', ParentDepartmentID: null })
  repo.listAll.mockResolvedValue([{ DepartmentID: 5, ParentDepartmentID: null }])
})

describe('DELETE /api/departments/:id', () => {
  it('refuses to delete a department that still has users (they would silently lose their department)', async () => {
    repo.countUsers.mockResolvedValue(3)
    const res = await request(app).delete('/api/departments/5').set('Cookie', cookie())
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('DEPARTMENT_IN_USE')
    expect(repo.deleteDepartment).not.toHaveBeenCalled()
  })

  it('deletes an empty department', async () => {
    repo.countUsers.mockResolvedValue(0)
    const res = await request(app).delete('/api/departments/5').set('Cookie', cookie())
    expect(res.status).toBe(204)
    expect(repo.deleteDepartment).toHaveBeenCalledOnce()
  })

  it('still refuses a department that has sub-departments', async () => {
    repo.listAll.mockResolvedValue([
      { DepartmentID: 5, ParentDepartmentID: null },
      { DepartmentID: 6, ParentDepartmentID: 5 },
    ])
    repo.countUsers.mockResolvedValue(0)
    const res = await request(app).delete('/api/departments/5').set('Cookie', cookie())
    expect(res.body.errorCode).toBe('DEPARTMENT_HAS_CHILDREN')
  })
})

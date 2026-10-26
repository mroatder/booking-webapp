import { describe, it, expect } from 'vitest'
import { mainDepartmentScope, wouldCreateCycle } from '../src/modules/departments/scope.js'

// ฝ่ายผลิต(1) ─┬─ ผลิต A(2) ── กะเช้า(3)
//             └─ ผลิต B(4)
// บัญชี(5)
const deps = [
  { DepartmentID: 1, ParentDepartmentID: null },
  { DepartmentID: 2, ParentDepartmentID: 1 },
  { DepartmentID: 3, ParentDepartmentID: 2 },
  { DepartmentID: 4, ParentDepartmentID: 1 },
  { DepartmentID: 5, ParentDepartmentID: null },
]

describe('mainDepartmentScope', () => {
  it('covers the whole main department from any sub-department', () => {
    expect(mainDepartmentScope(deps, 3)).toEqual(new Set([1, 2, 3, 4]))
    expect(mainDepartmentScope(deps, 4)).toEqual(new Set([1, 2, 3, 4]))
    expect(mainDepartmentScope(deps, 1)).toEqual(new Set([1, 2, 3, 4]))
  })

  it('does not leak into other main departments', () => {
    expect(mainDepartmentScope(deps, 5)).toEqual(new Set([5]))
  })

  it('is empty without a department (or with an unknown one)', () => {
    expect(mainDepartmentScope(deps, null)).toEqual(new Set())
    expect(mainDepartmentScope(deps, 99)).toEqual(new Set())
  })

  it('terminates on cyclic data', () => {
    const cyclic = [
      { DepartmentID: 1, ParentDepartmentID: 2 },
      { DepartmentID: 2, ParentDepartmentID: 1 },
    ]
    expect(mainDepartmentScope(cyclic, 1)).toEqual(new Set([1, 2]))
  })
})

describe('wouldCreateCycle', () => {
  it('rejects itself or a descendant as parent', () => {
    expect(wouldCreateCycle(deps, 1, 1)).toBe(true)
    expect(wouldCreateCycle(deps, 1, 3)).toBe(true)
  })

  it('allows moving under an unrelated department', () => {
    expect(wouldCreateCycle(deps, 2, 5)).toBe(false)
    expect(wouldCreateCycle(deps, 3, 4)).toBe(false)
  })
})

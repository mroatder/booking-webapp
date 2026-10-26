import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildRosterTemplate, departmentRows } from '../src/modules/users/rosterTemplate.js'
import { parseRosterWorkbook, validateRosterRows } from '../src/modules/users/rosterImport.js'

const dep = (id, name, parent = null) => ({ DepartmentID: id, Name: name, ParentDepartmentID: parent })

async function load(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe('roster import template', () => {
  const departments = [dep(1, 'Production'), dep(2, 'Packing Line', 1), dep(3, 'IT', 4), dep(4, 'Finance and Administration')]

  it('lists the department names exactly as they are in the system right now', async () => {
    const wb = await load(await buildRosterTemplate(departments))
    const names = wb.getWorksheet('Departments').getColumn(2).values.slice(2)
    expect(names.sort()).toEqual(['Finance and Administration', 'IT', 'Packing Line', 'Production'])

    // เปลี่ยนชื่อแผนกแล้วดาวน์โหลดใหม่ → เห็นชื่อใหม่ ไม่เหลือชื่อเก่า
    const renamed = departments.map((d) => (d.DepartmentID === 2 ? { ...d, Name: 'Packing 2' } : d))
    const wb2 = await load(await buildRosterTemplate(renamed))
    const names2 = wb2.getWorksheet('Departments').getColumn(2).values.slice(2)
    expect(names2).toContain('Packing 2')
    expect(names2).not.toContain('Packing Line')
  })

  it('points the department dropdown at exactly the listed rows', async () => {
    const wb = await load(await buildRosterTemplate(departments))
    const dv = wb.getWorksheet('Employees').getCell('D2').dataValidation
    expect(dv.type).toBe('list')
    expect(dv.formulae[0]).toBe('Departments!$B$2:$B$5')
  })

  it('sample rows pass the real import validation, and the file parses back', async () => {
    const buffer = Buffer.from(await buildRosterTemplate(departments))
    const rows = await parseRosterWorkbook(buffer)
    expect(rows).toHaveLength(2)
    const checked = validateRosterRows(rows, { departments, existingCodes: new Set() })
    expect(checked.every((r) => r.errors.length === 0)).toBe(true)
  })

  it('still builds with no departments (no dropdown)', async () => {
    const wb = await load(await buildRosterTemplate([]))
    expect(wb.getWorksheet('Employees').getCell('D2').dataValidation ?? null).toBeNull()
  })

  it('marks a top-level department as top level instead of repeating its own name as parent', async () => {
    const wb = await load(await buildRosterTemplate([dep(30, 'Safety'), dep(31, 'SAF', 30)]))
    const sheet = wb.getWorksheet('Departments')
    const rows = [2, 3].map((r) => [sheet.getCell(r, 1).value, sheet.getCell(r, 2).value])
    expect(rows).toContainEqual(['(แผนกหลัก / Top level)', 'Safety'])
    expect(rows).toContainEqual(['Safety', 'SAF'])
  })

  it('groups children under their parent', () => {
    expect(departmentRows(departments).find((r) => r.name === 'Packing Line').parent).toBe('Production')
  })
})

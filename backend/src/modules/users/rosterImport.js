import multer from 'multer'
import ExcelJS from 'exceljs'
import { AppError } from '../../errors/AppError.js'
import { ErrorCodes } from '../../errors/codes.js'
import { isValidPhone, isValidEmail } from '../../utils/validation.js'

/**
 * นำเข้ารายชื่อพนักงานที่ไม่ login จากไฟล์ Excel (ไฟล์ตัวอย่างสร้างสดจาก rosterTemplate.js ผ่าน GET /users/import-roster/template)
 * ชีตแรก, แถว 1 = หัวตาราง, คอลัมน์ตามลำดับ: A รหัสพนักงาน | B ชื่อ-สกุล EN | C ชื่อ-สกุล TH | D แผนก | E เบอร์โทร | F อีเมล (ไม่บังคับ)
 * ผลต่อแถวเป็นรหัสปัญหา (ให้ frontend แปลเอง) - ไม่ใช่ AppError เพราะไฟล์ยังใช้ได้ แค่บางแถวผิด
 */
export const MAX_IMPORT_ROWS = 1000
const MAX_BYTES = 2 * 1024 * 1024
const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04] // zip

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single('file')

export function uploadRosterFile(req, res, next) {
  upload(req, res, (err) => (err ? next(new AppError(ErrorCodes.IMPORT_FILE_INVALID, 400)) : next()))
}

/** ค่าในเซลล์ → ข้อความ (รองรับตัวเลข, rich text, ลิงก์ mailto ที่ Excel สร้างให้อัตโนมัติ) */
function cellText(cell) {
  let v = cell?.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join('')
    else if (v.text !== undefined) v = typeof v.text === 'object' ? (v.text.richText ?? []).map((r) => r.text).join('') : v.text
    else if (v.result !== undefined) v = v.result
    else v = ''
  }
  return String(v ?? '').replace(/^mailto:/i, '').trim()
}

export async function parseRosterWorkbook(buffer) {
  if (!buffer || !XLSX_MAGIC.every((b, i) => buffer[i] === b)) throw new AppError(ErrorCodes.IMPORT_FILE_INVALID, 400)
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new AppError(ErrorCodes.IMPORT_FILE_INVALID, 400)
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new AppError(ErrorCodes.IMPORT_FILE_INVALID, 400)

  const rows = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const item = {
      row: r,
      employeeCode: cellText(row.getCell(1)),
      fullName: cellText(row.getCell(2)),
      fullNameTh: cellText(row.getCell(3)),
      department: cellText(row.getCell(4)),
      phone: cellText(row.getCell(5)),
      email: cellText(row.getCell(6)),
    }
    if (Object.values(item).every((v) => v === '' || v === r)) continue // แถวว่าง
    rows.push(item)
    if (rows.length > MAX_IMPORT_ROWS) throw new AppError(ErrorCodes.IMPORT_TOO_MANY_ROWS, 400, { max: MAX_IMPORT_ROWS })
  }
  return rows
}

/**
 * ชื่อแผนกซ้ำกัน (เช่น แผนกหลัก Safety กับแผนกย่อย Safety) → เลือกแผนกย่อยถ้ามีแผนกย่อยเพียงอันเดียว ไม่งั้นถือว่าก้ำกึ่ง
 */
function resolveDepartment(name, departments) {
  const matches = departments.filter((d) => d.Name.trim().toLowerCase() === name.toLowerCase())
  if (matches.length === 0) return { error: 'DEPARTMENT_UNKNOWN' }
  if (matches.length === 1) return { id: matches[0].DepartmentID }
  const children = matches.filter((d) => d.ParentDepartmentID !== null)
  if (children.length === 1) return { id: children[0].DepartmentID }
  return { error: 'DEPARTMENT_AMBIGUOUS' }
}

/** ตรวจทุกแถว → [{...แถว, departmentId, errors: []}] ; existingCodes = รหัสพนักงานที่มีในระบบแล้ว (ตัวพิมพ์เล็ก) */
export function validateRosterRows(rows, { departments, existingCodes }) {
  const seen = new Map()
  return rows.map((item) => {
    const errors = []
    if (!item.employeeCode) errors.push('CODE_REQUIRED')
    if (!item.fullName) errors.push('NAME_EN_REQUIRED')
    if (!item.fullNameTh) errors.push('NAME_TH_REQUIRED')
    if (item.employeeCode.length > 50 || item.fullName.length > 200 || item.fullNameTh.length > 200) errors.push('TOO_LONG')

    let departmentId = null
    if (!item.department) errors.push('DEPARTMENT_REQUIRED')
    else {
      const dep = resolveDepartment(item.department, departments)
      if (dep.error) errors.push(dep.error)
      else departmentId = dep.id
    }

    if (item.phone && !isValidPhone(item.phone)) errors.push('PHONE_INVALID')
    if (item.email && !isValidEmail(item.email)) errors.push('EMAIL_INVALID')

    const key = item.employeeCode.toLowerCase()
    if (key) {
      if (existingCodes.has(key)) errors.push('CODE_EXISTS')
      if (seen.has(key)) errors.push('CODE_DUPLICATE_IN_FILE')
      else seen.set(key, item.row)
    }
    return { ...item, departmentId, errors }
  })
}

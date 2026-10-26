import ExcelJS from 'exceljs'

/**
 * ไฟล์ตัวอย่างสำหรับนำเข้ารายชื่อพนักงาน - สร้างสดทุกครั้งที่ดาวน์โหลด
 * ชีต Departments + dropdown คอลัมน์แผนก ดึงจากฐานข้อมูล ณ ตอนนั้น (แผนกถูกเปลี่ยนชื่อ/เพิ่ม/ลบได้ จึงห้ามฝังชื่อไว้ในไฟล์ตายตัว)
 * โครงคอลัมน์ต้องตรงกับ parseRosterWorkbook ใน rosterImport.js (A-F ตามลำดับ)
 */
const DATA_ROWS = 500 // จำนวนแถวที่ใส่ dropdown/รูปแบบข้อความไว้ให้
const HEADER_FILL = 'FF1F4E79'
const TOP_LEVEL = '(แผนกหลัก / Top level)' // แถวที่เป็นแผนกหลักเอง - ห้ามใส่ชื่อตัวเองในช่องแผนกหลัก (ดูเหมือนเป็นแผนกย่อยของตัวเอง)

const HEADERS = [
  ['รหัสพนักงาน\nEmployee Code', 18],
  ['ชื่อ-สกุล (EN)\nFull name (EN)', 28],
  ['ชื่อ-สกุล (TH)\nFull name (TH)', 28],
  ['แผนก\nDepartment', 22],
  ['เบอร์โทร\nPhone', 16],
  ['อีเมล (ถ้ามี)\nEmail (optional)', 30],
]

const INSTRUCTIONS = [
  'วิธีกรอก / How to fill',
  '1. กรอกข้อมูลที่ชีต Employees ตั้งแต่แถวที่ 2 (แถว 2-3 เป็นตัวอย่าง ลบทิ้งก่อนส่งไฟล์จริง) 1 แถว = 1 คน',
  '2. คอลัมน์ที่จำเป็น: รหัสพนักงาน, ชื่อ-สกุล (EN), ชื่อ-สกุล (TH), แผนก  |  ไม่บังคับ: เบอร์โทร, อีเมล',
  '3. แผนก: เลือกจากรายการใน dropdown (ตรงกับชีต Departments ซึ่งดึงจากระบบ ณ วันที่ดาวน์โหลด) สะกดให้ตรงทุกตัวอักษร',
  '4. รหัสพนักงานและเบอร์โทรต้องเป็นข้อความ (คงเลข 0 นำหน้า) - ช่องตั้งค่าเป็น Text ไว้แล้ว ห้ามเปลี่ยนรูปแบบเซลล์',
  '5. รหัสพนักงานห้ามซ้ำกัน และห้ามซ้ำกับพนักงานที่มีในระบบแล้ว',
  '6. รายชื่อที่นำเข้าเป็น "รายชื่อไม่ login" - ไม่มี username/รหัสผ่าน เข้าระบบไม่ได้ ใช้เป็นผู้โดยสารรถ/ผู้ร่วมเดินทางเท่านั้น',
  '7. ชื่อ EN = ชื่อหลักในระบบ, ชื่อ TH = ชื่อที่พิมพ์ในแบบฟอร์ม PDF ภาษาไทย',
  '8. อีเมลว่างได้ (ถ้าไม่มีอีเมล ระบบจะไม่ส่งแจ้งเตือนให้คนนั้น)',
]

/** แผนกทั้งหมด เรียงตามแผนกหลักแล้วชื่อ → [{ parent, name }] (ชื่อแผนกหลักของตัวเอง = ว่าง) */
export function departmentRows(departments) {
  const byId = new Map(departments.map((d) => [d.DepartmentID, d]))
  return departments
    .map((d) => ({ parent: byId.get(d.ParentDepartmentID)?.Name?.trim() ?? '', name: d.Name.trim() }))
    .sort((a, b) => (a.parent || a.name).localeCompare(b.parent || b.name) || a.parent.localeCompare(b.parent) || a.name.localeCompare(b.name))
}

export async function buildRosterTemplate(departments) {
  const rows = departmentRows(departments)
  const workbook = new ExcelJS.Workbook()

  const employees = workbook.addWorksheet('Employees', { views: [{ state: 'frozen', ySplit: 1 }] })
  const depSheet = workbook.addWorksheet('Departments')
  const help = workbook.addWorksheet('Instructions')

  const header = (sheet, titles) => {
    const row = sheet.getRow(1)
    titles.forEach((t, i) => {
      const cell = row.getCell(i + 1)
      cell.value = t
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })
    row.height = 34
  }

  // ชีต Departments: A = แผนกหลัก, B = ชื่อแผนกที่ใช้กรอก (dropdown อ้างคอลัมน์ B)
  header(depSheet, ['แผนกหลัก\nParent department', 'แผนก\nDepartment (ใช้ค่านี้ในคอลัมน์ D)'])
  depSheet.getColumn(1).width = 30
  depSheet.getColumn(2).width = 36
  rows.forEach((r, i) => {
    depSheet.getCell(i + 2, 1).value = r.parent || TOP_LEVEL
    depSheet.getCell(i + 2, 2).value = r.name
  })

  header(employees, HEADERS.map(([title]) => title))
  HEADERS.forEach(([, width], i) => {
    employees.getColumn(i + 1).width = width
  })
  for (const col of [1, 5]) employees.getColumn(col).numFmt = '@' // คงเลข 0 นำหน้า

  const sample = rows.slice(0, 2).map((r) => r.name)
  ;[
    ['0001', 'Somchai Jaidee', 'สมชาย ใจดี', sample[0] ?? '', '0812345678', 'somchai@example.com'],
    ['0002', 'Somying Rakdee', 'สมหญิง รักดี', sample[1] ?? sample[0] ?? '', '0898765432', ''],
  ].forEach((values, i) => {
    values.forEach((v, c) => {
      const cell = employees.getCell(i + 2, c + 1)
      if (c === 0 || c === 4) cell.numFmt = '@'
      cell.value = v
    })
  })

  if (rows.length > 0) {
    const range = `Departments!$B$2:$B$${rows.length + 1}`
    for (let r = 2; r <= DATA_ROWS + 1; r++) {
      employees.getCell(r, 1).numFmt = '@'
      employees.getCell(r, 5).numFmt = '@'
      employees.getCell(r, 4).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [range],
        showErrorMessage: true,
        errorTitle: 'แผนกไม่ถูกต้อง',
        error: 'เลือกชื่อแผนกจากรายการ (ดูชีต Departments)',
      }
    }
  }

  help.getColumn(1).width = 120
  INSTRUCTIONS.forEach((line, i) => {
    const cell = help.getCell(i + 1, 1)
    cell.value = line
    if (i === 0) cell.font = { bold: true, size: 14 }
  })

  return workbook.xlsx.writeBuffer()
}

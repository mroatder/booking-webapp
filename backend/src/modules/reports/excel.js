import ExcelJS from 'exceljs'
import { bangkokDate } from './service.js'

/**
 * ส่งออกรายงานเป็น Excel - 1 ตาราง = 1 sheet (+ sheet หน้าปกบอกชื่อรายงาน/ช่วงวันที่/เวลาออกรายงาน)
 * วันที่แบบ DD/MM/YYYY เวลา 24 ชม. ตามเวลาไทย (ตรงกับหน้าเว็บ)
 */
const pad = (n) => String(n).padStart(2, '0')
function bkk(date) {
  const d = new Date(new Date(date).getTime() + 7 * 3_600_000)
  return {
    date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  }
}
const ymdToDmy = (ymd) => ymd.split('-').reverse().join('/')

function cellValue(value, type) {
  if (value === null || value === undefined || value === '') return type === 'percent' ? '-' : ''
  if (type === 'datetime') {
    const b = bkk(value)
    return `${b.date} ${b.time}`
  }
  if (type === 'date') return ymdToDmy(String(value))
  return value
}

// ชื่อ sheet ใน Excel: ไม่เกิน 31 ตัวอักษร ห้าม : \ / ? * [ ]
const sheetName = (title) => title.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)

export async function reportToXlsx(report, { from, to }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ระบบจองห้องประชุมและรถ'
  wb.created = new Date()

  const lastDay = new Date(to.getTime() - 1)
  const cover = wb.addWorksheet('สรุป')
  cover.getColumn(1).width = 22
  cover.getColumn(2).width = 50
  cover.addRow([report.title]).font = { bold: true, size: 14 }
  cover.addRow([])
  cover.addRow(['ช่วงวันที่', `${ymdToDmy(bangkokDate(from))} – ${ymdToDmy(bangkokDate(lastDay))}`])
  const now = bkk(new Date())
  cover.addRow(['ออกรายงานเมื่อ', `${now.date} ${now.time}`])
  if (report.note) cover.addRow(['หมายเหตุ', report.note])
  cover.addRow([])
  cover.addRow(['ตารางในไฟล์นี้'])
  for (const table of report.tables) cover.addRow(['', `${table.title} (${table.rows.length} แถว)`])

  for (const table of report.tables) {
    const ws = wb.addWorksheet(sheetName(table.title), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = table.columns.map((c) => ({
      header: c.label,
      key: c.key,
      width: Math.min(45, Math.max(12, c.label.length + 4, ...table.rows.map((r) => String(cellValue(r[c.key], c.type) ?? '').length + 2))),
    }))
    const header = ws.getRow(1)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    header.alignment = { vertical: 'middle' }
    for (const row of table.rows) {
      ws.addRow(Object.fromEntries(table.columns.map((c) => [c.key, cellValue(row[c.key], c.type)])))
    }
    table.columns.forEach((c, i) => {
      if (['number', 'hours', 'percent'].includes(c.type)) {
        const col = ws.getColumn(i + 1)
        col.alignment = { horizontal: 'right' }
        if (c.type === 'hours' || c.type === 'percent') col.numFmt = '0.0'
      }
    })
    if (table.rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } }
  }

  return wb.xlsx.writeBuffer()
}

// Helper สำหรับแปลงระหว่าง Date object กับ string ที่ใช้ใน <input type="date/time">
// ต้องใช้ getFullYear/getMonth/... (เวลาท้องถิ่น) ไม่ใช่ toISOString() ตรงๆ
// เพราะ toISOString() คืนค่าเป็น UTC - ในไทย (UTC+7) จะเพี้ยนทั้งชั่วโมงและบางทีเพี้ยนวันที่ด้วย
function pad(n) {
  return String(n).padStart(2, '0')
}

export function toLocalDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toLocalTimeStr(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * แสดงวันที่แบบไทย DD/MM/YYYY ปี ค.ศ. (dev ยืนยัน 2026-09-29: ค.ศ. + วันที่แบบไทย + เวลา 24 ชั่วโมง)
 * ประกอบเองแทน Intl('th-TH') ซึ่งจะแปลงเป็นปี พ.ศ. อัตโนมัติ
 */
export function formatDateDMY(date) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * แสดงวันและเวลา DD/MM/YYYY HH:mm (ค.ศ., 24 ชั่วโมง) - withSeconds สำหรับเวลาที่ต้องละเอียด เช่น อุปกรณ์ออนไลน์ล่าสุด
 */
export function formatDateTimeDMY(date, { withSeconds = false } = {}) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const time = withSeconds ? `${toLocalTimeStr(d)}:${pad(d.getSeconds())}` : toLocalTimeStr(d)
  return `${formatDateDMY(d)} ${time}`
}

/**
 * แสดงช่วงเวลาการจองในรูปแบบ DD/MM/YYYY HH:mm – HH:mm (ค.ศ. 24 ชั่วโมง)
 */
export function formatBookingRange(startTime, endTime) {
  if (!startTime || !endTime) return ''
  const start = new Date(startTime)
  const end = new Date(endTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  return `${formatDateDMY(start)} ${toLocalTimeStr(start)} – ${toLocalTimeStr(end)}`
}

/**
 * ช่วงเวลาทริปรถ - ทริปวันเดียว: DD/MM/YYYY HH:mm – HH:mm, ทริปข้ามวัน: แสดงวันที่ทั้งสองฝั่ง
 */
export function formatTripRange(departTime, returnTime) {
  if (!departTime || !returnTime) return ''
  const depart = new Date(departTime)
  const ret = new Date(returnTime)
  if (Number.isNaN(depart.getTime()) || Number.isNaN(ret.getTime())) return ''
  if (toLocalDateStr(depart) === toLocalDateStr(ret)) return formatBookingRange(depart, ret)
  return `${formatDateTimeDMY(depart)} – ${formatDateTimeDMY(ret)}`
}

/**
 * แสดงวันที่/เวลาตาม locale และใช้ 24 ชั่วโมงเสมอ - ภาษาไทยบังคับปฏิทิน ค.ศ. (th-TH ปกติเป็น พ.ศ.)
 */
export function formatDateTime(date, locale, options) {
  const localeTag = locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB'
  return new Intl.DateTimeFormat(localeTag, { hour12: false, ...options }).format(new Date(date))
}

/** เวลาเริ่ม/สิ้นสุดเริ่มต้นที่สมเหตุสมผล: ปัดขึ้นเป็นครึ่งชั่วโมงถัดไปจากตอนนี้ + ให้ยาว 1 ชั่วโมง */
export function defaultBookingTimes() {
  const start = new Date()
  const minutes = start.getMinutes()
  start.setSeconds(0, 0)
  start.setMinutes(minutes < 30 ? 30 : 0, 0, 0)
  if (minutes >= 30) start.setHours(start.getHours() + 1)

  const end = new Date(start.getTime() + 60 * 60 * 1000)

  return { date: toLocalDateStr(start), startTime: toLocalTimeStr(start), endTime: toLocalTimeStr(end) }
}

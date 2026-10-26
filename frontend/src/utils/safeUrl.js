/**
 * ลิงก์ที่มาจากผู้ใช้ (ลิงก์แผนที่/หมุด) ต้องเป็น http/https เท่านั้นก่อนนำไปใส่ href หรือ window.open
 * - กัน javascript: / data: ที่เคยถูกเก็บไว้ในฐานข้อมูลถูกรันเมื่อ Admin กดเปิด
 * @returns URL ที่ปลอดภัย หรือ '' ถ้าไม่ใช่ลิงก์ที่ใช้ได้
 */
export function safeUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

/** เปิดลิงก์ในแท็บใหม่ (เฉพาะ http/https) - คืน true ถ้าเปิดได้ */
export function openSafeUrl(value) {
  const url = safeUrl(value)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

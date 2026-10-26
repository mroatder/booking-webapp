/**
 * รับเฉพาะลิงก์ http/https (กัน javascript: / data: ถูกเก็บแล้วไปแสดงเป็น <a href> หรือ window.open ให้คนอื่นคลิก)
 * คืน URL ที่ normalize แล้ว หรือ null ถ้าไม่ใช่ลิงก์ที่ปลอดภัย
 */
export function toHttpUrl(value, maxLength = 2000) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > maxLength) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * ดาวน์โหลดไฟล์จาก API ที่ต้องใช้ cookie ล็อกอิน (ลิงก์ <a href> ธรรมดาส่งชื่อไฟล์ไทย/ตรวจสิทธิ์ไม่สะดวก)
 * ชื่อไฟล์มาจาก Content-Disposition (รองรับ filename* แบบ UTF-8 สำหรับชื่อไทย)
 * @throws {Error} เมื่อเซิร์ฟเวอร์ตอบไม่สำเร็จ - ผู้เรียกแสดง toast เอง
 */
export async function downloadFile(url, fallbackName = 'download') {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1]
  let name = plain ?? fallbackName
  if (utf8) {
    try {
      name = decodeURIComponent(utf8)
    } catch {
      // ใช้ชื่อสำรอง
    }
  }
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

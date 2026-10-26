// ช่วงวันที่จองได้: วันนี้ถึง 90 วันข้างหน้า (REQUIREMENTS กฎห้อง 3 / กฎรถ) - ใช้กำหนด min/max ของ DatePicker
export const MAX_ADVANCE_DAYS = 90

export function bookingDateLimits(now = new Date()) {
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const max = new Date(min)
  max.setDate(max.getDate() + MAX_ADVANCE_DAYS)
  return { min, max }
}

/**
 * เรียงกิจกรรมเดินทางกลุ่ม: ที่ยังไม่เกิด/ยังไม่จบเรียงตามวันเดินทางเร็วสุดก่อน
 * ส่วนที่จบไปแล้ว (เลยวันกลับ หรือวันเดินทางถ้าไม่มีวันกลับ) ต่อท้าย เรียงใหม่สุดก่อน
 */
export function sortEventsSoonestFirst(events, now = Date.now()) {
  const start = (e) => new Date(e.EventDate).getTime()
  const isPast = (e) => new Date(e.ReturnDate ?? e.EventDate).getTime() < now
  return [
    ...events.filter((e) => !isPast(e)).sort((a, b) => start(a) - start(b)),
    ...events.filter(isPast).sort((a, b) => start(b) - start(a)),
  ]
}

import { ref, watch, onUnmounted, nextTick } from 'vue'

/**
 * จอ tablet ห้ามเลื่อน: ทำให้รายการ (ul) พอดีกล่องเสมอ ไม่ว่าจะมีกี่รายการ
 *  1) ย่อตัวอักษรทั้งรายการ (ตัวแปร CSS --fit บน ul; รายการต้องใช้หน่วย em/calc(... * var(--fit)))
 *  2) ยังไม่พอ → ซ่อนรายการที่จบไปแล้ว (นับจาก startIndex) ก่อน
 *  3) ยังไม่พอ → ซ่อนรายการท้ายๆ แล้วให้ footer แสดง "+N รายการ" (hidden)
 * ul ต้องมีความสูงคงที่จาก layout (flex-1 min-h-0 / h-full) + overflow-hidden เพื่อไม่ให้การซ่อนทำให้ขนาดกล่องเปลี่ยนวนลูป
 */
const MIN_FIT = 0.6
const STEP = 0.05

export function useFitList(listRef, getStartIndex = () => 0, footerReserve = 40) {
  const hidden = ref(0)

  function fit() {
    const el = listRef.value
    if (!el) return
    const kids = Array.from(el.children)
    kids.forEach((k) => (k.style.display = ''))
    el.style.setProperty('--fit', '1')
    const over = (reserve = 0) => el.scrollHeight > el.clientHeight - reserve + 1

    let f = 1
    while (over() && f > MIN_FIT) {
      f = Math.round((f - STEP) * 100) / 100
      el.style.setProperty('--fit', String(f))
    }
    const start = Math.min(getStartIndex(), kids.length - 1)
    let from = 0
    while (over() && from < start) kids[from++].style.display = 'none'

    let to = kids.length
    if (over()) {
      while (to - from > 1 && over(footerReserve)) kids[--to].style.display = 'none'
    }
    hidden.value = kids.length - to
  }

  async function refit() {
    await nextTick()
    fit()
  }

  // ul อาจถูก mount ทีหลัง (v-if ตามข้อมูล) → ผูก observer ตาม ref
  const observer = new ResizeObserver(() => fit())
  watch(
    listRef,
    (el, old) => {
      if (old) observer.unobserve(old)
      if (el) {
        observer.observe(el)
        fit()
      }
    },
    { flush: 'post' },
  )
  onUnmounted(() => observer.disconnect())

  return { hidden, refit }
}

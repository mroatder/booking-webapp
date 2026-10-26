import { reactive } from 'vue'

// กล่องยืนยันของเว็บเอง (แทน window.confirm / window.prompt ของเบราว์เซอร์)
// ใช้: if (!(await confirmDialog(message, { danger: true }))) return
// ตัวแสดงผลคือ components/common/ConfirmDialog.vue ที่วางไว้ครั้งเดียวใน App.vue
export const confirmState = reactive({
  open: false,
  message: '',
  title: '',
  okLabel: '',
  danger: false,
  value: '', // มีค่า → แสดงช่องข้อความอ่านอย่างเดียวให้คัดลอก (แทน window.prompt) และมีแค่ปุ่มตกลง
})

let pending = null

function settle(result) {
  if (!pending) return
  const resolve = pending
  pending = null
  confirmState.open = false
  resolve(result)
}

export function confirmDialog(message, { title = '', okLabel = '', danger = false, value = '' } = {}) {
  // ถ้ามีกล่องค้างอยู่ให้ถือว่ายกเลิกอันเก่า
  settle(false)
  Object.assign(confirmState, { open: true, message, title, okLabel, danger, value })
  return new Promise((resolve) => {
    pending = resolve
  })
}

export const acceptConfirm = () => settle(true)
export const dismissConfirm = () => settle(false)

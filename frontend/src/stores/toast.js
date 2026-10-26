import { defineStore } from 'pinia'

// แจ้งเตือนมุมจอ (toast) หลังทำรายการสำเร็จ/ล้มเหลว - หายเองอัตโนมัติ, error ค้างนานกว่าให้อ่านทัน
const DURATION_MS = { success: 3500, error: 7000 }
const MAX_VISIBLE = 4

let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [],
  }),
  actions: {
    show(type, message) {
      const id = nextId++
      this.toasts.push({ id, type, message })
      if (this.toasts.length > MAX_VISIBLE) this.toasts.shift()
      setTimeout(() => this.dismiss(id), DURATION_MS[type])
    },
    success(message) {
      this.show('success', message)
    },
    error(message) {
      this.show('error', message)
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})

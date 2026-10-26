import { defineStore } from 'pinia'
import { api } from '@/api/client'

const POLL_MS = 60_000
let timer = null

export const useAlertsStore = defineStore('alerts', {
  state: () => ({
    approvals: 0, // คำขอรถที่รอฉันอนุมัติ
    vehicleManage: 0, // (Admin) คำขอรถที่รอจัดรถ
  }),
  getters: {
    total: (state) => state.approvals + state.vehicleManage,
  },
  actions: {
    async refresh() {
      try {
        const data = await api.get('/alerts/summary')
        this.approvals = data.approvals ?? 0
        this.vehicleManage = data.vehicleManage ?? 0
      } catch {
        // แจ้งเตือนเป็นแค่ตัวช่วย - พลาดครั้งนี้ไม่ต้องรบกวนผู้ใช้ รอรอบถัดไป
      }
    },
    startPolling() {
      this.stopPolling()
      this.refresh()
      timer = setInterval(() => {
        if (!document.hidden) this.refresh()
      }, POLL_MS)
    },
    stopPolling() {
      if (timer) clearInterval(timer)
      timer = null
      this.approvals = 0
      this.vehicleManage = 0
    },
  },
})

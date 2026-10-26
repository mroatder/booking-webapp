import { defineStore } from 'pinia'
import { api } from '@/api/client'

export const useDriversStore = defineStore('drivers', {
  state: () => ({
    drivers: [],
    isLoading: false,
  }),
  actions: {
    async fetchAll({ includeInactive = false } = {}) {
      this.isLoading = true
      try {
        const data = await api.get(`/drivers${includeInactive ? '?includeInactive=true' : ''}`)
        this.drivers = data.drivers
      } finally {
        this.isLoading = false
      }
    },
    async fetchSchedule(from, to) {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
      const data = await api.get(`/drivers/schedule?${params}`)
      return data.assignments
    },
    async create(payload) {
      const data = await api.post('/drivers', payload)
      this.drivers.push(data.driver)
      return data.driver
    },
    async update(id, payload) {
      const data = await api.put(`/drivers/${id}`, payload)
      const idx = this.drivers.findIndex((d) => d.id === id)
      if (idx !== -1) this.drivers[idx] = data.driver
    },
    // ลบจริง - backend ปฏิเสธ (FLEET_ITEM_IN_USE) ถ้าเคยถูกจัดให้คำขอหรือเป็นคนขับประจำรถ
    async remove(id) {
      await api.delete(`/drivers/${id}`)
      this.drivers = this.drivers.filter((d) => d.id !== id)
    },
  },
})

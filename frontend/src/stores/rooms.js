import { defineStore } from 'pinia'
import { api } from '@/api/client'

export const useRoomsStore = defineStore('rooms', {
  state: () => ({
    rooms: [],
    isLoading: false,
  }),
  actions: {
    // includeInactive: หน้าจัดการห้อง (Admin) เท่านั้น - หน้าจอง/ปฏิทินเห็นแค่ห้องที่เปิดใช้งาน
    async fetchAll({ includeInactive = false } = {}) {
      this.isLoading = true
      try {
        const data = await api.get(`/rooms${includeInactive ? '?includeInactive=true' : ''}`)
        this.rooms = data.rooms
      } finally {
        this.isLoading = false
      }
    },
    async create(payload) {
      const data = await api.post('/rooms', payload)
      this.rooms.push(data.room)
      this.rooms.sort((a, b) => a.name.localeCompare(b.name))
    },
    async update(id, payload) {
      const data = await api.put(`/rooms/${id}`, payload)
      const idx = this.rooms.findIndex((r) => r.id === id)
      if (idx !== -1) this.rooms[idx] = data.room
    },
    async remove(id) {
      await api.delete(`/rooms/${id}`)
      this.rooms = this.rooms.filter((r) => r.id !== id)
    },
    async setActive(id, isActive) {
      const data = await api.put(`/rooms/${id}/active`, { isActive })
      const idx = this.rooms.findIndex((r) => r.id === id)
      if (idx !== -1) this.rooms[idx] = data.room
    },
  },
})

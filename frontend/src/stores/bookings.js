import { defineStore } from 'pinia'
import { api } from '@/api/client'

export const useBookingsStore = defineStore('bookings', {
  state: () => ({
    bookings: [],
    isLoading: false,
  }),
  actions: {
    async fetchMine() {
      this.isLoading = true
      try {
        const data = await api.get('/bookings?mine=true')
        this.bookings = data.bookings
      } finally {
        this.isLoading = false
      }
    },
    async create(payload) {
      const data = await api.post('/bookings', payload)
      await this.fetchMine()
      return data.bookings
    },
    async update(id, payload) {
      const data = await api.put(`/bookings/${id}`, payload)
      const idx = this.bookings.findIndex((b) => b.id === id)
      if (idx !== -1) this.bookings[idx] = data.booking
    },
    async cancel(id, scope = 'single') {
      await api.delete(`/bookings/${id}?scope=${scope}`)
      await this.fetchMine()
    },
    async checkin(id) {
      const data = await api.post(`/bookings/${id}/checkin`)
      const idx = this.bookings.findIndex((b) => b.id === id)
      if (idx !== -1) this.bookings[idx] = data.booking
      return data.booking
    },
  },
})

import { defineStore } from 'pinia'
import { api } from '@/api/client'

export const useEventsStore = defineStore('events', {
  state: () => ({
    events: [],
    activeEvent: null,
    isLoading: false,
    myBoarding: [],
  }),
  actions: {
    async fetchEvents() {
      this.isLoading = true
      try {
        const data = await api.get('/events')
        this.events = data?.events || data?.data?.events || []
      } catch (err) {
        this.events = []
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async fetchEventById(id) {
      this.isLoading = true
      try {
        const data = await api.get(`/events/${id}`)
        const evt = data?.event || data?.data?.event || null
        this.activeEvent = evt
        return evt
      } finally {
        this.isLoading = false
      }
    },

    async createEvent(payload) {
      const data = await api.post('/events', payload)
      const evt = data?.event || data?.data?.event
      if (evt) this.events.unshift(evt)
      return evt
    },

    async updateEvent(id, payload) {
      const data = await api.put(`/events/${id}`, payload)
      const evt = data?.event || data?.data?.event
      if (evt) {
        const idx = this.events.findIndex((e) => e.EventID === id)
        if (idx !== -1) this.events[idx] = evt
        if (this.activeEvent?.EventID === id) this.activeEvent = evt
      }
      return evt
    },

    async deleteEvent(id) {
      await api.delete(`/events/${id}`)
      this.events = this.events.filter((e) => e.EventID !== id)
      if (this.activeEvent?.EventID === id) this.activeEvent = null
    },

    async registerPassenger(eventId, payload) {
      const data = await api.post(`/events/${eventId}/passengers`, payload)
      const evt = data?.event || data?.data?.event
      if (evt) {
        this.activeEvent = evt
        const idx = this.events.findIndex((e) => e.EventID === eventId)
        if (idx !== -1) this.events[idx] = evt
      }
      return data
    },

    async cancelRegistration(eventId, passengerId) {
      const data = await api.delete(`/events/${eventId}/passengers/${passengerId}`)
      const evt = data?.event || data?.data?.event
      if (evt) {
        this.activeEvent = evt
        const idx = this.events.findIndex((e) => e.EventID === eventId)
        if (idx !== -1) this.events[idx] = evt
      }
    },

    // ---------- รายละเอียดการขึ้นรถ ----------
    // พนักงาน: สายรถที่ตัวเองอยู่ (เจ้าของรายชื่อ/คนลงชื่อให้) แสดงทั้งสาย เฉพาะกิจกรรมที่ประกาศแล้ว
    async fetchMyBoarding() {
      const data = await api.get('/events/boarding/mine')
      this.myBoarding = data.routes
    },
    // Admin
    fetchBoarding(eventId) {
      return api.get(`/events/${eventId}/boarding`)
    },
    saveBoarding(eventId, payload) {
      return api.put(`/events/${eventId}/boarding`, payload)
    },
    publishBoarding(eventId) {
      return api.post(`/events/${eventId}/boarding/publish`, {})
    },
    unpublishBoarding(eventId) {
      return api.delete(`/events/${eventId}/boarding/publish`)
    },
  },
})

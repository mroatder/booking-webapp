import { defineStore } from 'pinia'
import { api } from '@/api/client'

export const useVehicleRequestsStore = defineStore('vehicleRequests', {
  state: () => ({
    requests: [],
    isLoading: false,
  }),
  actions: {
    // mine = true: คำขอของตัวเอง, false: ทั้งหมด (Admin) - status กรองเพิ่มได้
    async fetch({ mine = true, status } = {}) {
      this.isLoading = true
      try {
        const params = new URLSearchParams()
        if (mine) params.set('mine', 'true')
        if (status) params.set('status', status)
        const data = await api.get(`/vehicle-requests?${params}`)
        this.requests = data.requests
      } finally {
        this.isLoading = false
      }
    },
    // ส่งเป็น multipart (API ยังรับไฟล์แนบได้ - ฟอร์มไม่มีช่องแนบแล้วตั้งแต่ 2026-10-05)
    async create(payload, files = []) {
      const form = new FormData()
      // array (เช่น passengers) ต้องส่งเป็น JSON - String([5, 7]) จะกลายเป็น "5,7" แล้ว backend อ่านไม่ออก
      for (const [key, value] of Object.entries(payload)) {
        form.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value))
      }
      for (const file of files) form.append('files', file)
      const data = await api.post('/vehicle-requests', form)
      return data.request
    },
    async update(id, payload) {
      const data = await api.put(`/vehicle-requests/${id}`, payload)
      this.replace(data.request)
      return data.request
    },
    // เปลี่ยนสถานะบนหน้าจอทันที (API ใช้เวลาแล้วค่อยตอบ) - ถ้าล้มเหลวคืนค่าเดิมแล้วโยน error ต่อ
    async cancel(id) {
      const idx = this.requests.findIndex((r) => r.id === id)
      const previous = idx !== -1 ? this.requests[idx] : null
      if (previous) this.requests[idx] = { ...previous, status: 'Cancelled' }
      try {
        const data = await api.delete(`/vehicle-requests/${id}`)
        this.replace(data.request)
      } catch (err) {
        if (previous) this.replace(previous)
        throw err
      }
    },
    // payload: { driverId, licensePlate, tripDriverName?, tripDriverPhone? } (ชื่อ/เบอร์รายทริปเฉพาะรถภายนอก)
    async assign(id, payload) {
      const data = await api.post(`/vehicle-requests/${id}/assign`, payload)
      this.replace(data.request)
    },
    // จัดรถคันเดียวให้ทุกคำขอของเที่ยวโอทีเดียวกัน (ทั้งหมดหรือไม่เลย)
    async assignTrip(requestIds, payload) {
      const data = await api.post('/vehicle-requests/assign-trip', { requestIds, ...payload })
      data.requests.forEach((r) => this.replace(r))
    },
    // สายรวมโอที (Admin): รวมคำขอของเที่ยวเดียวกันจากหลายสาย / ถอดออก - เซิร์ฟเวอร์คืนคำขอที่เปลี่ยนแปลงทั้งหมด
    async combineTrip(requestIds) {
      const data = await api.post('/vehicle-requests/combine', { requestIds })
      data.requests.forEach((r) => this.replace(r))
    },
    async uncombineTrip(requestIds) {
      const data = await api.post('/vehicle-requests/uncombine', { requestIds })
      data.requests.forEach((r) => this.replace(r))
    },
    replace(request) {
      const idx = this.requests.findIndex((r) => r.id === request.id)
      if (idx !== -1) this.requests[idx] = request
    },
  },
})

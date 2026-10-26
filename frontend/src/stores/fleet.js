import { defineStore } from 'pinia'
import { api } from '@/api/client'

// รถที่ลงทะเบียน + ผู้ให้บริการ (บริษัทรถเช่า / เรียกรถออนไลน์) - คนขับอยู่ที่ stores/drivers.js
export const useFleetStore = defineStore('fleet', {
  state: () => ({
    providers: [],
    vehicles: [],
    shuttleRoutes: [],
    shuttlePassengers: [],
    isLoading: false,
  }),
  getters: {
    rentalProviders: (state) => state.providers.filter((p) => p.kind === 'Rental' && p.isActive),
  },
  actions: {
    async fetchProviders({ includeInactive = false } = {}) {
      const data = await api.get(`/providers${includeInactive ? '?includeInactive=true' : ''}`)
      this.providers = data.providers
    },
    async fetchVehicles({ includeInactive = false } = {}) {
      this.isLoading = true
      try {
        const data = await api.get(`/vehicles${includeInactive ? '?includeInactive=true' : ''}`)
        this.vehicles = data.vehicles
      } finally {
        this.isLoading = false
      }
    },
    async fetchShuttleRoutes({ includeInactive = false } = {}) {
      const data = await api.get(`/routes${includeInactive ? '?includeInactive=true' : ''}`)
      this.shuttleRoutes = data.routes
    },
    async createProvider(payload) {
      const data = await api.post('/providers', payload)
      this.providers.push(data.provider)
      return data.provider
    },
    async updateProvider(id, payload) {
      const data = await api.put(`/providers/${id}`, payload)
      const idx = this.providers.findIndex((p) => p.id === id)
      if (idx !== -1) this.providers[idx] = data.provider
      return data.provider
    },
    // ลบจริง - backend ปฏิเสธ (FLEET_ITEM_IN_USE) ถ้ามีประวัติ/ยังมีคนขับ-รถ-สายผูกอยู่
    async deleteProvider(id) {
      await api.delete(`/providers/${id}`)
      this.providers = this.providers.filter((p) => p.id !== id)
    },
    async deleteVehicle(id) {
      await api.delete(`/vehicles/${id}`)
      this.vehicles = this.vehicles.filter((v) => v.id !== id)
    },
    async createVehicle(payload) {
      const data = await api.post('/vehicles', payload)
      this.vehicles.push(data.vehicle)
      return data.vehicle
    },
    async updateVehicle(id, payload) {
      const data = await api.put(`/vehicles/${id}`, payload)
      const idx = this.vehicles.findIndex((v) => v.id === id)
      if (idx !== -1) this.vehicles[idx] = data.vehicle
      return data.vehicle
    },
    async createShuttleRoute(payload) {
      const data = await api.post('/routes', payload)
      this.shuttleRoutes.push(data.route)
      return data.route
    },
    // ลบจริง - backend ปฏิเสธ (FLEET_ITEM_IN_USE) ถ้ายังมีผู้โดยสารลงทะเบียนในสาย
    async deleteShuttleRoute(id) {
      await api.delete(`/routes/${id}`)
      this.shuttleRoutes = this.shuttleRoutes.filter((r) => r.id !== id)
    },
    async updateShuttleRoute(id, payload) {
      const data = await api.put(`/routes/${id}`, payload)
      const idx = this.shuttleRoutes.findIndex((r) => r.id === id)
      if (idx !== -1) this.shuttleRoutes[idx] = data.route
      return data.route
    },
    async fetchShuttlePassengers() {
      const data = await api.get('/passengers')
      this.shuttlePassengers = data.passengers
    },
    async updateShuttlePassenger(userId, payload) {
      const data = await api.put(`/passengers/${userId}`, payload)
      const idx = this.shuttlePassengers.findIndex((p) => p.userId === userId)
      if (idx !== -1) {
        this.shuttlePassengers[idx] = data.passenger
      } else {
        this.shuttlePassengers.push(data.passenger)
      }
      return data.passenger
    },
    async deleteShuttlePassenger(userId) {
      await api.delete(`/passengers/${userId}`)
      this.shuttlePassengers = this.shuttlePassengers.filter((p) => p.userId !== userId)
    },
    /**
     * ตัวเลือกสำหรับจัดรถให้คำขอหนึ่ง: คนขับ + รถ (พร้อม isBusy ในช่วงเวลาของคำขอ) + ผู้ให้บริการ
     * ไม่เก็บลง state - ข้อมูลว่าง/ไม่ว่างผูกกับคำขอนั้นเท่านั้น
     */
    async fetchAssignOptions(request) {
      const params = new URLSearchParams({
        busyFrom: request.departTime,
        busyTo: request.returnTime,
        excludeRequestId: String(request.id),
      })
      const [drivers, vehicles, providers, routes] = await Promise.all([
        api.get(`/drivers?${params}`),
        api.get(`/vehicles?${params}`),
        api.get('/providers'),
        api.get('/routes'),
      ])
      return { drivers: drivers.drivers, vehicles: vehicles.vehicles, providers: providers.providers, routes: routes.routes }
    },
  },
})

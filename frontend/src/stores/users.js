import { defineStore } from 'pinia'
import { api } from '@/api/client'

function rosterForm(file, dryRun) {
  const form = new FormData()
  form.append('file', file)
  form.append('dryRun', String(dryRun))
  return form
}

export const useUsersStore = defineStore('users', {
  state: () => ({
    users: [], // รายชื่อเต็ม (Admin เท่านั้น)
    directory: [], // รายชื่อย่อ id/ชื่อ/แผนก ที่ทุกคนเห็นได้ - ใช้เลือกพนักงานที่เดินทางในฟอร์มขอรถ
    isLoading: false,
  }),
  actions: {
    async fetchDirectory() {
      const data = await api.get('/users/directory')
      this.directory = data.users
    },
    async fetchAll() {
      this.isLoading = true
      try {
        const data = await api.get('/users')
        this.users = data.users
      } finally {
        this.isLoading = false
      }
    },
    async create(payload) {
      const data = await api.post('/users', payload)
      this.users.push(data.user)
      this.users.sort((a, b) => a.fullName.localeCompare(b.fullName))
    },
    async update(id, payload) {
      const data = await api.put(`/users/${id}`, payload)
      const idx = this.users.findIndex((u) => u.id === id)
      if (idx !== -1) this.users[idx] = data.user
    },
    // ค้นหาผู้ใช้ใน AD (ผ่านบัญชีบริการฝั่ง backend) - ผลมี alreadyAdded บอกว่ามีในระบบแล้ว
    async searchAd(q) {
      const data = await api.get(`/users/ad-search?q=${encodeURIComponent(q)}`)
      return data.results
    },
    // เพิ่มผู้ใช้ AD ที่เลือก - backend อ่านโปรไฟล์จาก AD เอง คืน { added, skipped, notFound }
    async importAd(usernames, role) {
      const data = await api.post('/users/import-ad', { usernames, role })
      this.users.push(...data.added)
      this.users.sort((a, b) => a.fullName.localeCompare(b.fullName))
      return data
    },
    // นำเข้ารายชื่อไม่ login จาก Excel - preview = ตรวจอย่างเดียว, import = สร้างจริงเฉพาะแถวที่ผ่าน
    previewRoster(file) {
      return api.post('/users/import-roster', rosterForm(file, true))
    },
    async importRoster(file) {
      const data = await api.post('/users/import-roster', rosterForm(file, false))
      await this.fetchAll()
      return data
    },
    async deactivate(id) {
      const data = await api.delete(`/users/${id}`)
      const idx = this.users.findIndex((u) => u.id === id)
      if (idx !== -1) this.users[idx] = data.user
    },
  },
})

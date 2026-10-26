import { defineStore } from 'pinia'
import { api } from '@/api/client'

// จำว่าแท็บนี้เคย login อยู่ (sessionStorage = เฉพาะแท็บนี้ รอดการรีเฟรช แต่แท็บใหม่จากลิงก์อีเมลไม่มี)
// ใช้แยก "session หมดอายุตอนเปิดหน้าค้างไว้" (login แล้วไปหน้าแรก) ออกจาก "เปิดลิงก์ลึกตอนยังไม่ login" (login แล้วไปหน้าตามลิงก์)
const AUTH_MARK_KEY = 'wasAuthenticated'
function markAuthenticated(on) {
  try {
    if (on) sessionStorage.setItem(AUTH_MARK_KEY, '1')
    else sessionStorage.removeItem(AUTH_MARK_KEY)
  } catch {
    // sessionStorage ใช้ไม่ได้ (โหมดส่วนตัว/ปิด storage) - ถือว่าไม่เคย login ในแท็บนี้
  }
}
function wasAuthenticated() {
  try {
    return sessionStorage.getItem(AUTH_MARK_KEY) === '1'
  } catch {
    return false
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isReady: false, // เช็ค session ครั้งแรกตอนโหลดแอปแล้วหรือยัง
    sessionExpired: false, // เช็ค session ตอนโหลดแอปแล้วไม่ผ่าน ทั้งที่แท็บนี้เคย login ไว้
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    isAdmin: (state) => state.user?.role === 'Admin',
  },
  actions: {
    async fetchMe() {
      try {
        const data = await api.get('/auth/me')
        this.user = data.user
        markAuthenticated(true)
      } catch {
        this.user = null
        this.sessionExpired = wasAuthenticated()
        markAuthenticated(false)
      } finally {
        this.isReady = true
      }
    },
    async login(username, password) {
      const data = await api.post('/auth/login', { username, password })
      this.user = data.user
      this.sessionExpired = false
      markAuthenticated(true)
    },
    async logout() {
      await api.post('/auth/logout')
      this.user = null
      markAuthenticated(false)
    },
    // ผู้ใช้แก้ได้เฉพาะเบอร์โทรของตัวเอง (เบอร์ไม่ได้มาจาก AD) - ค่าว่าง = ลบเบอร์
    // ลายเซ็น/ตราของผู้อนุมัติ (PNG/JPG) - ใส่ช่อง Approved by ในแบบฟอร์ม W-HR-009
    async uploadMySignature(file) {
      const body = new FormData()
      body.append('file', file)
      const data = await api.put('/auth/me/signature', body)
      this.user = data.user
    },
    async deleteMySignature() {
      const data = await api.delete('/auth/me/signature')
      this.user = data.user
    },
    async updateMyEmail(email) {
      const data = await api.put('/auth/me/email', { email })
      this.user = data.user
    },
    async updateMyPhone(phone) {
      const data = await api.put('/auth/me/phone', { phone })
      this.user = data.user
    },
  },
})

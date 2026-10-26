import { vi } from 'vitest'

// requireAuth ตรวจผู้ใช้กับฐานข้อมูลทุกคำขอ - test ส่วนใหญ่ใช้ pool จำลอง จึงจำลองให้ผู้ใช้ "ใช้งานอยู่" และ role ตาม token
// (test ที่ต้องการพฤติกรรมจริงให้ vi.unmock แล้ว vi.importActual - ดู auth.currentUser.test.js)
vi.mock('../src/modules/auth/currentUser.js', () => ({
  loadCurrentUser: vi.fn(async (payload) => ({ UserID: payload.sub, IsActive: true, Role: payload.role })),
}))

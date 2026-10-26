import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // จำลองการตรวจผู้ใช้ปัจจุบันใน requireAuth (ดู tests/setup.js) - test เฉพาะเรื่องนี้ใช้ของจริงผ่าน vi.importActual
    setupFiles: ['./tests/setup.js'],
  },
})

import { createApp } from './app.js'
import { env } from './config/env.js'
import { isMailConfigured } from './modules/notifications/mailer.js'
import { startAutoReleaseJob } from './jobs/autoRelease.js'
import { startReminderJob } from './jobs/reminders.js'

const app = createApp()

startAutoReleaseJob()
startReminderJob()

const server = app.listen(env.port, () => {
  console.log(`[server] listening on port ${env.port} (${env.nodeEnv})`)
  // ไม่ตั้ง APP_BASE_URL = อีเมลไม่มีปุ่มลิงก์ไปหน้าดำเนินการ (ผู้ใช้ต้องเปิดระบบเอง)
  if (isMailConfigured() && !env.appBaseUrl) {
    console.warn('[server] APP_BASE_URL is not set - notification emails will have no action link buttons')
  }
})

// IIS (ARR) ใช้ connection ซ้ำกับ Node แต่ keep-alive ดีฟอลต์ของ Node คือ 5 วินาที ถ้า Node ปิด connection
// ก่อนที่ IIS จะส่งคำขอถัดไปมา จะเจอ ERR_CONNECTION_RESET แบบสุ่ม (โดยเฉพาะ POST/PUT) - ตั้งให้นานกว่า idle timeout ของ IIS
server.keepAliveTimeout = 125_000
server.headersTimeout = 130_000

import cron from 'node-cron'
import { getPool } from '../db/pool.js'
import { runReminders } from '../modules/notifications/reminders.js'

/** เตือนผู้อนุมัติที่ค้าง / ก่อนวันเดินทาง / ใกล้ปิดรับลงชื่อเดินทางกลุ่ม - ทุก 15 นาที */
export function startReminderJob() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runReminders(await getPool())
    } catch (err) {
      console.error('[ReminderJob] Error running reminders:', err)
    }
  })
}

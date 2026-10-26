import cron from 'node-cron'
import { getPool } from '../db/pool.js'
import { releaseOverdueBookings, claimEndingSoonBookings, findNextBooking } from '../modules/bookings/repository.js'
import { roomsAutoReleased, roomsEndingSoon } from '../modules/notifications/service.js'
import { recordAudit } from '../modules/audit/service.js'

export function startAutoReleaseJob() {
  // Run every 1 minute to check for overdue bookings (over 10 mins past startTime without checkin)
  cron.schedule('* * * * *', async () => {
    try {
      const pool = await getPool()
      const released = await releaseOverdueBookings(pool)
      if (released && released.length > 0) {
        console.log(`[AutoReleaseJob] Released ${released.length} overdue room booking(s):`, released.map((r) => r.BookingID))
        roomsAutoReleased(released)
        // M9: ระบบปล่อยห้องเอง บันทึกเป็นผู้กระทำ 'system' (ไม่ได้มาจาก route จึงต้องเรียกตรง)
        for (const r of released) {
          recordAudit({ actor: 'system', action: 'booking.autoRelease', entityType: 'booking', entityId: r.BookingID, details: JSON.stringify({ reason: 'no check-in within 10 minutes' }) })
        }
      }
    } catch (err) {
      console.error('[AutoReleaseJob] Error executing auto-release job:', err)
    }

    // เตือนก่อนหมดเวลา 5 นาทีเมื่อมีคนจองต่อ (REQUIREMENTS กฎห้องข้อ 7, dev 2026-10-05)
    try {
      const pool = await getPool()
      const endingSoon = await claimEndingSoonBookings(pool)
      if (endingSoon.length > 0) roomsEndingSoon(endingSoon, findNextBooking)
    } catch (err) {
      console.error('[AutoReleaseJob] Error checking bookings that end soon:', err)
    }
  })
}

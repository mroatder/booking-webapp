// ทดสอบจริงกับฐานข้อมูลจริง (booking_project_dev) - ไม่ mock db/pool
// เพราะจุดประสงค์คือพิสูจน์ว่า UPDLOCK+HOLDLOCK กันจองชนได้จริงภายใต้ concurrent request
// ไม่ใช่แค่ตรวจ logic ผ่าน mock (mock ไม่มี lock contention จริงให้พิสูจน์อะไร)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { getPool, sql } from '../src/db/pool.js'
import { hashPassword } from '../src/modules/auth/password.js'
import { createLocalUser } from '../src/modules/users/repository.js'
import { create as createRoom } from '../src/modules/rooms/repository.js'

const app = createApp()
const TEST_USERNAME = `__test_concurrency_${Date.now()}`
const TEST_PASSWORD = 'Passw0rd!23'

let pool
let room
let userId
let cookie

beforeAll(async () => {
  pool = await getPool()

  room = await createRoom(pool, { name: '__test_concurrency_room__', floor: null })

  const passwordHash = await hashPassword(TEST_PASSWORD)
  const user = await createLocalUser(pool, {
    username: TEST_USERNAME,
    passwordHash,
    fullName: 'Concurrency Test User',
    role: 'Employee',
  })
  userId = user.UserID

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
  cookie = loginRes.headers['set-cookie']
})

afterAll(async () => {
  if (room) {
    await pool.request().input('roomId', sql.Int, room.RoomID).query('DELETE FROM RoomBookings WHERE RoomID = @roomId')
    await pool.request().input('roomId', sql.Int, room.RoomID).query('DELETE FROM Rooms WHERE RoomID = @roomId')
  }
  if (userId) {
    await pool.request().input('id', sql.Int, userId).query('DELETE FROM Users WHERE UserID = @id')
  }
})

describe('Room booking conflict prevention (real DB, concurrent requests)', () => {
  it('allows exactly one of many simultaneous overlapping booking requests to succeed', async () => {
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const endTime = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()

    const attempts = Array.from({ length: 8 }, (_, i) =>
      request(app)
        .post('/api/bookings')
        .set('Cookie', cookie)
        .send({ roomId: room.RoomID, title: `Concurrent attempt ${i}`, startTime, endTime }),
    )

    const results = await Promise.all(attempts)

    const succeeded = results.filter((r) => r.status === 201)
    const conflicted = results.filter((r) => r.status === 409)

    expect(succeeded).toHaveLength(1)
    expect(conflicted).toHaveLength(7)
    expect(conflicted.every((r) => r.body.errorCode === 'ROOM_BOOKING_CONFLICT')).toBe(true)

    // ยืนยันใน DB จริงว่ามีแค่ 1 แถวที่ active ในช่วงเวลานี้จริงๆ (ไม่ใช่แค่เชื่อ response)
    const dbCheck = await pool
      .request()
      .input('roomId', sql.Int, room.RoomID)
      .query(
        `SELECT COUNT(*) AS cnt FROM RoomBookings WHERE RoomID = @roomId AND Status IN ('Booked', 'CheckedIn')`,
      )
    expect(dbCheck.recordset[0].cnt).toBe(1)
  }, 20000)

  it('rejects a non-overlapping-looking request that still touches the booked range', async () => {
    // ช่วงเวลาที่ overlap บางส่วนกับการจองที่สำเร็จไปแล้วด้านบน (เริ่มก่อนจบ ต้องชนกัน)
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString()
    const endTime = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()

    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', cookie)
      .send({ roomId: room.RoomID, title: 'Overlap check', startTime, endTime })

    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('ROOM_BOOKING_CONFLICT')
  })
})

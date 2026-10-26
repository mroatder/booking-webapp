// กำหนดรหัส action ของ audit log จาก "METHOD + path" และตัดข้อมูลลับก่อนบันทึก
// รหัสเป็นภาษาอังกฤษแบบ entity.verb (หน้าเว็บเป็นผู้แปลเป็นข้อความตามภาษา - ห้ามเก็บข้อความภาษาไทย/อังกฤษไว้ใน DB)

/** path ส่วนแรก → ชนิด entity */
const ENTITY_BY_SEGMENT = {
  auth: 'auth',
  bookings: 'booking',
  tablet: 'device',
  'vehicle-requests': 'vehicleRequest',
  users: 'user',
  rooms: 'room',
  drivers: 'driver',
  providers: 'provider',
  vehicles: 'vehicle',
  routes: 'shuttleRoute',
  passengers: 'shuttlePassenger',
  departments: 'department',
  events: 'event',
}

/** แคตตาล็อก action ที่รู้จัก - key = "METHOD /template" */
const ACTION_BY_ROUTE = {
  'POST /auth/login': 'auth.login',
  'POST /auth/logout': 'auth.logout',
  'PUT /auth/me/phone': 'auth.updatePhone',
  'PUT /auth/me/email': 'auth.updateEmail',
  'PUT /auth/me/signature': 'auth.uploadSignature',
  'DELETE /auth/me/signature': 'auth.deleteSignature',

  'POST /bookings': 'booking.create',
  'PUT /bookings/:id': 'booking.update',
  'DELETE /bookings/:id': 'booking.cancel',
  'POST /bookings/:id/checkin': 'booking.checkin',

  'POST /tablet/display/:token/checkin': 'booking.checkinTablet',
  'POST /tablet/devices': 'device.create',
  'PUT /tablet/devices/:id': 'device.update',
  'DELETE /tablet/devices/:id': 'device.delete',
  'POST /tablet/devices/:id/token/regenerate': 'device.regenerateToken',

  'POST /vehicle-requests': 'vehicleRequest.create',
  'PUT /vehicle-requests/:id': 'vehicleRequest.update',
  'POST /vehicle-requests/:id/attachments': 'vehicleRequest.addAttachment',
  'DELETE /vehicle-requests/:id/attachments/:id': 'vehicleRequest.removeAttachment',
  'DELETE /vehicle-requests/:id': 'vehicleRequest.cancel',
  'POST /vehicle-requests/:id/approve': 'vehicleRequest.approve',
  'POST /vehicle-requests/:id/reject': 'vehicleRequest.reject',
  'POST /vehicle-requests/assign-trip': 'vehicleRequest.assignTrip',
  'POST /vehicle-requests/:id/assign': 'vehicleRequest.assign',

  'POST /users': 'user.create',
  'PUT /users/:id': 'user.update',
  'DELETE /users/:id': 'user.deactivate',
  'POST /users/import-ad': 'user.importAd',

  'POST /rooms': 'room.create',
  'PUT /rooms/:id': 'room.update',
  'PUT /rooms/:id/active': 'room.setActive',
  'DELETE /rooms/:id': 'room.delete',

  'POST /drivers': 'driver.create',
  'PUT /drivers/:id': 'driver.update',
  'DELETE /drivers/:id': 'driver.delete',

  'POST /providers': 'provider.create',
  'PUT /providers/:id': 'provider.update',
  'DELETE /providers/:id': 'provider.delete',
  'POST /vehicles': 'vehicle.create',
  'PUT /vehicles/:id': 'vehicle.update',
  'DELETE /vehicles/:id': 'vehicle.delete',
  'POST /routes': 'shuttleRoute.create',
  'PUT /routes/:id': 'shuttleRoute.update',
  'PUT /passengers/:id': 'shuttlePassenger.set',
  'DELETE /passengers/:id': 'shuttlePassenger.remove',

  'POST /departments': 'department.create',
  'PUT /departments/:id': 'department.update',
  'DELETE /departments/:id': 'department.delete',

  'POST /events': 'event.create',
  'PUT /events/:id': 'event.update',
  'DELETE /events/:id': 'event.delete',
  'POST /events/:id/passengers': 'event.register',
  'DELETE /events/:id/passengers/:id': 'event.unregister',
  'PUT /events/:id/boarding': 'event.updateBoarding',
  'POST /events/:id/boarding/publish': 'event.publishBoarding',
  'DELETE /events/:id/boarding/publish': 'event.retractBoarding',
}

/** action ที่ระบบ/โค้ดส่วนอื่นบันทึกเอง (ไม่ได้มาจาก route) - ใส่ไว้ให้ตัวกรองหน้าเว็บเห็นครบ */
const EXTRA_ACTIONS = ['auth.loginFailed', 'auth.loginBlocked', 'booking.autoRelease']

export const KNOWN_ACTIONS = [...new Set([...Object.values(ACTION_BY_ROUTE), ...EXTRA_ACTIONS])].sort()

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
export const isMutating = (method) => MUTATING.has(method)

/**
 * แปลง URL เป็น template + หา entity
 *   /api/bookings/12/checkin?x=1  → { template: '/bookings/:id/checkin', entityType: 'booking', entityId: 12 }
 *   /api/tablet/display/<token>/checkin → ':token' (ห้ามเก็บ token จริงลง log)
 */
export function describeRequest(method, originalUrl) {
  const pathOnly = String(originalUrl ?? '').split('?')[0].replace(/^\/api(?=\/|$)/, '')
  let entityId = null
  const segments = pathOnly
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (/^\d+$/.test(seg)) {
        if (entityId === null) entityId = Number(seg)
        return ':id'
      }
      if (/^[A-Za-z0-9_-]{24,}$/.test(seg)) return ':token'
      return seg
    })
  const template = '/' + segments.join('/')
  const entityType = ENTITY_BY_SEGMENT[segments[0]] ?? null
  const action =
    ACTION_BY_ROUTE[`${method} ${template}`] ?? `${entityType ?? 'api'}.${String(method).toLowerCase()}`
  return { template, entityType, entityId: Number.isSafeInteger(entityId) ? entityId : null, action }
}

const SECRET_KEY = /pass(word)?|secret|token|hash|signature|authorization|cookie/i
const MAX_STRING = 500
const MAX_ARRAY = 50
const MAX_DEPTH = 4

/** ตัดข้อมูลลับ/ข้อมูลใหญ่ออกก่อนบันทึก (ใช้ทั้ง body และ snapshot ก่อนแก้) */
export function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (Buffer.isBuffer(value)) return '[binary]'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
  if (typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[nested]'
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => sanitize(v, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY.test(k) ? '[redacted]' : sanitize(v, depth + 1)
  }
  return out
}

const MAX_DETAILS = 8000

/** รวมรายละเอียดเป็น JSON string ไม่เกิน MAX_DETAILS (เกิน → เก็บ preview ที่ยังเป็น JSON ที่ถูกต้อง) */
export function buildDetails({ before, body, query, files } = {}) {
  const parts = {}
  if (before) parts.before = sanitize(before)
  if (body && typeof body === 'object' && Object.keys(body).length > 0) parts.body = sanitize(body)
  if (query && Object.keys(query).length > 0) parts.query = sanitize(query)
  if (files?.length) parts.files = files.map((f) => ({ name: sanitize(f.originalname), size: f.size, type: f.mimetype }))
  if (Object.keys(parts).length === 0) return null
  const json = JSON.stringify(parts)
  if (json.length <= MAX_DETAILS) return json
  // preview ถูก escape อีกชั้น (เครื่องหมายคำพูดยาวขึ้น) จึงหดทีละส่วนจนรวมแล้วไม่เกินขีดจำกัด
  let keep = MAX_DETAILS - 100
  for (;;) {
    const out = JSON.stringify({ truncated: true, preview: json.slice(0, keep) })
    if (out.length <= MAX_DETAILS) return out
    keep = Math.floor(keep * 0.85)
  }
}

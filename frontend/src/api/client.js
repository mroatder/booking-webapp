const BASE_URL = '/api'

export class ApiError extends Error {
  constructor(errorCode, status, details) {
    super(errorCode)
    this.errorCode = errorCode
    this.status = status
    this.details = details // ข้อมูลประกอบจาก backend (ไม่ใช่ข้อความแสดงผล) ใช้เติมค่าในข้อความแปล
  }
}

/** error code สำหรับแปลเป็นข้อความผ่าน `errors.*` ใน locale (error ที่ไม่ใช่จาก API = GENERIC) */
export function errorCodeOf(err) {
  return err instanceof ApiError ? err.errorCode : 'GENERIC'
}

// เครือข่ายหลุดกลางทาง (เช่น ERR_CONNECTION_RESET จาก proxy/เซิร์ฟเวอร์รีสตาร์ท) - fetch โยน TypeError
// ลองใหม่ได้เฉพาะ GET (อ่านอย่างเดียว) เพราะ POST/PUT/DELETE อาจสำเร็จที่เซิร์ฟเวอร์ไปแล้ว ส่งซ้ำจะซ้ำซ้อน
const RETRY_DELAY_MS = 400

async function request(path, { method = 'GET', body, headers } = {}) {
  // FormData (อัปโหลดไฟล์) ต้องให้ browser ตั้ง Content-Type + boundary เอง ห้าม stringify
  const isForm = body instanceof FormData
  const send = () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  let res
  try {
    res = await send()
  } catch (err) {
    if (method !== 'GET') throw err
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    res = await send()
  }

  if (res.status === 204) return null

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(data?.errorCode ?? 'GENERIC', res.status, data?.details)
  }

  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

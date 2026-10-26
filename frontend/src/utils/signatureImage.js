// ลายเซ็นที่อัปโหลดมักเป็นรูปถ่าย/สกรีนช็อตที่มีขอบกว้าง พื้นเทา/เหลือง หรือมีฝุ่น - ทำให้ดูเล็กและเลอะในฟอร์ม
// ที่นี่ประมวลผลก่อนแสดง (ไฟล์ต้นฉบับไม่ถูกแก้):
//  1) ประเมินสีพื้นหลังจากขอบรูป  2) หารอยเซ็น = พิกเซลที่ต่างจากพื้นหลังชัดเจน (ทิ้งจุดรบกวนเดี่ยวๆ)
//  3) ตัดเหลือเฉพาะรอยเซ็น + ขอบเล็กน้อย  4) ทำพื้นหลังโปร่งใส เหลือแต่เส้นลายเซ็น
// ผลลัพธ์ให้กรอบคงที่ในฟอร์ม (object-fit: contain) ขยายเต็มกรอบเสมอ ไม่ว่าไฟล์ต้นทางจะขนาด/พื้นหลังแบบไหน

const ANALYSIS_MAX = 800 // วิเคราะห์บนภาพย่อ (เร็ว) แล้วค่อยตัดจากภาพเต็ม
const INK_DISTANCE = 60 // ระยะสีจากพื้นหลังที่ถือว่าเป็นหมึก (RGB, 0-441)
const FADE_FROM = 25 // ต่ำกว่านี้ = พื้นหลังล้วน (โปร่งใส)
const FADE_TO = 90 // สูงกว่านี้ = หมึกเต็ม (ทึบ)
const PAD_RATIO = 0.06
const NOISE_RATIO = 0.003 // แถว/คอลัมน์ที่มีหมึกน้อยกว่านี้ (สัดส่วนของด้านยาว) ถือเป็นจุดรบกวน

function readAsDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// สีพื้นหลัง = ค่ากลางของพิกเซลตามขอบรูป (โปร่งใสถือเป็นขาว)
function backgroundColor(data, w, h) {
  const r = []
  const g = []
  const b = []
  const take = (x, y) => {
    const i = (y * w + x) * 4
    const a = data[i + 3] / 255
    r.push(data[i] * a + 255 * (1 - a))
    g.push(data[i + 1] * a + 255 * (1 - a))
    b.push(data[i + 2] * a + 255 * (1 - a))
  }
  for (let x = 0; x < w; x++) {
    take(x, 0)
    take(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    take(0, y)
    take(w - 1, y)
  }
  return [median(r), median(g), median(b)]
}

function distance(data, i, bg) {
  const a = data[i + 3] / 255
  const dr = data[i] * a + 255 * (1 - a) - bg[0]
  const dg = data[i + 1] * a + 255 * (1 - a) - bg[1]
  const db = data[i + 2] * a + 255 * (1 - a) - bg[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function drawToCanvas(img, w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx }
}

// ขอบเขตของรอยเซ็นบนภาพวิเคราะห์ (null = ไม่พบ)
function inkBounds(data, w, h, bg) {
  const rows = new Uint32Array(h)
  const cols = new Uint32Array(w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (distance(data, (y * w + x) * 4, bg) > INK_DISTANCE) {
        rows[y]++
        cols[x]++
      }
    }
  }
  const min = Math.max(2, Math.round(Math.max(w, h) * NOISE_RATIO))
  const first = (arr) => arr.findIndex((n) => n >= min)
  const last = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= min) return i
    return -1
  }
  const x0 = first(cols)
  const x1 = last(cols)
  const y0 = first(rows)
  const y1 = last(rows)
  return x0 < 0 || y0 < 0 ? null : { x0, x1, y0, y1 }
}

/** blob ของรูปลายเซ็น → data URL (PNG โปร่งใส) ที่มีแต่รอยเซ็น (ประมวลผลไม่ได้/ไม่พบรอยเซ็น = คืนรูปเดิม) */
export async function trimmedSignatureDataUrl(blob) {
  const original = await readAsDataUrl(blob)
  if (!original) return null
  try {
    const img = await loadImage(original)
    const { width, height } = img
    const scale = Math.min(1, ANALYSIS_MAX / Math.max(width, height))
    const aw = Math.max(1, Math.round(width * scale))
    const ah = Math.max(1, Math.round(height * scale))
    const small = drawToCanvas(img, aw, ah)
    const bg = backgroundColor(small.ctx.getImageData(0, 0, aw, ah).data, aw, ah)
    const box = inkBounds(small.ctx.getImageData(0, 0, aw, ah).data, aw, ah, bg)
    if (!box) return original

    // แปลงกลับเป็นพิกเซลของภาพเต็ม + ขอบเล็กน้อย
    const pad = Math.round(Math.max(box.x1 - box.x0, box.y1 - box.y0) * PAD_RATIO)
    const sx = Math.max(0, Math.floor((box.x0 - pad) / scale))
    const sy = Math.max(0, Math.floor((box.y0 - pad) / scale))
    const ex = Math.min(width, Math.ceil((box.x1 + pad + 1) / scale))
    const ey = Math.min(height, Math.ceil((box.y1 + pad + 1) / scale))
    const sw = ex - sx
    const sh = ey - sy

    const full = drawToCanvas(img, width, height)
    const crop = full.ctx.getImageData(sx, sy, sw, sh)
    const px = crop.data
    for (let i = 0; i < px.length; i += 4) {
      const d = distance(px, i, bg)
      const alpha = Math.min(1, Math.max(0, (d - FADE_FROM) / (FADE_TO - FADE_FROM)))
      px[i + 3] = Math.round(alpha * 255)
    }
    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    out.getContext('2d').putImageData(crop, 0, 0)
    return out.toDataURL('image/png')
  } catch {
    return original
  }
}

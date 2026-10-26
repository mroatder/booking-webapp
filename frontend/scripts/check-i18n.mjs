// ตรวจระบบ 2 ภาษา (REQUIREMENTS § 7: ห้าม hardcode ข้อความ, ต้องมีคำแปลครบทั้งไทย/อังกฤษ)
//   npm run lint:i18n
// 1) key ใน th.json และ en.json ต้องตรงกันทุกตัว และไม่มีค่าว่าง
// 2) key ที่เรียก t('...') แบบ static ในโค้ดต้องมีอยู่จริงในทั้ง 2 ภาษา
// 3) ห้ามมีอักษรไทยในโค้ด (.vue/.js) นอกคอมเมนต์ - ยกเว้นไฟล์ใน ALLOW_THAI ด้านล่าง
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')

// ไฟล์ที่ยอมให้มีข้อความไทยตายตัวได้ พร้อมเหตุผล - ห้ามเพิ่มไฟล์โดยไม่มีเหตุผลเดียวกันนี้
const ALLOW_THAI = {
  'src/components/fleet/CarBookingFormModal.vue': 'เอกสารฟอร์มทางการ W-HR-009 ภาษาไทยตายตัว (ส่วนปุ่ม/หัวข้อของหน้าต่างผ่าน i18n แล้ว)',
  'src/components/fleet/ShuttleDispatchPrintModal.vue': 'เอกสารใบจัดรถภาษาไทยตายตัว (ส่งบริษัทรถเช่า)',
  'src/utils/carBookingForm.js': 'เอกสารฟอร์ม W-HR-009 ภาษาไทยตายตัว (หน้าต่างพิมพ์)',
  'src/utils/shuttleRoutes.js': 'ค่าข้อมูลที่เก็บใน DB ("บริษัท") ใช้จับคู่ ไม่ใช่ข้อความแสดงผล',
  'src/components/VehicleRequestForm.vue': 'ค่าข้อมูลจุดรับ/ปลายทางของรถโอทีที่บันทึกลง DB (ใช้จับคู่กับ utils/shuttleRoutes.js)',
  'src/components/LanguageSwitcher.vue': 'ชื่อภาษาต้องแสดงเป็นภาษาของตัวเอง ("ไทย")',
  'src/views/HomeView.vue': 'ชื่อวันย่อภาษาไทยในปฏิทิน เลือกตามภาษาปัจจุบันอยู่แล้ว',
}

function flat(obj, pre = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, v]],
  )
}
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(vue|js)$/.test(p) ? [p] : []
  })
}

const th = Object.fromEntries(flat(JSON.parse(readFileSync(join(srcDir, 'locales/th.json'), 'utf8'))))
const en = Object.fromEntries(flat(JSON.parse(readFileSync(join(srcDir, 'locales/en.json'), 'utf8'))))
const problems = []

for (const k of Object.keys(th)) if (!(k in en)) problems.push(`ขาดใน en.json: ${k}`)
for (const k of Object.keys(en)) if (!(k in th)) problems.push(`ขาดใน th.json: ${k}`)
for (const [k, v] of [...Object.entries(th), ...Object.entries(en)]) if (v === '') problems.push(`ค่าว่าง: ${k}`)

const has = (dict, key) => key in dict || Object.keys(dict).some((x) => x.startsWith(key + '.'))
const KEY_RE = /(?<![\w.])(?:\$t|t)\(\s*(['"`])([^'"`$]+?)\1/g
const THAI = /[฀-๿]/

for (const file of walk(srcDir)) {
  const rel = relative(root, file).replaceAll('\\', '/')
  if (rel.startsWith('src/locales/')) continue
  const text = readFileSync(file, 'utf8')

  for (const m of text.matchAll(KEY_RE)) {
    if (!has(th, m[2])) problems.push(`${rel}: ใช้ key ที่ไม่มีใน th.json → ${m[2]}`)
    else if (!has(en, m[2])) problems.push(`${rel}: ใช้ key ที่ไม่มีใน en.json → ${m[2]}`)
  }

  if (rel in ALLOW_THAI) continue
  const code = text
    .replace(/<!--[\s\S]*?-->/g, (c) => '\n'.repeat(c.split('\n').length - 1))
    .replace(/\/\*[\s\S]*?\*\//g, (c) => '\n'.repeat(c.split('\n').length - 1))
  code.split(/\r?\n/).forEach((line, i) => {
    const stripped = line.replace(/(^|[^:"'`])\/\/.*$/, '$1')
    if (THAI.test(stripped)) problems.push(`${rel}:${i + 1}: ข้อความไทย hardcode → ${stripped.trim().slice(0, 80)}`)
  })
}

if (problems.length) {
  console.error('i18n ไม่ผ่าน - ใส่ข้อความเป็น key ใน locales/th.json + en.json แล้วเรียกผ่าน t()\n')
  problems.slice(0, 80).forEach((p) => console.error('  ✗ ' + p))
  if (problems.length > 80) console.error(`  … และอีก ${problems.length - 80} รายการ`)
  process.exit(1)
}
console.log(`i18n ผ่าน (th=${Object.keys(th).length} key, en=${Object.keys(en).length} key, ยกเว้นไฟล์เอกสาร/ข้อมูล ${Object.keys(ALLOW_THAI).length} ไฟล์)`)

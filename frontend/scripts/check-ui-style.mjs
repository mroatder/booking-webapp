// ตรวจว่าหน้า .vue ไม่เขียน style ปุ่ม/ช่องกรอก/modal เองนอกระบบกลาง (docs/UI-STYLE.md)
//   npm run lint:ui                 ตรวจ - ล้มเหลวถ้าไฟล์ใดมีจุดผิดกติกา "มากกว่า" baseline
//   npm run lint:ui -- --baseline   บันทึกจำนวนจุดผิดกติกาปัจจุบันเป็น baseline (ใช้ตอนตั้งต้น/หลังแก้หน้าเก่าให้ถูกแล้วเท่านั้น)
// หน้าเก่าที่ยังค้างอยู่ใน baseline ปล่อยผ่านชั่วคราว แต่ห้ามเพิ่ม และไฟล์ใหม่ต้องเป็น 0 เสมอ
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const baselineFile = join(root, 'scripts', 'ui-style-baseline.json')

const RULES = [
  {
    id: 'raw-primary-button',
    fix: 'ใช้ class="btn btn-primary"',
    // มี rounded = ปุ่ม/ป้ายที่เขียนเอง (เซลล์ตารางที่ไฮไลต์วันนี้ไม่มี rounded จึงไม่ถูกจับ)
    test: (c) => c.includes('bg-slate-900') && c.includes('text-white') && /\bpx-/.test(c) && /\brounded/.test(c),
  },
  {
    id: 'raw-secondary-button',
    fix: 'ใช้ class="btn btn-secondary"',
    test: (c) => c.includes('border-slate-300') && c.includes('hover:bg-slate-50'),
  },
  {
    id: 'raw-field',
    fix: 'ใช้ class="input" (และ class="label" สำหรับป้ายกำกับ)',
    test: (c) => c.includes('border-slate-300') && c.includes('focus:outline-none'),
  },
  {
    id: 'raw-modal-panel',
    fix: 'ใช้ class="modal-backdrop" / "modal-panel" / "modal-header" / "modal-body" / "modal-footer"',
    test: (c) => c.includes('bg-white') && /\bshadow-(xl|2xl)\b/.test(c) && /\brounded/.test(c) && !c.includes('modal-panel'),
  },
  {
    id: 'raw-slate-in-new-token-area',
    fix: 'ใช้ semantic token (text-ink / text-muted / border-line / bg-surface) แทน slate-*',
    // ใช้กับ STRICT_FILES และไฟล์ใหม่ทุกไฟล์ - ไฟล์เก่ายังมี slate-* ได้ (สเกล slate ถูกปรับเป็นขาว-ดำคมแล้ว หน้าตาเท่ากัน) จนกว่าจะแตะแก้ไฟล์นั้น
    strictOnly: true,
    test: (c) => /\b(?:bg|text|border|ring|divide)-slate-\d{2,3}\b/.test(c),
  },
]

// ไฟล์ที่ย้ายเข้าระบบใหม่เต็มรูปแบบแล้ว: ห้ามมี slate-* เลย (เพิ่มชื่อไฟล์ที่นี่เมื่อย้ายหน้าเสร็จ)
const STRICT_FILES = new Set([
  'src/App.vue',
  'src/components/common/SubNav.vue',
  'src/layouts/AdminLayout.vue',
  'src/layouts/RoomBookingLayout.vue',
  'src/layouts/VehicleRequestLayout.vue',
  'src/views/admin/DepartmentsView.vue',
  'src/views/admin/AuditLogView.vue',
])

// ไฟล์ใหม่ (ยังไม่เคย commit / เพิ่งเพิ่ม) ต้องไม่มี slate-* เลย ตั้งแต่ไฟล์แรก
function newFiles() {
  try {
    const out = execSync('git status --porcelain --untracked-files=all -- src', { cwd: root, encoding: 'utf8' })
    return new Set(
      out
        .split('\n')
        .filter((l) => /^(\?\?|A )/.test(l))
        .map((l) => l.slice(3).trim().replace(/^frontend\//, '')),
    )
  } catch {
    return new Set()
  }
}
const NEW_FILES = newFiles()

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.vue') ? [p] : []
  })
}

// ตรวจทั้ง class="..." และ :class="[...]" (รวมสตริงที่อยู่ใน binding แบบไดนามิก)
const CLASS_RE = /(?<![\w-])(?::|v-bind:)?class="([^"]*)"/g
const result = {}
const details = []
for (const file of walk(srcDir)) {
  const rel = relative(root, file).replaceAll('\\', '/')
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CLASS_RE)) {
      for (const rule of RULES) {
        if (rule.strictOnly && !STRICT_FILES.has(rel) && !NEW_FILES.has(rel)) continue
        if (rule.test(m[1])) {
          result[rel] ??= {}
          result[rel][rule.id] = (result[rel][rule.id] ?? 0) + 1
          details.push(`${rel}:${i + 1}  [${rule.id}] ${rule.fix}`)
        }
      }
    }
  })
}

if (process.argv.includes('--baseline')) {
  // strict files ต้องเป็น 0 เสมอ ไม่เข้า baseline
  for (const f of STRICT_FILES) delete result[f]
  writeFileSync(baselineFile, JSON.stringify(result, null, 2) + '\n')
  const total = Object.values(result).reduce((a, r) => a + Object.values(r).reduce((x, y) => x + y, 0), 0)
  console.log(`baseline saved: ${Object.keys(result).length} files, ${total} legacy spots`)
  process.exit(0)
}

const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {}
const failures = []
for (const [file, rules] of Object.entries(result)) {
  for (const [id, n] of Object.entries(rules)) {
    const allowed = baseline[file]?.[id] ?? 0
    if (n > allowed) failures.push(`${file}: [${id}] พบ ${n} จุด (อนุญาต ${allowed})`)
  }
}

if (failures.length) {
  console.error('UI style ไม่ผ่าน - ดูกติกาที่ docs/UI-STYLE.md\n')
  failures.forEach((f) => console.error('  ✗ ' + f))
  console.error('\nจุดที่พบ:')
  details
    .filter((d) => failures.some((f) => f.startsWith(d.split(':')[0] + ':') && f.includes(d.match(/\[(.+?)\]/)[1])))
    .forEach((d) => console.error('  ' + d))
  process.exit(1)
}
const legacy = Object.values(baseline).reduce((a, r) => a + Object.values(r).reduce((x, y) => x + y, 0), 0)
console.log(`UI style ผ่าน (ค้างจากหน้าเก่าใน baseline อีก ${legacy} จุด รอย้ายเข้าระบบใหม่)`)

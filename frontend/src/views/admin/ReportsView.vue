<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, errorCodeOf } from '@/api/client'
import { useToastStore } from '@/stores/toast'
import { formatDateTimeDMY, toLocalDateStr } from '@/utils/datetime'
import PaginationBar from '@/components/common/PaginationBar.vue'

// รายงาน (M8, Admin) - 4 รายงาน เลือกช่วงวันที่ ดูบนเว็บ และส่งออก Excel
// โครงตารางมาจาก backend ({ title, tables: [{ title, columns, rows }] }) หน้านี้แค่จัดรูปแบบตามชนิดคอลัมน์
const { t } = useI18n()
const toast = useToastStore()

const REPORTS = ['rooms', 'vehicle-requests', 'drivers', 'shuttle-routes', 'group-trips']
const active = ref('rooms')

// ช่วงวันที่: ทางลัด หรือกำหนดเอง (รวมวันสุดท้าย)
const RANGES = ['thisMonth', 'lastMonth', 'last30', 'custom']
const rangeKey = ref('thisMonth')
const today = new Date()
const customFrom = ref(toLocalDateStr(new Date(today.getFullYear(), today.getMonth(), 1)))
const customTo = ref(toLocalDateStr(today))

const range = computed(() => {
  const y = today.getFullYear()
  const m = today.getMonth()
  if (rangeKey.value === 'thisMonth') return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) }
  if (rangeKey.value === 'lastMonth') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }
  if (rangeKey.value === 'last30') {
    const to = new Date(y, m, today.getDate() + 1)
    return { from: new Date(to.getTime() - 30 * 86400000), to }
  }
  const from = new Date(`${customFrom.value}T00:00:00`)
  const to = new Date(`${customTo.value}T00:00:00`)
  to.setDate(to.getDate() + 1)
  return { from, to }
})
const query = computed(() =>
  new URLSearchParams({ from: range.value.from.toISOString(), to: range.value.to.toISOString() }).toString(),
)
const rangeValid = computed(() => customFrom.value && customTo.value && range.value.to > range.value.from)

const report = ref(null)
const isLoading = ref(false)
const errorCode = ref('')

async function load() {
  if (!rangeValid.value) return
  isLoading.value = true
  errorCode.value = ''
  try {
    const data = await api.get(`/reports/${active.value}?${query.value}`)
    report.value = data.report
  } catch (err) {
    errorCode.value = errorCodeOf(err)
    report.value = null
  } finally {
    isLoading.value = false
  }
}
watch([active, query], load, { immediate: true })

// ดาวน์โหลด Excel - ใช้ fetch เพราะต้องแนบ cookie และรับเป็นไฟล์
const isExporting = ref(false)
async function exportExcel() {
  isExporting.value = true
  try {
    const res = await fetch(`/api/reports/${active.value}/export?${query.value}`, { credentials: 'include' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'report.xlsx'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.error(t('reports.exportFailed'))
  } finally {
    isExporting.value = false
  }
}

const NUMERIC = ['number', 'hours', 'percent']
function format(value, type) {
  if (value === null || value === undefined || value === '') return type === 'percent' ? '-' : ''
  if (type === 'datetime') return formatDateTimeDMY(value)
  if (type === 'date') return String(value).split('-').reverse().join('/')
  if (type === 'hours' || type === 'percent') return Number(value).toFixed(1)
  if (type === 'number') return Number(value).toLocaleString('en-US')
  return value
}

// ทุกตารางแบ่งหน้า (หน้าละ 25 แถว แยกอิสระต่อ 1 ตาราง) - ไฟล์ Excel มีครบทุกแถวเสมอ
const PAGE_SIZE = 25
const pages = ref({})
const pageOf = (key) => pages.value[key] ?? 1
watch(report, () => (pages.value = {}))
const visibleRows = (table) => table.rows.slice((pageOf(table.key) - 1) * PAGE_SIZE, pageOf(table.key) * PAGE_SIZE)

const pillClass = (on) => [
  'seg-btn',
  on ? 'is-active' : '',
]
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('reports.title') }}</h1>

    <div class="filter-bar">
      <div>
        <p class="filter-label">{{ t('reports.reportLabel') }}</p>
        <div class="seg">
          <button v-for="r in REPORTS" :key="r" type="button" :class="pillClass(active === r)" @click="active = r">
            {{ t(`reports.type.${r}`) }}
          </button>
        </div>
      </div>
      <div>
        <p class="filter-label">{{ t('reports.rangeLabel') }}</p>
        <div class="seg">
          <button v-for="r in RANGES" :key="r" type="button" :class="pillClass(rangeKey === r)" @click="rangeKey = r">
            {{ t(`reports.range.${r}`) }}
          </button>
        </div>
      </div>
      <div v-if="rangeKey === 'custom'" class="flex items-end gap-2">
        <div class="w-40">
          <p class="filter-label">{{ t('roomBooking.fromDate') }}</p>
          <DatePicker v-model="customFrom" />
        </div>
        <div class="w-40">
          <p class="filter-label">{{ t('roomBooking.toDate') }}</p>
          <DatePicker v-model="customTo" />
        </div>
      </div>
      <button type="button" :disabled="isExporting || !report" class="btn btn-primary sm:ml-auto" @click="exportExcel">
        {{ isExporting ? t('common.loading') : t('reports.exportExcel') }}
      </button>
    </div>

    <p v-if="errorCode" role="alert" class="mb-4 rounded-control bg-red-50 p-3 text-sm text-red-600">
      {{ t(`errors.${errorCode}`) }}
    </p>

    <div v-if="report" :class="['space-y-6', isLoading ? 'opacity-60' : '']">
      <p v-if="report.note" class="text-xs text-slate-500">{{ t('reports.note') }}: {{ report.note }}</p>

      <div v-for="table in report.tables" :key="table.key">
        <h2 class="mb-2 text-sm font-semibold text-ink">
          {{ table.title }}
          <span class="font-normal text-slate-500">({{ table.rows.length }})</span>
        </h2>
        <p v-if="table.rows.length === 0" class="empty-state !py-8">{{ t('reports.noData') }}</p>
        <div v-else class="overflow-x-auto">
          <table class="data-table ruled">
            <thead>
              <tr>
                <th
                  v-for="c in table.columns"
                  :key="c.key"
                  :class="['whitespace-nowrap', NUMERIC.includes(c.type) ? 'text-right' : 'text-left']"
                >
                  {{ c.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in visibleRows(table)" :key="`${table.key}-${pageOf(table.key)}-${i}`">
                <td
                  v-for="c in table.columns"
                  :key="c.key"
                  :class="[
                    NUMERIC.includes(c.type) ? 'whitespace-nowrap text-right tabular-nums' : '',
                    c.type === 'datetime' || c.type === 'date' ? 'whitespace-nowrap' : '',
                    c === table.columns[0] ? 'whitespace-nowrap font-medium !text-ink' : '',
                  ]"
                >
                  {{ format(row[c.key], c.type) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar
          :page="pageOf(table.key)"
          :total="table.rows.length"
          :page-size="PAGE_SIZE"
          class="mt-3"
          @update:page="pages[table.key] = $event"
        />
      </div>
    </div>
    <p v-else-if="isLoading" class="text-sm text-slate-400">{{ t('common.loading') }}</p>
  </section>
</template>

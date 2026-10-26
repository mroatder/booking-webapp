<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useTabletI18n } from './useTabletI18n'
import { useFitList } from './useFitList'
import { api, ApiError } from '@/api/client'
import { formatDateTime, toLocalDateStr } from '@/utils/datetime'

// ปฏิทินรายเดือนของห้องบนจอ tablet - ดูอย่างเดียว (ตรวจสอบหน้าห้องว่าวันไหนว่าง/มีประชุมอะไร)
// จอติดหน้าห้องไม่มีใครกดปิด → เปิดได้นานสุด 5 นาที ไม่กด Back ก็กลับหน้าสถานะเอง (dev 2026-09-30)
const props = defineProps({
  token: { type: String, required: true },
})
const emit = defineEmits(['close'])
const { t, locale } = useTabletI18n() // จอหน้าห้องเป็นภาษาอังกฤษเสมอ

const OPEN_LIMIT_S = 5 * 60
const todayStr = toLocalDateStr(new Date())

const viewMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const selectedDate = ref(todayStr)
const bookings = ref([])
const isLoading = ref(false)
const errorCode = ref('')

const monthKey = computed(
  () => `${viewMonth.value.getFullYear()}-${String(viewMonth.value.getMonth() + 1).padStart(2, '0')}`,
)
const monthLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { month: 'long', year: 'numeric' }).format(
    viewMonth.value,
  ),
)
const weekdayLabels = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short' })
  // เริ่มวันจันทร์ (2024-01-01 เป็นวันจันทร์)
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
})

async function load() {
  isLoading.value = true
  errorCode.value = ''
  try {
    const data = await api.get(`/tablet/display/${props.token}/calendar?month=${monthKey.value}`)
    bookings.value = data.bookings
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isLoading.value = false
  }
}
watch(monthKey, load, { immediate: true })

// การจองแยกตามวัน เฉพาะวันของเดือนที่ดูอยู่ (ประชุมข้ามวันนับทุกวันที่ครอบคลุม)
const byDate = computed(() => {
  const map = new Map()
  const month = viewMonth.value.getMonth()
  for (const b of bookings.value) {
    const d = new Date(b.startTime)
    d.setHours(0, 0, 0, 0)
    const end = new Date(b.endTime)
    while (d < end) {
      if (d.getMonth() === month) {
        const key = toLocalDateStr(d)
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(b)
      }
      d.setDate(d.getDate() + 1)
    }
  }
  for (const list of map.values()) list.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
  return map
})

// เฉพาะสัปดาห์ของเดือนนั้น (4-6 แถว) เริ่มวันจันทร์ - วันของเดือนก่อน/ถัดไปแสดงแค่ในสัปดาห์ที่คาบเกี่ยว
// เป็นช่องจางกดไม่ได้ ไม่มีข้อมูล (dev: แสดงแค่ของเดือนนั้นๆ พอ)
const cells = computed(() => {
  const first = viewMonth.value
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const total = Math.ceil((lead + daysInMonth) / 7) * 7
  const start = new Date(first)
  start.setDate(1 - lead)
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = toLocalDateStr(d)
    const slots = byDate.value.get(key) ?? []
    return {
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
      // ปล่อยห้องอัตโนมัติไม่นับว่าห้องไม่ว่าง (เหมือนหน้าแรก) แต่ยังแสดงให้เห็น
      active: slots.filter((b) => b.status !== 'AutoReleased').length,
      released: slots.filter((b) => b.status === 'AutoReleased').length,
    }
  })
})

// เหมือนหน้าแรก: released = ปล่อยห้องอัตโนมัติ, ended = ผ่านไปแล้ว, inUse = กำลังใช้, upcoming = ยังไม่ถึง
const now = ref(Date.now())
function slotState(b) {
  if (b.status === 'AutoReleased') return 'released'
  if (new Date(b.endTime).getTime() <= now.value) return 'ended'
  if (new Date(b.startTime).getTime() <= now.value) return 'inUse'
  return 'upcoming'
}
const slotClass = {
  upcoming: 'bg-amber-50 text-neutral-900',
  inUse: 'bg-[#3e6ae1]/10 text-neutral-900',
  ended: 'bg-neutral-50 text-neutral-400',
  released: 'bg-neutral-50 text-neutral-400',
}
const badgeClass = {
  inUse: 'bg-[#3e6ae1] text-white',
  ended: 'bg-neutral-200 text-neutral-600',
  released: 'bg-neutral-200 text-neutral-500',
}

const selectedBookings = computed(() => byDate.value.get(selectedDate.value) ?? [])
const selectedLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${selectedDate.value}T00:00:00`)),
)

// เปลี่ยนเดือน → เลือกวันนี้ถ้าอยู่ในเดือนนั้น ไม่งั้นวันที่ 1
function shiftMonth(delta) {
  const d = new Date(viewMonth.value)
  d.setMonth(d.getMonth() + delta)
  viewMonth.value = d
  selectedDate.value = todayStr.startsWith(monthKey.value) ? todayStr : `${monthKey.value}-01`
}

function goToday() {
  viewMonth.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  selectedDate.value = todayStr
}

function pick(cell) {
  if (cell.inMonth) selectedDate.value = cell.key
}

function formatTime(iso) {
  return formatDateTime(iso, locale.value, { timeStyle: 'short' })
}

// แสดงเวลาเฉพาะส่วนที่อยู่ในวันที่เลือก (ประชุมข้ามวัน)
function slotRange(b) {
  const dayStart = new Date(`${selectedDate.value}T00:00:00`)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const start = new Date(b.startTime) < dayStart ? '…' : formatTime(b.startTime)
  const end = new Date(b.endTime) > dayEnd ? '…' : formatTime(b.endTime)
  return `${start}–${end}`
}

// นับถอยหลังจากตอนเปิด (ไม่รีเซ็ตเมื่อแตะจอ) - แสดงเวลาที่เหลือข้างปุ่ม Back ให้คนรู้ว่าจะกลับเอง
const openedAt = Date.now()
const secondsLeft = ref(OPEN_LIMIT_S)
const countdown = computed(
  () => `${Math.floor(secondsLeft.value / 60)}:${String(secondsLeft.value % 60).padStart(2, '0')}`,
)
let tick = null
let nowTimer = null
onMounted(() => {
  tick = setInterval(() => {
    secondsLeft.value = Math.max(0, OPEN_LIMIT_S - Math.floor((Date.now() - openedAt) / 1000))
    if (secondsLeft.value === 0) emit('close')
  }, 1000)
  nowTimer = setInterval(() => (now.value = Date.now()), 30_000)
})
onUnmounted(() => {
  clearInterval(tick)
  clearInterval(nowTimer)
})

const bookingList = ref(null)
const { hidden: hiddenBookings, refit: refitBookings } = useFitList(bookingList)
watch(selectedBookings, refitBookings, { flush: 'post' })

const navBtn =
  'flex h-12 min-w-12 cursor-pointer items-center justify-center rounded-full bg-white px-4 text-lg text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-95'
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <button type="button" :class="navBtn" :aria-label="t('tablet.prevMonth')" @click="shiftMonth(-1)">‹</button>
        <p class="min-w-[9em] text-center text-[clamp(1.25rem,2.2vw,1.5rem)] font-light tracking-tight">{{ monthLabel }}</p>
        <button type="button" :class="navBtn" :aria-label="t('tablet.nextMonth')" @click="shiftMonth(1)">›</button>
        <button type="button" :class="[navBtn, 'ml-2 text-base']" @click="goToday">{{ t('tablet.today') }}</button>
      </div>
      <div class="flex items-center gap-4">
        <p class="text-sm text-neutral-500">
          {{ t('tablet.autoReturn') }} <span class="tabular-nums font-medium text-neutral-700">{{ countdown }}</span>
        </p>
        <button
          type="button"
          class="flex h-12 cursor-pointer items-center gap-2 rounded-full bg-neutral-900 px-6 text-base font-medium text-white transition hover:bg-neutral-800 active:scale-[0.98]"
          @click="emit('close')"
        >
          <AppIcon name="arrowLeft" /> {{ t('tablet.backToStatus') }}
        </button>
      </div>
    </div>

    <p class="mt-3 px-1 text-sm text-neutral-500">{{ t('tablet.tapDayHint') }}</p>

    <p v-if="errorCode" class="mt-6 text-base text-red-600">{{ t(`errors.${errorCode}`) }}</p>

    <div
      class="mt-[clamp(0.5rem,1.5vh,1rem)] grid min-h-0 flex-1 gap-[clamp(0.75rem,2vw,1.5rem)] portrait:grid-rows-[auto_minmax(0,1fr)] landscape:grid-cols-3 landscape:grid-rows-[minmax(0,1fr)]"
    >
      <div
        :class="[
          'flex min-h-0 flex-col rounded-3xl bg-white p-[clamp(0.75rem,1.6vw,1.25rem)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.05)] landscape:col-span-2',
          isLoading ? 'opacity-60' : '',
        ]"
      >
        <div class="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-wider text-neutral-400">
          <div v-for="w in weekdayLabels" :key="w" class="py-1">{{ w }}</div>
        </div>
        <!-- แนวนอน: แถวยืดเต็มความสูงการ์ดเท่ากันทุกแถว (จอสูงไม่เหลือที่ว่าง), แนวตั้ง: สูงตามจอ -->
        <div class="mt-1 grid min-h-0 grid-cols-7 gap-2 landscape:flex-1 landscape:auto-rows-fr">
          <button
            v-for="cell in cells"
            :key="cell.key"
            type="button"
            :disabled="!cell.inMonth"
            :class="[
              'relative flex min-h-11 flex-col portrait:h-[clamp(2.75rem,6vh,5rem)] items-center justify-center rounded-2xl text-[clamp(1rem,1.8vw,1.25rem)] transition',
              cell.key === selectedDate
                ? 'cursor-pointer bg-[#3e6ae1] text-white shadow-md'
                : cell.inMonth
                  ? cell.active
                    ? 'cursor-pointer bg-amber-100 text-neutral-900 hover:bg-amber-200 active:scale-95'
                    : 'cursor-pointer bg-emerald-50 text-neutral-900 hover:bg-emerald-100 active:scale-95'
                  : 'cursor-default text-neutral-300',
            ]"
            @click="pick(cell)"
          >
            <span class="font-light tabular-nums">{{ cell.day }}</span>
            <span
              v-if="cell.active"
              :class="['mt-0.5 text-[11px]', cell.key === selectedDate ? 'text-white/80' : 'font-medium text-amber-700']"
            >
              {{ t('tablet.meetingsCount', { n: cell.active }, cell.active) }}
            </span>
            <span v-else-if="cell.released" class="mt-0.5 text-[11px] text-neutral-400">
              {{ t('tablet.releasedCount', { n: cell.released }, cell.released) }}
            </span>
            <!-- วันนี้: จุดฟ้ามุมขวาบน (ไม่ทับข้อความจำนวนประชุมบนจอเตี้ย) -->
            <span
              v-if="cell.key === todayStr"
              :class="['absolute top-2 right-2 h-2 w-2 rounded-full', cell.key === selectedDate ? 'bg-white' : 'bg-[#3e6ae1]']"
              aria-hidden="true"
            ></span>
          </button>
        </div>
      </div>

      <section class="flex min-h-0 flex-col rounded-3xl bg-white p-[clamp(1rem,2vw,1.5rem)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.05)]">
        <h2 class="text-lg font-medium text-[#3e6ae1]">{{ selectedLabel }}</h2>
        <!-- ห้ามเลื่อน: useFitList ย่อตัวอักษร (--fit) / ตัดท้ายเป็น "+N" ให้พอดีกล่อง -->
        <div v-if="selectedBookings.length" class="relative mt-4 min-h-0 flex-1">
          <ul ref="bookingList" class="h-full space-y-2 overflow-hidden text-[length:calc(1rem*var(--fit,1))]">
            <li v-for="b in selectedBookings" :key="b.bookingId" :class="['rounded-2xl px-[1em] py-[0.75em]', slotClass[slotState(b)]]">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[0.875em] tabular-nums text-neutral-500">{{ slotRange(b) }}</p>
                <span
                  v-if="slotState(b) !== 'upcoming'"
                  :class="['shrink-0 rounded-full px-[0.8em] py-[0.15em] text-[0.75em] font-medium', badgeClass[slotState(b)]]"
                >
                  {{ t(`home.slotState.${slotState(b)}`) }}
                </span>
              </div>
              <p :class="['mt-0.5 line-clamp-2 break-words font-medium', { 'line-through': slotState(b) === 'released' }]">{{ b.title }}</p>
            </li>
          </ul>
          <p v-if="hiddenBookings > 0" class="absolute inset-x-0 bottom-0 bg-white px-1 pt-1 text-sm font-medium text-neutral-500">
            {{ t('tablet.moreItems', { n: hiddenBookings }) }}
          </p>
        </div>
        <p v-else class="mt-4 text-lg font-medium text-emerald-600">{{ t('tablet.dayFree') }}</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '@/api/client'
import { formatDateTime } from '@/utils/datetime'
import TabletCalendar from '@/components/tablet/TabletCalendar.vue'
import { useFitList } from '@/components/tablet/useFitList'
import { useTabletI18n } from '@/components/tablet/useTabletI18n'

const { t, locale } = useTabletI18n() // จอหน้าห้องเป็นภาษาอังกฤษเสมอ
const route = useRoute()

const data = ref(null)
const errorCode = ref('')
const now = ref(new Date())
// กดดูปฏิทินรายเดือนของห้อง (dev 2026-09-29: ตรวจสอบหน้าห้อง) - ไม่แตะจอสักพักกลับหน้าสถานะเอง
const showCalendar = ref(false)

let refreshTimer = null
let clockTimer = null

// สไตล์แบบจอรถ Tesla (dev 2026-09-29): พื้นเทาอ่อน การ์ดขาวมุมโค้งมาก เงาบาง ตัวเลขใหญ่น้ำหนักเบา
// สีน้อยที่สุด - สถานะเป็นแค่จุดสี, สีหลักของปุ่ม/แถบเวลาคือฟ้า Tesla (#3e6ae1)
// สีสถานะ: ตัวหนังสือสถานะเป็นสี + จุดใหญ่ + พื้นการ์ดไล่สีอ่อนจากบน (dev: สีเล็กไป) - ไม่มีแถบสีขอบบน (dev ไม่เอา)
const statusConfig = {
  free: { labelKey: 'tablet.statusFree', dot: 'bg-emerald-500', text: 'text-emerald-600', tint: 'from-emerald-50' },
  upcoming: { labelKey: 'tablet.statusUpcoming', dot: 'bg-amber-400', text: 'text-amber-500', tint: 'from-amber-50' },
  busy: { labelKey: 'tablet.statusBusy', dot: 'bg-red-500', text: 'text-red-600', tint: 'from-red-50' },
}

// บรรทัดรองใต้สถานะ: ว่างถึงกี่โมง / เริ่มในกี่นาที / เหลืออีกกี่นาที + แถบความคืบหน้าของประชุมที่กำลังดำเนิน
function minutesUntil(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.value.getTime()) / 60000))
}
const statusDetail = computed(() => {
  const d = data.value
  if (!d) return ''
  if (d.currentMeeting) return t('tablet.endsIn', { n: minutesUntil(d.currentMeeting.endTime) })
  if (d.nextMeeting && d.status === 'upcoming') return t('tablet.startsIn', { n: minutesUntil(d.nextMeeting.startTime) })
  if (d.nextMeeting) return t('tablet.availableUntil', { time: formatTime(d.nextMeeting.startTime) })
  return t('tablet.availableRestOfDay')
})
const progress = computed(() => {
  const m = data.value?.currentMeeting
  if (!m) return 0
  const start = new Date(m.startTime).getTime()
  const end = new Date(m.endTime).getTime()
  return Math.min(100, Math.max(0, ((now.value.getTime() - start) / (end - start)) * 100))
})

const todayLabel = computed(() =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now.value),
)

// ตารางวันนี้: จบแล้วจาง, กำลังประชุมพื้นฟ้าอ่อน
function slotTone(slot) {
  const t0 = now.value.getTime()
  if (new Date(slot.endTime).getTime() <= t0) return 'text-neutral-400'
  if (new Date(slot.startTime).getTime() <= t0) return 'bg-[#3e6ae1]/8 font-medium text-neutral-900'
  return 'text-neutral-800'
}

const currentStatus = computed(() => statusConfig[data.value?.status] ?? statusConfig.free)

function formatTime(iso) {
  return formatDateTime(iso, locale.value, { timeStyle: 'short' })
}

// ตารางวันนี้: ห้ามเลื่อน - ย่อตัวอักษร/ซ่อนรายการที่จบแล้ว/ตัดท้ายเป็น "+N" ให้พอดีกล่องเสมอ (useFitList)
const scheduleList = ref(null)
const firstUpcomingIndex = () => Math.max(0, (data.value?.schedule ?? []).findIndex((x) => new Date(x.endTime) > now.value))
const { hidden: hiddenSlots, refit: refitSchedule } = useFitList(scheduleList, firstUpcomingIndex)
// มีการประชุมอยู่/ถัดไป → ตัวอักษรสถานะเล็กลงให้มีที่พอสำหรับรายละเอียด; ห้องว่างทั้งวัน → ใหญ่เต็มพื้นที่
const hasMeeting = computed(() => Boolean(data.value?.currentMeeting || data.value?.nextMeeting))
// มีปุ่มเช็คอินในการ์ดสถานะ (การประชุมที่กำลังดำเนินอยู่หรือถัดไปที่ยังไม่เช็คอิน) → เนื้อหาสูงขึ้น ต้องบีบให้พอดีจอ ไม่ให้ล้น
const hasCheckInButton = computed(() => {
  const d = data.value
  if (!d) return false
  return Boolean(
    (d.currentMeeting && !d.currentMeeting.isCheckedIn) || (d.status === 'upcoming' && d.nextMeeting && !d.nextMeeting.isCheckedIn),
  )
})
watch(() => data.value?.schedule, refitSchedule)
watch(showCalendar, (v) => !v && refitSchedule())

async function loadData() {
  try {
    const result = await api.get(`/tablet/display/${route.params.token}`)
    data.value = result
    errorCode.value = ''
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  }
}

const isCheckingIn = ref(false)
const checkInToast = ref('')

async function handleCheckIn(bookingId) {
  if (!bookingId || isCheckingIn.value) return
  isCheckingIn.value = true
  checkInToast.value = ''
  try {
    await api.post(`/tablet/display/${route.params.token}/checkin`, { bookingId })
    checkInToast.value = t('tablet.checkInSuccess')
    await loadData()
    setTimeout(() => {
      checkInToast.value = ''
    }, 3500)
  } catch {
    checkInToast.value = t('tablet.checkInFailed')
    setTimeout(() => {
      checkInToast.value = ''
    }, 3500)
  } finally {
    isCheckingIn.value = false
  }
}

onMounted(() => {
  loadData()
  refreshTimer = setInterval(loadData, 30_000)
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  clearInterval(refreshTimer)
  clearInterval(clockTimer)
})
</script>

<template>
  <!-- responsive ตามขนาด tablet (dev 2026-09-30): พอดีจอไม่ต้องเลื่อน ตัวอักษร/ระยะย่อขยายตามขนาดจอ -->
  <div
    class="relative flex h-dvh flex-col overflow-hidden bg-neutral-100 px-[clamp(1rem,3vw,2.5rem)] py-[clamp(0.75rem,3vh,2rem)] text-neutral-900 antialiased"
  >
    <transition enter-active-class="transition duration-300 ease-out" enter-from-class="-translate-y-full opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-200 ease-in" leave-from-class="translate-y-0 opacity-100" leave-to-class="-translate-y-full opacity-0">
      <div v-if="checkInToast" class="fixed top-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-white shadow-xl text-base font-semibold">
        <AppIcon name="check" class="h-6 w-6" /> {{ checkInToast }}
      </div>
    </transition>

    <div v-if="errorCode" class="flex flex-1 items-center justify-center">
      <p class="text-2xl font-light text-neutral-500">{{ t(`errors.${errorCode}`) }}</p>
    </div>

    <template v-else-if="data">
      <header class="flex shrink-0 items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="break-words text-[clamp(1.75rem,min(4.4vw,7.5vh),3.75rem)] leading-tight font-bold tracking-tight">{{ data.room.name }}</h1>
          <p v-if="data.room.floor" class="mt-0.5 text-[clamp(1.125rem,min(2.5vw,4vh),2rem)] font-semibold text-neutral-500">{{ data.room.floor }}</p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-[clamp(2rem,min(5.4vw,9vh),4.75rem)] leading-none font-semibold tabular-nums tracking-tight">{{ formatTime(now) }}</p>
          <p class="mt-1 whitespace-nowrap text-[clamp(1rem,min(2.1vw,3.4vh),1.625rem)] font-semibold text-neutral-500">{{ todayLabel }}</p>
        </div>
      </header>

      <TabletCalendar
        v-if="showCalendar"
        class="mt-[clamp(0.75rem,2vh,1.5rem)]"
        :token="route.params.token"
        @close="showCalendar = false"
      />

      <template v-else>
        <div
          class="mt-[clamp(0.75rem,2vh,1.5rem)] grid min-h-0 flex-1 gap-[clamp(0.75rem,2vw,1.5rem)] portrait:grid-rows-[auto_minmax(0,1fr)] landscape:grid-cols-5 landscape:grid-rows-[minmax(0,1fr)]"
        >
          <!-- สถานะห้อง -->
          <section
            :class="[
              'flex min-h-0 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-b to-white to-60% p-[clamp(1.25rem,3vw,2.5rem)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.05)] transition-colors duration-700 landscape:col-span-3',
              currentStatus.tint,
            ]"
          >
            <div>
              <p class="text-[clamp(1rem,min(2vw,3.2vh),1.5rem)] text-neutral-500">{{ t('tablet.roomStatus') }}</p>
              <!-- ขนาดสถานะอิงทั้งความกว้างและความสูงจอ จุดสีใหญ่ตามตัวอักษร (em) -->
              <p
                :class="[
                  'mt-[0.15em] flex items-center gap-[0.25em] portrait:text-[clamp(3rem,min(12vw,9vh),8rem)] leading-none font-light tracking-tight',
                  hasCheckInButton ? 'text-[clamp(2.25rem,min(5.5vw,8vh),4rem)]' : hasMeeting ? 'text-[clamp(2.75rem,min(7.5vw,12vh),6rem)]' : 'text-[clamp(3rem,min(9vw,16vh),9rem)]',
                  currentStatus.text,
                ]"
              >
                <span :class="['h-[0.4em] w-[0.4em] shrink-0 rounded-full shadow-sm', currentStatus.dot]" aria-hidden="true"></span>
                {{ t(currentStatus.labelKey) }}
              </p>
              <p class="mt-[clamp(0.5rem,1.5vh,0.75rem)] text-[clamp(1.0625rem,min(2.2vw,3.6vh),1.75rem)] font-light text-neutral-500">{{ statusDetail }}</p>
            </div>

            <div :class="hasCheckInButton ? 'mt-[clamp(0.5rem,1.5vh,1rem)] space-y-[clamp(0.5rem,1.2vh,0.875rem)]' : 'mt-[clamp(1rem,4vh,2.5rem)] space-y-[clamp(0.75rem,2vh,1.5rem)]'">
              <div v-if="data.currentMeeting">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-[clamp(1rem,min(1.8vw,3vh),1.375rem)] text-neutral-500">{{ t('tablet.inProgress') }}</p>
                  <span v-if="data.currentMeeting.isCheckedIn" class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <AppIcon name="check" class="h-3.5 w-3.5" /> {{ t('tablet.checkedIn') }}
                  </span>
                </div>
                <p class="mt-1 line-clamp-2 break-words text-[clamp(1.375rem,min(2.6vw,4.4vh),2.25rem)] leading-tight font-medium">{{ data.currentMeeting.title }}</p>
                <div class="mt-3 flex items-center gap-4">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div class="h-full rounded-full bg-[#3e6ae1] transition-all duration-700" :style="{ width: `${progress}%` }"></div>
                  </div>
                  <span class="text-[clamp(1.0625rem,min(1.8vw,3vh),1.5rem)] tabular-nums text-neutral-500">
                    {{ formatTime(data.currentMeeting.startTime) }} – {{ formatTime(data.currentMeeting.endTime) }}
                  </span>
                </div>

                <button
                  v-if="!data.currentMeeting.isCheckedIn"
                  type="button"
                  :disabled="isCheckingIn"
                  class="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-[clamp(0.75rem,2.2vh,1.25rem)] text-[clamp(1rem,min(1.7vw,2.8vh),1.375rem)] font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                  @click="handleCheckIn(data.currentMeeting.bookingId)"
                >
                  <AppIcon name="check" class="h-5 w-5" />
                  <span>{{ isCheckingIn ? 'Checking in...' : t('tablet.checkIn') }}</span>
                </button>
              </div>

              <div v-if="data.nextMeeting" class="rounded-2xl bg-neutral-100 px-[clamp(1rem,2vw,1.5rem)] py-[clamp(0.625rem,1.5vh,1rem)]">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-[clamp(1rem,min(1.8vw,3vh),1.375rem)] text-neutral-500">{{ t('tablet.nextMeeting') }}</p>
                  <span v-if="data.nextMeeting.isCheckedIn" class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    <AppIcon name="check" class="h-3.5 w-3.5" /> {{ t('tablet.checkedIn') }}
                  </span>
                </div>
                <div class="mt-1 flex items-baseline justify-between gap-4">
                  <p class="min-w-0 line-clamp-2 break-words text-[clamp(1.125rem,min(2.1vw,3.6vh),1.75rem)] font-medium">{{ data.nextMeeting.title }}</p>
                  <p class="shrink-0 text-[clamp(1.0625rem,min(1.8vw,3vh),1.5rem)] tabular-nums text-neutral-600">
                    {{ formatTime(data.nextMeeting.startTime) }} – {{ formatTime(data.nextMeeting.endTime) }}
                  </p>
                </div>

                <button
                  v-if="data.status === 'upcoming' && !data.nextMeeting.isCheckedIn"
                  type="button"
                  :disabled="isCheckingIn"
                  class="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-[clamp(0.625rem,1.8vh,1rem)] text-[clamp(1rem,min(1.9vw,3vh),1.5rem)] font-bold text-white shadow transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                  @click="handleCheckIn(data.nextMeeting.bookingId)"
                >
                  <AppIcon name="check" class="h-5 w-5" />
                  <span>{{ isCheckingIn ? 'Checking in...' : t('tablet.checkIn') }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- ตารางวันนี้ + ปฏิทิน -->
          <section class="flex min-h-0 flex-col rounded-3xl bg-white p-[clamp(1rem,2vw,1.5rem)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.05)] landscape:col-span-2">
            <h2 class="shrink-0 px-2 text-[clamp(1.25rem,min(2.4vw,4vh),1.875rem)] font-medium">{{ t('tablet.todaySchedule') }}</h2>
            <!-- ห้ามเลื่อน: useFitList ย่อ/ซ่อนรายการให้พอดี, footer บอกจำนวนที่ซ่อน -->
            <div v-if="data.schedule.length > 0" class="relative mt-3 min-h-0 flex-1">
              <ul ref="scheduleList" class="h-full space-y-1 overflow-hidden">
                <li
                  v-for="slot in data.schedule"
                  :key="slot.bookingId"
                  :class="['flex gap-[1em] rounded-xl px-[0.75em] py-[0.6em] text-[length:calc(clamp(1rem,min(1.7vw,2.8vh),1.375rem)*var(--fit,1))]', slotTone(slot)]"
                >
                  <span class="w-[7.5em] shrink-0 tabular-nums text-neutral-500">{{ formatTime(slot.startTime) }} – {{ formatTime(slot.endTime) }}</span>
                  <span class="min-w-0 break-words">{{ slot.title }}</span>
                </li>
              </ul>
              <p v-if="hiddenSlots > 0" class="absolute inset-x-0 bottom-0 bg-white px-3 pt-1 text-sm font-medium text-neutral-500">
                {{ t('tablet.moreItems', { n: hiddenSlots }) }}
              </p>
            </div>
            <p v-else class="mt-3 flex-1 px-2 text-[clamp(1rem,min(1.7vw,2.8vh),1.375rem)] font-light text-neutral-500">{{ t('tablet.noMoreToday') }}</p>

            <button
              type="button"
              class="mt-4 flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#3e6ae1] px-6 py-[clamp(0.875rem,2.6vh,1.5rem)] text-[clamp(1rem,min(1.7vw,2.8vh),1.375rem)] font-medium text-white shadow-sm transition hover:bg-[#3457c7] active:scale-[0.98]"
              @click="showCalendar = true"
            >
              {{ t('tablet.viewCalendar') }}
              <AppIcon name="arrowRight" />
            </button>
          </section>
        </div>
      </template>
    </template>
  </div>
</template>

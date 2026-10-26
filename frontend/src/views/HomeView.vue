<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRoomsStore } from '@/stores/rooms'
import { api } from '@/api/client'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const roomsStore = useRoomsStore()

const today = new Date()
const currentYear = ref(today.getFullYear())
const currentMonth = ref(today.getMonth()) // 0-indexed (0 = Jan)
const selectedRoomId = ref(null)

const isLoadingCalendar = ref(false)
const busySlots = ref([])
const selectedDay = ref(null) // day detail modal

// เวลาปัจจุบันสำหรับคำนวณสถานะ "จบแล้ว/กำลังใช้งาน" - อัปเดตทุก 1 นาที
const now = ref(Date.now())
let nowTimer = null

onMounted(async () => {
  nowTimer = setInterval(() => (now.value = Date.now()), 60 * 1000)
  await roomsStore.fetchAll()
  if (roomsStore.rooms.length > 0) {
    selectedRoomId.value = roomsStore.rooms[0].id
  }
})

onUnmounted(() => clearInterval(nowTimer))

// Fetch monthly busy slots for the selected room
async function loadMonthlySchedule() {
  if (!selectedRoomId.value) return
  isLoadingCalendar.value = true
  try {
    const y = currentYear.value
    const m = String(currentMonth.value + 1).padStart(2, '0')
    const monthParam = `${y}-${m}`
    const data = await api.get(`/rooms/${selectedRoomId.value}/availability?month=${monthParam}&includeReleased=1`)
    busySlots.value = data.busy || []
  } catch {
    busySlots.value = []
  } finally {
    isLoadingCalendar.value = false
  }
}

watch([selectedRoomId, currentYear, currentMonth], loadMonthlySchedule, { immediate: true })

// Helper to format date string YYYY-MM-DD
function formatDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Group busy slots by YYYY-MM-DD (Local Time)
const busyByDateMap = computed(() => {
  const map = {}
  for (const slot of busySlots.value) {
    const startDate = new Date(slot.startTime)
    const dateKey = formatDateKey(startDate)
    if (!map[dateKey]) map[dateKey] = []
    map[dateKey].push(slot)
  }
  return map
})

// released = ปล่อยห้องอัตโนมัติ (ไม่มีคนเช็คอิน), ended = ผ่านไปแล้ว, inUse = อยู่ในช่วงเวลานี้, upcoming = ยังไม่ถึง
function slotState(slot) {
  if (slot.status === 'AutoReleased') return 'released'
  const start = new Date(slot.startTime).getTime()
  const end = new Date(slot.endTime).getTime()
  if (end <= now.value) return 'ended'
  if (start <= now.value) return 'inUse'
  return 'upcoming'
}

const slotStateClasses = {
  upcoming: 'border-amber-200 bg-amber-50 text-amber-900',
  inUse: 'border-sky-300 bg-sky-50 text-sky-900',
  ended: 'border-slate-200 bg-slate-100 text-slate-500',
  released: 'border-dashed border-slate-200 bg-white text-slate-400',
}

const slotStateBadgeClasses = {
  inUse: 'bg-sky-100 text-sky-800',
  ended: 'bg-slate-200 text-slate-600',
  released: 'bg-slate-100 text-slate-500',
}

// การจองที่ปล่อยห้องแล้วไม่นับว่าห้อง "ไม่ว่าง"
function activeCount(slots) {
  return slots.filter((s) => s.status !== 'AutoReleased').length
}

// Generate calendar cells (42 cells: 6 weeks)
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDayOfMonth = new Date(year, month, 1)
  const startingDayOfWeek = firstDayOfMonth.getDay() // 0 = Sun, 1 = Mon ...
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const todayStr = formatDateKey(new Date())
  const days = []

  // Prev month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i)
    const key = formatDateKey(d)
    days.push({
      dateObj: d,
      dateKey: key,
      dayNum: d.getDate(),
      isCurrentMonth: false,
      isSunday: d.getDay() === 0,
      isToday: key === todayStr,
      slots: busyByDateMap.value[key] || [],
    })
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    const key = formatDateKey(d)
    days.push({
      dateObj: d,
      dateKey: key,
      dayNum: i,
      isCurrentMonth: true,
      isSunday: d.getDay() === 0,
      isToday: key === todayStr,
      slots: busyByDateMap.value[key] || [],
    })
  }

  // Next month padding (only fill remaining days of the last week)
  const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7
  const remainingCells = totalCells - days.length
  for (let i = 1; i <= remainingCells; i++) {
    const d = new Date(year, month + 1, i)
    const key = formatDateKey(d)
    days.push({
      dateObj: d,
      dateKey: key,
      dayNum: d.getDate(),
      isCurrentMonth: false,
      isSunday: d.getDay() === 0,
      isToday: key === todayStr,
      slots: busyByDateMap.value[key] || [],
    })
  }

  return days
})

const selectedRoom = computed(() => {
  return roomsStore.rooms.find((r) => r.id === selectedRoomId.value)
})

const monthFormatter = computed(() => {
  return new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-US', {
    month: 'long',
    year: 'numeric',
    calendar: 'gregory',
  })
})

const monthYearTitle = computed(() => {
  const d = new Date(currentYear.value, currentMonth.value, 1)
  return monthFormatter.value.format(d)
})

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

function goToToday() {
  const now = new Date()
  currentYear.value = now.getFullYear()
  currentMonth.value = now.getMonth()
}

function openDayDetail(day) {
  selectedDay.value = day
}

function closeDayDetail() {
  selectedDay.value = null
}

function bookRoomOnDate(dateKey) {
  router.push({
    name: 'room-booking-new',
    query: dateKey ? { roomId: selectedRoomId.value, date: dateKey } : { roomId: selectedRoomId.value },
  })
}

// ชื่อของช่องวัน (สำหรับโปรแกรมอ่านหน้าจอ): วันที่ + สถานะการจอง
function dayAriaLabel(day) {
  const status = !day.isCurrentMonth
    ? ''
    : activeCount(day.slots) === 0
      ? t('home.dayAvailable')
      : t('home.dayBusyCount', { n: activeCount(day.slots) })
  return `${formatDateLong(day.dateObj)} ${status}`.trim()
}

// Format time
function formatTimeShort(isoStr) {
  const d = new Date(isoStr)
  return new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', {
    timeStyle: 'short',
    hour12: false
  }).format(d)
}

function formatDateLong(dateObj) {
  // ระบุทีละส่วนแทน dateStyle: 'full' ซึ่งภาษาไทยจะเติม "ค.ศ." หน้าปี
  return new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH-u-ca-gregory' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj)
}

const weekDayNames = computed(() => {
  return locale.value === 'th'
    ? ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
})
</script>

<template>
  <div class="page-container flex min-h-[calc(100dvh-3.5rem)] flex-col py-3">
    <!-- Header Greeting -->
    <div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-0">
      <h1 class="text-lg font-semibold text-ink sm:text-xl">
        {{ t('home.greeting', { name: auth.user?.fullName || auth.user?.username || '' }) }}
      </h1>
      <p class="text-sm text-muted">{{ t('home.subtitle') }}</p>
    </div>

    <!-- ปฏิทินห้องประชุม: รายชื่อห้องแนวตั้งทางซ้าย (จอแคบ = เรียงแนวนอนเหนือปฏิทิน), ปฏิทินยืดเต็มพื้นที่ที่เหลือของจอ -->
    <div class="flex flex-1 flex-col gap-4 md:flex-row md:gap-5">
      <nav class="md:w-44 md:shrink-0" :aria-label="t('home.selectRoom')">
        <p class="mb-1.5 text-xs font-semibold text-muted">{{ t('home.selectRoom') }}</p>
        <div class="flex flex-wrap gap-1.5 md:flex-col md:gap-0.5">
          <button
            v-for="room in roomsStore.rooms"
            :key="room.id"
            type="button"
            class="rail-btn"
            :aria-pressed="selectedRoomId === room.id"
            :title="room.floor ? `${room.name} • ${room.floor}` : room.name"
            @click="selectedRoomId = room.id"
          >
            {{ room.name }}
          </button>
        </div>
      </nav>

      <div class="flex min-w-0 flex-1 flex-col">
        <h2 class="sr-only">{{ t('home.roomCalendarTitle') }}</h2>

        <!-- Toolbar: เดือน + เลื่อนเดือน (ซ้าย) - ปุ่มหลักจองห้อง (ขวา) -->
        <div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div class="flex items-center gap-2">
            <span class="mr-2 text-lg font-semibold capitalize text-ink">{{ monthYearTitle }}</span>
            <button type="button" class="btn btn-secondary btn-sm" :aria-label="t('home.prevMonth')" @click="prevMonth">
              <AppIcon name="arrowLeft" />
            </button>
            <button type="button" class="btn btn-secondary btn-sm" :aria-label="t('home.nextMonth')" @click="nextMonth">
              <AppIcon name="arrowRight" />
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="goToToday">
              {{ t('home.today') }}
            </button>
          </div>

          <button type="button" class="btn btn-primary btn-sm" :disabled="!selectedRoomId" @click="bookRoomOnDate()">
            <AppIcon name="plus" />
            {{ t('home.quickBookRoom') }}
          </button>
        </div>

        <!-- Calendar Loading Indicator -->
        <div v-if="isLoadingCalendar" class="py-12 text-center text-sm text-slate-400">
          {{ t('common.loading') }}
        </div>

        <!-- Calendar Grid -->
        <div v-else class="flex min-h-0 flex-1 flex-col overflow-x-auto">
          <div class="flex min-w-[700px] flex-1 flex-col">
            <!-- Weekday Headers -->
            <div class="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-xs font-semibold text-slate-600">
              <div
                v-for="(dayName, idx) in weekDayNames"
                :key="idx"
                :class="['py-1.5', idx === 0 ? 'text-red-600 bg-red-50 font-bold' : '']"
              >
                {{ dayName }}
              </div>
            </div>

            <!-- Calendar Days Grid (6 rows x 7 cols) -->
            <div
              class="grid flex-1 grid-cols-7 gap-px border-l border-t border-slate-200 bg-slate-200"
              :style="{ gridTemplateRows: `repeat(${calendarDays.length / 7}, minmax(0, 1fr))` }"
            >
              <div
                v-for="(day, idx) in calendarDays"
                :key="idx"
                :class="[
                  'min-h-14 overflow-hidden flex flex-col justify-between cursor-pointer p-1.5 transition-colors',
                  day.isSunday
                    ? day.isCurrentMonth
                      ? 'bg-red-50 hover:bg-red-100'
                      : 'bg-red-50 text-slate-400 hover:bg-red-100'
                    : day.isCurrentMonth
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100',
                  day.isToday ? 'bg-slate-50 ring-2 ring-slate-900 ring-inset' : '',
                ]"
                role="button"
                tabindex="0"
                :aria-label="dayAriaLabel(day)"
                @click="openDayDetail(day)"
                @keydown.enter.prevent="openDayDetail(day)"
                @keydown.space.prevent="openDayDetail(day)"
              >
                <!-- Cell Header -->
                <div>
                  <div class="mb-1 flex items-center justify-between">
                    <span
                      :class="[
                        'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium',
                        day.isToday
                          ? 'bg-slate-900 font-bold text-white'
                          : day.isSunday
                            ? 'font-semibold text-red-600'
                            : 'text-slate-700',
                      ]"
                    >
                      {{ day.dayNum }}
                    </span>
                    <!-- วันที่ว่างไม่ต้องมีป้าย (ดูรายละเอียดได้ตอนกดเข้าไป) แสดงเฉพาะวันที่มีการจอง -->
                    <span
                      v-if="day.isCurrentMonth && activeCount(day.slots) > 0"
                      class="rounded bg-amber-100 px-1 py-0.5 text-xs font-bold text-amber-800"
                    >
                      {{ t('home.dayBusyCount', { n: activeCount(day.slots) }) }}
                    </span>
                  </div>

                  <!-- Slots / Bookings list preview in fixed height day cell -->
                  <div class="space-y-0.5 overflow-hidden">
                    <div
                      v-for="slot in day.slots.slice(0, 1)"
                      :key="slot.bookingId"
                      :class="[
                        'truncate rounded border px-1 py-0.5 text-xs font-medium',
                        slotStateClasses[slotState(slot)],
                        { 'line-through': slotState(slot) === 'released' },
                      ]"
                      :title="`${formatTimeShort(slot.startTime)} - ${formatTimeShort(slot.endTime)} ${slot.title}`"
                    >
                      {{ formatTimeShort(slot.startTime) }} {{ slot.title }}
                    </div>
                    <div
                      v-if="day.slots.length > 1"
                      class="pl-0.5 text-xs font-semibold text-slate-500"
                    >
                      {{ t('home.moreBookings', { n: day.slots.length - 1 }) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Day Detail Modal -->
    <div
      v-if="selectedDay"
      class="modal-backdrop"
      @click.self="closeDayDetail"
    >
      <div class="modal-panel max-w-lg" role="dialog" aria-modal="true" aria-labelledby="day-detail-title">
        <div class="modal-header">
          <div>
            <h3 id="day-detail-title" class="text-base font-semibold text-ink">
              {{ selectedRoom?.name }}
            </h3>
            <p class="text-xs font-normal text-muted capitalize">
              {{ formatDateLong(selectedDay.dateObj) }}
            </p>
          </div>
          <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="closeDayDetail">
            <AppIcon name="close" />
          </button>
        </div>

        <div class="modal-body">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {{ t('home.scheduleDetails') }}
          </h4>

          <div v-if="selectedDay.slots.length === 0" class="rounded-control border border-emerald-200 bg-emerald-50/50 p-4 text-center">
            <p class="text-sm font-medium text-emerald-800">{{ t('home.dayAvailable') }}</p>
            <p class="mt-1 text-xs text-emerald-600">{{ t('home.availableAnytime') }}</p>
          </div>

          <ul v-else class="space-y-2">
            <li
              v-for="slot in selectedDay.slots"
              :key="slot.bookingId"
              :class="['flex items-center justify-between gap-3 rounded-control border px-3.5 py-2.5 text-sm', slotStateClasses[slotState(slot)]]"
            >
              <div :class="{ 'line-through': slotState(slot) === 'released' }">
                <span class="font-bold">
                  {{ formatTimeShort(slot.startTime) }} – {{ formatTimeShort(slot.endTime) }}
                </span>
                <p class="text-xs font-medium opacity-90">{{ slot.title }}</p>
              </div>
              <span
                v-if="slotState(slot) !== 'upcoming'"
                :class="['shrink-0 rounded px-2 py-0.5 text-xs font-semibold', slotStateBadgeClasses[slotState(slot)]]"
              >
                {{ t(`home.slotState.${slotState(slot)}`) }}
              </span>
            </li>
          </ul>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="closeDayDetail">
            {{ t('home.close') }}
          </button>
          <button type="button" class="btn btn-primary" @click="bookRoomOnDate(selectedDay.dateKey)">
            {{ t('home.quickBookRoom') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

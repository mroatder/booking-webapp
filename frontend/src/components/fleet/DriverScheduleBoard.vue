<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDriversStore } from '@/stores/drivers'
import { formatDateDMY, formatDateTime, toLocalTimeStr } from '@/utils/datetime'

// ตารางงานรายสัปดาห์ของคนขับที่ลงทะเบียน (บริษัท + บริษัทรถเช่า) - ทริปข้ามวันแสดงทุกวันที่ครอบคลุม
const { t, locale } = useI18n()
const driversStore = useDriversStore()

function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // จันทร์ = วันแรก
  return d
}

const weekStart = ref(startOfWeek(new Date()))
const assignments = ref([])
const isLoading = ref(false)

const weekDays = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const start = new Date(weekStart.value)
    start.setDate(start.getDate() + i)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }),
)

async function load() {
  isLoading.value = true
  try {
    assignments.value = await driversStore.fetchSchedule(weekStart.value, weekDays.value[6].end)
  } finally {
    isLoading.value = false
  }
}

watch(weekStart, load)
onMounted(async () => {
  if (driversStore.drivers.length === 0) await driversStore.fetchAll()
  await load()
})

function shiftWeek(delta) {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + delta * 7)
  weekStart.value = d
}

// คนขับบริษัทก่อน แล้วตามด้วยคนขับของบริษัทรถเช่า
const drivers = computed(() =>
  driversStore.drivers
    .filter((d) => d.isActive)
    .sort((a, b) => (a.providerName ?? '').localeCompare(b.providerName ?? '', 'th') || a.name.localeCompare(b.name, 'th')),
)

function tripsFor(driverId, day) {
  return assignments.value.filter(
    (a) => a.driver?.id === driverId && new Date(a.departTime) < day.end && new Date(a.returnTime) > day.start,
  )
}

// เวลาเริ่ม/จบภายในวันนั้น - ถ้าทริปเริ่มก่อน/จบหลังวันนั้นให้แสดง "…" แทน
function tripLabel(trip, day) {
  const depart = new Date(trip.departTime)
  const ret = new Date(trip.returnTime)
  return `${depart >= day.start ? toLocalTimeStr(depart) : '…'}–${ret <= day.end ? toLocalTimeStr(ret) : '…'}`
}

function dayHeader(day) {
  return formatDateTime(day.start, locale.value, { weekday: 'short', day: 'numeric', month: 'short' })
}

function isToday(day) {
  const now = new Date()
  return now >= day.start && now < day.end
}

defineExpose({ reload: load })
import AppIcon from '@/components/common/AppIcon.vue'
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-secondary btn-sm" :aria-label="t('home.prevMonth')" @click="shiftWeek(-1)">
          <AppIcon name="arrowLeft" />
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :aria-label="t('home.nextMonth')" @click="shiftWeek(1)">
          <AppIcon name="arrowRight" />
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="weekStart = startOfWeek(new Date())">
          {{ t('admin.thisWeek') }}
        </button>
        <span class="ml-2 text-base font-semibold text-ink">
          {{ formatDateDMY(weekDays[0].start) }} – {{ formatDateDMY(weekDays[6].start) }}
        </span>
      </div>
    </div>

    <p v-if="drivers.length === 0" class="empty-state">
      {{ t('admin.noDrivers') }}
    </p>
    <div v-else class="overflow-x-auto">
      <table :class="['w-full min-w-[760px] table-fixed text-sm', { 'opacity-60': isLoading }]">
        <thead>
          <tr class="text-xs font-semibold text-muted">
            <th class="w-40 border-b border-slate-200 px-3 py-2 text-left">{{ t('vehicleBooking.driver') }}</th>
            <th
              v-for="day in weekDays"
              :key="day.start.getTime()"
              :class="['border-b border-l border-slate-200 px-2 py-2 text-center capitalize', isToday(day) ? 'bg-accent text-white' : '']"
            >
              {{ dayHeader(day) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="driver in drivers" :key="driver.id" class="align-top">
            <td class="border-b border-slate-100 px-3 py-2">
              <p class="font-medium text-slate-900">{{ driver.name }}</p>
              <p class="text-xs text-slate-500">{{ driver.providerName ?? t('fleet.ownerCompany') }}</p>
            </td>
            <td v-for="day in weekDays" :key="day.start.getTime()" class="h-16 border-b border-l border-slate-100 p-1">
              <div
                v-for="trip in tripsFor(driver.id, day)"
                :key="trip.id"
                class="mb-1 rounded-control bg-amber-50 px-1.5 py-1 text-xs leading-tight text-amber-900"
                :title="`${trip.pickupLocation} → ${trip.destination} (${trip.requesterName}) • ${trip.driver?.licensePlate ?? ''}`"
              >
                <p class="font-semibold">{{ tripLabel(trip, day) }}</p>
                <p class="truncate">{{ trip.destination }}</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

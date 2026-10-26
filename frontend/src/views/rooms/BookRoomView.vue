<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useRoomsStore } from '@/stores/rooms'
import { useBookingsStore } from '@/stores/bookings'
import { useToastStore } from '@/stores/toast'
import { api, ApiError } from '@/api/client'
import { defaultBookingTimes } from '@/utils/datetime'
import { bookingDateLimits } from '@/utils/bookingWindow'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const roomsStore = useRoomsStore()
const bookingsStore = useBookingsStore()
const toast = useToastStore()

const form = reactive({
  roomId: '',
  title: '',
  isRecurring: false,
  recurrenceUntil: '',
  ...defaultBookingTimes(),
})

const errorCode = ref('')
const isSubmitting = ref(false)
const busySlots = ref([])
const isLoadingAvailability = ref(false)

onMounted(async () => {
  await roomsStore.fetchAll()
  const queryRoomId = Number(route.query.roomId)
  if (queryRoomId && roomsStore.rooms.some((r) => r.id === queryRoomId)) {
    form.roomId = queryRoomId
  } else if (roomsStore.rooms.length > 0) {
    form.roomId = roomsStore.rooms[0].id
  }
  if (route.query.date) {
    form.date = String(route.query.date)
  }
  // มาจากมุมมองวันของหน้าแรก: ตั้งเวลาเริ่มตามช่องที่คลิก (จอง 1 ชั่วโมง)
  const startQuery = String(route.query.start ?? '')
  if (/^\d{2}:\d{2}$/.test(startQuery)) {
    const [h, m] = startQuery.split(':').map(Number)
    form.startTime = startQuery
    form.endTime = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
})

async function loadAvailability() {
  if (!form.roomId || !form.date) {
    busySlots.value = []
    return
  }
  isLoadingAvailability.value = true
  try {
    const data = await api.get(`/rooms/${form.roomId}/availability?date=${form.date}`)
    busySlots.value = data.busy
  } finally {
    isLoadingAvailability.value = false
  }
}

watch(() => [form.roomId, form.date], loadAvailability, { immediate: true })

// ---- รายการจองของห้องวันนั้น + ห้องอื่นที่ว่างช่วงเวลาที่เลือก ----
const allBusy = ref({}) // roomId -> การจองของวันที่เลือก
async function loadAllBusy() {
  if (!form.date || roomsStore.rooms.length === 0) return
  const day = form.date
  const entries = await Promise.all(
    roomsStore.rooms.map((r) =>
      api
        .get(`/rooms/${r.id}/availability?date=${day}`)
        .then((d) => [r.id, d.busy ?? []])
        .catch(() => [r.id, []]),
    ),
  )
  if (day === form.date) allBusy.value = Object.fromEntries(entries)
}
watch(() => [form.date, roomsStore.rooms.length], loadAllBusy, { immediate: true })

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number)
  return h * 60 + m
}
const isoMin = (iso) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
const slotValid = computed(() => form.startTime && form.endTime && toMin(form.endTime) > toMin(form.startTime))
const slotConflicts = computed(
  () =>
    slotValid.value &&
    busySlots.value.some((s) => isoMin(s.startTime) < toMin(form.endTime) && (isoMin(s.endTime) || 24 * 60) > toMin(form.startTime)),
)
const otherFreeRooms = computed(() => {
  if (!slotValid.value) return []
  return roomsStore.rooms.filter(
    (r) =>
      r.id !== Number(form.roomId) &&
      !(allBusy.value[r.id] ?? []).some(
        (s) => isoMin(s.startTime) < toMin(form.endTime) && (isoMin(s.endTime) || 24 * 60) > toMin(form.startTime),
      ),
  )
})

const dateFormatter = computed(
  () => new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', { timeStyle: 'short', hour12: false }),
)

function formatTime(iso) {
  return dateFormatter.value.format(new Date(iso))
}

const limits = bookingDateLimits()

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    const startTime = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const endTime = new Date(`${form.date}T${form.endTime}:00`).toISOString()

    const payload = {
      roomId: Number(form.roomId),
      title: form.title,
      startTime,
      endTime,
    }
    if (form.isRecurring && form.recurrenceUntil) {
      payload.recurrence = {
        freq: 'weekly',
        until: new Date(`${form.recurrenceUntil}T${form.endTime}:00`).toISOString(),
      }
    }

    const created = await bookingsStore.create(payload)
    // จองซ้ำรายสัปดาห์สร้างหลายรายการ - บอกจำนวนด้วย
    toast.success(
      created.length > 1
        ? t('toast.bookingSeriesCreated', { title: payload.title, n: created.length })
        : t('toast.bookingCreated', { title: payload.title }),
    )
    router.push({ name: 'room-booking-mine' })
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('roomBooking.newTab') }}</h1>

    <form class="no-required-note grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12" @submit.prevent="onSubmit">
      <div class="space-y-5">
        <p class="text-xs text-subtle">{{ t('common.requiredNote') }}</p>
        <div>
          <label for="book-title" class="label">{{ t('roomBooking.title') }}</label>
          <input id="book-title" v-model="form.title" type="text" required class="input" />
        </div>

        <div>
          <label for="book-room" class="label">{{ t('roomBooking.room') }}</label>
          <select id="book-room" v-model="form.roomId" required class="input">
            <option v-for="room in roomsStore.rooms" :key="room.id" :value="room.id">
              {{ room.name }}
            </option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div class="col-span-2 sm:col-span-1">
            <label class="label">{{ t('roomBooking.date') }}</label>
            <DatePicker
              v-model="form.date"
              :required="true"
              :min-date="limits.min"
              :max-date="limits.max"
            />
          </div>
          <div>
            <label class="label">{{ t('roomBooking.startTime') }}</label>
            <TimePicker v-model="form.startTime" :required="true" />
          </div>
          <div>
            <label class="label">{{ t('roomBooking.endTime') }}</label>
            <TimePicker v-model="form.endTime" :required="true" />
          </div>
        </div>

        <div>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
            <input v-model="form.isRecurring" type="checkbox" class="h-4 w-4 accent-black" />
            {{ t('roomBooking.recurring') }}
          </label>
          <div v-if="form.isRecurring" class="mt-3 max-w-xs">
            <label class="label">{{ t('roomBooking.recurUntil') }}</label>
            <DatePicker
              v-model="form.recurrenceUntil"
              :required="form.isRecurring"
              :min-date="form.date || limits.min"
              :max-date="limits.max"
            />
          </div>
        </div>

        <p v-if="errorCode" role="alert" class="text-sm text-danger">{{ t(`errors.${errorCode}`) }}</p>

        <div class="pt-1">
          <button type="submit" :disabled="isSubmitting || !form.roomId" class="btn btn-primary px-6">
            {{ t('roomBooking.submit') }}
          </button>
        </div>
      </div>

      <aside class="self-start rounded-card bg-surface p-5 lg:sticky lg:top-32">
        <h2 class="mb-3 text-sm font-semibold text-ink">{{ t('roomBooking.timelineTitle') }}</h2>
        <p v-if="isLoadingAvailability" class="text-sm text-subtle">{{ t('common.loading') }}</p>
        <template v-else>
          <p v-if="busySlots.length === 0" class="text-sm text-muted">{{ t('roomBooking.noBusySlots') }}</p>
          <p v-if="slotConflicts" role="alert" class="mt-2 text-sm text-danger">{{ t('roomBooking.slotConflict') }}</p>

          <ul v-if="busySlots.length" class="space-y-1.5">
            <li v-for="slot in busySlots" :key="slot.bookingId" class="text-sm">
              <span class="font-semibold text-ink">{{ formatTime(slot.startTime) }}–{{ formatTime(slot.endTime) }}</span>
              <span class="ml-2 text-muted">{{ slot.title }}</span>
            </li>
          </ul>

          <div v-if="slotValid" class="mt-5">
            <h3 class="mb-2 text-sm font-semibold text-ink">{{ t('roomBooking.otherFreeTitle') }}</h3>
            <p v-if="otherFreeRooms.length === 0" class="text-sm text-muted">{{ t('roomBooking.noOtherFree') }}</p>
            <ul v-else class="flex flex-wrap gap-2">
              <li v-for="r in otherFreeRooms" :key="r.id">
                <button type="button" class="filter-chip" :title="t('roomBooking.switchRoom')" @click="form.roomId = r.id">
                  {{ r.name }}
                </button>
              </li>
            </ul>
          </div>
        </template>
      </aside>
    </form>
  </section>
</template>

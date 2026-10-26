<script setup>
import { confirmDialog } from '@/utils/confirm'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { bookingDateLimits } from '@/utils/bookingWindow'
import { useI18n } from 'vue-i18n'
import { useBookingsStore } from '@/stores/bookings'
import { useToastStore } from '@/stores/toast'
import { ApiError, errorCodeOf } from '@/api/client'
import { toLocalDateStr, toLocalTimeStr, formatBookingRange, formatDateTimeDMY } from '@/utils/datetime'
import AppIcon from '@/components/common/AppIcon.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'

const { t } = useI18n()
const bookingsStore = useBookingsStore()
const toast = useToastStore()

const editingId = ref(null)
const form = reactive({ title: '', date: '', startTime: '', endTime: '' })
const errorCode = ref('')
const isSubmitting = ref(false)

const PAGE_SIZE = 10
const page = ref(1)
const pagedBookings = computed(() =>
  bookingsStore.bookings.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)
watch(
  () => bookingsStore.bookings.length,
  (n) => {
    const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (page.value > last) page.value = last
  },
)

onMounted(() => {
  bookingsStore.fetchMine()
})

function formatRange(booking) {
  return formatBookingRange(booking.startTime, booking.endTime)
}

const statusLabel = {
  Booked: 'statusBooked',
  CheckedIn: 'statusCheckedIn',
  AutoReleased: 'statusAutoReleased',
  Cancelled: 'statusCancelled',
}

const limits = bookingDateLimits()

function resetForm() {
  editingId.value = null
  form.title = ''
  form.date = ''
  form.startTime = ''
  form.endTime = ''
  errorCode.value = ''
}

function startEdit(booking) {
  editingId.value = booking.id
  const start = new Date(booking.startTime)
  const end = new Date(booking.endTime)
  form.title = booking.title
  form.date = toLocalDateStr(start)
  form.startTime = toLocalTimeStr(start)
  form.endTime = toLocalTimeStr(end)
  errorCode.value = ''
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    const startTime = new Date(`${form.date}T${form.startTime}:00`).toISOString()
    const endTime = new Date(`${form.date}T${form.endTime}:00`).toISOString()
    await bookingsStore.update(editingId.value, { title: form.title, startTime, endTime })
    toast.success(t('toast.bookingUpdated', { title: form.title }))
    resetForm()
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isSubmitting.value = false
  }
}

async function onCancel(booking) {
  if (!await confirmDialog(t('roomBooking.confirmCancel', { title: booking.title }), { danger: true })) return
  try {
    await bookingsStore.cancel(booking.id, 'single')
    toast.success(t('toast.bookingCancelled', { title: booking.title }))
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

async function onCancelSeries(booking) {
  if (!await confirmDialog(t('roomBooking.confirmCancelSeries', { title: booking.title }), { danger: true })) return
  try {
    await bookingsStore.cancel(booking.id, 'series')
    toast.success(t('toast.bookingSeriesCancelled', { title: booking.title }))
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}
function canCheckIn(booking) {
  if (booking.status !== 'Booked') return false
  const now = Date.now()
  const start = new Date(booking.startTime).getTime()
  const windowStart = start - 10 * 60 * 1000
  const windowEnd = start + 10 * 60 * 1000
  return now >= windowStart && now <= windowEnd
}

// เดิม error ของเช็คอินไปแสดงในฟอร์มแก้ไข ซึ่งแสดงเฉพาะตอนกำลังแก้ไข → ผู้ใช้ไม่เห็น ย้ายมาเป็น toast
async function onCheckIn(booking) {
  try {
    await bookingsStore.checkin(booking.id)
    toast.success(t('toast.checkedIn', { title: booking.title }))
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('roomBooking.mineTab') }}</h1>

    <form
      v-if="editingId"
      class="mb-6 grid grid-cols-1 gap-4 rounded-card bg-surface p-4 sm:grid-cols-5 sm:items-end"
      @submit.prevent="onSubmit"
    >
      <div class="sm:col-span-2">
        <label class="label">{{ t('roomBooking.title') }}</label>
        <input v-model="form.title" type="text" required class="w-full rounded-control border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="label">{{ t('roomBooking.date') }}</label>
        <DatePicker v-model="form.date" :required="true" :min-date="limits.min" :max-date="limits.max" />
      </div>
      <div>
        <label class="label">{{ t('roomBooking.startTime') }}</label>
        <TimePicker v-model="form.startTime" :required="true" />
      </div>
      <div>
        <label class="label">{{ t('roomBooking.endTime') }}</label>
        <TimePicker v-model="form.endTime" :required="true" />
      </div>
      <div class="flex gap-2 sm:col-span-5">
        <button
          type="submit"
          :disabled="isSubmitting"
          class="btn btn-primary"
        >
          {{ t('common.save') }}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          @click="resetForm"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
      <p v-if="errorCode" role="alert" class="text-sm text-red-600 sm:col-span-5">{{ t(`errors.${errorCode}`) }}</p>
    </form>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('roomBooking.title') }}</th>
            <th>{{ t('roomBooking.room') }}</th>
            <th>{{ t('roomBooking.when') }}</th>
            <th>{{ t('roomBooking.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="booking in pagedBookings" :key="booking.id">
            <td class="max-w-md py-3 font-medium break-words text-slate-900">{{ booking.title }}</td>
            <td class="py-3">{{ booking.roomName }}</td>
            <td class="py-3">{{ formatRange(booking) }}</td>
            <td class="py-3">
              <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="{
                  'bg-amber-100 text-amber-800': booking.status === 'Booked',
                  'bg-emerald-100 text-emerald-800': booking.status === 'CheckedIn',
                  'bg-red-100 text-red-800': booking.status === 'AutoReleased',
                  'bg-slate-100 text-slate-600': booking.status === 'Cancelled'
                }"
              >
                {{ t(`roomBooking.${statusLabel[booking.status]}`) }}
              </span>
              <p v-if="booking.status === 'CheckedIn' && booking.checkedInAt" class="mt-1 text-xs text-slate-500">
                {{ t('roomBooking.checkedInAt', { at: formatDateTimeDMY(booking.checkedInAt) }) }}
              </p>
            </td>
            <td class="whitespace-nowrap py-3 text-right">
              <template v-if="booking.status === 'Booked'">
                <button
                  v-if="canCheckIn(booking)"
                  type="button"
                  class="btn btn-sm mr-3 bg-emerald-600 text-white hover:bg-emerald-700"
                  @click="onCheckIn(booking)"
                >
                  {{ t('roomBooking.checkIn') }}
                </button>
                <button type="button" class="link-action" @click="startEdit(booking)">
                  {{ t('common.edit') }}
                </button>
                <button type="button" class="link-danger ml-3" @click="onCancel(booking)">
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-if="booking.recurrenceGroupId"
                  type="button"
                  class="link-danger ml-3"
                  @click="onCancelSeries(booking)"
                >
                  {{ t('roomBooking.cancelSeries') }}
                </button>
              </template>
              <span v-else-if="booking.status === 'CheckedIn'" class="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <AppIcon name="check" class="h-4 w-4" /> {{ t('roomBooking.statusCheckedIn') }}
              </span>
            </td>
          </tr>
          <tr v-if="bookingsStore.bookings.length === 0">
            <td colspan="5">
              <div class="empty-state">
                <p>{{ t('roomBooking.noBookings') }}</p>
                <RouterLink to="/bookings/rooms/new" class="btn btn-primary">
                  <AppIcon name="plus" />{{ t('roomBooking.newTab') }}
                </RouterLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="bookingsStore.bookings.length" :page-size="PAGE_SIZE" class="mt-4" />
  </section>
</template>

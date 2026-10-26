<script setup>
import { confirmDialog } from '@/utils/confirm'
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, errorCodeOf } from '@/api/client'
import { useRoomsStore } from '@/stores/rooms'
import { useToastStore } from '@/stores/toast'
import { formatBookingRange, formatDateTimeDMY, toLocalDateStr } from '@/utils/datetime'
import PaginationBar from '@/components/common/PaginationBar.vue'

// Admin: ดูการจองห้องของทุกคน - ใครจอง ห้องไหน เมื่อไหร่ จองไว้ตั้งแต่เมื่อไร สถานะเป็นยังไง (dev 2026-09-30)
// ดึงตามช่วงวันที่จาก API แล้วกรองห้อง/สถานะ/คำค้นฝั่งหน้าเว็บ (จะได้นับจำนวนแต่ละสถานะได้)
const { t } = useI18n()
const roomsStore = useRoomsStore()
const toast = useToastStore()

const PAGE_SIZE = 10
const STATUSES = ['Booked', 'CheckedIn', 'AutoReleased', 'Cancelled']
const statusStyle = {
  Booked: 'bg-amber-100 text-amber-800',
  CheckedIn: 'bg-emerald-100 text-emerald-800',
  AutoReleased: 'bg-red-100 text-red-800',
  Cancelled: 'bg-slate-100 text-slate-600',
}

// ช่วงวันที่: ทางลัด หรือกำหนดเอง
const RANGES = {
  today: [0, 1],
  next7: [0, 7],
  next30: [0, 30],
  past30: [-30, 1],
}
const rangeKey = ref('next7')
const customFrom = ref(toLocalDateStr(new Date()))
const customTo = ref(toLocalDateStr(new Date(Date.now() + 7 * 86400000)))

function dayStart(offsetDays) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d
}
const range = computed(() => {
  if (rangeKey.value === 'custom') {
    const from = new Date(`${customFrom.value}T00:00:00`)
    const to = new Date(`${customTo.value}T00:00:00`)
    to.setDate(to.getDate() + 1) // รวมวันสุดท้าย
    return { from, to }
  }
  const [a, b] = RANGES[rangeKey.value]
  return { from: dayStart(a), to: dayStart(b) }
})

const bookings = ref([])
const isLoading = ref(false)
const errorCode = ref('')

async function load() {
  const { from, to } = range.value
  if (!customFrom.value || !customTo.value || to <= from) return
  isLoading.value = true
  errorCode.value = ''
  try {
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
    const data = await api.get(`/bookings?${params}`)
    bookings.value = data.bookings
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isLoading.value = false
  }
}
watch(range, load)

onMounted(() => {
  load()
  roomsStore.fetchAll({ includeInactive: true }) // ห้องที่ปิดแล้วก็ยังมีประวัติให้ดู
})

// ---------- กรองฝั่งหน้าเว็บ ----------
const roomFilter = ref('')
const statusFilter = ref('')
const search = ref('')
const page = ref(1)

const baseFiltered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return bookings.value
    .filter((b) => !roomFilter.value || b.roomId === roomFilter.value)
    .filter((b) => !q || [b.title, b.ownerName, b.ownerDepartment].some((v) => v?.toLowerCase().includes(q)))
})
const statusCounts = computed(() => {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const b of baseFiltered.value) counts[b.status]++
  return counts
})
const filtered = computed(() =>
  statusFilter.value ? baseFiltered.value.filter((b) => b.status === statusFilter.value) : baseFiltered.value,
)
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

watch([roomFilter, statusFilter, search, range], () => {
  page.value = 1
})
watch(
  () => filtered.value.length,
  (n) => {
    const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (page.value > last) page.value = last
  },
)

// Admin ยกเลิกการจองที่ยังไม่จบได้ (ครั้งนี้ครั้งเดียว - ชุดรายสัปดาห์ให้ผู้จองหรือ Admin ยกเลิกทีละครั้ง)
function canCancel(b) {
  return b.status === 'Booked' && new Date(b.endTime) > new Date()
}
async function onCancel(b) {
  if (!await confirmDialog(t('roomBooking.adminConfirmCancel', { title: b.title, name: b.ownerName }), { danger: true })) return
  try {
    await api.delete(`/bookings/${b.id}?scope=single`)
    toast.success(t('roomBooking.adminCancelled', { title: b.title }))
    await load()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

const pillClass = (active) => [
  'seg-btn',
  active ? 'is-active' : '',
]
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('roomBooking.manageTab') }}</h1>

    <div class="filter-bar">
        <div>
          <p class="filter-label">{{ t('roomBooking.filterRange') }}</p>
          <div class="seg">
            <button
              v-for="key in ['today', 'next7', 'next30', 'past30', 'custom']"
              :key="key"
              type="button"
              :class="pillClass(rangeKey === key)"
              @click="rangeKey = key"
            >
              {{ t(`roomBooking.range.${key}`) }}
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
        <div class="w-full sm:ml-auto sm:w-52">
          <label for="mrb-room" class="filter-label">{{ t('roomBooking.room') }}</label>
          <select id="mrb-room" v-model="roomFilter" class="input">
            <option value="">{{ t('admin.filterAll') }}</option>
            <option v-for="r in roomsStore.rooms" :key="r.id" :value="r.id">
              {{ r.name }}<template v-if="!r.isActive"> ({{ t('admin.inactive') }})</template>
            </option>
          </select>
        </div>
        <div class="w-full sm:w-64">
          <label for="mrb-search" class="filter-label">{{ t('admin.filterSearch') }}</label>
          <input
            id="mrb-search"
            v-model="search"
            type="search"
            :placeholder="t('roomBooking.searchPlaceholder')"
            class="input"
          />
        </div>
    </div>
    <div class="filter-bar">
        <div>
          <p class="filter-label">{{ t('roomBooking.status') }}</p>
          <div class="seg">
            <button type="button" :class="pillClass(statusFilter === '')" @click="statusFilter = ''">
              {{ t('admin.filterAll') }} ({{ baseFiltered.length }})
            </button>
            <button
              v-for="s in STATUSES"
              :key="s"
              type="button"
              :class="pillClass(statusFilter === s)"
              @click="statusFilter = s"
            >
              {{ t(`roomBooking.status${s}`) }} ({{ statusCounts[s] }})
            </button>
          </div>
        </div>
    </div>

    <p v-if="errorCode" role="alert" class="mb-4 rounded-control bg-red-50 p-3 text-sm text-red-600">
      {{ t(`errors.${errorCode}`) }}
    </p>

    <div :class="['overflow-x-auto', isLoading ? 'opacity-60' : '']">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('roomBooking.when') }}</th>
            <th>{{ t('roomBooking.room') }}</th>
            <th>{{ t('roomBooking.title') }}</th>
            <th>{{ t('roomBooking.bookedBy') }}</th>
            <th>{{ t('roomBooking.status') }}</th>
            <th>{{ t('roomBooking.bookedAt') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in paged" :key="b.id" :class="['align-top', b.status === 'Cancelled' ? 'opacity-60' : '']">
            <td class="py-3 whitespace-nowrap font-medium text-ink">{{ formatBookingRange(b.startTime, b.endTime) }}</td>
            <td class="py-3 whitespace-nowrap">{{ b.roomName }}</td>
            <td class="max-w-md min-w-48 py-3 break-words text-ink">
              {{ b.title }}
              <span v-if="b.recurrenceGroupId" class="chip ml-1">{{ t('roomBooking.weekly') }}</span>
            </td>
            <td class="py-3">
              <p class="whitespace-nowrap font-medium text-ink">{{ b.ownerName }}</p>
              <p class="whitespace-nowrap text-xs text-muted">
                <span v-if="b.ownerDepartment">{{ b.ownerDepartment }}</span>
                <span v-if="b.ownerDepartment && b.ownerPhone"> • </span>
                <span v-if="b.ownerPhone">{{ b.ownerPhone }}</span>
              </p>
            </td>
            <td class="py-3">
              <span :class="['inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', statusStyle[b.status]]">
                {{ t(`roomBooking.status${b.status}`) }}
              </span>
              <p v-if="b.checkedInAt" class="mt-1 text-xs text-muted">
                {{ t('roomBooking.checkedInAt', { at: formatDateTimeDMY(b.checkedInAt) }) }}
              </p>
            </td>
            <td class="py-3 whitespace-nowrap text-xs text-muted">
              {{ formatDateTimeDMY(b.createdAt) }}
              <p v-if="b.status === 'Cancelled'" class="mt-1">
                {{ t('roomBooking.cancelledAt', { at: formatDateTimeDMY(b.updatedAt) }) }}
              </p>
            </td>
            <td class="py-3 text-right whitespace-nowrap">
              <button v-if="canCancel(b)" type="button" class="link-danger text-sm" @click="onCancel(b)">
                {{ t('common.cancel') }}
              </button>
            </td>
          </tr>
          <tr v-if="!isLoading && filtered.length === 0">
            <td colspan="7"><p class="empty-state">{{ t('roomBooking.noBookingsInRange') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="filtered.length" :page-size="PAGE_SIZE" class="mt-4" />
  </section>
</template>

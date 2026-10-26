<script setup>
import { confirmDialog } from '@/utils/confirm'
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'
import { useVehicleRequestsStore } from '@/stores/vehicleRequests'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { formatDateDMY, toLocalDateStr, toLocalTimeStr } from '@/utils/datetime'
import { groupShuttleTrips, tripAssignment } from '@/utils/shuttleRoutes'
import ShuttleTripModal from '@/components/ShuttleTripModal.vue'
import ShuttleDispatchPrintModal from '@/components/fleet/ShuttleDispatchPrintModal.vue'

// มุมมอง "รวมตามสาย" ของคำขอโอที - dev: "ถ้าต่างคนต่างขอ เราก็ไม่รู้ว่าสายนี้ทั้งหมดมีใครขึ้นบ้าง"
// ดูทีละวัน → รายการเที่ยว 1 แถว = 1 รอบ + 1 สาย (จำนวนคน + สถานะคนขับ) → กดดูใบรายชื่อใน modal
// (dev: การ์ด/ใบรายชื่อเต็มหน้าจะยาวเกินถ้าคนเยอะ ให้เป็นรายการแล้วกดดูแทน)
const props = defineProps({
  requests: { type: Array, required: true }, // หน้าแม่ส่งเฉพาะคำขอโอทีที่ยังไม่ยกเลิก
})
const emit = defineEmits(['view', 'assign', 'assign-trip'])
const { t } = useI18n()
const fleet = useFleetStore()
const requestsStore = useVehicleRequestsStore()
const toast = useToastStore()

const showPrintModal = ref(false)

const trips = computed(() => groupShuttleTrips(props.requests, fleet.shuttleRoutes))

const todayStr = toLocalDateStr(new Date())
// วันที่มีรถโอทีตั้งแต่วันนี้ - ใช้เป็นทางลัด และเป็นวันเริ่มต้น (ไม่ต้องไล่หาเองว่าวันไหนมีคำขอ)
const upcomingDates = computed(() => {
  const counts = new Map()
  for (const trip of trips.value) {
    if (trip.dateKey < todayStr) continue
    counts.set(trip.dateKey, (counts.get(trip.dateKey) ?? 0) + trip.riders.length)
  }
  return [...counts].map(([date, n]) => ({ date, n })).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10)
})

const selectedDate = ref(todayStr)
const userPicked = ref(false)
watch(upcomingDates, (dates) => {
  if (!userPicked.value && dates.length) selectedDate.value = dates[0].date
}, { immediate: true })

function pickDate(date) {
  userPicked.value = true
  selectedDate.value = date
  selectedKeys.value = new Set()
}

function shiftDay(delta) {
  const d = new Date(`${selectedDate.value}T00:00:00`)
  d.setDate(d.getDate() + delta)
  pickDate(toLocalDateStr(d))
}

// เที่ยวของวันที่เลือก (groupShuttleTrips เรียงเวลา/สายไว้แล้ว)
const dayTrips = computed(() => trips.value.filter((trip) => trip.dateKey === selectedDate.value))
const dayRiders = computed(() => dayTrips.value.reduce((n, trip) => n + trip.riders.length, 0))

// ---- สายรวม (Admin): ติ๊กเที่ยวของวันเดียวกัน ≥2 เที่ยวที่เวลา/ประเภทเดียวกัน แล้วรวมเป็นเที่ยวเดียว ----
const selectedKeys = ref(new Set())
const isCombining = ref(false)

function toggleSelect(key) {
  const next = new Set(selectedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedKeys.value = next
}

const selectedTrips = computed(() => dayTrips.value.filter((trip) => selectedKeys.value.has(trip.key)))

// รวมได้เมื่อเลือก ≥2 เที่ยว และเป็นเที่ยวเดียวกัน (เวลาออก/กลับ + ประเภทโอทีตรงกัน)
// เหตุผลที่รวมไม่ได้ (null = รวมได้ หรือเลือกยังไม่ถึง 2 เที่ยว) - แสดงเป็นข้อความเตือนข้างปุ่ม
const combineProblem = computed(() => {
  const list = selectedTrips.value
  if (list.length < 2) return null
  const [first] = list
  if (list.some((trip) => trip.otType !== first.otType)) return 'vehicleBooking.combineDifferentType'
  const sameTime = list.every(
    (trip) =>
      new Date(trip.departTime).getTime() === new Date(first.departTime).getTime() &&
      new Date(trip.returnTime).getTime() === new Date(first.returnTime).getTime(),
  )
  return sameTime ? null : 'vehicleBooking.combineDifferentTime'
})
const canCombine = computed(() => selectedTrips.value.length >= 2 && combineProblem.value === null)

const requestIdsOf = (trips) => [...new Set(trips.flatMap((trip) => trip.requests.map((r) => r.id)))]

async function runCombine(action, trips, successKey) {
  isCombining.value = true
  try {
    await requestsStore[action](requestIdsOf(trips))
    selectedKeys.value = new Set()
    toast.success(t(successKey))
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  } finally {
    isCombining.value = false
  }
}

const onCombine = () => runCombine('combineTrip', selectedTrips.value, 'vehicleBooking.combinedDone')
const onUncombine = async (trip) => {
  if (await confirmDialog(t('vehicleBooking.confirmUncombine'), { danger: true })) runCombine('uncombineTrip', [trip], 'vehicleBooking.uncombinedDone')
}

// เก็บ key ไม่ใช่ object - จัดรถแล้วหน้าแม่โหลดใหม่ modal จะเห็นข้อมูลล่าสุด
const openKey = ref(null)
const openTrip = computed(() => trips.value.find((trip) => trip.key === openKey.value) ?? null)

function assignmentText(trip) {
  const a = tripAssignment(trip)
  if (a.tone === 'pending') return t('vehicleBooking.noDriverYet')
  if (a.tone === 'done') return a.drivers[0]
  return t('vehicleBooking.assignedPartial', { done: a.done, total: a.total, drivers: a.drivers.join(', ') })
}

const toneClass = {
  done: 'text-emerald-700',
  partial: 'text-amber-700',
  pending: 'text-slate-400',
}
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <button
      type="button"
      class="btn btn-secondary"
      :aria-label="t('vehicleBooking.prevDay')"
      @click="shiftDay(-1)"
    >
      ◀
    </button>
    <div class="w-40">
      <DatePicker :model-value="selectedDate" @update:model-value="(v) => v && pickDate(v)" />
    </div>
    <button
      type="button"
      class="btn btn-secondary"
      :aria-label="t('vehicleBooking.nextDay')"
      @click="shiftDay(1)"
    >
      ▶
    </button>
    <button
      v-if="selectedDate !== todayStr"
      type="button"
      class="link-action text-sm"
      @click="pickDate(todayStr)"
    >
      {{ t('vehicleBooking.today') }}
    </button>

    <button
      v-if="selectedTrips.length"
      type="button"
      :disabled="!canCombine || isCombining"
      :title="canCombine ? '' : t('vehicleBooking.combineNeedSame')"
      class="btn btn-secondary"
      @click="onCombine"
    >
      {{ t('vehicleBooking.combineSelected', { n: selectedTrips.length }) }}
    </button>
    <p v-if="combineProblem" role="alert" class="flex items-center gap-1 text-sm text-danger">
      <AppIcon name="warning" class="h-4 w-4" /> {{ t(combineProblem) }}
    </p>

    <button
      v-if="dayTrips.length"
      type="button"
      class="btn btn-secondary"
      @click="showPrintModal = true"
    >
      <AppIcon name="document" class="mr-1" /> {{ t('fleet.printDispatch') }}
    </button>

    <div v-if="upcomingDates.length" class="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
      <span class="text-slate-500">{{ t('vehicleBooking.datesWithOt') }}</span>
      <button
        v-for="d in upcomingDates"
        :key="d.date"
        type="button"
        :class="[
          'cursor-pointer rounded-full px-2 py-0.5 ring-1',
          d.date === selectedDate
            ? 'bg-accent text-white ring-slate-900'
            : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
        ]"
        @click="pickDate(d.date)"
      >
        {{ formatDateDMY(new Date(`${d.date}T00:00:00`)).slice(0, 5) }} ({{ d.n }})
      </button>
    </div>
  </div>

  <p
    v-if="dayTrips.length === 0"
    class="empty-state"
  >
    {{ t('vehicleBooking.noOtOnDate', { date: formatDateDMY(new Date(`${selectedDate}T00:00:00`)) }) }}
  </p>

  <div v-else class="overflow-x-auto">
    <table class="data-table">
      <thead>
        <tr>
          <th class="w-10"></th>
          <th>{{ t('vehicleBooking.timeCol') }}</th>
          <th>{{ t('vehicleBooking.otRound') }}</th>
          <th>{{ t('vehicleBooking.shuttleRouteTitle') }}</th>
          <th class="text-right">{{ t('vehicleBooking.riderCount') }}</th>
          <th>{{ t('vehicleBooking.driver') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="trip in dayTrips"
          :key="trip.key"
          class="cursor-pointer hover:bg-slate-50"
          @click="openKey = trip.key"
        >
          <td @click.stop>
            <input
              type="checkbox"
              :checked="selectedKeys.has(trip.key)"
              :aria-label="t('vehicleBooking.selectTrip')"
              @change="toggleSelect(trip.key)"
            />
          </td>
          <!-- ดูทีละวันอยู่แล้ว - แสดงแค่เวลา -->
          <td class="whitespace-nowrap font-medium text-slate-900">
            {{ toLocalTimeStr(new Date(trip.departTime)) }} – {{ toLocalTimeStr(new Date(trip.returnTime)) }}
          </td>
          <td class="whitespace-nowrap">{{ t(`vehicleBooking.ot${trip.otType}`) }}</td>
          <td class="font-medium text-slate-900">
            <template v-if="trip.routeName">
              <AppIcon name="route" class="mr-1" />
              <span v-if="trip.isCombined" class="chip chip-solid mr-1">{{ t('vehicleBooking.combinedTrip') }}</span><span v-if="trip.combinedTripCode" class="mr-1 text-xs font-normal text-slate-500">{{ trip.combinedTripCode }}</span>{{ trip.routeName }}
            </template>
            <span v-else class="text-orange-600"><AppIcon name="warning" class="mr-1" /> {{ t('vehicleBooking.noShuttleRoute') }}</span>
            <span v-if="trip.requests.length > 1" class="ml-1 text-xs font-normal text-slate-500">
              ({{ t('vehicleBooking.fromRequests', { n: trip.requests.length }) }})
            </span>
          </td>
          <td class="text-right font-semibold text-slate-900">{{ trip.riders.length }}</td>
          <td :class="['py-3.5', toneClass[tripAssignment(trip).tone]]">
            <template v-if="tripAssignment(trip).tone === 'done'"><AppIcon name="checkCircle" class="mr-1" /> </template>{{ assignmentText(trip) }}
          </td>
          <td class="whitespace-nowrap text-right">
            <button
              v-if="trip.isCombined"
              type="button"
              :disabled="isCombining"
              class="btn btn-secondary btn-sm mr-2"
              @click.stop="onUncombine(trip)"
            >
              {{ t('vehicleBooking.uncombine') }}
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              @click.stop="openKey = trip.key"
            >
              {{ t('vehicleBooking.viewRiders') }}
            </button>
          </td>
        </tr>
      </tbody>
      <tfoot class="bg-slate-50 text-xs text-slate-500">
        <tr>
          <td colspan="4">{{ t('vehicleBooking.dayTotal') }}</td>
          <td class="text-right font-semibold">{{ dayRiders }}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <ShuttleTripModal
    v-if="openTrip"
    :trip="openTrip"
    @close="openKey = null"
    @view="emit('view', $event)"
    @assign="emit('assign', $event)"
    @assign-trip="emit('assign-trip', $event)"
  />

  <ShuttleDispatchPrintModal
    v-if="showPrintModal"
    :trips="dayTrips"
    @close="showPrintModal = false"
  />
</template>

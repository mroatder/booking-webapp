<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatTripRange } from '@/utils/datetime'
import { tripAssignment, summarizeShuttleRoutes } from '@/utils/shuttleRoutes'
import VehicleRequestStatusBadge from '@/components/VehicleRequestStatusBadge.vue'
import ShuttleDispatchPrintModal from '@/components/fleet/ShuttleDispatchPrintModal.vue'

// ใบรายชื่อขึ้นรถของเที่ยวเดียว (รอบ + สาย) - เปิดจากมุมมองรวมตามสาย
// คนเยอะก็เลื่อนอยู่ใน modal ไม่ดันหน้ารายการ (dev: กลัวคนเยอะแล้วแสดงผลไม่โอเค)
const props = defineProps({
  trip: { type: Object, required: true },
})
const emit = defineEmits(['close', 'view', 'assign', 'assign-trip'])
const { t } = useI18n()

const showPrintModal = ref(false)

const assignment = computed(() => tripAssignment(props.trip))

// จัดรถเป็นรายคำขอ - คำขอที่มีคนสายอื่นด้วย รถคันนี้จะถูกจัดให้คนสายอื่นในคำขอนั้นไปด้วย ต้องบอก Admin
function spansOtherRoutes(request) {
  return summarizeShuttleRoutes(request.passengers).routes.length > 1
}

function driverText(request) {
  return [request.driver.name, request.driver.licensePlate].filter(Boolean).join(' ')
}

// dialog จัดรถ/รายละเอียดคำขอเปิดซ้อนบนนี้ได้ - Esc ปิดเฉพาะตัวบนสุด
function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (document.querySelectorAll('[role="dialog"]').length > 1) return
  emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shuttle-trip-title"
      class="modal-panel max-h-[90vh] max-w-3xl"
    >
      <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div class="min-w-0">
          <h2 id="shuttle-trip-title" class="text-base font-bold text-slate-900">
            <template v-if="trip.routeName">
              <AppIcon name="route" class="mr-1" /> <span v-if="trip.isCombined">{{ t('vehicleBooking.combinedTrip') }}<template v-if="trip.combinedTripCode"> {{ trip.combinedTripCode }}</template>: </span>{{ trip.routeName }}
            </template>
            <span v-else class="text-orange-600"><AppIcon name="warning" class="mr-1" /> {{ t('vehicleBooking.noShuttleRoute') }}</span>
            <span class="font-normal text-slate-500"> • {{ t('vehicleBooking.passengersShort', { n: trip.riders.length }) }}</span>
          </h2>
          <p class="text-sm text-slate-500">
            {{ t(`vehicleBooking.ot${trip.otType}`) }} • {{ formatTripRange(trip.departTime, trip.returnTime) }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="showPrintModal = true"
          >
            <AppIcon name="document" class="mr-1" /> {{ t('fleet.printDispatch') }}
          </button>
          <button
            type="button"
            :aria-label="t('common.close')"
            class="cursor-pointer text-slate-400 hover:text-slate-600"
            @click="emit('close')"
          >
            <AppIcon name="close" class="h-5 w-5" />
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sticky top-0 w-10 bg-white text-right">#</th>
              <th v-if="trip.isCombined" class="sticky top-0 bg-white">{{ t('vehicleBooking.homeRoute') }}</th>
              <th class="sticky top-0 bg-white">{{ t('vehicleBooking.pickupStop') }}</th>
              <th class="sticky top-0 bg-white">{{ t('admin.fullName') }}</th>
              <th class="sticky top-0 bg-white">{{ t('admin.department') }}</th>
              <th class="sticky top-0 bg-white text-right">{{ t('vehicleBooking.requestNo') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(rider, i) in trip.riders" :key="`${rider.request.id}-${rider.id}`">
              <td class="text-right text-slate-400">{{ i + 1 }}</td>
              <td v-if="trip.isCombined">{{ rider.homeRouteName ?? '-' }}</td>
              <td>{{ rider.pickupStop ?? '-' }}</td>
              <td class="text-slate-900">{{ rider.fullName }}</td>
              <td class="text-slate-500">{{ rider.department ?? '-' }}</td>
              <td class="text-right">
                <button
                  type="button"
                  class="cursor-pointer text-xs text-slate-500 underline hover:text-slate-900"
                  :title="t('vehicleBooking.requestedBy', { name: rider.request.requesterName })"
                  @click="emit('view', rider.request)"
                >
                  {{ rider.request.requestNo }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- แต่ละคำขอยังจัดรถแยกกัน - สรุปผู้ขอ/คนขับ/สถานะของทุกคำขอในเที่ยวนี้ -->
      <div class="space-y-1.5 border-t border-slate-200 px-5 py-3 text-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-bold text-slate-800">
            {{ t('vehicleBooking.requestsInTrip', { n: assignment.total }) }}
          </p>
          <button
            v-if="trip.requests.length > 1"
            type="button"
            class="btn btn-primary btn-sm"
            @click="emit('assign-trip', trip.requests)"
          >
            {{ t('admin.assignWholeTrip') }}
          </button>
        </div>
        <div v-for="request in trip.requests" :key="request.id" class="flex flex-wrap items-center justify-between gap-2">
          <p class="min-w-0 text-slate-600">
            <button
              type="button"
              class="cursor-pointer font-medium underline hover:text-slate-900"
              @click="emit('view', request)"
            >
              {{ request.requestNo }}
            </button>
            {{ request.requesterName }} •
            <span :class="request.driver ? 'text-slate-900' : 'text-slate-400'">
              {{ request.driver ? driverText(request) : t('vehicleBooking.noDriverYet') }}
            </span>
            <span v-if="spansOtherRoutes(request)" class="block text-xs text-amber-700">
              <AppIcon name="warning" class="mr-1" /> {{ t('vehicleBooking.requestSpansRoutes') }}
            </span>
          </p>
          <div class="flex items-center gap-2">
            <VehicleRequestStatusBadge :status="request.status" />
            <button
              type="button"
              :class="[
                'cursor-pointer rounded-control px-2.5 py-1 text-xs font-medium',
                request.driver
                  ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-accent text-white hover:bg-accent-strong',
              ]"
              @click="emit('assign', request)"
            >
              {{ request.driver ? t('admin.changeDriver') : t('admin.assignDriver') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ShuttleDispatchPrintModal
      v-if="showPrintModal"
      :trips="[trip]"
      @close="showPrintModal = false"
    />
  </div>
</template>

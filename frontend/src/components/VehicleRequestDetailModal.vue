<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { safeUrl } from '@/utils/safeUrl'
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatTripRange, formatDateTimeDMY } from '@/utils/datetime'
import { summarizeShuttleRoutes, otTypeOf } from '@/utils/shuttleRoutes'
import VehicleRequestStatusBadge from '@/components/VehicleRequestStatusBadge.vue'
import AttachmentLinks from '@/components/AttachmentLinks.vue'
import AssignmentSummary from '@/components/AssignmentSummary.vue'
import { canAssign, canExportForm } from '@/utils/vehicleApproval'

// รายละเอียดคำขอรถแบบเต็ม (หน้าจัดการคำขอรถ) - ปิดด้วย Esc / คลิกพื้นหลัง / ปุ่มปิด
// ปุ่มจัดรถ/ยกเลิกส่ง event กลับให้หน้าแม่จัดการ (ใช้ flow เดิมของตาราง)
const props = defineProps({
  request: { type: Object, required: true },
})
const emit = defineEmits(['close', 'assign', 'cancel', 'export'])
const { t } = useI18n()

const passengers = computed(() => props.request.passengers ?? [])
const guestCount = computed(() => Math.max(0, props.request.passengerCount - passengers.value.length))
const isBusinessTrip = computed(() => props.request.requestType === 'BusinessTrip')

// รถโอที: สาย/จุดขึ้นรถของแต่ละคนเป็นสำเนา ณ ตอนส่งคำขอ (อยู่ใน p.routeName / p.pickupStop)
// สรุปสายที่ต้องวิ่ง เรียงจากคนมากสุด (ตรงกับที่ dialog จัดรถใช้แนะนำรถประจำสาย)
const routeSummary = computed(() => summarizeShuttleRoutes(passengers.value))

const stops = computed(() => [
  { key: 'pickup', label: t('vehicleBooking.pickupLocation'), place: props.request.pickupLocation, gate: props.request.pickupGate, map: props.request.pickupMapLink },
  { key: 'destination', label: t('vehicleBooking.destination'), place: props.request.destination, gate: props.request.destinationGate, map: props.request.destinationMapLink },
])

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const sectionTitle = 'mb-2 text-sm font-bold text-slate-800'
const approvalTone = { Approved: 'text-emerald-700', Rejected: 'text-red-700', Pending: 'text-sky-700' }
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vr-detail-title"
      class="modal-panel max-h-[90vh] max-w-3xl"
    >
      <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="vr-detail-title" class="text-base font-bold text-slate-900">
            {{ t('vehicleBooking.detailTitle', { no: request.requestNo }) }}
          </h2>
          <span
            :class="[
              'rounded-control px-1.5 py-0.5 text-xs font-semibold',
              isBusinessTrip ? 'bg-accent-soft text-accent' : 'bg-amber-100 text-amber-700',
            ]"
          >
            {{ isBusinessTrip ? t('vehicleBooking.businessTripShort') : t('vehicleBooking.otShort') }}
          </span>
          <VehicleRequestStatusBadge :status="request.status" :approval-status="request.approvalStatus" />
        </div>
        <button
          type="button"
          :aria-label="t('common.close')"
          class="cursor-pointer text-slate-400 hover:text-slate-600"
          @click="emit('close')"
        >
          <AppIcon name="close" class="h-5 w-5" />
        </button>
      </div>

      <div class="flex-1 space-y-5 overflow-y-auto p-5 text-sm text-slate-700">
        <div class="grid gap-5 sm:grid-cols-2">
          <section>
            <h3 :class="sectionTitle">{{ t('vehicleBooking.requester') }}</h3>
            <p class="font-medium text-slate-900">{{ request.requesterName }}</p>
            <p v-if="request.requesterDepartment" class="text-slate-500">{{ request.requesterDepartment }}</p>
            <p><AppIcon name="phone" class="mr-1" /> {{ request.contactPhone }}</p>
            <p class="mt-1 text-xs text-slate-400">
              {{ t('vehicleBooking.requestedAt', { at: formatDateTimeDMY(request.createdAt) }) }}
            </p>
          </section>

          <section>
            <h3 :class="sectionTitle">{{ t('vehicleBooking.when') }}</h3>
            <p class="font-medium text-slate-900">{{ formatTripRange(request.departTime, request.returnTime) }}</p>
            <p v-if="isBusinessTrip">{{ t(`vehicleBooking.trip${request.tripType ?? 'RoundTrip'}`) }}</p>
            <p>
              {{ t(`vehicleBooking.type${request.vehicleType}`) }} •
              {{ t('vehicleBooking.passengersShort', { n: request.passengerCount }) }}
            </p>
          </section>
        </div>

        <!-- รถโอที = ชื่อสายรถ (จุดรับ/ปลายทางเป็นแค่ข้อความตามประเภทเที่ยว), รถนอก = จุดรับ → ปลายทาง + แผนที่ -->
        <section v-if="!isBusinessTrip">
          <h3 :class="sectionTitle">
            {{ t('vehicleBooking.shuttleRouteTitle') }}
            <span class="font-normal text-slate-500">({{ t(`vehicleBooking.ot${otTypeOf(request)}`) }})</span>
          </h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="r in routeSummary.routes"
              :key="r.name"
              class="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-800 ring-1 ring-amber-200"
            >
              <AppIcon name="route" class="mr-1" /> {{ r.name }} • {{ t('vehicleBooking.passengersShort', { n: r.n }) }}
            </span>
            <span
              v-if="routeSummary.noRoute"
              class="rounded-full bg-orange-50 px-2.5 py-1 text-sm font-medium text-orange-700 ring-1 ring-orange-200"
            >
              <AppIcon name="warning" class="mr-1" /> {{ t('vehicleBooking.noShuttleRouteCount', { n: routeSummary.noRoute }) }}
            </span>
          </div>
        </section>

        <section v-else>
          <h3 :class="sectionTitle">{{ t('vehicleBooking.tripRouteTitle') }}</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <div v-for="stop in stops" :key="stop.key" class="rounded-card bg-surface px-3 py-2">
              <p class="text-xs text-slate-500">{{ stop.label }}</p>
              <p class="font-medium text-slate-900">{{ stop.place }}</p>
              <p v-if="stop.gate" class="text-sm text-slate-700">{{ t('vehicleBooking.gateValue', { gate: stop.gate }) }}</p>
              <a
                v-if="safeUrl(stop.map)"
                :href="safeUrl(stop.map)"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-slate-600 underline hover:text-slate-900"
              ><AppIcon name="mapPin" class="mr-1" /> {{ t('vehicleBooking.openMap') }}</a>
            </div>
          </div>
        </section>

        <!-- เหตุผล + การอนุมัติของหัวหน้า (รถนอก) - ข้อมูลชุดเดียวกับในแบบฟอร์ม W-HR-009 -->
        <section v-if="isBusinessTrip && request.approvalStatus !== 'NotRequired'">
          <h3 :class="sectionTitle">{{ t('approvals.section') }}</h3>
          <p v-if="request.reason"><span class="text-slate-500">{{ t('vehicleBooking.reason') }}:</span> {{ request.reason }}</p>
          <p>
            <span class="text-slate-500">{{ t('vehicleBooking.approver') }}:</span>
            {{ request.approver?.name }}
            <span v-if="request.approver?.level" class="text-slate-500">({{ t('approvals.levelN', { n: request.approver.level }) }})</span>
          </p>
          <p>
            <span class="text-slate-500">{{ t('approvals.result') }}:</span>
            <span :class="approvalTone[request.approvalStatus]"> {{ t(`approvals.status${request.approvalStatus}`) }}</span>
            <span v-if="request.approvedAt" class="text-xs text-slate-400"> • {{ formatDateTimeDMY(request.approvedAt) }}</span>
          </p>
          <p v-if="request.approvalNote" class="text-red-700">{{ t('approvals.rejectReason') }}: {{ request.approvalNote }}</p>
          <p v-if="request.approvalStatus === 'Approved' && request.approver && !request.approver.hasSignature" class="mt-1 text-xs text-amber-700">
            {{ t('approvals.noSignatureYet') }}
          </p>
        </section>

        <section>
          <h3 :class="sectionTitle">
            {{ t('vehicleBooking.passengerList') }}
            <span class="font-normal text-slate-500">
              <!-- รถโอทีมีแต่พนักงาน - นับแขกเฉพาะรถนอก -->
              <template v-if="isBusinessTrip">
                ({{ t('vehicleBooking.passengerBreakdown', { staff: passengers.length, guests: guestCount }) }})
              </template>
              <template v-else>({{ t('vehicleBooking.passengersShort', { n: passengers.length }) }})</template>
            </span>
          </h3>
          <ul v-if="passengers.length" class="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <li v-for="p in passengers" :key="p.id">
              {{ p.fullName }}<span v-if="p.department" class="text-slate-500"> - {{ p.department }}</span>
              <template v-if="!isBusinessTrip">
                <span v-if="p.routeName" class="block text-xs text-slate-500">
                  <AppIcon name="route" class="mr-1" /> {{ p.routeName }} • {{ p.pickupStop }}
                </span>
                <span v-else class="block text-xs text-orange-500"><AppIcon name="warning" class="mr-1" /> {{ t('vehicleBooking.noShuttleRoute') }}</span>
              </template>
            </li>
          </ul>
          <p v-else class="text-slate-400">{{ t('vehicleBooking.noStaffPassengers') }}</p>
        </section>

        <section v-if="request.attachments?.length">
          <h3 :class="sectionTitle">{{ t('vehicleBooking.attachments') }}</h3>
          <AttachmentLinks :request-id="request.id" :attachments="request.attachments" />
        </section>

        <section>
          <h3 :class="sectionTitle">{{ t('vehicleBooking.driver') }}</h3>
          <template v-if="request.driver">
            <AssignmentSummary :assignment="request.driver" />
            <p v-if="request.assignedByName" class="mt-1 text-xs text-slate-400">
              {{ t('vehicleBooking.assignedBy', { name: request.assignedByName, at: formatDateTimeDMY(request.assignedAt) }) }}
            </p>
          </template>
          <p v-else class="text-slate-400">{{ t('vehicleBooking.noDriverYet') }}</p>
        </section>
      </div>

      <div class="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button
          v-if="canExportForm(request)"
          type="button"
          class="btn btn-secondary mr-auto"
          :title="t('approvals.exportFormHint')"
          @click="emit('export', request)"
        >
          {{ t('approvals.exportForm') }}
        </button>
        <template v-if="request.status !== 'Cancelled'">
          <button
            type="button"
            class="btn btn-secondary text-red-600"
            @click="emit('cancel', request)"
          >
            {{ t('admin.cancelRequest') }}
          </button>
          <button
            type="button"
            :disabled="!canAssign(request)"
            :title="canAssign(request) ? '' : t('approvals.assignAfterApproval')"
            class="btn btn-primary"
            @click="emit('assign', request)"
          >
            {{ request.driver ? t('admin.changeDriver') : t('admin.assignDriver') }}
          </button>
        </template>
        <button
          type="button"
          class="btn btn-secondary"
          @click="emit('close')"
        >
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>

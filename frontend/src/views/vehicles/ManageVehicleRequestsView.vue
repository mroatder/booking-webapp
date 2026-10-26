<script setup>
import { confirmDialog } from '@/utils/confirm'
import AppIcon from '@/components/common/AppIcon.vue'
import { safeUrl } from '@/utils/safeUrl'
import ManageViewSwitch from '@/components/fleet/ManageViewSwitch.vue'
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVehicleRequestsStore } from '@/stores/vehicleRequests'
import { useFleetStore } from '@/stores/fleet'
import { summarizeShuttleRoutes, otTypeOf } from '@/utils/shuttleRoutes'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { formatTripRange } from '@/utils/datetime'
import { canAssign, canExportForm } from '@/utils/vehicleApproval'
import VehicleRequestStatusBadge from '@/components/VehicleRequestStatusBadge.vue'
import AttachmentLinks from '@/components/AttachmentLinks.vue'
import AssignVehicleDialog from '@/components/AssignVehicleDialog.vue'
import VehicleRequestDetailModal from '@/components/VehicleRequestDetailModal.vue'
import ShuttleTripGroups from '@/components/ShuttleTripGroups.vue'
import AssignmentSummary from '@/components/AssignmentSummary.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import CarBookingFormModal from '@/components/fleet/CarBookingFormModal.vue'

const { t } = useI18n()
const store = useVehicleRequestsStore()
const toast = useToastStore()
const fleet = useFleetStore()
// ชื่อสายของคำขอโอทีมาจากข้อมูลผู้โดยสารรถรับส่ง (คำขอไม่ได้เก็บสายไว้), ลำดับจุดจอดมาจากสายรถ
fleet.fetchShuttleRoutes()
const shuttleSummaries = computed(() => {
  const map = new Map()
  for (const r of pagedRequests.value) {
    if (r.requestType === 'Shuttle') map.set(r.id, summarizeShuttleRoutes(r.passengers))
  }
  return map
})

const statusFilter = ref('Pending')
const filters = ['Pending', 'Assigned', 'Cancelled', '']

// กรองประเภทคำขอฝั่งหน้าเว็บ - หน้าเดียวกันเพราะรถ/คนขับชุดเดียวกัน (dev เห็นด้วย 2026-09-29)
const typeFilter = ref('')
const typeFilters = ['', 'BusinessTrip', 'Shuttle']
// รถโอทีมีมุมมอง "รวมตามสาย": ต่างคนต่างขอ → รวมให้เห็นว่าเที่ยว/สายนี้มีใครขึ้นบ้าง
const viewMode = ref('list')
const isByRoute = computed(() => typeFilter.value === 'Shuttle' && viewMode.value === 'byRoute')

const PAGE_SIZE = 15
const page = ref(1)

const filteredRequests = computed(() =>
  typeFilter.value ? store.requests.filter((r) => r.requestType === typeFilter.value) : store.requests,
)
const pagedRequests = computed(() =>
  filteredRequests.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

// รวมตามสาย: ทุกสถานะที่ยังไม่ยกเลิก (ไม่สนตัวกรองสถานะ) - เลือกวันที่ในมุมมองนั้นเอง
const tripRequests = computed(() => filteredRequests.value.filter((r) => r.status !== 'Cancelled'))

function reload() {
  return store.fetch({ mine: false, status: isByRoute.value ? undefined : statusFilter.value || undefined })
}

watch([statusFilter, isByRoute], () => {
  page.value = 1
  reload()
}, { immediate: true })
watch(typeFilter, () => {
  page.value = 1
})

watch(
  () => filteredRequests.value.length,
  (n) => {
    const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (page.value > last) page.value = last
  },
)

// คำขอที่กำลังเปิด dialog จัดรถ (null = ปิด), assigningTrip = ทุกคำขอของเที่ยวโอทีที่จัดพร้อมกัน
const assigning = ref(null)
const assigningTrip = ref(null)

function assignTrip(requests) {
  assigningTrip.value = requests
  assigning.value = requests[0]
}

function closeAssign() {
  assigning.value = null
  assigningTrip.value = null
}

const exportingRequest = ref(null)

// แบบฟอร์ม W-HR-009 (PDF) ส่งบริษัทรถ - เปิดหน้าต่างพิมพ์ พรีวิวในระบบ แล้วเลือกบันทึกเป็น PDF
function exportForm(request) {
  exportingRequest.value = request
}

// คำขอที่กำลังดูรายละเอียด (null = ปิด) - กดจัดรถ/ยกเลิกใน modal แล้วปิด modal ไปใช้ flow เดิม
const viewing = ref(null)

function assignFromDetail(request) {
  viewing.value = null
  assigning.value = request
}

function cancelFromDetail(request) {
  viewing.value = null
  onCancel(request)
}

async function onAssigned() {
  closeAssign()
  await reload()
}

async function onCancel(request) {
  if (
    !await confirmDialog(t('admin.confirmCancelRequest', { name: request.requesterName, destination: request.destination }), { danger: true })
  ) {
    return
  }
  try {
    await store.cancel(request.id)
    toast.success(t('toast.vehicleRequestCancelled', { destination: request.destination }))
    await reload()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

function filterLabel(status) {
  return status ? t(`vehicleBooking.status${status}`) : t('admin.filterAll')
}

function typeLabel(type) {
  if (type === 'BusinessTrip') return t('vehicleBooking.businessTripShort')
  if (type === 'Shuttle') return t('vehicleBooking.otShort')
  return t('admin.filterAll')
}


const pillClass = (active) => [
  'seg-btn',
  active ? 'is-active' : '',
]
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('admin.vehicleRequests') }}</h1>

    <!-- แถบตัวกรอง: แต่ละกลุ่มมีหัวข้อกำกับ (dev: ปุ่มเรียงติดกันเป็นแถวเดียวแล้วแยกไม่ออกว่าอันไหนกรองอะไร) -->
    <div class="filter-bar">
      <div>
        <p class="filter-label">{{ t('admin.filterTypeLabel') }}</p>
        <div class="seg">
          <button
            v-for="type in typeFilters"
            :key="type || 'all'"
            type="button"
            :class="pillClass(typeFilter === type)"
            @click="typeFilter = type"
          >
            {{ typeLabel(type) }}
          </button>
        </div>
      </div>

      <div>
        <p class="filter-label">{{ t('admin.filterStatusLabel') }}</p>
        <!-- รวมตามสายไม่ใช้ตัวกรองสถานะ (แสดงทุกคำขอที่ยังไม่ยกเลิก) - บอกไว้แทนการซ่อนกลุ่ม ปุ่มจะได้ไม่กระโดด -->
        <p v-if="isByRoute" class="py-1.5 text-xs text-muted">{{ t('admin.byRouteStatusNote') }}</p>
        <div v-else class="seg">
          <button
            v-for="status in filters"
            :key="status || 'all'"
            type="button"
            :class="pillClass(statusFilter === status)"
            @click="statusFilter = status"
          >
            {{ filterLabel(status) }}
          </button>
        </div>
      </div>

      <div v-if="typeFilter === 'Shuttle'">
        <p class="filter-label">{{ t('admin.viewModeLabel') }}</p>
        <div class="seg">
          <button type="button" :class="pillClass(viewMode === 'list')" @click="viewMode = 'list'">
            {{ t('admin.viewList') }}
          </button>
          <button type="button" :class="pillClass(viewMode === 'byRoute')" @click="viewMode = 'byRoute'">
            {{ t('admin.viewByRoute') }}
          </button>
        </div>
      </div>

      <ManageViewSwitch class="sm:ml-auto" />
    </div>

    <template v-if="isByRoute">
      <ShuttleTripGroups :requests="tripRequests" @view="viewing = $event" @assign="assigning = $event" @assign-trip="assignTrip" />
    </template>


    <div v-else class="overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th class="xl:w-56">{{ t('vehicleBooking.requester') }}</th>
            <th class="xl:w-52">{{ t('vehicleBooking.when') }}</th>
            <th>{{ t('vehicleBooking.route') }}</th>
            <th class="xl:w-40">{{ t('vehicleBooking.driver') }}</th>
            <th class="xl:w-32">{{ t('vehicleBooking.status') }}</th>
            <th class="xl:w-64"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="request in pagedRequests" :key="request.id" class="align-top">
            <td class="py-3">
              <p class="font-mono text-xs tracking-tight text-subtle">{{ request.requestNo }}</p>
              <p class="font-semibold text-ink">{{ request.requesterName }}</p>
              <p class="text-xs text-muted">
                <span v-if="request.requesterDepartment">{{ request.requesterDepartment }} • </span>{{ request.contactPhone }}
              </p>
            </td>
            <td class="py-3 text-ink xl:whitespace-nowrap">
              {{ formatTripRange(request.departTime, request.returnTime) }}
            </td>
            <td class="py-3 text-ink">
              <template v-if="request.requestType === 'Shuttle'">
                <p class="flex flex-wrap gap-x-3 gap-y-1">
                  <span v-for="r in shuttleSummaries.get(request.id).routes" :key="r.name" class="font-medium">
                    <AppIcon name="route" class="mr-1" />{{ r.name }} ({{ r.n }})
                  </span>
                  <span v-if="shuttleSummaries.get(request.id).noRoute" class="text-xs text-orange-700">
                    <AppIcon name="warning" class="mr-1" />{{ t('vehicleBooking.noShuttleRouteCount', { n: shuttleSummaries.get(request.id).noRoute }) }}
                  </span>
                </p>
              </template>
              <p v-else>
                {{ request.pickupLocation }}
                <AppIcon name="arrowRight" class="mx-0.5 h-3.5 w-3.5 text-subtle" />
                {{ request.destination }}
              </p>
              <p class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span :class="['chip', request.requestType === 'BusinessTrip' ? 'chip-accent' : '']">
                  {{ request.requestType === 'BusinessTrip' ? t('vehicleBooking.businessTripShort') : t('vehicleBooking.otShort') }}
                </span>
                <span class="chip">{{ t(`vehicleBooking.type${request.vehicleType}`) }} · {{ t('vehicleBooking.passengersShort', { n: request.passengerCount }) }}</span>
                <span v-if="request.requestType === 'Shuttle'" class="chip">{{ t(`vehicleBooking.ot${otTypeOf(request)}`) }}</span>
                <span v-else class="chip">{{ t(`vehicleBooking.trip${request.tripType ?? 'RoundTrip'}`) }}</span>
                <a
                  v-if="safeUrl(request.pickupMapLink)"
                  :href="safeUrl(request.pickupMapLink)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="link-action text-xs underline"
                ><AppIcon name="mapPin" class="mr-0.5" />{{ t('vehicleBooking.pickupMap') }}</a>
                <a
                  v-if="safeUrl(request.destinationMapLink)"
                  :href="safeUrl(request.destinationMapLink)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="link-action text-xs underline"
                ><AppIcon name="mapPin" class="mr-0.5" />{{ t('vehicleBooking.destinationMap') }}</a>
              </p>
              <AttachmentLinks :request-id="request.id" :attachments="request.attachments" class="mt-1.5" />
            </td>
            <td class="min-w-[5.5rem] py-3 text-ink">
              <AssignmentSummary v-if="request.driver" :assignment="request.driver" compact />
              <span v-else class="text-subtle">{{ t('vehicleBooking.noDriverYet') }}</span>
            </td>
            <td class="py-3 whitespace-nowrap"><VehicleRequestStatusBadge :status="request.status" :approval-status="request.approvalStatus" /></td>
            <td class="py-3">
              <div class="row-actions">
                <button
                  v-if="request.status !== 'Cancelled'"
                  type="button"
                  :disabled="!canAssign(request)"
                  :title="canAssign(request) ? '' : t('approvals.assignAfterApproval')"
                  class="btn btn-primary btn-sm"
                  @click="assigning = request"
                >
                  {{ request.driver ? t('admin.changeDriver') : t('admin.assignDriver') }}
                </button>
                <div class="row-actions-links">
                  <button type="button" class="link-action" @click="viewing = request">
                    {{ t('vehicleBooking.details') }}
                  </button>
                  <template v-if="request.status !== 'Cancelled'">
                    <button
                      v-if="canExportForm(request)"
                      type="button"
                      class="link-action"
                      :title="t('approvals.exportFormHint')"
                      @click="exportForm(request)"
                    >
                      {{ t('approvals.exportFormShort') }}
                    </button>
                    <button type="button" class="link-danger" @click="onCancel(request)">
                      {{ t('common.cancel') }}
                    </button>
                  </template>
                </div>
              </div>
            </td>
          </tr>
          <tr v-if="!store.isLoading && filteredRequests.length === 0">
            <td colspan="6"><p class="empty-state">{{ t('vehicleBooking.noRequests') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar
      v-if="!isByRoute"
      v-model:page="page"
      :total="filteredRequests.length"
      :page-size="PAGE_SIZE"
      class="mt-4"
    />

    <VehicleRequestDetailModal
      v-if="viewing"
      :request="viewing"
      @close="viewing = null"
      @assign="assignFromDetail"
      @export="exportForm"
      @cancel="cancelFromDetail"
    />
    <AssignVehicleDialog
      v-if="assigning"
      :key="assigningTrip ? `trip-${assigning.id}` : assigning.id"
      :request="assigning"
      :trip-requests="assigningTrip"
      @close="closeAssign"
      @assigned="onAssigned"
    />
    <CarBookingFormModal
      v-if="exportingRequest"
      :request="exportingRequest"
      @close="exportingRequest = null"
    />
  </section>
</template>

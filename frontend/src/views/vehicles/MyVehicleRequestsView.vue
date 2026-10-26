<script setup>
import { confirmDialog } from '@/utils/confirm'
import AppIcon from '@/components/common/AppIcon.vue'
import { safeUrl } from '@/utils/safeUrl'
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVehicleRequestsStore } from '@/stores/vehicleRequests'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { formatTripRange } from '@/utils/datetime'
import VehicleRequestForm from '@/components/VehicleRequestForm.vue'
import VehicleRequestStatusBadge from '@/components/VehicleRequestStatusBadge.vue'
import AttachmentLinks from '@/components/AttachmentLinks.vue'
import AssignmentSummary from '@/components/AssignmentSummary.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'

const { t } = useI18n()
const store = useVehicleRequestsStore()
const toast = useToastStore()

const editing = ref(null)
const editSection = ref(null)

// แสดงหน้าละ 7 รายการ เรียงจากคำขอที่ส่งล่าสุด (dev ยืนยัน 2026-09-29)
// คำขอของตัวเองโหลดมาทั้งหมดอยู่แล้ว (ไม่เยอะ) จึงแบ่งหน้าฝั่งหน้าเว็บ
const PAGE_SIZE = 7
const page = ref(1)
const sortedRequests = computed(() =>
  [...store.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id),
)
const pagedRequests = computed(() => sortedRequests.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
// ยกเลิก/โหลดใหม่แล้วจำนวนลดลง - อย่าค้างอยู่หน้าที่ไม่มีแล้ว
watch(
  () => store.requests.length,
  (n) => {
    const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (page.value > last) page.value = last
  },
)

// ฟอร์มแก้ไขอยู่บนสุดของหน้า - กดแก้ไขจากหน้าท้ายๆ แล้วเลื่อนขึ้นไปให้เห็นฟอร์ม
async function startEdit(request) {
  editing.value = request
  await nextTick()
  editSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  store.fetch({ mine: true })
})

async function onSave(payload) {
  // backend บังคับ requestType ทุกครั้ง - ใช้ประเภทเดิมของคำขอ (เปลี่ยนประเภทตอนแก้ไขไม่ได้)
  await store.update(editing.value.id, { ...payload, requestType: editing.value.requestType })
  toast.success(t('toast.vehicleRequestUpdated', { destination: payload.destination }))
  editing.value = null
}

async function onCancel(request) {
  if (!await confirmDialog(t('vehicleBooking.confirmCancel', { destination: request.destination }), { danger: true })) return
  try {
    await store.cancel(request.id)
    toast.success(t('toast.vehicleRequestCancelled', { destination: request.destination }))
    await store.fetch({ mine: true })
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
    // สถานะอาจเปลี่ยนไปแล้ว (เช่น Admin เพิ่งจัดคนขับ) - โหลดใหม่ให้เห็นสถานะจริง
    await store.fetch({ mine: true })
  }
}
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('vehicleBooking.mineTab') }}</h1>

    <div v-if="editing" ref="editSection" class="mb-6 scroll-mt-4">
      <h2 class="mb-3 text-base font-semibold text-ink">{{ t('vehicleBooking.editTitle') }}</h2>
      <VehicleRequestForm
        :request="editing"
        :request-type="editing.requestType"
        :submit-label="t('common.save')"
        :on-save="onSave"
        @cancel="editing = null"
      />
    </div>


    <p v-if="store.isLoading && store.requests.length === 0" class="text-sm text-subtle">
      {{ t('common.loading') }}
    </p>
    <div v-else-if="store.requests.length === 0" class="empty-state">
      <p>{{ t('vehicleBooking.noRequests') }}</p>
      <RouterLink to="/requests/vehicles/business-trip" class="btn btn-primary">
        <AppIcon name="plus" />{{ t('nav.requestOutside') }}
      </RouterLink>
    </div>

    <!-- 1 คำขอ = 1 แถว: เส้นทาง/เวลา/ชิป | คนขับ+รถ | สถานะ | ปุ่ม -->
    <div v-else class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('vehicleBooking.route') }}</th>
            <th>{{ t('vehicleBooking.driver') }}</th>
            <th>{{ t('vehicleBooking.status') }}</th>
            <th class="w-40"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="request in pagedRequests" :key="request.id" :class="['align-top', request.status === 'Cancelled' ? 'opacity-60' : '']">
            <td class="py-3">
              <p class="font-semibold text-ink" :title="`${request.pickupLocation} → ${request.destination}`">
                {{ request.pickupLocation }}
                <AppIcon name="arrowRight" class="mx-0.5 h-3.5 w-3.5 text-subtle" />
                {{ request.destination }}
              </p>
              <p class="text-ink">{{ formatTripRange(request.departTime, request.returnTime) }}</p>
              <p class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span class="chip">
                  <template v-if="request.requestType === 'BusinessTrip'">{{ t(`vehicleBooking.trip${request.tripType ?? 'RoundTrip'}`) }}</template>
                  <template v-else>{{ t('vehicleBooking.otShort') }}</template>
                </span>
                <span class="chip">{{ t(`vehicleBooking.type${request.vehicleType}`) }} · {{ t('vehicleBooking.passengersShort', { n: request.passengerCount }) }}</span>
                <span class="font-mono text-xs tracking-tight text-subtle">{{ request.requestNo }}</span>
                <a
                  v-if="safeUrl(request.pickupMapLink)"
                  :href="safeUrl(request.pickupMapLink)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="link-action text-xs"
                ><AppIcon name="mapPin" class="mr-1" />{{ t('vehicleBooking.pickupMap') }}</a>
                <a
                  v-if="safeUrl(request.destinationMapLink)"
                  :href="safeUrl(request.destinationMapLink)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="link-action text-xs"
                ><AppIcon name="mapPin" class="mr-1" />{{ t('vehicleBooking.destinationMap') }}</a>
              </p>
              <AttachmentLinks :request-id="request.id" :attachments="request.attachments" class="mt-1" />
              <p v-if="request.approver && request.approvalStatus !== 'NotRequired'" class="mt-1 text-xs text-muted">
                {{ t('vehicleBooking.approverLine', { name: request.approver.name }) }}
              </p>
              <p v-if="request.approvalStatus === 'Rejected' && request.status === 'Pending'" class="mt-1 text-xs text-danger">
                {{ t('approvals.rejectReason') }}: {{ request.approvalNote }}
              </p>
            </td>
            <td class="py-3">
              <AssignmentSummary v-if="request.driver" :assignment="request.driver" compact />
              <span v-else class="text-subtle">{{ t('vehicleBooking.noDriverYet') }}</span>
            </td>
            <td class="py-3 whitespace-nowrap"><VehicleRequestStatusBadge :status="request.status" :approval-status="request.approvalStatus" /></td>
            <td class="py-3 text-right">
              <div v-if="request.status === 'Pending'" class="row-actions-links justify-end">
                <button type="button" class="link-action" @click="startEdit(request)">{{ t('common.edit') }}</button>
                <button type="button" class="link-danger" @click="onCancel(request)">{{ t('common.cancel') }}</button>
              </div>
              <p v-else-if="request.status === 'Assigned'" class="text-xs leading-tight text-subtle" :title="t('vehicleBooking.contactAdminToCancel')">
                {{ t('vehicleBooking.contactAdminShort') }}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="sortedRequests.length" :page-size="PAGE_SIZE" class="mt-4" />
  </section>
</template>

<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, errorCodeOf } from '@/api/client'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { formatTripRange, formatDateTimeDMY } from '@/utils/datetime'
import VehicleRequestStatusBadge from '@/components/VehicleRequestStatusBadge.vue'
import FormModal from '@/components/FormModal.vue'

// หน้ารออนุมัติ (ผู้มีระดับอนุมัติ) - คำขอรถไปงานนอกที่ผู้ขอเลือกฉันเป็นผู้อนุมัติ (dev+HR 2026-10-05)
const { t } = useI18n()
const toast = useToastStore()
const auth = useAuthStore()
// ต้องมีลายเซ็น/ตราก่อนอนุมัติ (ไม่งั้นช่อง Approved by ใน PDF ว่าง)
const hasSignature = computed(() => Boolean(auth.user?.hasSignature))

const requests = ref([])
const isLoading = ref(false)
const filter = ref('pending')

async function load() {
  isLoading.value = true
  try {
    const data = await api.get('/vehicle-requests?approvals=mine')
    requests.value = data.requests
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  } finally {
    isLoading.value = false
  }
}
onMounted(load)

const isWaiting = (r) => r.approvalStatus === 'Pending' && r.status === 'Pending'
const pendingCount = computed(() => requests.value.filter(isWaiting).length)
const shown = computed(() =>
  [...(filter.value === 'pending' ? requests.value.filter(isWaiting) : requests.value)].sort(
    (a, b) => new Date(a.departTime) - new Date(b.departTime),
  ),
)

const busyId = ref(null)
async function approve(r) {
  busyId.value = r.id
  try {
    await api.post(`/vehicle-requests/${r.id}/approve`)
    toast.success(t('approvals.approved', { no: r.requestNo }))
    await load()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
    await load()
  } finally {
    busyId.value = null
  }
}

const rejecting = ref(null)
const rejectNote = ref('')
const rejectError = ref('')
function openReject(r) {
  rejecting.value = r
  rejectNote.value = ''
  rejectError.value = ''
}
async function submitReject() {
  rejectError.value = ''
  busyId.value = rejecting.value.id
  try {
    await api.post(`/vehicle-requests/${rejecting.value.id}/reject`, { note: rejectNote.value })
    toast.success(t('approvals.rejected', { no: rejecting.value.requestNo }))
    rejecting.value = null
    await load()
  } catch (err) {
    rejectError.value = errorCodeOf(err)
  } finally {
    busyId.value = null
  }
}

const pillClass = (on) => [
  'seg-btn',
  on ? 'is-active' : '',
]
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('approvals.title') }}</h1>

    <div class="mb-4 seg">
      <button type="button" :class="pillClass(filter === 'pending')" @click="filter = 'pending'">
        {{ t('approvals.waiting') }} ({{ pendingCount }})
      </button>
      <button type="button" :class="pillClass(filter === 'all')" @click="filter = 'all'">
        {{ t('approvals.all') }} ({{ requests.length }})
      </button>
    </div>

    <p v-if="!hasSignature" class="mb-3 text-sm text-danger">
      {{ t('approvals.signatureNeeded') }}
      <RouterLink to="/profile" class="link-action">{{ t('approvals.goProfile') }}</RouterLink>
    </p>

    <div v-if="!isLoading && shown.length === 0" class="empty-state">
      <p>{{ filter === 'pending' ? t('approvals.nothingWaiting') : t('vehicleBooking.noRequests') }}</p>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('vehicleBooking.requester') }}</th>
            <th>{{ t('vehicleBooking.route') }}</th>
            <th class="xl:w-56"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in shown" :key="r.id" class="align-top">
            <td class="py-3">
              <p class="font-mono text-xs text-subtle">{{ r.requestNo }}</p>
              <p class="font-semibold text-ink">{{ r.requesterName }}</p>
              <p v-if="r.requesterDepartment" class="text-xs text-muted">{{ r.requesterDepartment }}</p>
            </td>
            <td class="py-3 text-ink">
              <p class="font-medium">
                {{ r.pickupLocation }}
                <AppIcon name="arrowRight" class="mx-0.5 h-3.5 w-3.5 text-subtle" />
                {{ r.destination }}
              </p>
              <p>{{ formatTripRange(r.departTime, r.returnTime) }}</p>
              <p class="mt-1 text-muted"><span class="font-medium">{{ t('vehicleBooking.reason') }}:</span> {{ r.reason }}</p>
              <p class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span class="chip">{{ t(`vehicleBooking.type${r.vehicleType}`) }} · {{ t('vehicleBooking.passengersShort', { n: r.passengerCount }) }}</span>
                <span v-if="r.approvedAt && !isWaiting(r)" class="text-xs text-muted">{{ formatDateTimeDMY(r.approvedAt) }}</span>
              </p>
              <p v-if="r.approvalStatus === 'Rejected' && r.approvalNote" class="mt-1 text-xs text-danger">{{ t('approvals.rejectReason') }}: {{ r.approvalNote }}</p>
            </td>
            <td class="py-3">
              <div v-if="isWaiting(r)" class="flex flex-wrap items-center justify-end gap-2">
                <button type="button" :disabled="busyId === r.id" class="btn btn-secondary btn-sm !text-danger" @click="openReject(r)">
                  {{ t('approvals.reject') }}
                </button>
                <button
                  type="button"
                  :disabled="busyId === r.id || !hasSignature"
                  :title="hasSignature ? undefined : t('approvals.signatureNeeded')"
                  class="btn btn-primary btn-sm"
                  @click="approve(r)"
                >
                  {{ t('approvals.approve') }}
                </button>
              </div>
              <div v-else class="text-right"><VehicleRequestStatusBadge :status="r.status" :approval-status="r.approvalStatus" /></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <FormModal
      v-if="rejecting"
      :title="t('approvals.rejectTitle', { no: rejecting.requestNo })"
      :submit-label="t('approvals.reject')"
      :submitting="busyId === rejecting.id"
      :submit-disabled="!rejectNote.trim()"
      :error-message="rejectError ? t(`errors.${rejectError}`) : ''"
      @submit="submitReject"
      @close="rejecting = null"
    >
      <label for="reject-note" class="label">{{ t('approvals.rejectReason') }}</label>
      <textarea
        id="reject-note"
        v-model="rejectNote"
        rows="3"
        maxlength="500"
        required
        class="input"
      ></textarea>
    </FormModal>
  </section>
</template>

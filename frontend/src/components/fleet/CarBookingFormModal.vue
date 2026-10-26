<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { trimmedSignatureDataUrl } from '@/utils/signatureImage'

const props = defineProps({
  request: { type: Object, required: true },
})
const emit = defineEmits(['close'])
const { t } = useI18n()

const pad = (n) => String(n).padStart(2, '0')
const dmy = (d) => (d ? `${pad(new Date(d).getDate())}/${pad(new Date(d).getMonth() + 1)}/${new Date(d).getFullYear()}` : '')
const hm = (d) => (d ? `${pad(new Date(d).getHours())}.${pad(new Date(d).getMinutes())}` : '')

const signatureUrl = ref(null)
const isLoadingSignature = ref(false)

const oneWay = computed(() => props.request.tripType && props.request.tripType !== 'RoundTrip')
const place = computed(() => props.request.destination || '')
// ฟอร์มพิมพ์เป็นภาษาไทย → ใช้ชื่อไทยของพนักงาน (ถ้า Admin ยังไม่กรอก ใช้ชื่อหลักแทน)
const requesterName = computed(() => props.request.requesterNameTh || props.request.requesterName)
const approverName = computed(() =>
  props.request.approvalStatus === 'Approved' ? (props.request.approver?.nameTh || props.request.approver?.name || '') : '',
)

onMounted(async () => {
  const req = props.request
  if (req.approvalStatus === 'Approved' && req.approver?.hasSignature && req.approver?.id) {
    isLoadingSignature.value = true
    try {
      const res = await fetch(`/api/vehicle-requests/${req.id}/approver-signature`, { credentials: 'include' })
      if (res.ok) {
        signatureUrl.value = await trimmedSignatureDataUrl(await res.blob())
      }
    } catch {
      // Ignore signature fetch error
    } finally {
      isLoadingSignature.value = false
    }
  }

  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

function printDocument() {
  window.print()
}
</script>

<template>
  <div class="modal-backdrop print:p-0 print:bg-white print:static" @click.self="emit('close')">
    <div
      role="dialog"
      aria-modal="true"
      class="modal-panel max-h-[95vh] max-w-5xl print:max-h-none print:w-full print:max-w-none print:border-none print:shadow-none print:rounded-none"
    >
      <!-- Action Header (Hide during printing) -->
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4 print:hidden">
        <div>
          <h2 class="text-base font-bold text-slate-900">
            <AppIcon name="document" class="mr-1" /> {{ t('fleet.printCarFormTitle') }}
          </h2>
          <p class="text-xs text-slate-500">
            {{ t('fleet.printCarFormHint', { no: request.requestNo }) }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-primary"
            @click="printDocument"
          >
            <AppIcon name="printer" class="mr-1" /> {{ t('fleet.printOrSavePdf') }}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="emit('close')"
          >
            <AppIcon name="close" class="mr-1" /> {{ t('common.close') }}
          </button>
        </div>
      </div>

      <!-- Printable Area -->
      <div class="flex-1 overflow-y-auto p-6 bg-slate-100 print:bg-white print:p-0 print:overflow-visible">
        <div id="print-w-hr-009" class="overflow-hidden mx-auto max-w-[210mm] bg-white p-8 shadow-md print:max-w-none print:p-0 print:shadow-none">
          <!-- Top Row -->
          <div class="flex justify-between items-start text-black">
            <div class="text-sm font-medium">บริษัท ทรีบอนด์ แมนูแฟคเจอริ่ง (ประเทศไทย) จำกัด</div>
            <div class="text-xs text-slate-600 text-right">เลขที่คำขอ {{ request.requestNo }}</div>
          </div>

          <!-- Titles -->
          <h1 class="text-center text-lg font-bold underline mt-3 mb-0.5 text-black">แบบฟอร์มการขอใช้รถ</h1>
          <div class="text-center text-xs underline mb-4 text-black">Company Car Booking</div>

          <!-- Main Form Table -->
          <table class="w-full overflow-hidden border-collapse border-[1.5px] border-black text-xs text-black table-fixed">
            <colgroup>
              <col style="width:10%"><col style="width:12%"><col style="width:9%"><col style="width:11%">
              <col style="width:10%"><col style="width:15%"><col style="width:14%"><col style="width:9.5%"><col style="width:9.5%">
            </colgroup>
            <thead>
              <tr>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">ว/ด/ป<span class="block font-bold text-[11px]">D/M/Y</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">ผู้ขอใช้รถ<span class="block font-bold text-[11px]">Name</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">แผนก<span class="block font-bold text-[11px]">Dept.</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">พนักงานขับรถ<span class="block font-bold text-[11px]">Driver Name</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">วันที่ขอใช้<span class="block font-bold text-[11px]">Requested Date</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">สถานที่<span class="block font-bold text-[11px]">Place</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">เหตุผล<span class="block font-bold text-[11px]">Reason</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">เวลาออก<span class="block font-bold text-[11px]">Time-out</span></th>
                <th class="border-[1.5px] border-black p-1 text-center font-semibold leading-tight">เวลาเข้า<span class="block font-bold text-[11px]">Time-in</span></th>
              </tr>
            </thead>
            <tbody>
              <tr class="h-9">
                <td class="border-[1.5px] border-black p-1 text-center align-top whitespace-nowrap font-mono text-[11px]">{{ dmy(request.createdAt) }}</td>
                <td class="border-[1.5px] border-black p-1 text-left align-top [overflow-wrap:anywhere]"><div class="line-clamp-4 overflow-hidden [overflow-wrap:anywhere]">{{ requesterName }}</div></td>
                <td class="border-[1.5px] border-black p-1 text-center align-top [overflow-wrap:anywhere]"><div class="line-clamp-4 overflow-hidden [overflow-wrap:anywhere]">{{ request.requesterDepartment }}</div></td>
                <td class="border-[1.5px] border-black p-1 text-left align-top [overflow-wrap:anywhere]">
                  <div class="line-clamp-4 overflow-hidden">
                    {{ request.driver?.name ?? '' }}
                    <template v-if="request.driver?.licensePlate">
                      <br><span class="text-[11px]">{{ request.driver.licensePlate }}</span>
                    </template>
                  </div>
                </td>
                <td class="border-[1.5px] border-black p-1 text-center align-top whitespace-nowrap font-mono text-[11px]">{{ dmy(request.departTime) }}</td>
                <td class="border-[1.5px] border-black p-1.5 text-left align-top [overflow-wrap:anywhere]"><div class="line-clamp-6 overflow-hidden [overflow-wrap:anywhere]">{{ place }}</div></td>
                <td class="border-[1.5px] border-black p-1.5 text-left align-top [overflow-wrap:anywhere]"><div class="line-clamp-6 overflow-hidden [overflow-wrap:anywhere]">{{ request.reason }}</div></td>
                <td class="border-[1.5px] border-black p-1.5 text-center align-top [overflow-wrap:anywhere]">{{ hm(request.departTime) }}</td>
                <td class="border-[1.5px] border-black p-1.5 text-center align-top [overflow-wrap:anywhere]">{{ oneWay ? '' : hm(request.returnTime) }}</td>
              </tr>
              <!-- Blank padding rows to match original W-HR-009 form height -->
              <tr v-for="i in 5" :key="i" class="h-6">
                <td v-for="c in 9" :key="c" class="border-x-[1.5px] border-black p-0"></td>
              </tr>
            </tbody>
          </table>

          <!-- Signatures Section -->
          <div class="flex justify-between mt-7 text-black text-xs">
            <div class="w-[40%] text-center">
              <div class="h-[62px] flex items-end justify-center border-b border-dotted border-black mx-4 pb-1">
                <span><div class="line-clamp-4 overflow-hidden [overflow-wrap:anywhere]">{{ requesterName }}</div></span>
              </div>
              <div class="mt-1 flex items-start justify-center gap-1 font-medium"><span>(</span><span class="line-clamp-4 overflow-hidden text-center [overflow-wrap:anywhere]">{{ requesterName }}</span><span>)</span></div>
              <div class="text-slate-600">Requested by</div>
              <div class="text-[11px] text-slate-500 mt-0.5">ส่งคำขอในระบบ {{ dmy(request.createdAt) }} {{ hm(request.createdAt) }}</div>
            </div>

            <div class="w-[40%] text-center">
              <div class="h-[62px] flex items-end justify-center border-b border-dotted border-black mx-4 pb-1">
                <img v-if="signatureUrl" :src="signatureUrl" alt="Signature" class="h-[56px] w-[135px] object-contain" />
                <span v-else class="max-w-full truncate">{{ approverName }}</span>
              </div>
              <div class="mt-1 truncate font-medium">( {{ approverName || '........................................' }} )</div>
              <div class="text-slate-600">Approved by</div>
              <div class="text-[11px] text-slate-500 mt-0.5">
                <template v-if="request.approvedAt">อนุมัติในระบบ {{ dmy(request.approvedAt) }} {{ hm(request.approvedAt) }}</template>
              </div>
            </div>
          </div>

          <!-- Document Footer -->
          <div class="mt-5 text-right text-black text-xs">
            <div>Annex B R0 (W-HR-009)</div>
            <div class="text-red-700 font-bold text-base mt-0.5">CONTROLLED</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@media print {
  @page {
    size: A4 portrait;
  }
}
</style>

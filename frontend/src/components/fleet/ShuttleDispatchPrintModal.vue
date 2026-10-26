<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps({
  trips: { type: Array, required: true }, // รายการเที่ยว (1 เที่ยว หรือหลายเที่ยวในวันนั้น)
})
const emit = defineEmits(['close'])
const { t } = useI18n()

const pad = (n) => String(n).padStart(2, '0')

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formatTime(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${pad(d.getHours())}.${pad(d.getMinutes())} น.`
}

function otShiftLabel(otType) {
  if (otType === 'Morning') return 'ล่วงเวลาเช้า'
  if (otType === 'Evening') return 'ล่วงเวลาเย็น'
  return 'ล่วงเวลาวันหยุด'
}

// จุดรถรับส่งของพนักงานคนเดียวกัน: โอทีเย็นรถออกจากบริษัท → เป็นจุดที่ลง, โอทีเช้า → จุดที่ขึ้น
function stopLabel(otType) {
  if (otType === 'Evening') return 'จุดลง'
  if (otType === 'Morning') return 'จุดขึ้น'
  return 'จุดรถรับส่ง'
}

// เลขที่ของเที่ยว: สายรวมมีเลขของตัวเอง (OT-ปี-ลำดับ) เที่ยวธรรมดาแสดงเลขคำขอรถทั้งหมดเรียงตามเลข
function requestNos(trip) {
  if (trip.isCombined && trip.combinedTripCode) return trip.combinedTripCode
  return trip.requests
    .map((r) => r.requestNo)
    .sort()
    .join(', ')
}

function driverInfo(trip) {
  const reqWithDriver = trip.requests.find((r) => r.driver)
  if (!reqWithDriver?.driver) {
    return {
      plate: 'ยังไม่จัดรถ',
      name: 'ยังไม่ได้ระบุคนขับ',
      phone: '-',
    }
  }
  return {
    plate: reqWithDriver.driver.licensePlate ? `ทะเบียน ${reqWithDriver.driver.licensePlate}` : '-',
    name: reqWithDriver.driver.name ? `คุณ${reqWithDriver.driver.name}` : '-',
    phone: reqWithDriver.driver.phone ? `เบอร์ติดต่อ ${reqWithDriver.driver.phone}` : '-',
  }
}

function printDocument() {
  window.print()
}

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="modal-backdrop print:p-0 print:bg-white print:static" @click.self="emit('close')">
    <div
      role="dialog"
      aria-modal="true"
      class="modal-panel max-h-[92vh] max-w-4xl print:max-h-none print:w-full print:max-w-none print:border-none print:shadow-none print:rounded-none"
    >
      <!-- Modal Action Header (ซ่อนเวลาพิมพ์) -->
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4 print:hidden">
        <div>
          <h2 class="text-base font-bold text-slate-900">
            <AppIcon name="document" class="mr-1" /> {{ t('fleet.printDispatchTitle') }}
          </h2>
          <p class="text-xs text-slate-500">
            {{ t('fleet.printDispatchHint') }}
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

      <!-- Scrollable Document Preview Area -->
      <div class="flex-1 overflow-y-auto p-6 bg-slate-100 print:bg-white print:p-0 print:overflow-visible">
        <div id="print-area" class="mx-auto max-w-[210mm] bg-white p-8 shadow-md print:max-w-none print:p-0 print:shadow-none">
          <div v-for="trip in trips" :key="trip.key" class="mb-10 print:mb-8 print:break-inside-avoid">
            <!-- Header Titles -->
            <div class="mb-4 text-center font-serif font-bold text-black" style="font-family: 'Sarabun', 'Leelawadee UI', Tahoma, sans-serif;">
              <h1 class="text-lg underline decoration-1 underline-offset-4">
                แบบคำขอรถรับ-ส่ง กรณีทำงานล่วงเวลา
              </h1>
              <h2 class="mt-1 text-base underline decoration-1 underline-offset-4">
                <template v-if="trip.isCombined">รายชื่อพนักงานสายรวม ({{ trip.routeName ?? 'ไม่ระบุสาย' }})</template>
                <template v-else>รายชื่อพนักงานสาย{{ trip.routeName ?? 'ทั่วไป (ไม่ระบุสาย)' }}</template>
              </h2>
              <!-- เลขที่คำขอรถของเที่ยวนี้ (เที่ยวเดียวอาจมาจากหลายคำขอ / สายรวมมีหลายคำขอ) -->
              <p class="mt-1 text-xs font-normal">{{ trip.isCombined && trip.combinedTripCode ? 'เลขที่สายรวม' : 'เลขที่คำขอ' }}: {{ requestNos(trip) }}</p>
            </div>

            <!-- Main Passenger Table -->
            <table class="w-full border-collapse border border-black text-xs text-black" style="font-family: 'Sarabun', 'Leelawadee UI', Tahoma, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
              <thead>
                <tr>
                  <th rowspan="2" class="border border-black px-2 py-1.5 text-center font-bold align-middle" style="width: 10%;">รหัสพนักงาน</th>
                  <th rowspan="2" class="border border-black px-2 py-1.5 text-center font-bold align-middle" style="width: 22%;">ชื่อ-สกุล</th>
                  <th rowspan="2" class="border border-black px-2 py-1.5 text-center font-bold align-middle" style="width: 10%;">แผนก</th>
                  <th rowspan="2" class="border border-black px-2 py-1.5 text-center font-bold align-middle" style="width: 15%;">สายรถ</th>
                  <th rowspan="2" class="border border-black px-2 py-1.5 text-center font-bold align-middle" style="width: 20%;">{{ stopLabel(trip.otType) }}</th>
                  <th rowspan="2" class="border border-black px-2 py-1.5 text-center font-bold align-middle" style="width: 13%;">เบอร์โทร</th>
                  <th colspan="2" class="border border-black px-2 py-1 text-center font-bold" style="background-color: #fde68a;">
                    {{ otShiftLabel(trip.otType) }}
                  </th>
                </tr>
                <tr>
                  <th class="border border-black px-1 py-1 text-center font-bold" style="width: 12%; background-color: #fde68a;">วันที่</th>
                  <th class="border border-black px-1 py-1 text-center font-bold" style="width: 10%; background-color: #fde68a;">เวลา</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rider in trip.riders" :key="`${rider.request.id}-${rider.id}`">
                  <td class="border border-black px-2 py-1.5 text-center font-mono text-xs">{{ rider.employeeCode || '-' }}</td>
                  <td class="border border-black px-2 py-1.5 text-left font-medium">{{ rider.fullNameTh || rider.fullName }}</td>
                  <td class="border border-black px-2 py-1.5 text-center">{{ rider.department ?? '-' }}</td>
                  <td class="border border-black px-2 py-1.5 text-center">{{ rider.homeRouteName ?? trip.routeName ?? '-' }}</td>
                  <td class="border border-black px-2 py-1.5 text-left">{{ rider.pickupStop ?? '-' }}</td>
                  <td class="border border-black px-2 py-1.5 text-center font-mono text-xs">{{ rider.phone ?? '-' }}</td>
                  <td class="border border-black px-1 py-1.5 text-center font-mono text-xs">{{ formatDate(rider.request?.departTime) }}</td>
                  <td class="border border-black px-1 py-1.5 text-center font-mono text-xs">{{ formatTime(rider.request?.departTime) }}</td>
                </tr>

                <!-- Yellow Driver Footer Box ( exact match to HR PDF sample ) -->
                <tr style="background-color: #ffff00;">
                  <td colspan="3" class="border border-black px-3 py-1.5 text-center font-bold text-black" style="background-color: #ffff00;">
                    {{ driverInfo(trip).plate }}
                  </td>
                  <td colspan="5" class="border border-black px-3 py-1.5 text-center font-bold text-black" style="background-color: #ffff00;">
                    {{ driverInfo(trip).name }}
                  </td>
                </tr>
                <tr style="background-color: #ffff00;">
                  <td colspan="8" class="border border-black px-3 py-1.5 text-center font-bold text-black" style="background-color: #ffff00;">
                    {{ driverInfo(trip).phone }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

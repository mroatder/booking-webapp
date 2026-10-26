<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { bookingDateLimits } from '@/utils/bookingWindow'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useUsersStore } from '@/stores/users'
import { useFleetStore } from '@/stores/fleet'
import { api, ApiError } from '@/api/client'
import { defaultBookingTimes, toLocalDateStr, toLocalTimeStr } from '@/utils/datetime'
import { otTypeOf } from '@/utils/shuttleRoutes'

// ฟอร์มคำขอใช้รถ ใช้ทั้งตอนสร้างใหม่และแก้ไข - parent ส่ง `onSave(payload, files)` ที่คืน Promise มาให้
// ไฟล์แบบฟอร์มขอรถ: ตอนสร้างส่งไปพร้อมคำขอ (`files`), ตอนแก้ไขเพิ่ม/ลบทีละไฟล์ทันทีผ่าน store
const props = defineProps({
  request: { type: Object, default: null },
  submitLabel: { type: String, required: true },
  onSave: { type: Function, required: true },
  requestType: { type: String, default: 'BusinessTrip' },
})
const emit = defineEmits(['cancel'])

const { t } = useI18n()
const limits = bookingDateLimits()
const auth = useAuthStore()
const usersStore = useUsersStore()
const fleetStore = useFleetStore()

// ใช้รายชื่อย่อ (directory) ที่พนักงานทั่วไปเข้าถึงได้ - /api/users เต็มๆ เปิดให้ Admin เท่านั้น
// (เดิมเรียก fetchAll ทำให้พนักงานทั่วไปค้นหาชื่อไม่เจอ และส่งคำขอโอทีไม่ได้)
// โหลดใหม่ทุกครั้ง: รายชื่อขึ้นกับผู้ที่ login (ไม่ใช่ Admin เห็นเฉพาะแผนกหลักของตัวเอง) - กันเห็นรายชื่อของคนที่ login ก่อนหน้า
usersStore.fetchDirectory()
if (fleetStore.shuttlePassengers.length === 0) {
  fleetStore.fetchShuttlePassengers()
}

// ผู้อนุมัติ (รถไปงานนอก, dev+HR 2026-10-05): หัวหน้างาน/ผู้มีระดับอนุมัติขอเอง = อนุมัติอัตโนมัติ
// คนอื่นเลือกผู้อนุมัติ 1 คนจากแผนกหลัก (เรียงระดับ 1 → 3) - ระดับ 1 ไม่อยู่ก็เลือกระดับที่สูงกว่าได้
const autoApproved = computed(() => Boolean(auth.user?.approvalLevel) || auth.user?.role === 'Supervisor')
const approvers = ref([])
if (props.requestType === 'BusinessTrip' && !autoApproved.value) {
  api.get('/users/approvers').then((data) => {
    approvers.value = data.approvers
    if (!form.approverUserId && approvers.value.length) form.approverUserId = approvers.value[0].id
  }).catch(() => {})
}

const form = reactive(emptyForm())
const errorCode = ref('')
const errorDetails = ref(null) // เช่น PASSENGER_DOUBLE_BOOKED → ชื่อคน + เลขคำขอที่ชน
const isSubmitting = ref(false)

// ----- ค้นหาผู้โดยสาร -----
const searchQuery = ref('')
const searchInput = ref(null)

const filteredUsers = computed(() => {
  if (!searchQuery.value.trim()) return []
  const q = searchQuery.value.toLowerCase()
  return usersStore.directory
    .filter(u => u.fullName.toLowerCase().includes(q) || (u.department && u.department.toLowerCase().includes(q)))
    .filter(u => !form.passengers.includes(u.id)) // ซ่อนคนที่เลือกไปแล้ว
    .slice(0, 10) // แสดงแค่ 10 คนแรกเพื่อไม่ให้รก
})

function addPassenger(user) {
  if (!form.passengers.includes(user.id)) {
    form.passengers.push(user.id)
  }
  searchQuery.value = ''
  searchInput.value?.focus()
}

// ตอนแก้ไข ผู้เดินทางเดิมอาจไม่อยู่ในรายชื่อที่เลือกได้แล้ว (ย้ายแผนก/อยู่นอกแผนกหลัก) - ใช้ชื่อจากคำขอแทน
function passengerName(userId) {
  return (
    usersStore.directory.find((u) => u.id === userId)?.fullName ??
    props.request?.passengers?.find((p) => p.id === userId)?.fullName
  )
}

function removePassenger(userId) {
  form.passengers = form.passengers.filter(id => id !== userId)
}

// ไม่มีไฟล์แนบในฟอร์มแล้ว - ใช้การอนุมัติของหัวหน้า + แบบฟอร์ม W-HR-009 จากระบบแทน (dev 2026-10-05)

// ต้องตรงกับ ONE_WAY_BLOCK_HOURS ใน backend (vehicle-requests/routes.js)
const ONE_WAY_BLOCK_HOURS = 2
const TRIP_TYPES = ['RoundTrip', 'OneWay', 'ReturnOnly']
const STOPS = [
  { key: 'pickup', label: 'vehicleBooking.pickupLocation', location: 'pickupLocation', mapLink: 'pickupMapLink', atCompany: 'pickupAtCompany', gate: 'pickupGate' },
  { key: 'destination', label: 'vehicleBooking.destination', location: 'destination', mapLink: 'destinationMapLink', atCompany: 'destinationAtCompany', gate: 'destinationGate' },
]

function emptyForm() {
  const d = defaultBookingTimes()
  return {
    contactPhone: auth.user?.phone ?? '',
    departDate: d.date,
    departTime: d.startTime,
    returnDate: d.date,
    returnTime: d.endTime,
    pickupLocation: '',
    destination: '',
    // งานนอกส่วนใหญ่ออกจากบริษัท - ติ๊กจุดรับเป็นบริษัทไว้ก่อน
    pickupAtCompany: true,
    pickupMapLink: '',
    pickupGate: '',
    destinationAtCompany: false,
    destinationMapLink: '',
    destinationGate: '',
    vehicleType: 'Van',
    otType: 'Evening',
    tripType: 'RoundTrip',
    passengerCount: 0,
    passengers: [],
    reason: '',
    approverUserId: '',
  }
}

// ประเภทโอทียังไม่ได้เก็บเป็นคอลัมน์แยก - otTypeOf (utils/shuttleRoutes) อ่านกลับจากจุดรับ-ส่งที่ฟอร์มนี้เขียนไว้ตอนสร้าง (ดู onSubmit)

function fromRequest(r) {
  const depart = new Date(r.departTime)
  const ret = new Date(r.returnTime)
  return {
    contactPhone: r.contactPhone,
    departDate: toLocalDateStr(depart),
    departTime: toLocalTimeStr(depart),
    returnDate: toLocalDateStr(ret),
    returnTime: toLocalTimeStr(ret),
    pickupLocation: r.pickupAtCompany ? '' : r.pickupLocation,
    destination: r.destinationAtCompany ? '' : r.destination,
    pickupAtCompany: Boolean(r.pickupAtCompany),
    pickupMapLink: r.pickupMapLink ?? '',
    destinationAtCompany: Boolean(r.destinationAtCompany),
    destinationMapLink: r.destinationMapLink ?? '',
    pickupGate: r.pickupGate ?? '',
    destinationGate: r.destinationGate ?? '',
    vehicleType: r.vehicleType,
    otType: otTypeOf(r),
    tripType: r.tripType ?? 'RoundTrip',
    // passengerCount จาก API = ผู้โดยสารทั้งหมด (แขก + พนักงาน) - ช่องในฟอร์มคือจำนวนแขกเท่านั้น จึงหักพนักงานออก
    passengerCount: Math.max(0, r.passengerCount - (r.passengers?.length ?? 0)),
    passengers: r.passengers?.map(p => p.id) ?? [],
    reason: r.reason ?? '',
    approverUserId: r.approver && r.approver.id !== auth.user?.id ? r.approver.id : '',
  }
}

watch(
  () => props.request,
  (r) => {
    Object.assign(form, r ? fromRequest(r) : emptyForm())
    errorCode.value = ''
  },
  { immediate: true },
)

// กลับอย่างเดียวมักรับจากข้างนอกมาส่งบริษัท → สลับจุดที่ติ๊ก "ที่บริษัท" ให้ (เฉพาะคำขอใหม่ ไม่แตะตอนแก้ไข)
watch(
  () => form.tripType,
  (tt) => {
    if (props.request) return
    form.pickupAtCompany = tt !== 'ReturnOnly'
    form.destinationAtCompany = tt === 'ReturnOnly'
  },
)

// เลื่อนวันออกไปหลังวันกลับ → ขยับวันกลับตาม (กันกรอกทริปย้อนเวลาโดยไม่ตั้งใจ)
watch(
  () => form.departDate,
  (d) => {
    if (d && form.returnDate < d) form.returnDate = d
  },
)

async function onSubmit() {
  errorCode.value = ''
  // ไม่บังคับแนบแบบฟอร์มขอรถแล้ว - ใช้ PDF จากระบบ + การอนุมัติของหัวหน้าแทน (dev+HR 2026-10-05)
  isSubmitting.value = true
  try {
    const depart = new Date(`${form.departDate}T${form.departTime}:00`)
    // โอทีเช้า/เย็นวิ่งเที่ยวเดียว → ไม่มีช่องเวลากลับ ใช้ +1 ชม. เป็นช่วงที่รถไม่ว่าง
    // โอทีวันหยุด (ไป-กลับ) → มีเวลาส่งกลับจริง ในวันเดียวกับวันรับ (รถไม่ว่างทั้งช่วง ใช้กันจัดรถชนได้ถูก)
    // งานนอกแบบไป/กลับอย่างเดียว → กรอกแค่เวลารับ ระบบจองคนขับ/รถไว้ ONE_WAY_BLOCK_HOURS ชม. (backend คำนวณซ้ำเอง)
    let ret
    if (props.requestType !== 'Shuttle' && form.tripType !== 'RoundTrip') ret = new Date(depart.getTime() + ONE_WAY_BLOCK_HOURS * 60 * 60 * 1000)
    else if (props.requestType !== 'Shuttle') ret = new Date(`${form.returnDate}T${form.returnTime}:00`)
    else if (form.otType === 'Holiday') ret = new Date(`${form.departDate}T${form.returnTime}:00`)
    else ret = new Date(depart.getTime() + 60 * 60 * 1000)

    if (!(ret > depart)) {
      errorCode.value = 'RETURN_BEFORE_DEPART'
      return
    }

    await props.onSave(
      {
      contactPhone: form.contactPhone,
      departTime: depart.toISOString(),
      returnTime: ret.toISOString(),
      pickupLocation: props.requestType === 'Shuttle' 
        ? (form.otType === 'Evening' ? 'บริษัท' : (form.otType === 'Morning' ? 'บ้าน (ตามสายรถพนักงาน)' : 'ไป-กลับ (บ้าน-บริษัท)')) 
        : form.pickupLocation,
      destination: props.requestType === 'Shuttle' 
        ? (form.otType === 'Evening' ? 'บ้าน (ตามสายรถพนักงาน)' : (form.otType === 'Morning' ? 'บริษัท' : 'ตามสายรถพนักงาน')) 
        : form.destination,
      pickupAtCompany: form.pickupAtCompany,
      pickupMapLink: form.pickupAtCompany ? '' : form.pickupMapLink.trim(),
      destinationAtCompany: form.destinationAtCompany,
      destinationMapLink: form.destinationAtCompany ? '' : form.destinationMapLink.trim(),
      pickupGate: form.pickupAtCompany ? form.pickupGate.trim() : '',
      destinationGate: form.destinationAtCompany ? form.destinationGate.trim() : '',
      vehicleType: form.vehicleType,
      tripType: props.requestType === 'Shuttle' ? 'RoundTrip' : form.tripType,
      passengerCount: Number(form.passengerCount),
      passengers: form.passengers,
      ...(props.requestType === 'BusinessTrip'
        ? { reason: form.reason.trim(), approverUserId: autoApproved.value ? '' : form.approverUserId }
        : {}),
      },
    )
    if (!props.request) Object.assign(form, emptyForm())
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
    errorDetails.value = err instanceof ApiError ? (err.details ?? null) : null
  } finally {
    isSubmitting.value = false
  }
}

const inputClass = 'input'
const labelClass = 'label'
// ปุ่มเลือกแบบแถบ (รูปแบบการเดินทาง / ประเภทรถ / ประเภทโอที) - radio ซ่อนอยู่ในป้าย
const segClass = (selected) => ['seg-btn !text-sm focus-within:outline-2 focus-within:outline-accent', selected ? 'is-active' : '']
const OT_TYPES = computed(() => [
  { value: 'Morning', label: t('vehicleBooking.otMorning') },
  { value: 'Evening', label: t('vehicleBooking.otEvening') },
  { value: 'Holiday', label: t('vehicleBooking.otHoliday') },
])

function shuttleInfo(userId) {
  return fleetStore.shuttlePassengers.find((p) => p.userId === userId)
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <!-- ผู้ขอ + เบอร์ติดต่อ -->
    <div class="form-row">
      <div>
        <h3 class="form-row-title">{{ t('vehicleBooking.secContact') }}</h3>
        <p class="form-row-note">{{ t('vehicleBooking.secContactNote') }}</p>
      </div>
      <div class="form-row-body grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,18rem)_14rem]">
        <div>
          <span :class="labelClass">{{ t('vehicleBooking.requester') }}</span>
          <p class="truncate py-2 text-sm font-medium text-ink">
            {{ request?.requesterName ?? auth.user?.fullName }}
            <span v-if="(request?.requesterDepartment ?? auth.user?.department)" class="text-muted">
              • {{ request?.requesterDepartment ?? auth.user?.department }}
            </span>
          </p>
        </div>
        <div>
          <label for="vr-phone" :class="labelClass">{{ t('vehicleBooking.contactPhone') }}</label>
          <input id="vr-phone" v-model="form.contactPhone" type="tel" required maxlength="50" :class="inputClass" />
        </div>
      </div>
    </div>

    <!-- รูปแบบ / ประเภท + วัน-เวลา -->
    <div class="form-row">
      <div>
        <h3 class="form-row-title">{{ t('vehicleBooking.secWhen') }}</h3>
        <p class="form-row-note">{{ t(requestType === 'BusinessTrip' ? 'vehicleBooking.secWhenNote' : 'vehicleBooking.secWhenNoteShuttle') }}</p>
      </div>
      <div class="form-row-body space-y-4">
        <div v-if="requestType === 'BusinessTrip'" class="flex flex-wrap gap-x-8 gap-y-3">
          <fieldset>
            <legend :class="labelClass">{{ t('vehicleBooking.tripType') }}</legend>
            <div class="seg">
              <label v-for="tt in TRIP_TYPES" :key="tt" :class="segClass(form.tripType === tt)">
                <input v-model="form.tripType" type="radio" :value="tt" class="sr-only" />
                {{ t(`vehicleBooking.trip${tt}`) }}
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend :class="labelClass">{{ t('vehicleBooking.vehicleType') }}</legend>
            <div class="seg">
              <label v-for="type in ['Van', 'Sedan']" :key="type" :class="segClass(form.vehicleType === type)">
                <input v-model="form.vehicleType" type="radio" :value="type" class="sr-only" />
                {{ t(`vehicleBooking.type${type}`) }}
              </label>
            </div>
          </fieldset>
        </div>

        <fieldset v-if="requestType === 'Shuttle'">
          <legend :class="labelClass">{{ t('vehicleBooking.otTypeLegend') }}</legend>
          <div class="seg">
            <label v-for="ot in OT_TYPES" :key="ot.value" :class="segClass(form.otType === ot.value)">
              <input v-model="form.otType" type="radio" :value="ot.value" class="sr-only" />
              {{ ot.label }}
            </label>
          </div>
        </fieldset>

        <div class="flex flex-wrap gap-3 [&>div]:w-44">
          <div v-if="requestType === 'Shuttle'">
            <label for="vr-depart-date" :class="labelClass">{{ t('vehicleBooking.shuttleDate') }}</label>
            <DatePicker id="vr-depart-date" v-model="form.departDate" :required="true" :min-date="limits.min" :max-date="limits.max" />
          </div>
          <div v-if="requestType === 'Shuttle'">
            <label for="vr-depart-time" :class="labelClass">
              {{ form.otType === 'Holiday' ? t('vehicleBooking.shuttlePickupToCompany') : t('vehicleBooking.shuttleTime') }}
            </label>
            <TimePicker id="vr-depart-time" v-model="form.departTime" :required="true" />
          </div>
          <div v-if="requestType === 'Shuttle' && form.otType === 'Holiday'">
            <label for="vr-return-time" :class="labelClass">{{ t('vehicleBooking.shuttleReturnTime') }}</label>
            <TimePicker id="vr-return-time" v-model="form.returnTime" :required="true" />
          </div>

          <div v-if="requestType === 'BusinessTrip'">
            <label for="vr-depart-date" :class="labelClass">
              {{ form.tripType === 'RoundTrip' ? t('vehicleBooking.departDate') : t('vehicleBooking.pickupDate') }}
            </label>
            <DatePicker id="vr-depart-date" v-model="form.departDate" :required="true" :min-date="limits.min" :max-date="limits.max" />
          </div>
          <div v-if="requestType === 'BusinessTrip'">
            <label for="vr-depart-time" :class="labelClass">
              {{ form.tripType === 'RoundTrip' ? t('vehicleBooking.departTime') : t('vehicleBooking.pickupTime') }}
            </label>
            <TimePicker id="vr-depart-time" v-model="form.departTime" :required="true" />
          </div>
          <div v-if="requestType === 'BusinessTrip' && form.tripType === 'RoundTrip'">
            <label for="vr-return-date" :class="labelClass">{{ t('vehicleBooking.returnDate') }}</label>
            <DatePicker id="vr-return-date" v-model="form.returnDate" :required="true" :min-date="form.departDate || limits.min" />
          </div>
          <div v-if="requestType === 'BusinessTrip' && form.tripType === 'RoundTrip'">
            <label for="vr-return-time" :class="labelClass">{{ t('vehicleBooking.returnTime') }}</label>
            <TimePicker id="vr-return-time" v-model="form.returnTime" :required="true" />
          </div>
        </div>
        <p v-if="requestType === 'BusinessTrip' && form.tripType !== 'RoundTrip'" class="text-xs text-muted">
          {{ t('vehicleBooking.oneWayHint', { hours: ONE_WAY_BLOCK_HOURS }) }}
        </p>
        <p v-if="requestType === 'BusinessTrip' && form.tripType === 'RoundTrip'" class="text-xs text-muted">
          {{ t('vehicleBooking.multiDayHint') }}
        </p>
      </div>
    </div>

    <!-- จุดรับ / ปลายทาง - แต่ละจุดแนบแผนที่ของตัวเอง, ติ๊ก "ที่บริษัท" ไม่ต้องกรอก (dev ยืนยัน 2026-09-29) -->
    <div v-if="requestType === 'BusinessTrip'" class="form-row">
      <div>
        <h3 class="form-row-title">{{ t('vehicleBooking.secPlaces') }}</h3>
        <p class="form-row-note">{{ t('vehicleBooking.secPlacesNote') }}</p>
      </div>
      <div class="form-row-body grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div v-for="stop in STOPS" :key="stop.key" class="rounded-card bg-surface p-4">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-sm font-semibold text-ink">{{ t(stop.label) }}<span v-if="!form[stop.atCompany]" class="ml-0.5 font-semibold text-danger">*</span></span>
            <label class="flex cursor-pointer items-center gap-1.5 text-sm text-muted">
              <input v-model="form[stop.atCompany]" type="checkbox" class="rounded text-slate-900 focus:ring-slate-900" />
              {{ t('vehicleBooking.atCompanyShort') }}
            </label>
          </div>
          <div v-if="form[stop.atCompany]" class="space-y-2">
            <p class="rounded-control bg-white px-3 py-2 text-sm text-muted">
              <AppIcon name="office" class="mr-1" /> {{ t('vehicleBooking.atCompanyNote') }}
            </p>
            <input
              :id="`vr-${stop.key}-gate`"
              v-model="form[stop.gate]"
              type="text"
              maxlength="100"
              :aria-label="t('vehicleBooking.gateOf', { place: t(stop.label) })"
              :placeholder="t('vehicleBooking.gatePlaceholder')"
              :class="inputClass"
            />
          </div>
          <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              :id="`vr-${stop.key}`"
              v-model="form[stop.location]"
              type="text"
              required
              maxlength="300"
              :aria-label="t(stop.label)"
              :placeholder="t('vehicleBooking.placeName')"
              :class="inputClass"
            />
            <input
              :id="`vr-${stop.key}-map`"
              v-model="form[stop.mapLink]"
              type="url"
              required
              maxlength="1000"
              :aria-label="t('vehicleBooking.mapLinkOf', { place: t(stop.label) })"
              :placeholder="t('vehicleBooking.mapLinkPlaceholder')"
              :class="inputClass"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- เหตุผล + ผู้อนุมัติ (รถไปงานนอก) - เหตุผลไปอยู่ช่อง Reason ในแบบฟอร์ม W-HR-009 -->
    <div v-if="requestType === 'BusinessTrip'" class="form-row">
      <div>
        <h3 class="form-row-title">{{ t('vehicleBooking.secReason') }}</h3>
      </div>
      <div class="form-row-body grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,32rem)_16rem]">
        <div>
          <label for="vr-reason" :class="labelClass">{{ t('vehicleBooking.reason') }}</label>
          <input
            id="vr-reason"
            v-model="form.reason"
            type="text"
            required
            maxlength="500"
            :placeholder="t('vehicleBooking.reasonPlaceholder')"
            :class="inputClass"
          />
        </div>
        <div>
          <label for="vr-approver" :class="labelClass">{{ t('vehicleBooking.approver') }}</label>
          <p v-if="autoApproved" class="rounded-control bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {{ t('vehicleBooking.autoApproved') }}
          </p>
          <template v-else>
            <select id="vr-approver" v-model="form.approverUserId" required :class="inputClass">
              <option value="" disabled>{{ t('vehicleBooking.chooseApprover') }}</option>
              <option v-for="a in approvers" :key="a.id" :value="a.id">
                {{ t('vehicleBooking.approverOption', { level: a.approvalLevel, name: a.fullName }) }}
              </option>
            </select>
            <p v-if="approvers.length === 0" class="mt-1 text-xs text-amber-700">{{ t('vehicleBooking.noApprovers') }}</p>
          </template>
        </div>
      </div>
    </div>

    <!-- ผู้เดินทาง - ค้นหาพนักงาน, คนที่เลือกแสดงเป็นป้ายเล็ก, แขกภายนอกอยู่ใต้ช่องค้นหา -->
    <div class="form-row">
      <div>
        <h3 class="form-row-title">{{ t('vehicleBooking.secTravelers') }}</h3>
        <p class="form-row-note">{{ t('vehicleBooking.secTravelersNote') }}</p>
      </div>
      <div class="form-row-body grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,32rem)_16rem]">
        <div>
          <label for="vr-passenger-search" :class="labelClass">
            {{ t('vehicleBooking.travelersTitle') }}
            <span class="text-xs font-normal text-red-500">
              {{ t('vehicleBooking.travelersPickOne') }}<span v-if="requestType === 'BusinessTrip'">{{ t('vehicleBooking.travelersIfNoGuests') }}</span>
            </span>
          </label>

          <div class="relative">
            <input
              id="vr-passenger-search"
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              :placeholder="t('groupTrips.searchEmployee')"
              :class="inputClass"
            />

            <!-- Dropdown ผลลัพธ์ -->
            <ul
              v-if="filteredUsers.length > 0"
              class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-control bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5"
            >
              <li
                v-for="u in filteredUsers"
                :key="u.id"
                class="flex cursor-pointer select-none items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                @click="addPassenger(u)"
              >
                <div>
                  <span class="font-medium">{{ u.fullName }}</span>
                  <span class="ml-2 text-xs text-slate-500">{{ u.department || t('vehicleBooking.noDepartment') }}</span>
                </div>
                <span class="text-xs font-medium text-blue-600">{{ t('vehicleBooking.addShort') }}</span>
              </li>
            </ul>
            <div
              v-else-if="searchQuery.trim() !== ''"
              class="absolute z-10 mt-1 w-full rounded-control bg-white px-4 py-3 text-center text-sm text-slate-500 shadow-lg ring-1 ring-black ring-opacity-5"
            >
              {{ t('vehicleBooking.noEmployeeFound') }}
            </div>
          </div>

          <!-- คนที่เลือกแล้ว -->
          <ul v-if="form.passengers.length > 0" class="mt-2 flex flex-wrap gap-1.5">
            <li
              v-for="userId in form.passengers"
              :key="userId"
              class="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-3 pr-1 text-sm text-ink"
            >
              <span class="font-medium">{{ passengerName(userId) }}</span>
              <template v-if="requestType === 'Shuttle'">
                <span v-if="shuttleInfo(userId)" class="text-xs text-muted">
                  <AppIcon name="route" class="mr-1" /> {{ shuttleInfo(userId).routeName }} • {{ shuttleInfo(userId).pickupStop }}
                </span>
                <span v-else class="text-xs text-orange-500"><AppIcon name="warning" class="mr-1" /> {{ t('vehicleBooking.noRegularRoute') }}</span>
              </template>
              <button
                type="button"
                class="cursor-pointer rounded-full p-1 text-subtle hover:bg-white hover:text-danger"
                :title="t('vehicleBooking.removeName')"
                :aria-label="t('vehicleBooking.removePerson', { name: passengerName(userId) })"
                @click="removePassenger(userId)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          </ul>
          <p class="mt-1 text-xs text-muted">
            <template v-if="form.passengers.length === 0">{{ t('vehicleBooking.noEmployeeSelected') }} • </template>
            {{ t('vehicleBooking.totalPeople') }}
            {{ requestType === 'Shuttle' ? form.passengers.length : Number(form.passengerCount) + form.passengers.length }} {{ t('vehicleBooking.peopleUnit') }}
          </p>
        </div>
        <div v-if="requestType === 'BusinessTrip'">
          <label for="vr-pax" :class="labelClass">{{ t('vehicleBooking.guestCount') }}</label>
          <input id="vr-pax" v-model="form.passengerCount" type="number" min="0" :class="inputClass" />
        </div>
      </div>
    </div>

    <p v-if="errorCode" role="alert" class="mb-3 text-sm text-danger">{{ t(`errors.${errorCode}`, { name: errorDetails?.fullName, id: errorDetails?.requestNo ?? errorDetails?.requestId }) }}</p>

    <div class="flex gap-2 border-t border-hair pt-5">
      <button type="submit" :disabled="isSubmitting" class="btn btn-primary">
        {{ submitLabel }}
      </button>
      <button v-if="request" type="button" class="btn btn-secondary" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </form>
</template>

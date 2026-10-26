<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'
import { useDriversStore } from '@/stores/drivers'
import { useVehicleRequestsStore } from '@/stores/vehicleRequests'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { formatTripRange } from '@/utils/datetime'
import FormModal from '@/components/FormModal.vue'

/**
 * จัดรถให้คำขอ 3 แบบ (dev ยืนยัน 2026-09-28):
 *  - รถบริษัท     : เลือกคนขับของบริษัท + รถของบริษัท
 *  - รถเช่า       : เลือกบริษัทรถเช่า → คนขับ + รถของบริษัทนั้น
 *  - เรียกรถออนไลน์ : เลือกบริการ (Grab) → กรอกชื่อ/เบอร์คนขับ + ทะเบียนรายทริป
 * คนขับ/รถที่ติดงานช่วงเดียวกันเลือกไม่ได้ (backend กันซ้ำอีกชั้นด้วย lock)
 */
const props = defineProps({
  request: { type: Object, required: true },
  // จัดรถทั้งเที่ยวโอที: ทุกคำขอของเที่ยว (request = คำขอแรก ใช้หาเวลา/สถานะว่าง) - null = จัดทีละคำขอ
  tripRequests: { type: Array, default: null },
})
const emit = defineEmits(['close', 'assigned'])

const { t } = useI18n()
const fleet = useFleetStore()
const store = useVehicleRequestsStore()
const toast = useToastStore()

const options = ref({ drivers: [], vehicles: [], providers: [] })
const isLoading = ref(true)
const isSubmitting = ref(false)
const errorCode = ref('')

const targets = props.tripRequests ?? [props.request]
const isTrip = targets.length > 1
// ที่นั่ง/ผู้โดยสารนับรวมทุกคำขอของเที่ยว (นั่งรถคันเดียวกัน)
const totalPassengers = targets.reduce((n, r) => n + r.passengerCount, 0)
const allPassengers = targets.flatMap((r) => r.passengers ?? [])

// ค่าเริ่มต้น: ทั้งเที่ยวใช้รถคันเดียวกันอยู่แล้ว → เลือกคันนั้นไว้, ไม่งั้นเริ่มว่าง
const sameAssignment = targets.every(
  (r) => r.driver && JSON.stringify(r.driver) === JSON.stringify(targets[0].driver),
)
const current = sameAssignment ? targets[0].driver : null
// เรียกรถออนไลน์ / พิมพ์เอง: คนขับและทะเบียนเป็นข้อความรายเที่ยว
const typedKinds = ['OnDemand', 'Manual']
// จำแบบรถที่ใช้ล่าสุด - Admin จัดรถซ้ำๆ แบบเดิมเกือบทุกครั้ง (เก็บในเบราว์เซอร์เท่านั้น)
function lastKind() {
  try {
    const k = localStorage.getItem('assign.lastKind')
    return ['Company', 'Rental', 'OnDemand', 'Manual'].includes(k) ? k : 'Company'
  } catch {
    return 'Company'
  }
}
const form = reactive({
  kind: current?.kind ?? lastKind(),
  providerId: current?.providerId ?? '',
  driverId: current?.id ?? null,
  vehicleId: current?.vehicleId ?? null,
  tripDriverName: typedKinds.includes(current?.kind) ? current.name : '',
  tripDriverPhone: typedKinds.includes(current?.kind) ? current.phone : '',
  licensePlate: typedKinds.includes(current?.kind) ? current.licensePlate : '',
})

async function loadOptions() {
  isLoading.value = true
  try {
    options.value = await fleet.fetchAssignOptions(props.request)
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isLoading.value = false
  }
}
onMounted(async () => {
  await loadOptions()
  await suggestFromRoute()
})

/**
 * คำขอรถโอที (Shuttle) ที่ยังไม่ได้จัดรถ: แนะนำรถ/คนขับประจำสายของผู้โดยสาร
 * (dev ยืนยัน 2026-09-29) - เลือกสายที่มีผู้โดยสารมากสุด แล้วหยิบรถประจำสายคันแรกที่ว่างทั้งรถและคนขับ
 * Admin เปลี่ยนเองได้เสมอ
 */
const suggestion = ref('')
async function suggestFromRoute() {
  if (props.request.requestType !== 'Shuttle' || current || allPassengers.length === 0) return
  try {
    await fleet.fetchShuttleRoutes()
  } catch {
    return // แนะนำไม่ได้ก็ไม่เป็นไร ให้ Admin เลือกเอง
  }
  const counts = new Map()
  for (const p of allPassengers) {
    const routeId = p.routeId
    if (routeId) counts.set(routeId, (counts.get(routeId) ?? 0) + 1)
  }
  if (counts.size === 0) return

  const ranked = [...counts.entries()]
    .map(([routeId, n]) => ({ route: fleet.shuttleRoutes.find((r) => r.id === routeId), n }))
    .filter((x) => x.route)
    .sort((a, b) => b.n - a.n)
  if (ranked.length === 0) return
  const { route, n } = ranked[0]

  const hints = []
  if (ranked.length > 1) {
    hints.push(t('fleet.suggestedMultipleRoutes', { routes: ranked.map((x) => `${x.route.name} (${x.n})`).join(', ') }))
  }
  const isFree = (list, id) => list.some((x) => x.id === id && x.isActive && !x.isBusy)
  const pick = (route.vehicles ?? []).find(
    (v) => v.driverId && isFree(options.value.vehicles, v.vehicleId) && isFree(options.value.drivers, v.driverId),
  )
  if (pick) {
    form.kind = 'Rental'
    form.providerId = route.providerId
    // รอ watch ของ kind/providerId ล้างค่าก่อน แล้วค่อยตั้งรถ/คนขับ
    await nextTick()
    form.vehicleId = pick.vehicleId
    form.driverId = pick.driverId
    hints.unshift(t('fleet.suggestedFromRoute', { route: route.name, n }))
  } else if (route.vehicles?.length) {
    hints.unshift(t('fleet.suggestedBusy', { route: route.name }))
  }
  suggestion.value = hints.join(' • ')
}

const providersOfKind = computed(() => options.value.providers.filter((p) => p.kind === form.kind && p.isActive))
// รถบริษัท = ProviderID ว่าง, รถเช่า = ของบริษัทรถเช่าที่เลือก
const ownerId = computed(() => (form.kind === 'Rental' ? Number(form.providerId) || -1 : null))
const drivers = computed(() => options.value.drivers.filter((d) => d.isActive && (d.providerId ?? null) === ownerId.value))
const vehicles = computed(() => options.value.vehicles.filter((v) => v.isActive && (v.providerId ?? null) === ownerId.value))

// เปลี่ยนแบบ/บริษัท → ล้างตัวเลือกที่ไม่ใช่ของกลุ่มใหม่
watch(
  () => [form.kind, form.providerId],
  () => {
    if (!drivers.value.some((d) => d.id === form.driverId)) form.driverId = null
    if (!vehicles.value.some((v) => v.id === form.vehicleId)) form.vehicleId = null
    if (form.kind !== 'Company' && !providersOfKind.value.some((p) => p.id === Number(form.providerId))) {
      form.providerId = providersOfKind.value.length === 1 ? providersOfKind.value[0].id : ''
    }
  },
)

// ---- เพิ่มคนขับ/รถใหม่ระหว่างจัดรถ (เผื่อยังไม่มีในระบบ) - ลงทะเบียนจริงให้ใช้ซ้ำได้ แล้วเลือกให้เลย ----
const driversStore = useDriversStore()
const adding = ref('') // '' | 'driver' | 'vehicle'
const isAdding = ref(false)
const newDriver = reactive({ name: '', phone: '' })
const newVehicle = reactive({ licensePlate: '', vehicleType: props.request.vehicleType, seatCount: '' })

function openAdd(kind) {
  errorCode.value = ''
  adding.value = kind
}

async function onAddDriver() {
  if (!newDriver.name.trim()) return
  errorCode.value = ''
  isAdding.value = true
  try {
    const driver = await driversStore.create({
      name: newDriver.name,
      phone: newDriver.phone || null,
      providerId: ownerId.value,
    })
    await loadOptions()
    form.driverId = driver.id
    Object.assign(newDriver, { name: '', phone: '' })
    adding.value = ''
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isAdding.value = false
  }
}

async function onAddVehicle() {
  if (!newVehicle.licensePlate.trim()) return
  errorCode.value = ''
  isAdding.value = true
  try {
    const vehicle = await fleet.createVehicle({
      licensePlate: newVehicle.licensePlate,
      vehicleType: newVehicle.vehicleType,
      seatCount: newVehicle.seatCount === '' ? null : Number(newVehicle.seatCount),
      providerId: ownerId.value,
    })
    await loadOptions()
    form.vehicleId = vehicle.id
    Object.assign(newVehicle, { licensePlate: '', seatCount: '' })
    adding.value = ''
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isAdding.value = false
  }
}

function seatsShort(v) {
  return v.seatCount !== null && v.seatCount < totalPassengers
}

const canSubmit = computed(() => {
  if (form.kind === 'Manual') return Boolean(form.tripDriverName.trim() && form.tripDriverPhone.trim() && form.licensePlate.trim())
  if (form.kind === 'OnDemand') return Boolean(form.providerId)
  return Boolean(form.driverId && form.vehicleId && (form.kind === 'Company' || form.providerId))
})

// เหตุผลที่ปุ่มยืนยันกดไม่ได้ - แสดงข้างปุ่ม
const submitHint = computed(() => {
  if (form.kind === 'Manual') return t('fleet.assignNeedTrip')
  if (form.kind !== 'Company' && !form.providerId) return t('fleet.assignNeedProvider')
  if (form.kind === 'OnDemand') return t('fleet.assignNeedTrip')
  if (!form.driverId && !form.vehicleId) return t('fleet.assignNeedBoth')
  return !form.driverId ? t('fleet.assignNeedDriver') : t('fleet.assignNeedVehicle')
})

async function onSubmit() {
  if (!canSubmit.value) return
  errorCode.value = ''
  isSubmitting.value = true
  const payload =
    form.kind === 'Manual'
      ? {
          kind: 'Manual',
          tripDriverName: form.tripDriverName,
          tripDriverPhone: form.tripDriverPhone,
          licensePlate: form.licensePlate,
        }
      : form.kind === 'OnDemand'
      ? {
          kind: 'OnDemand',
          providerId: Number(form.providerId),
          tripDriverName: form.tripDriverName,
          tripDriverPhone: form.tripDriverPhone,
          licensePlate: form.licensePlate,
        }
      : {
          kind: form.kind,
          providerId: form.kind === 'Rental' ? Number(form.providerId) : null,
          driverId: form.driverId,
          vehicleId: form.vehicleId,
        }
  try {
    if (isTrip) await store.assignTrip(targets.map((r) => r.id), payload)
    else await store.assign(props.request.id, payload)
    const driverName =
      typedKinds.includes(form.kind) ? form.tripDriverName : drivers.value.find((d) => d.id === form.driverId)?.name
    try {
      localStorage.setItem('assign.lastKind', form.kind)
    } catch {
      /* ไม่เก็บก็ไม่เป็นไร */
    }
    toast.success(t('toast.driverAssigned', { driver: driverName, destination: props.request.destination }))
    emit('assigned')
  } catch (err) {
    errorCode.value = errorCodeOf(err)
    // คนขับ/รถอาจเพิ่งถูกจัดให้งานอื่นพร้อมกัน - โหลดสถานะว่างใหม่
    if (['DRIVER_SCHEDULE_CONFLICT', 'VEHICLE_SCHEDULE_CONFLICT'].includes(errorCode.value)) await loadOptions()
  } finally {
    isSubmitting.value = false
  }
}

const kinds = ['Company', 'Rental', 'OnDemand', 'Manual']
const inputClass = 'input'
const labelClass = 'label'
const optionClass = (selected, disabled) => [
  'flex items-center justify-between gap-3 rounded-control border px-3 py-2 text-sm',
  disabled
    ? 'cursor-not-allowed border-line bg-canvas text-subtle'
    : selected
      ? 'cursor-pointer border-accent bg-canvas'
      : 'cursor-pointer border-line hover:bg-canvas',
]
</script>

<template>
  <FormModal
    :title="isTrip ? t('admin.assignTripTitle', { n: targets.length }) : t('admin.assignTitle')"
    :submit-label="t('admin.confirmAssign')"
    :submitting="isSubmitting"
    :submit-disabled="!canSubmit || isLoading"
    :submit-hint="submitHint"
    :error-message="errorCode ? t(`errors.${errorCode}`) : ''"
    max-width="max-w-2xl"
    @submit="onSubmit"
    @close="emit('close')"
  >
    <div class="rounded-control bg-slate-50 px-3 py-2 text-sm">
      <p class="font-medium text-slate-800">{{ request.pickupLocation }}<template v-if="request.pickupGate"> ({{ request.pickupGate }})</template> <AppIcon name="arrowRight" class="mx-0.5 h-3.5 w-3.5 text-slate-400" /> {{ request.destination }}<template v-if="request.destinationGate"> ({{ request.destinationGate }})</template><span v-if="request.requestType === 'BusinessTrip'" class="ml-1 rounded-control bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{{ t(`vehicleBooking.trip${request.tripType ?? 'RoundTrip'}`) }}</span></p>
      <p class="text-xs text-slate-500">
        {{ formatTripRange(request.departTime, request.returnTime) }} •
        {{ t(`vehicleBooking.type${request.vehicleType}`) }} •
        {{ t('vehicleBooking.passengersShort', { n: totalPassengers }) }}
      </p>
      <p v-if="isTrip" class="mt-1 text-xs text-slate-600">
        {{ t('admin.assignTripNote', { ids: targets.map((r) => r.requestNo).join(', ') }) }}
      </p>
    </div>

    <p v-if="isLoading" class="text-sm text-slate-400">{{ t('common.loading') }}</p>
    <template v-else>
      <p v-if="suggestion" class="rounded-control bg-accent-soft px-3 py-2 text-xs text-ink"><AppIcon name="lightbulb" class="mr-1" /> {{ suggestion }}</p>
      <fieldset>
        <legend :class="labelClass">{{ t('fleet.assignKind') }}</legend>
        <div class="seg">
          <button
            v-for="kind in kinds"
            :key="kind"
            type="button"
            :aria-pressed="form.kind === kind"
            class="seg-btn !text-sm"
            @click="form.kind = kind"
          >
            {{ t(`fleet.assign${kind}`) }}
          </button>
        </div>
        <p class="mt-1.5 text-xs text-muted">{{ t(`fleet.assign${form.kind}Hint`) }}</p>
      </fieldset>

      <div v-if="form.kind !== 'Company'">
        <label for="assign-provider" :class="labelClass">
          {{ form.kind === 'Rental' ? t('fleet.kindRental') : t('fleet.kindOnDemand') }}
        </label>
        <select id="assign-provider" v-model="form.providerId" required :class="inputClass">
          <option value="" disabled>{{ t('fleet.chooseProvider') }}</option>
          <option v-for="p in providersOfKind" :key="p.id" :value="p.id">
            {{ p.name }}<template v-if="p.phone"> ({{ p.phone }})</template>
          </option>
        </select>
        <p v-if="providersOfKind.length === 0" class="mt-1 text-xs text-amber-700">{{ t('fleet.noProvidersOfKind') }}</p>
      </div>

      <!-- รถบริษัท / รถเช่า: เลือกคนขับ + รถจากรายชื่อที่ลงทะเบียน -->
      <template v-if="form.kind !== 'OnDemand' && (form.kind === 'Company' || form.providerId)">
        <fieldset>
          <legend :class="labelClass">{{ t('vehicleBooking.driver') }}</legend>
          <p v-if="drivers.length === 0" class="text-sm text-slate-500">{{ t('fleet.noDriversForOwner') }}</p>
          <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <label v-for="d in drivers" :key="d.id" :class="optionClass(form.driverId === d.id, d.isBusy)">
              <span class="flex min-w-0 items-center gap-2">
                <input v-model="form.driverId" type="radio" :value="d.id" :disabled="d.isBusy" />
                <span class="truncate font-medium">{{ d.name }}</span>
                <span v-if="d.phone" class="shrink-0 text-xs text-slate-500">{{ d.phone }}</span>
              </span>
              <span :class="['shrink-0 rounded-control px-2 py-0.5 text-xs font-semibold', d.isBusy ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700']">
                {{ d.isBusy ? t('admin.driverBusy') : t('admin.driverFree') }}
              </span>
            </label>
          </div>
          <button v-if="adding !== 'driver'" type="button" class="link-action mt-2 text-sm" @click="openAdd('driver')">
            + {{ t('fleet.addDriverInline') }}
          </button>
          <div v-else class="mt-2 space-y-3 rounded-control bg-slate-50 p-3">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label for="new-driver-name" :class="labelClass">{{ t('fleet.driverName') }}</label>
                <input id="new-driver-name" v-model="newDriver.name" type="text" maxlength="200" :class="inputClass" />
              </div>
              <div>
                <label for="new-driver-phone" :class="labelClass">{{ t('admin.phone') }}</label>
                <input id="new-driver-phone" v-model="newDriver.phone" type="tel" maxlength="50" :class="inputClass" />
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" :disabled="isAdding" class="btn btn-secondary btn-sm" @click="adding = ''">{{ t('common.cancel') }}</button>
              <button type="button" :disabled="isAdding || !newDriver.name.trim()" class="btn btn-primary btn-sm" @click="onAddDriver">
                {{ t('fleet.saveAndSelect') }}
              </button>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend :class="labelClass">{{ t('fleet.vehicle') }}</legend>
          <p v-if="vehicles.length === 0" class="text-sm text-slate-500">{{ t('fleet.noVehiclesForOwner') }}</p>
          <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <label v-for="v in vehicles" :key="v.id" :class="optionClass(form.vehicleId === v.id, v.isBusy)">
              <span class="flex min-w-0 items-start gap-2">
                <input v-model="form.vehicleId" type="radio" :value="v.id" :disabled="v.isBusy" class="mt-0.5" />
                <span class="min-w-0">
                  <span class="block font-medium">{{ v.licensePlate }}</span>
                  <span class="block truncate text-xs text-slate-500">
                    {{ t(`vehicleBooking.type${v.vehicleType}`) }}
                    <template v-if="v.seatCount"> • {{ t('fleet.seatsShort', { n: v.seatCount }) }}</template>
                    <template v-if="v.description"> • {{ v.description }}</template>
                  </span>
                  <span v-if="seatsShort(v) && !v.isBusy" class="block text-xs font-medium text-amber-700">
                    {{ t('fleet.seatsWarning', { seats: v.seatCount, pax: totalPassengers }) }}
                  </span>
                </span>
              </span>
              <span :class="['shrink-0 rounded-control px-2 py-0.5 text-xs font-semibold', v.isBusy ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700']">
                {{ v.isBusy ? t('admin.driverBusy') : t('admin.driverFree') }}
              </span>
            </label>
          </div>
          <button v-if="adding !== 'vehicle'" type="button" class="link-action mt-2 text-sm" @click="openAdd('vehicle')">
            + {{ t('fleet.addVehicleInline') }}
          </button>
          <div v-else class="mt-2 space-y-3 rounded-control bg-slate-50 p-3">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label for="new-vehicle-plate" :class="labelClass">{{ t('vehicleBooking.licensePlate') }}</label>
                <input id="new-vehicle-plate" v-model="newVehicle.licensePlate" type="text" maxlength="50" :class="inputClass" />
              </div>
              <div>
                <label for="new-vehicle-type" :class="labelClass">{{ t('vehicleBooking.vehicleType') }}</label>
                <select id="new-vehicle-type" v-model="newVehicle.vehicleType" :class="inputClass">
                  <option value="Sedan">{{ t('vehicleBooking.typeSedan') }}</option>
                  <option value="Van">{{ t('vehicleBooking.typeVan') }}</option>
                </select>
              </div>
              <div>
                <label for="new-vehicle-seats" :class="labelClass">{{ t('fleet.seatCount') }}</label>
                <input id="new-vehicle-seats" v-model="newVehicle.seatCount" type="number" min="1" max="100" :class="inputClass" />
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" :disabled="isAdding" class="btn btn-secondary btn-sm" @click="adding = ''">{{ t('common.cancel') }}</button>
              <button type="button" :disabled="isAdding || !newVehicle.licensePlate.trim()" class="btn btn-primary btn-sm" @click="onAddVehicle">
                {{ t('fleet.saveAndSelect') }}
              </button>
            </div>
          </div>
        </fieldset>
      </template>

      <!-- เรียกรถออนไลน์: กรอกข้อมูลคนขับ/รถของเที่ยวนี้ -->
      <fieldset v-if="(form.kind === 'OnDemand' && form.providerId) || form.kind === 'Manual'" class="space-y-3 rounded-card bg-surface p-3">
        <legend class="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{{ t('admin.tripDetails') }}</legend>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label for="trip-driver-name" :class="labelClass">{{ t('admin.tripDriverName') }}</label>
            <input id="trip-driver-name" v-model="form.tripDriverName" type="text" required maxlength="200" :class="inputClass" />
          </div>
          <div>
            <label for="trip-driver-phone" :class="labelClass">{{ t('admin.tripDriverPhone') }}</label>
            <input id="trip-driver-phone" v-model="form.tripDriverPhone" type="tel" required maxlength="50" :class="inputClass" />
          </div>
        </div>
        <div>
          <label for="trip-plate" :class="labelClass">{{ t('vehicleBooking.licensePlate') }}</label>
          <input
            id="trip-plate"
            v-model="form.licensePlate"
            type="text"
            required
            maxlength="50"
            :placeholder="t('admin.licensePlatePlaceholder')"
            :class="inputClass"
          />
        </div>
      </fieldset>
    </template>
  </FormModal>
</template>

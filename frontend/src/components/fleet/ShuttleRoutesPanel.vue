<script setup>
import { confirmDialog } from '@/utils/confirm'
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'
import { useDriversStore } from '@/stores/drivers'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import FormModal from '@/components/FormModal.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import { deleteErrorMessage } from '@/utils/fleetUsage'

const { t } = useI18n()
const fleet = useFleetStore()
const driversStore = useDriversStore()
const toast = useToastStore()

const showInactive = ref(false)
const editingId = ref(null)
const form = reactive(emptyForm())
const errorCode = ref('')
const isSubmitting = ref(false)
const isModalOpen = ref(false)

watch(showInactive, (v) => fleet.fetchShuttleRoutes({ includeInactive: v }), { immediate: true })

// แสดงทีละ 5 สาย เกินนั้นแบ่งหน้า (กรองแล้วจำนวนลดลงจนหน้าปัจจุบันเกิน → ถอยกลับหน้าสุดท้าย)
const PAGE_SIZE = 5
const page = ref(1)
const pagedRoutes = computed(() => fleet.shuttleRoutes.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch(showInactive, () => (page.value = 1))
watch(() => fleet.shuttleRoutes.length, (n) => { page.value = Math.min(page.value, Math.max(1, Math.ceil(n / PAGE_SIZE))) })

// รถ/คนขับของบริษัทรถเช่า ใช้เป็นตัวเลือก "รถประจำสาย"
onMounted(() => Promise.all([fleet.fetchVehicles(), driversStore.fetchAll()]))

// ----- รถประจำสาย + คนขับประจำ (dev ยืนยัน 2026-09-29: สายมีได้หลายคัน แต่ละคันมีคนขับประจำ) -----
const providerVehicles = computed(() =>
  fleet.vehicles.filter((v) => v.isActive && v.providerId === Number(form.providerId)),
)
const providerDrivers = computed(() =>
  driversStore.drivers.filter((d) => d.isActive && d.providerId === Number(form.providerId)),
)

// รถ/คนขับที่เลือกไปแล้วในแถวอื่น เลือกซ้ำไม่ได้
function vehicleTaken(vehicleId, rowIndex) {
  return form.vehicles.some((v, i) => i !== rowIndex && v.vehicleId === vehicleId)
}
function driverTaken(driverId, rowIndex) {
  return form.vehicles.some((v, i) => i !== rowIndex && v.driverId === driverId)
}

// เปลี่ยนบริษัทรถเช่า → รถ/คนขับของบริษัทเดิมใช้กับสายนี้ไม่ได้แล้ว
watch(
  () => form.providerId,
  () => {
    form.vehicles = form.vehicles.filter((v) => !v.vehicleId || providerVehicles.value.some((pv) => pv.id === v.vehicleId))
  },
)

function vehicleOptionLabel(v) {
  const onOtherRoute = v.routeId && v.routeId !== editingId.value ? ` - ${t('fleet.onRoute', { name: v.routeName })}` : ''
  return `${v.licensePlate} (${t(`vehicleBooking.type${v.vehicleType}`)}${v.seatCount ? `, ${t('fleet.seatsShort', { n: v.seatCount })}` : ''})${onOtherRoute}`
}

function emptyForm() {
  return {
    providerId: '',
    name: '',
    allStops: [{ name: '', time: '' }, { name: '', time: '' }],
    morningDepart: '',
    morningArrive: '',
    eveningDepart: '',
    eveningArrive: '',
    vehicles: [],
    isActive: true,
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  errorCode.value = ''
  isModalOpen.value = true
}

function startEdit(r) {
  editingId.value = r.id
  let allStops = [{ name: r.origin, time: r.morningDepart || '' }]
  if (r.stops && r.stops.length) {
    allStops.push(...r.stops.map(s => typeof s === 'string' ? { name: s, time: '' } : { name: s.name, time: s.time || '' }))
  }
  if (r.origin !== r.destination) {
    allStops.push({ name: r.destination, time: r.morningArrive || '' })
  } else if (allStops.length === 1) {
    allStops.push({ name: r.destination, time: r.morningArrive || '' })
  }
  Object.assign(form, {
    providerId: r.providerId,
    name: r.name,
    allStops,
    eveningDepart: r.eveningDepart || '',
    eveningArrive: r.eveningArrive || '',
    vehicles: (r.vehicles ?? []).map((v) => ({ vehicleId: v.vehicleId, driverId: v.driverId ?? '' })),
    isActive: r.isActive,
  })
  errorCode.value = ''
  isModalOpen.value = true
}

function payloadOf(source) {
  const filteredStops = source.allStops.filter(s => s.name && s.name.trim())
  const origin = filteredStops.length > 0 ? filteredStops[0].name.trim() : ''
  const destination = filteredStops.length > 1 ? filteredStops[filteredStops.length - 1].name.trim() : origin
  const stops = filteredStops.length > 2 ? filteredStops.slice(1, filteredStops.length - 1).map(s => ({ name: s.name.trim(), time: s.time || null })) : []

  const originTime = filteredStops.length > 0 ? filteredStops[0].time : null
  const destTime = filteredStops.length > 1 ? filteredStops[filteredStops.length - 1].time : originTime

  return {
    providerId: source.providerId,
    name: source.name,
    origin,
    destination,
    stops,
    morningDepart: originTime || null,
    morningArrive: destTime || null,
    eveningDepart: null,
    eveningArrive: null,
    runDays: '1111111', // ทำงานทุกวันเป็นค่าเริ่มต้น จะได้ไม่ติดปัญหาเวลาจัดรถวันเสาร์
    vehicles: source.vehicles.filter((v) => v.vehicleId).map((v) => ({ vehicleId: v.vehicleId, driverId: v.driverId || null })),
  }
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    if (editingId.value) {
      await fleet.updateShuttleRoute(editingId.value, { ...payloadOf(form), isActive: form.isActive })
      toast.success(t('toast.routeUpdated', { name: form.name }))
    } else {
      await fleet.createShuttleRoute(payloadOf(form))
      toast.success(t('toast.routeCreated', { name: form.name }))
    }
    isModalOpen.value = false
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isSubmitting.value = false
  }
}

async function setActive(r, isActive) {
  if (!isActive && !await confirmDialog(t('fleet.confirmDeactivateRoute', { name: r.name }), { danger: true })) return
  try {
    await fleet.updateShuttleRoute(r.id, {
      ...r,
      stops: r.stops,
      vehicles: undefined, // ไม่แตะรถประจำสายเดิม
      isActive,
    })
    toast.success(t(isActive ? 'toast.routeActivated' : 'toast.routeDeactivated', { name: r.name }))
    if (!showInactive.value) await fleet.fetchShuttleRoutes()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

// ลบได้เมื่อไม่มีผู้โดยสารลงทะเบียนในสาย - ไม่งั้น backend บอกเหตุผล ให้ปิดใช้งานแทน
async function remove(r) {
  if (!await confirmDialog(t('fleet.confirmDeleteRoute', { name: r.name }), { danger: true })) return
  try {
    await fleet.deleteShuttleRoute(r.id)
    toast.success(t('toast.routeDeleted', { name: r.name }))
  } catch (err) {
    toast.error(deleteErrorMessage(t, err, r.name))
  }
}

const inputClass =
  'rounded-control border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'

</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
      <slot name="lead" />
      <label class="flex items-center gap-2 text-sm text-slate-600">
        <input v-model="showInactive" type="checkbox" class="rounded-control border-slate-300" />
        {{ t('fleet.showInactiveRoutes') }}
      </label>
      <button type="button" class="btn btn-primary sm:ml-auto" @click="openCreate">
        <AppIcon name="plus" />{{ t('fleet.addRoute') }}
      </button>
    </div>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('fleet.routeName') }}</th>
            <th>{{ t('fleet.owner') }}</th>
            <th>{{ t('fleet.routePath') }}</th>
            <th>{{ t('fleet.routeVehicles') }}</th>
            <th>{{ t('fleet.schedule') }}</th>
            <th>{{ t('admin.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in pagedRoutes" :key="r.id" :class="{ 'opacity-60': !r.isActive }">
            <td class="whitespace-nowrap py-3 font-medium text-slate-900">{{ r.name }}</td>
            <td class="py-3">{{ r.providerName }}</td>
            <td class="py-3">
              <div class="flex flex-col gap-1 text-xs">
                <div class="font-medium text-emerald-700">• {{ r.origin }} <span v-if="r.morningDepart" class="text-xs text-slate-500">({{ r.morningDepart }})</span></div>
                <div v-for="(s, idx) in r.stops" :key="idx" class="text-slate-500 ml-2 border-l-2 border-slate-200 pl-2">
                  ○ {{ typeof s === 'string' ? s : s.name }} <span v-if="s.time" class="text-xs text-slate-400">({{ s.time }})</span>
                </div>
                <div class="font-medium text-indigo-700">• {{ r.destination }}</div>
              </div>
            </td>
            <td class="py-3">
              <ul v-if="r.vehicles?.length" class="space-y-1 text-xs">
                <li v-for="v in r.vehicles" :key="v.vehicleId">
                  <span class="font-medium text-slate-900">{{ v.licensePlate }}</span>
                  <span v-if="v.seatCount" class="text-slate-500"> ({{ t('fleet.seatsShort', { n: v.seatCount }) }})</span>
                  <span class="block text-slate-600">
                    {{ v.driverName ?? t('fleet.noRegularDriver') }}<template v-if="v.driverPhone"> • {{ v.driverPhone }}</template>
                  </span>
                </li>
              </ul>
              <span v-else class="text-xs text-slate-400">{{ t('fleet.noRouteVehicles') }}</span>
            </td>
            <td class="py-3">
              <div v-if="r.morningDepart" class="font-medium text-slate-900">{{ t('fleet.firstRunTime') }}: {{ r.morningDepart }}</div>
              <div class="mt-1 flex gap-1">
                <span class="inline-flex rounded-control bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {{ t('fleet.onDemandRuns') }}
                </span>
              </div>
            </td>
            <td class="py-3">
              <span
                :class="[
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                  r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                ]"
              >
                {{ r.isActive ? t('admin.active') : t('admin.inactive') }}
              </span>
            </td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="startEdit(r)">
                {{ t('common.edit') }}
              </button>
              <button v-if="r.isActive" type="button" class="link-danger ml-3" @click="setActive(r, false)">
                {{ t('admin.deactivate') }}
              </button>
              <button v-else type="button" class="link-action ml-3 !text-emerald-700" @click="setActive(r, true)">
                {{ t('admin.activate') }}
              </button>
              <button type="button" class="link-danger ml-3" @click="remove(r)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="fleet.shuttleRoutes.length === 0">
            <td colspan="7"><p class="empty-state">{{ t('fleet.noRoutes') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="fleet.shuttleRoutes.length" :page-size="PAGE_SIZE" class="mt-4" />

    <FormModal
      v-if="isModalOpen"
      :title="editingId ? t('fleet.editRoute') : t('fleet.addRoute')"
      :submit-label="editingId ? t('common.save') : t('fleet.addRoute')"
      :submitting="isSubmitting"
      :error-message="errorCode ? t(`errors.${errorCode}`) : ''"
      @submit="onSubmit"
      @close="isModalOpen = false"
    >
      <div>
        <label for="route-owner" :class="labelClass">{{ t('fleet.owner') }} {{ t('fleet.rentalSuffix') }}</label>
        <select id="route-owner" v-model="form.providerId" required :class="[inputClass, 'w-full']">
          <option value="" disabled>{{ t('fleet.chooseProvider') }}</option>
          <option v-for="p in fleet.rentalProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div>
        <label for="route-name" :class="labelClass">{{ t('fleet.routeName') }}</label>
        <input
          id="route-name"
          v-model="form.name"
          type="text"
          required
          maxlength="100"
          :placeholder="t('fleet.routeNamePh')"
          :class="[inputClass, 'w-full']"
        />
      </div>
      <div>
        <label :class="labelClass">{{ t('fleet.routePath') }}</label>
        <div class="flex flex-col gap-2">
          <div v-for="(stop, idx) in form.allStops" :key="idx" class="flex items-center gap-2">
            <span class="text-xs font-medium text-slate-500 w-16 whitespace-nowrap text-right">
              {{ idx === 0 ? t('fleet.origin') : idx === form.allStops.length - 1 ? t('fleet.destination') : t('fleet.stopN', { n: idx }) }}
            </span>
            <input v-model="form.allStops[idx].name" type="text" required maxlength="200" :class="[inputClass, 'w-full flex-1']" :placeholder="t('fleet.placePh')" />
            <TimePicker v-if="idx !== form.allStops.length - 1" v-model="form.allStops[idx].time" :required="false" :title="t('fleet.arriveTime')" />
            <button v-if="form.allStops.length > 2" type="button" @click="form.allStops.splice(idx, 1)" class="text-slate-400 hover:text-red-600 px-2 cursor-pointer" :title="t('fleet.removeStop')"><AppIcon name="close" class="h-4 w-4" /></button>
            <button v-else type="button" class="text-transparent px-2 cursor-default" disabled><AppIcon name="close" class="h-4 w-4" /></button>
          </div>
          <button type="button" @click="form.allStops.splice(form.allStops.length - 1, 0, { name: '', time: '' })" class="mt-1 ml-18 self-start text-sm text-accent hover:text-accent font-medium cursor-pointer">
            {{ t('fleet.addStop') }}
          </button>
        </div>
      </div>

      <fieldset>
        <legend :class="labelClass">{{ t('fleet.routeVehicles') }}</legend>
        <p v-if="!form.providerId" class="text-xs text-slate-500">{{ t('fleet.chooseProviderFirst') }}</p>
        <template v-else>
          <p v-if="providerVehicles.length === 0" class="text-xs text-amber-700">{{ t('fleet.noVehiclesForOwner') }}</p>
          <div v-for="(row, idx) in form.vehicles" :key="idx" class="mb-2 flex flex-wrap items-center gap-2">
            <select
              v-model="row.vehicleId"
              required
              :aria-label="t('fleet.vehicle')"
              :class="[inputClass, 'min-w-0 flex-1']"
            >
              <option value="" disabled>{{ t('fleet.chooseVehicle') }}</option>
              <option v-for="v in providerVehicles" :key="v.id" :value="v.id" :disabled="vehicleTaken(v.id, idx)">
                {{ vehicleOptionLabel(v) }}
              </option>
            </select>
            <select v-model="row.driverId" :aria-label="t('fleet.regularDriver')" :class="[inputClass, 'min-w-0 flex-1']">
              <option value="">{{ t('fleet.noRegularDriver') }}</option>
              <option v-for="d in providerDrivers" :key="d.id" :value="d.id" :disabled="driverTaken(d.id, idx)">
                {{ d.name }}<template v-if="d.phone"> ({{ d.phone }})</template>
              </option>
            </select>
            <button
              type="button"
              class="cursor-pointer px-2 text-slate-400 hover:text-red-600"
              :aria-label="t('common.delete')"
              @click="form.vehicles.splice(idx, 1)"
            >
              <AppIcon name="close" class="h-5 w-5" />
            </button>
          </div>
          <button
            v-if="form.vehicles.length < providerVehicles.length"
            type="button"
            class="cursor-pointer text-sm font-medium text-accent hover:text-accent"
            @click="form.vehicles.push({ vehicleId: '', driverId: '' })"
          >
            + {{ t('fleet.addRouteVehicle') }}
          </button>
          <p class="mt-1 text-xs text-slate-500">{{ t('fleet.routeVehiclesHint') }}</p>
        </template>
      </fieldset>
    </FormModal>
  </div>
</template>

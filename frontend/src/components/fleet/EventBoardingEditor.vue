<script setup>
import { confirmDialog } from '@/utils/confirm'
// รายละเอียดการขึ้นรถของเดินทางกลุ่ม (Admin) - ขั้นตอน: สร้างสายรถ (ตู้/เก๋ง ทะเบียน คนขับ) → เลือกชื่อผู้เดินทางที่ขึ้นคันนั้น
// (จุดขึ้นรถใช้ตามที่ลงชื่อไว้) → "ดูรายงาน" ตรวจสอบ → "ประกาศ" (เว็บ + อีเมลแนบ Excel)
// หน้าหลักเป็นตารางสายรถ - เพิ่ม/แก้ไขสายผ่าน modal (ข้อมูลรถ/คนขับ + เลือกชื่อ + เวลา); ร่างยังไม่ถูกบันทึกจนกว่าจะกด "บันทึก"
// (ประกาศจะบันทึกให้เอง) - หน้าที่ครอบถามก่อนออกผ่าน isDirty
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorCodeOf } from '@/api/client'
import AppIcon from '@/components/common/AppIcon.vue'
import FormModal from '@/components/FormModal.vue'
import { useDriversStore } from '@/stores/drivers'
import { useEventsStore } from '@/stores/events'
import { useFleetStore } from '@/stores/fleet'
import { useToastStore } from '@/stores/toast'
import { formatDateTimeDMY, toLocalDateStr, toLocalTimeStr } from '@/utils/datetime'
import { downloadFile } from '@/utils/download'

const props = defineProps({
  event: { type: Object, required: true },
})
const emit = defineEmits(['back'])

const { t } = useI18n()
const store = useEventsStore()
const fleet = useFleetStore()
const driversStore = useDriversStore()
const toast = useToastStore()
const eventId = props.event.EventID
// เวลาขึ้นรถเป็นของวันเดินทาง - Admin กรอกแค่เวลา
const eventDay = toLocalDateStr(new Date(props.event.EventDate))

const isLoading = ref(true)
const isBusy = ref(false)
const dirty = ref(false)
const publishedAt = ref(null)
const passengers = ref([])
const routes = ref([]) // [{ key, name, vehicleType, vehiclePlate, driverName, driverPhone, memberIds }]
const times = reactive({}) // passengerId → เวลาขึ้นรถ ('05:30')
const showReport = ref(false)
let routeSeq = 0
let suspended = true // ระหว่างโหลดข้อมูลไม่นับเป็นการแก้ไข

const byId = computed(() => new Map(passengers.value.map((p) => [p.id, p])))
const assignedIds = computed(() => new Set(routes.value.flatMap((r) => r.memberIds)))
const unassigned = computed(() => passengers.value.filter((p) => !assignedIds.value.has(p.id)))
const members = (ids) => ids.map((id) => byId.value.get(id)).filter(Boolean)
const hasAssigned = computed(() => assignedIds.value.size > 0)

function showError(err) {
  toast.error(t(`errors.${errorCodeOf(err)}`, err.details ?? {}))
}

function apply(view) {
  suspended = true
  publishedAt.value = view.publishedAt
  passengers.value = view.passengers
  for (const k of Object.keys(times)) delete times[k]
  routes.value = view.routes.map((r) => ({
    key: `r${r.id}`,
    name: r.name,
    vehicleType: r.vehicleType ?? 'Van',
    vehiclePlate: r.vehiclePlate ?? '',
    driverName: r.driverName ?? '',
    driverPhone: r.driverPhone ?? '',
    memberIds: view.passengers.filter((p) => p.routeId === r.id).map((p) => p.id),
  }))
  for (const p of view.passengers) if (p.routeId && p.boardingAt) times[p.id] = toLocalTimeStr(new Date(p.boardingAt))
  dirty.value = false
  nextTick(() => {
    suspended = false
  })
}

async function load() {
  isLoading.value = true
  try {
    apply(await store.fetchBoarding(eventId))
  } catch (err) {
    showError(err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  load()
  // ตัวช่วย "เลือกจากข้อมูลที่มีในระบบ" - ดึงไม่ได้ก็ยังพิมพ์เองได้
  fleet.fetchVehicles().catch(() => {})
  driversStore.fetchAll().catch(() => {})
})

watch(
  [routes, times],
  () => {
    if (!suspended) dirty.value = true
  },
  { deep: true },
)

defineExpose({ isDirty: computed(() => dirty.value) })

// ---------- เวลา: พิมพ์ตรงๆ (530 / 5:30 / 05.30 → 05:30) ----------
const pad = (n) => String(n).padStart(2, '0')
function normalizeTime(value) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  const m = /^(\d{1,2})[:.]?(\d{2})?$/.exec(s)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  return h > 23 || min > 59 ? null : `${pad(h)}:${pad(min)}`
}
const timeInvalid = (value) => normalizeTime(value) === null

const vehicleLabel = (type) => t(`boarding.vehicle${type}`)

/** สรุปเวลาขึ้นรถของสายในตาราง: เวลาเดียว หรือช่วงแรก–สุดท้าย */
function timeSummary(route) {
  const list = [...new Set(route.memberIds.map((id) => times[id]).filter(Boolean))].sort()
  if (!list.length) return '-'
  return list.length === 1 ? list[0] : `${list[0]} – ${list[list.length - 1]}`
}

function memberSummary(route) {
  const names = members(route.memberIds).map((p) => p.name)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
}

async function removeRoute(route) {
  if (!await confirmDialog(t('boarding.confirmRemoveRoute', { name: route.name }), { danger: true })) return
  for (const id of route.memberIds) delete times[id]
  routes.value = routes.value.filter((r) => r.key !== route.key)
}

// ---------- modal เพิ่ม/แก้ไขสาย (แก้ในสำเนา กดตกลงแล้วค่อยเขียนกลับลงร่าง) ----------
const emptyModal = () => ({
  open: false,
  key: null, // null = สายใหม่
  form: { name: '', vehicleType: 'Van', vehiclePlate: '', driverName: '', driverPhone: '' },
  memberIds: [],
  times: {},
  bulkTime: '',
  pickerOpen: false,
  search: '',
  picked: [],
})
const modal = reactive(emptyModal())

function openModal(route = null) {
  Object.assign(modal, emptyModal(), { open: true })
  if (route) {
    modal.key = route.key
    modal.form = {
      name: route.name,
      vehicleType: route.vehicleType,
      vehiclePlate: route.vehiclePlate,
      driverName: route.driverName,
      driverPhone: route.driverPhone,
    }
    modal.memberIds = [...route.memberIds]
    modal.times = Object.fromEntries(route.memberIds.map((id) => [id, times[id] ?? '']))
  } else {
    modal.form.name = t('boarding.defaultRouteName', { n: routes.value.length + 1 })
  }
}
const closeModal = () => {
  modal.open = false
}

const modalMembers = computed(() => members(modal.memberIds))

// เลือกได้เฉพาะคนที่ยังไม่อยู่สายอื่น (และยังไม่ได้อยู่ในสายที่กำลังแก้)
const modalCandidates = computed(() => {
  const takenElsewhere = new Set(routes.value.filter((r) => r.key !== modal.key).flatMap((r) => r.memberIds))
  const q = modal.search.trim().toLowerCase()
  return passengers.value.filter(
    (p) =>
      !takenElsewhere.has(p.id) &&
      !modal.memberIds.includes(p.id) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        (p.department ?? '').toLowerCase().includes(q) ||
        p.pickupLocation.toLowerCase().includes(q)),
  )
})
const allPicked = computed(() => modalCandidates.value.length > 0 && modalCandidates.value.every((p) => modal.picked.includes(p.id)))
const togglePickAll = () => {
  modal.picked = allPicked.value ? [] : modalCandidates.value.map((p) => p.id)
}

function addPicked() {
  const bulk = normalizeTime(modal.bulkTime)
  for (const id of modal.picked) {
    modal.memberIds.push(id)
    modal.times[id] = bulk || '' // ตั้งเวลาทั้งสายไว้แล้ว → คนที่เพิ่มเข้ามาได้เวลานั้นเลย
  }
  modal.picked = []
  modal.search = ''
  modal.pickerOpen = false
}
function removeMember(id) {
  modal.memberIds = modal.memberIds.filter((x) => x !== id)
  delete modal.times[id]
}
function tidyModalTime(id) {
  const n = normalizeTime(modal.times[id])
  if (n !== null) modal.times[id] = n
}
function tidyBulk() {
  const n = normalizeTime(modal.bulkTime)
  if (n !== null) modal.bulkTime = n
}
function applyBulkTime() {
  const n = normalizeTime(modal.bulkTime)
  if (!n) {
    toast.error(t('boarding.timeInvalid'))
    return
  }
  modal.bulkTime = n
  for (const id of modal.memberIds) modal.times[id] = n
}

const vehicleOptions = computed(() => fleet.vehicles.filter((v) => v.isActive !== false))
const driverOptions = computed(() => driversStore.drivers.filter((d) => d.isActive !== false))
function pickVehicle(id) {
  const v = fleet.vehicles.find((x) => x.id === Number(id))
  if (!v) return
  modal.form.vehiclePlate = v.licensePlate
  if (['Van', 'Sedan'].includes(v.vehicleType)) modal.form.vehicleType = v.vehicleType
}
function pickDriver(id) {
  const d = driversStore.drivers.find((x) => x.id === Number(id))
  if (!d) return
  modal.form.driverName = d.name
  modal.form.driverPhone = d.phone ?? ''
}

function submitModal() {
  if (!modal.form.name.trim()) {
    toast.error(t('errors.VALIDATION_ERROR'))
    return
  }
  if (modal.memberIds.some((id) => timeInvalid(modal.times[id])) || timeInvalid(modal.bulkTime)) {
    toast.error(t('boarding.timeInvalid'))
    return
  }
  const data = { ...modal.form, name: modal.form.name.trim(), memberIds: [...modal.memberIds] }
  if (modal.key) {
    const route = routes.value.find((r) => r.key === modal.key)
    for (const id of route.memberIds) if (!data.memberIds.includes(id)) delete times[id]
    Object.assign(route, data)
  } else {
    routes.value.push({ key: `n${++routeSeq}`, ...data })
  }
  for (const id of data.memberIds) {
    const n = normalizeTime(modal.times[id])
    if (n) times[id] = n
    else delete times[id]
  }
  closeModal()
}

// ---------- บันทึก / ประกาศ ----------
function buildPayload() {
  const routeOf = new Map(routes.value.flatMap((r, i) => r.memberIds.map((id) => [id, i])))
  return {
    routes: routes.value.map((r) => ({
      name: r.name,
      vehicleType: r.vehicleType,
      vehiclePlate: r.vehiclePlate,
      driverName: r.driverName,
      driverPhone: r.driverPhone,
    })),
    assignments: passengers.value.map((p) => {
      const routeIndex = routeOf.has(p.id) ? routeOf.get(p.id) : null
      const time = normalizeTime(times[p.id])
      return { passengerId: p.id, routeIndex, boardingAt: routeIndex !== null && time ? `${eventDay}T${time}:00` : null }
    }),
  }
}

async function save() {
  isBusy.value = true
  try {
    apply(await store.saveBoarding(eventId, buildPayload()))
    toast.success(t('boarding.saved'))
    return true
  } catch (err) {
    showError(err)
    return false
  } finally {
    isBusy.value = false
  }
}

async function publish() {
  if (publishedAt.value && !await confirmDialog(t('boarding.confirmRepublish'))) return
  if (dirty.value && !(await save())) return
  isBusy.value = true
  try {
    apply(await store.publishBoarding(eventId))
    showReport.value = false
    toast.success(t('boarding.publishedOk'))
  } catch (err) {
    showError(err)
  } finally {
    isBusy.value = false
  }
}

async function unpublish() {
  if (!await confirmDialog(t('boarding.confirmUnpublish'), { danger: true })) return
  isBusy.value = true
  try {
    const keepDraft = dirty.value
    const view = await store.unpublishBoarding(eventId)
    publishedAt.value = view.publishedAt
    if (!keepDraft) apply(view)
    toast.success(t('boarding.unpublishedOk'))
  } catch (err) {
    showError(err)
  } finally {
    isBusy.value = false
  }
}

// kind: 'all' = รายชื่อรวมทั้งกิจกรรม (เรียงตามจุดขึ้นรถ) | 'routes' = แยกตามสายรถ (สรุป + 1 ชีตต่อสาย)
async function downloadExcel(kind) {
  const byRoute = kind === 'routes'
  try {
    await downloadFile(`/api/events/${eventId}/report${byRoute ? '/routes' : ''}`, byRoute ? 'routes.xlsx' : 'passengers.xlsx')
  } catch {
    toast.error(t('groupTrips.exportFailed'))
  }
}

const inputClass =
  'w-full rounded-control border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none'
const labelClass = 'mb-1 block text-sm font-bold text-slate-800'
const timeClass = (invalid) =>
  `w-24 rounded-control border px-2 py-1.5 text-center text-sm focus:outline-none ${invalid ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-900 focus:border-slate-500'}`
const secondaryBtn =
  'flex cursor-pointer items-center gap-1.5 rounded-control border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const primaryBtn =
  'flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50'
// ปุ่มเลือกแบบแถบ (ตู้/เก๋ง) - แบบเดียวกับตัวกรองในหน้าจัดการคำขอรถ
const pillClass = (active) => [
  'seg-btn',
  active ? 'is-active' : '',
]
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <h3 class="text-lg font-semibold text-slate-900">{{ t('boarding.title') }}: {{ event.Title }}</h3>
        <p class="mt-1 text-sm text-slate-500">{{ t('boarding.subtitle') }}</p>
      </div>
      <button type="button" :class="secondaryBtn" @click="emit('back')">
        <AppIcon name="arrowLeft" />{{ t('boarding.backToList') }}
      </button>
    </div>

    <p v-if="isLoading" class="py-10 text-center text-sm text-slate-500">{{ t('common.loading') }}</p>

    <template v-else>
      <!-- แถบสถานะ + ปุ่มหลัก -->
      <div
        class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border px-4 py-3"
        :class="publishedAt ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'"
      >
        <p class="flex items-center gap-1.5 text-sm font-bold" :class="publishedAt ? 'text-emerald-800' : 'text-slate-600'">
          <AppIcon :name="publishedAt ? 'checkCircle' : 'clock'" />
          {{ publishedAt ? t('boarding.publishedAt', { time: formatDateTimeDMY(publishedAt) }) : t('boarding.notPublished') }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" :class="secondaryBtn" :disabled="!passengers.length" @click="showReport = true">
            <AppIcon name="document" />{{ t('boarding.viewReport') }}
          </button>
          <button
            type="button"
            :class="secondaryBtn"
            :disabled="!hasAssigned || dirty"
            :title="dirty ? t('boarding.saveFirst') : ''"
            @click="downloadExcel('routes')"
          >
            <AppIcon name="download" />{{ t('boarding.exportRoutes') }}
          </button>
          <button type="button" :class="primaryBtn" :disabled="isBusy || !hasAssigned" @click="publish">
            <AppIcon name="userAdd" />{{ publishedAt ? t('boarding.republish') : t('boarding.publish') }}
          </button>
          <button v-if="publishedAt" type="button" :class="secondaryBtn" :disabled="isBusy" @click="unpublish">
            {{ t('boarding.unpublish') }}
          </button>
        </div>
      </div>
      <p v-if="publishedAt" class="mt-2 flex items-start gap-1.5 text-sm text-slate-500">
        <AppIcon name="exclamation" class="mt-0.5 h-4 w-4 shrink-0" />{{ t('boarding.editedAfterPublish') }}
      </p>

      <div
        v-if="dirty"
        class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-amber-50 px-4 py-2 text-sm text-amber-900"
      >
        <span class="flex items-center gap-1.5"><AppIcon name="warning" class="text-amber-600" />{{ t('boarding.draftBanner') }}</span>
        <span class="flex gap-2">
          <button type="button" :class="secondaryBtn" :disabled="isBusy" @click="load">{{ t('boarding.discard') }}</button>
          <button type="button" :class="primaryBtn" :disabled="isBusy" @click="save">{{ t('boarding.save') }}</button>
        </span>
      </div>

      <p v-if="!passengers.length" class="py-10 text-center text-sm text-slate-500">{{ t('boarding.noPassengers') }}</p>

      <template v-else>
        <div class="mt-5 flex items-center justify-between">
          <h4 class="text-base font-semibold text-slate-900">
            {{ t('boarding.routesTitle') }}
            <span class="ml-1 text-sm font-normal text-slate-500">
              ({{ t('boarding.assignedSummary', { done: assignedIds.size, total: passengers.length }) }})
            </span>
          </h4>
          <button type="button" :class="primaryBtn" @click="openModal()"><AppIcon name="plus" />{{ t('boarding.addRoute') }}</button>
        </div>

        <!-- ตารางสายรถ: หนึ่งสายต่อหนึ่งแถว แก้ไขผ่าน modal -->
        <div class="mt-3 overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ t('boarding.routeName') }}</th>
                <th>{{ t('boarding.vehicleType') }}</th>
                <th>{{ t('boarding.plate') }}</th>
                <th>{{ t('boarding.colDriver') }}</th>
                <th>{{ t('boarding.colPassengers') }}</th>
                <th>{{ t('boarding.lblTime') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!routes.length">
                <td colspan="7" class="text-center text-slate-500">{{ t('boarding.noRoutes') }}</td>
              </tr>
              <tr v-for="route in routes" :key="route.key" class="align-top">
                <td class="font-medium text-slate-900">{{ route.name }}</td>
                <td class="whitespace-nowrap">{{ vehicleLabel(route.vehicleType) }}</td>
                <td class="whitespace-nowrap">{{ route.vehiclePlate || '-' }}</td>
                <td>
                  <p>{{ route.driverName || '-' }}</p>
                  <p v-if="route.driverPhone" class="text-xs text-slate-500">{{ route.driverPhone }}</p>
                </td>
                <td>
                  <p class="font-medium text-slate-900">{{ t('boarding.peopleCount', { n: route.memberIds.length }) }}</p>
                  <p class="max-w-xs truncate text-xs text-slate-500">{{ memberSummary(route) }}</p>
                </td>
                <td class="whitespace-nowrap">{{ timeSummary(route) }}</td>
                <td class="whitespace-nowrap text-right">
                  <button type="button" class="mr-3 cursor-pointer text-slate-600 hover:text-slate-900" @click="openModal(route)">{{ t('boarding.edit') }}</button>
                  <button type="button" class="link-danger" @click="removeRoute(route)">{{ t('boarding.removeRoute') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ยังไม่ได้จัดสาย (แจ้งให้รู้ว่าเหลือใคร) -->
        <section v-if="unassigned.length" class="mt-4 rounded-control bg-amber-50/60 px-4 py-3 text-sm">
          <h4 class="mb-1.5 flex items-center gap-1.5 font-bold text-amber-900">
            <AppIcon name="warning" class="text-amber-600" />{{ t('boarding.unassignedTitle', { n: unassigned.length }) }}
          </h4>
          <p class="text-slate-700">
            <span v-for="(p, i) in unassigned" :key="p.id">{{ p.name }}<span class="text-slate-500"> ({{ p.pickupLocation }})</span>{{ i < unassigned.length - 1 ? ', ' : '' }}</span>
          </p>
        </section>

        <div class="mt-4 flex justify-end">
          <button type="button" :class="primaryBtn" :disabled="isBusy || !dirty" @click="save">{{ t('boarding.save') }}</button>
        </div>
      </template>
    </template>

    <!-- modal เพิ่ม/แก้ไขสายรถ -->
    <FormModal
      v-if="modal.open"
      :title="modal.key ? t('boarding.editRoute') : t('boarding.addRoute')"
      :submit-label="t('boarding.confirm')"
      max-width="max-w-3xl"
      @submit="submitModal"
      @close="closeModal"
    >
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label :class="labelClass">{{ t('boarding.routeName') }} <span class="text-red-500">*</span></label>
          <input v-model="modal.form.name" type="text" maxlength="100" :class="inputClass" />
        </div>
        <div>
          <label :class="labelClass">{{ t('boarding.vehicleType') }}</label>
          <div class="seg">
            <button v-for="type in ['Van', 'Sedan']" :key="type" type="button" :class="pillClass(modal.form.vehicleType === type)" @click="modal.form.vehicleType = type">
              {{ vehicleLabel(type) }}
            </button>
          </div>
        </div>
        <div>
          <label :class="labelClass">{{ t('boarding.plate') }}</label>
          <input v-model="modal.form.vehiclePlate" type="text" maxlength="50" :class="inputClass" />
          <select
            v-if="vehicleOptions.length"
            class="mt-1.5 w-full rounded-control border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600"
            @change="pickVehicle($event.target.value); $event.target.value = ''"
          >
            <option value="">{{ t('boarding.pickVehicle') }}</option>
            <option v-for="v in vehicleOptions" :key="v.id" :value="v.id">
              {{ v.licensePlate }} • {{ vehicleLabel(v.vehicleType) }}{{ v.providerName ? ` • ${v.providerName}` : '' }}
            </option>
          </select>
        </div>
        <div>
          <label :class="labelClass">{{ t('boarding.driverName') }}</label>
          <input v-model="modal.form.driverName" type="text" maxlength="150" :class="inputClass" />
          <select
            v-if="driverOptions.length"
            class="mt-1.5 w-full rounded-control border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600"
            @change="pickDriver($event.target.value); $event.target.value = ''"
          >
            <option value="">{{ t('boarding.pickDriver') }}</option>
            <option v-for="d in driverOptions" :key="d.id" :value="d.id">{{ d.name }}{{ d.providerName ? ` • ${d.providerName}` : '' }}</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label :class="labelClass">{{ t('boarding.driverPhone') }}</label>
          <input v-model="modal.form.driverPhone" type="tel" maxlength="50" :class="inputClass" />
        </div>
      </div>

      <!-- ผู้เดินทางในสายนี้ -->
      <div class="border-t border-slate-200 pt-4">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-bold text-slate-800">{{ t('boarding.membersTitle') }} ({{ modal.memberIds.length }})</span>
          <span class="flex items-center gap-2 text-sm text-slate-600">
            {{ t('boarding.routeTime') }}
            <input
              v-model="modal.bulkTime"
              type="text"
              inputmode="numeric"
              maxlength="5"
              :placeholder="t('boarding.timePlaceholder')"
              :class="timeClass(timeInvalid(modal.bulkTime))"
              @blur="tidyBulk"
              @keydown.enter.prevent="applyBulkTime"
            />
            <button type="button" :class="secondaryBtn" :disabled="!modal.memberIds.length || !modal.bulkTime" @click="applyBulkTime">
              {{ t('boarding.applyTime') }}
            </button>
          </span>
        </div>

        <p v-if="!modal.memberIds.length" class="rounded-control border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
          {{ t('boarding.noMembers') }}
        </p>
        <ul v-else class="divide-y divide-hair">
          <li v-for="p in modalMembers" :key="p.id" class="flex items-center gap-3 px-4 py-2.5 text-sm">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-slate-900">{{ p.name }}<span v-if="p.department" class="font-normal text-slate-500"> • {{ p.department }}</span></p>
              <p class="flex items-center gap-1 truncate text-slate-500"><AppIcon name="mapPin" class="h-3.5 w-3.5 shrink-0" />{{ p.pickupLocation }}</p>
            </div>
            <input
              v-model="modal.times[p.id]"
              type="text"
              inputmode="numeric"
              maxlength="5"
              :placeholder="t('boarding.timePlaceholder')"
              :class="timeClass(timeInvalid(modal.times[p.id]))"
              @blur="tidyModalTime(p.id)"
              @keydown.enter.prevent
            />
            <button type="button" class="cursor-pointer text-slate-400 hover:text-red-600" :aria-label="t('boarding.removePassenger')" @click="removeMember(p.id)">
              <AppIcon name="close" class="h-4 w-4" />
            </button>
          </li>
        </ul>

        <button type="button" class="mt-3" :class="secondaryBtn" @click="modal.pickerOpen = !modal.pickerOpen">
          <AppIcon name="userAdd" />{{ t('boarding.addPassengers') }}
        </button>

        <!-- เลือกชื่อ (เลือกได้หลายคนในครั้งเดียว) -->
        <div v-if="modal.pickerOpen" class="mt-3 rounded-card bg-surface p-3">
          <input
            v-model="modal.search"
            type="text"
            autocomplete="off"
            :placeholder="t('boarding.searchPassenger')"
            :class="inputClass"
            @keydown.enter.prevent
          />
          <p v-if="!modalCandidates.length" class="mt-2 text-sm text-slate-500">{{ t('boarding.noUnassigned') }}</p>
          <template v-else>
            <label class="mt-2 flex cursor-pointer items-center gap-2 px-1 text-sm font-bold text-slate-700">
              <input type="checkbox" :checked="allPicked" @change="togglePickAll" />{{ t('boarding.pickAll') }}
            </label>
            <ul class="mt-1 max-h-56 divide-y divide-hair overflow-y-auto bg-white text-sm">
              <li v-for="p in modalCandidates" :key="p.id">
                <label class="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <input v-model="modal.picked" type="checkbox" :value="p.id" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-slate-900">{{ p.name }}<span v-if="p.department" class="font-normal text-slate-500"> • {{ p.department }}</span></span>
                    <span class="block truncate text-slate-500">{{ p.pickupLocation }}</span>
                  </span>
                </label>
              </li>
            </ul>
          </template>
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" :class="secondaryBtn" @click="modal.pickerOpen = false">{{ t('boarding.closePicker') }}</button>
            <button type="button" :class="primaryBtn" :disabled="!modal.picked.length" @click="addPicked">
              {{ t('boarding.addSelected', { n: modal.picked.length }) }}
            </button>
          </div>
        </div>
      </div>
    </FormModal>

    <!-- รายงานสำหรับตรวจสอบก่อนประกาศ: เหมือนที่พนักงานจะเห็น/ได้ในอีเมล -->
    <div v-if="showReport" class="modal-backdrop" @click.self="showReport = false">
      <div class="modal-panel max-h-[90vh] max-w-5xl">
        <div class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h3 class="text-base font-bold text-slate-900">{{ t('boarding.reportTitle') }}</h3>
            <p class="mt-0.5 text-sm text-slate-500">{{ event.Title }} • {{ formatDateTimeDMY(event.EventDate) }} • {{ t('boarding.reportHint') }}</p>
          </div>
          <button type="button" class="cursor-pointer text-slate-400 hover:text-slate-600" :aria-label="t('common.close')" @click="showReport = false">
            <AppIcon name="close" class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 pb-4">
        <p v-if="!hasAssigned" class="py-8 text-center text-sm text-slate-500">{{ t('boarding.reportEmpty') }}</p>

        <section v-for="route in routes.filter((r) => r.memberIds.length)" :key="route.key" class="mt-4 overflow-hidden">
          <div class="bg-slate-50 px-4 py-2.5 text-sm">
            <p class="font-bold text-slate-900">{{ route.name }} • {{ vehicleLabel(route.vehicleType) }}</p>
            <p class="text-slate-600">
              {{ t('boarding.lblPlate') }}: <b>{{ route.vehiclePlate || '-' }}</b> •
              {{ t('boarding.lblDriver') }}: <b>{{ route.driverName || '-' }}</b>{{ route.driverPhone ? ` (${route.driverPhone})` : '' }}
            </p>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th class="w-12">{{ t('boarding.colOrder') }}</th>
                <th>{{ t('boarding.colName') }}</th>
                <th>{{ t('boarding.colPickup') }}</th>
                <th class="w-20">{{ t('boarding.colTime') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, pi) in members(route.memberIds)" :key="p.id">
                <td>{{ pi + 1 }}</td>
                <td><span class="font-medium text-slate-900">{{ p.name }}</span><span v-if="p.department" class="text-slate-500"> • {{ p.department }}</span></td>
                <td>{{ p.pickupLocation }}</td>
                <td class="font-medium">{{ times[p.id] || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <p v-if="unassigned.length && hasAssigned" class="mt-4 flex items-start gap-1.5 rounded-control bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AppIcon name="warning" class="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          {{ t('boarding.unassignedTitle', { n: unassigned.length }) }}: {{ unassigned.map((p) => p.name).join(', ') }}
        </p>

        </div>

        <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <span v-if="dirty" class="mr-auto text-sm text-amber-700">{{ t('boarding.saveFirst') }}</span>
          <button type="button" :class="secondaryBtn" :disabled="dirty" @click="downloadExcel('all')">
            <AppIcon name="download" />{{ t('boarding.exportAll') }}
          </button>
          <button type="button" :class="secondaryBtn" :disabled="dirty || !hasAssigned" @click="downloadExcel('routes')">
            <AppIcon name="download" />{{ t('boarding.exportRoutes') }}
          </button>
          <button type="button" :class="secondaryBtn" @click="showReport = false">{{ t('common.close') }}</button>
          <button type="button" :class="primaryBtn" :disabled="isBusy || !hasAssigned" @click="publish">
            <AppIcon name="userAdd" />{{ publishedAt ? t('boarding.republish') : t('boarding.publish') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

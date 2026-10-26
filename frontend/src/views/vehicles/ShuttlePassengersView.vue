<script setup>
import { confirmDialog } from '@/utils/confirm'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'
import { useUsersStore } from '@/stores/users'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import FormModal from '@/components/FormModal.vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const { t } = useI18n()
const fleet = useFleetStore()
const users = useUsersStore()
const toast = useToastStore()

// รายชื่ออาจมีหลายร้อยคน - หน้าละ 10 คน + ค้นหา/กรองสายให้หาคนเจอ (dev ขอ 2026-09-29)
const PAGE_SIZE = 10
const page = ref(1)
const search = ref('')
const routeFilter = ref('')

const filteredPassengers = computed(() => {
  const q = search.value.trim().toLowerCase()
  return fleet.shuttlePassengers
    .filter((p) => !routeFilter.value || p.routeId === routeFilter.value)
    .filter(
      (p) =>
        !q ||
        [p.fullName, p.department, p.pickupStop].some((v) => v?.toLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        (a.routeName ?? '').localeCompare(b.routeName ?? '', 'th') ||
        a.fullName.localeCompare(b.fullName, 'th'),
    )
})
const pagedPassengers = computed(() =>
  filteredPassengers.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
watch([search, routeFilter], () => {
  page.value = 1
})
// ลบคนสุดท้ายของหน้าท้าย - อย่าค้างอยู่หน้าว่าง
watch(
  () => filteredPassengers.value.length,
  (n) => {
    const last = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (page.value > last) page.value = last
  },
)

const isModalOpen = ref(false)
const isSubmitting = ref(false)
const errorCode = ref('')

// ตัวกรองแผนกในช่องเลือกพนักงาน (modal เพิ่มพนักงาน) - รายชื่อมีหลายร้อยคน
const isEditing = ref(false)
const modalDepartment = ref('')
const modalDepartments = computed(() =>
  [...new Set(users.users.map((u) => u.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')),
)
const modalUsers = computed(() =>
  users.users.filter((u) => !modalDepartment.value || u.department === modalDepartment.value),
)

const form = reactive({
  userId: '',
  routeId: '',
  pickupStop: '',
})

onMounted(() => {
  fleet.fetchShuttleRoutes()
  fleet.fetchShuttlePassengers()
  users.fetchAll() // Need all users to populate the select
})

function openCreate() {
  isEditing.value = false
  modalDepartment.value = ''
  form.userId = ''
  form.routeId = ''
  form.pickupStop = ''
  errorCode.value = ''
  isModalOpen.value = true
}

function startEdit(p) {
  isEditing.value = true
  form.userId = p.userId
  form.routeId = p.routeId
  form.pickupStop = p.pickupStop
  errorCode.value = ''
  isModalOpen.value = true
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    await fleet.updateShuttlePassenger(form.userId, {
      routeId: form.routeId,
      pickupStop: form.pickupStop,
    })
    toast.success(t('passengers.saved'))
    isModalOpen.value = false
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isSubmitting.value = false
  }
}

async function deletePassenger(p) {
  if (!await confirmDialog(t('passengers.confirmRemove', { name: p.fullName }), { danger: true })) return
  try {
    await fleet.deleteShuttlePassenger(p.userId)
    toast.success(t('passengers.removed'))
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

const activeRoutes = computed(() => fleet.shuttleRoutes.filter(r => r.isActive))

const routeStops = computed(() => {
  if (!form.routeId) return []
  const route = activeRoutes.value.find(r => r.id === form.routeId)
  if (!route) return []
  
  const stops = [{ name: route.origin, time: route.morningDepart }]
  if (route.stops && route.stops.length) {
    stops.push(...route.stops.map(s => typeof s === 'string' ? { name: s, time: null } : s))
  }
  if (route.origin !== route.destination) {
    stops.push({ name: route.destination, time: null })
  }
  
  return stops.filter(s => s.name).map(s => ({
    value: s.name,
    label: s.time ? `${s.name} (${s.time})` : s.name
  }))
})

// ล้างจุดรับส่งเมื่อเปลี่ยนสาย
function onRouteChanged() {
  form.pickupStop = ''
}

const inputClass = 'w-full rounded-control border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('admin.passengers') }}</h1>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="w-full sm:w-72">
        <label for="pass-search" :class="labelClass">{{ t('admin.filterSearch') }}</label>
        <input
          id="pass-search"
          v-model="search"
          type="search"
          :placeholder="t('vehicleBooking.passengerSearchPlaceholder')"
          :class="inputClass"
        />
      </div>
      <div class="w-full sm:w-56">
        <label for="pass-route-filter" :class="labelClass">{{ t('vehicleBooking.shuttleRouteTitle') }}</label>
        <select id="pass-route-filter" v-model="routeFilter" :class="inputClass">
          <option value="">{{ t('admin.filterAll') }}</option>
          <option v-for="r in fleet.shuttleRoutes" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>
      <p class="pb-2 text-sm text-slate-500">
        {{ t('vehicleBooking.passengerCountOf', { n: filteredPassengers.length, total: fleet.shuttlePassengers.length }) }}
      </p>
      <button type="button" class="btn btn-primary sm:ml-auto" @click="openCreate">
        <AppIcon name="plus" />{{ t('passengers.add') }}
      </button>
    </div>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('admin.fullName') }}</th>
            <th>{{ t('admin.department') }}</th>
            <th>{{ t('fleet.routeName') }}</th>
            <th>{{ t('vehicleBooking.pickupStop') }}</th>
            <th class="text-right"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pagedPassengers" :key="p.userId">
            <td class="whitespace-nowrap py-3 font-medium text-slate-900">{{ p.fullName }}</td>
            <td class="py-3">{{ p.department || '-' }}</td>
            <td class="py-3">{{ p.routeName }}</td>
            <td class="py-3">{{ p.pickupStop }}</td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="startEdit(p)">
                {{ t('common.edit') }}
              </button>
              <button type="button" class="link-danger ml-3" @click="deletePassenger(p)">
                {{ t('passengers.remove') }}
              </button>
            </td>
          </tr>
          <tr v-if="fleet.shuttlePassengers.length === 0">
            <td colspan="5"><p class="empty-state">{{ t('passengers.empty') }}</p></td>
          </tr>
          <tr v-else-if="filteredPassengers.length === 0">
            <td colspan="5"><p class="empty-state">{{ t('admin.filterNoMatch') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar v-model:page="page" :total="filteredPassengers.length" :page-size="PAGE_SIZE" class="mt-4" />

    <FormModal
      v-if="isModalOpen"
      :title="t('passengers.modalTitle')"
      :submit-label="t('common.save')"
      :submitting="isSubmitting"
      :error-message="errorCode ? t(`errors.${errorCode}`) : ''"
      @submit="onSubmit"
      @close="isModalOpen = false"
    >
      <div v-if="!isEditing" class="mb-4">
        <label for="pass-dept" :class="labelClass">{{ t('admin.department') }}</label>
        <select id="pass-dept" v-model="modalDepartment" :class="inputClass">
          <option value="">{{ t('admin.filterAll') }}</option>
          <option v-for="d in modalDepartments" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>

      <div>
        <label for="pass-user" :class="labelClass">{{ t('passengers.employee') }}</label>
        <select id="pass-user" v-model="form.userId" required :class="inputClass" :disabled="isEditing">
          <option value="" disabled>{{ t('passengers.pickEmployee') }}</option>
          <option v-for="u in modalUsers" :key="u.id" :value="u.id">{{ u.employeeCode ? `${u.employeeCode} · ` : '' }}{{ u.fullName }} {{ u.department ? `(${u.department})` : '' }}</option>
        </select>
        <p v-if="isEditing" class="mt-1 text-xs text-slate-500">{{ t('passengers.cannotChangeEmployee') }}</p>
      </div>

      <div class="mt-4">
        <label for="pass-route" :class="labelClass">{{ t('passengers.route') }}</label>
        <select id="pass-route" v-model="form.routeId" @change="onRouteChanged" required :class="inputClass">
          <option value="" disabled>{{ t('passengers.pickRoute') }}</option>
          <option v-for="r in activeRoutes" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>

      <div class="mt-4" v-if="routeStops.length > 0">
        <label for="pass-stop" :class="labelClass">{{ t('passengers.stop') }}</label>
        <select id="pass-stop" v-model="form.pickupStop" required :class="inputClass">
          <option value="" disabled>{{ t('passengers.pickStop') }}</option>
          <option v-for="stop in routeStops" :key="stop.value" :value="stop.value">{{ stop.label }}</option>
        </select>
      </div>
    </FormModal>
  </section>
</template>

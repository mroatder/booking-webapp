<script setup>
import { confirmDialog } from '@/utils/confirm'
import { ref, reactive, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { deleteErrorMessage } from '@/utils/fleetUsage'
import FormModal from '@/components/FormModal.vue'
import OwnerSelect from '@/components/fleet/OwnerSelect.vue'
import AppIcon from '@/components/common/AppIcon.vue'

// รถที่ลงทะเบียน: รถของบริษัท + รถของบริษัทรถเช่า - เลือกตอนจัดรถ (ทะเบียนถูก snapshot ลงคำขอ)
const { t } = useI18n()
const fleet = useFleetStore()
const toast = useToastStore()

const showInactive = ref(false)
const editingId = ref(null)
const form = reactive(emptyForm())
const errorCode = ref('')
const isSubmitting = ref(false)
const isModalOpen = ref(false)

watch(showInactive, (v) => fleet.fetchVehicles({ includeInactive: v }), { immediate: true })

function emptyForm() {
  return { licensePlate: '', vehicleType: 'Van', seatCount: '', description: '', providerId: '', routeId: '', isActive: true }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  errorCode.value = ''
  isModalOpen.value = true
}

function startEdit(v) {
  editingId.value = v.id
  Object.assign(form, {
    licensePlate: v.licensePlate,
    vehicleType: v.vehicleType,
    seatCount: v.seatCount ?? '',
    description: v.description ?? '',
    providerId: v.providerId ?? '',
    routeId: v.routeId ?? '',
    isActive: v.isActive,
  })
  errorCode.value = ''
  isModalOpen.value = true
}

function payloadOf(source) {
  return {
    licensePlate: source.licensePlate,
    vehicleType: source.vehicleType,
    seatCount: source.seatCount === '' || source.seatCount === null ? null : Number(source.seatCount),
    description: source.description ?? '',
    providerId: source.providerId || null,
    routeId: source.routeId || null,
  }
}

const providerRoutes = computed(() => {
  if (!form.providerId) return []
  return fleet.shuttleRoutes.filter(r => r.providerId === form.providerId && r.isActive)
})

watch(() => form.providerId, () => {
  // If provider changes and route is not valid for new provider, clear it
  if (form.routeId && !providerRoutes.value.some(r => r.id === form.routeId)) {
    form.routeId = ''
  }
})

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    if (editingId.value) {
      await fleet.updateVehicle(editingId.value, { ...payloadOf(form), isActive: form.isActive })
      toast.success(t('toast.vehicleUpdated', { plate: form.licensePlate }))
    } else {
      await fleet.createVehicle(payloadOf(form))
      toast.success(t('toast.vehicleCreated', { plate: form.licensePlate }))
    }
    isModalOpen.value = false
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isSubmitting.value = false
  }
}

async function setActive(v, isActive) {
  if (!isActive && !await confirmDialog(t('fleet.confirmDeactivateVehicle', { plate: v.licensePlate }), { danger: true })) return
  try {
    await fleet.updateVehicle(v.id, { ...payloadOf(v), isActive })
    toast.success(t(isActive ? 'toast.vehicleActivated' : 'toast.vehicleDeactivated', { plate: v.licensePlate }))
    if (!showInactive.value) await fleet.fetchVehicles()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

// ลบได้เฉพาะรถที่ไม่เคยถูกใช้และไม่อยู่ในสาย - มีประวัติแล้ว backend บอกเหตุผล ให้ปิดใช้งานแทน
async function remove(v) {
  if (!await confirmDialog(t('fleet.confirmDeleteVehicle', { plate: v.licensePlate }), { danger: true })) return
  try {
    await fleet.deleteVehicle(v.id)
    toast.success(t('toast.vehicleDeleted', { plate: v.licensePlate }))
  } catch (err) {
    toast.error(deleteErrorMessage(t, err, v.licensePlate))
  }
}

const inputClass =
  'w-full rounded-control border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
      <slot name="lead" />
      <label class="flex items-center gap-2 text-sm text-slate-600">
        <input v-model="showInactive" type="checkbox" class="rounded-control border-slate-300" />
        {{ t('fleet.showInactiveVehicles') }}
      </label>
      <button type="button" class="btn btn-primary sm:ml-auto" @click="openCreate">
        <AppIcon name="plus" />{{ t('fleet.addVehicle') }}
      </button>
    </div>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('vehicleBooking.licensePlate') }}</th>
            <th>{{ t('vehicleBooking.vehicleType') }}</th>
            <th>{{ t('fleet.seatCount') }}</th>
            <th>{{ t('fleet.description') }}</th>
            <th>{{ t('fleet.owner') }}</th>
            <th>{{ t('fleet.route') }}</th>
            <th>{{ t('admin.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in fleet.vehicles" :key="v.id" :class="{ 'opacity-60': !v.isActive }">
            <td class="whitespace-nowrap py-3 font-medium text-slate-900">{{ v.licensePlate }}</td>
            <td class="py-3">{{ t(`vehicleBooking.type${v.vehicleType}`) }}</td>
            <td class="py-3">{{ v.seatCount ?? '-' }}</td>
            <td class="py-3">{{ v.description || '-' }}</td>
            <td class="py-3">{{ v.providerName ?? t('fleet.ownerCompany') }}</td>
            <td class="py-3">{{ v.routeName || '-' }}</td>
            <td class="py-3">
              <span
                :class="[
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                  v.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                ]"
              >
                {{ v.isActive ? t('admin.active') : t('admin.inactive') }}
              </span>
            </td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="startEdit(v)">
                {{ t('common.edit') }}
              </button>
              <button v-if="v.isActive" type="button" class="link-danger ml-3" @click="setActive(v, false)">
                {{ t('admin.deactivate') }}
              </button>
              <button v-else type="button" class="link-action ml-3 !text-emerald-700" @click="setActive(v, true)">
                {{ t('admin.activate') }}
              </button>
              <button type="button" class="link-danger ml-3 !text-subtle" @click="remove(v)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="!fleet.isLoading && fleet.vehicles.length === 0">
            <td colspan="8"><p class="empty-state">{{ t('fleet.noVehicles') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <FormModal
      v-if="isModalOpen"
      :title="editingId ? t('fleet.editVehicle') : t('fleet.addVehicle')"
      :submit-label="editingId ? t('common.save') : t('fleet.addVehicle')"
      :submitting="isSubmitting"
      :error-message="errorCode ? t(`errors.${errorCode}`) : ''"
      @submit="onSubmit"
      @close="isModalOpen = false"
    >
      <div>
        <label for="veh-owner" :class="labelClass">{{ t('fleet.owner') }}</label>
        <OwnerSelect id="veh-owner" v-model="form.providerId" />
      </div>
      <div v-if="providerRoutes.length > 0">
        <label for="veh-route" :class="labelClass">{{ t('fleet.route') }}</label>
        <select id="veh-route" v-model="form.routeId" :class="inputClass">
          <option value="">{{ t('fleet.noRoute') }}</option>
          <option v-for="r in providerRoutes" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>
      <div>
        <label for="veh-plate" :class="labelClass">{{ t('vehicleBooking.licensePlate') }}</label>
        <input
          id="veh-plate"
          v-model="form.licensePlate"
          type="text"
          required
          maxlength="50"
          :placeholder="t('admin.licensePlatePlaceholder')"
          :class="inputClass"
        />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="veh-type" :class="labelClass">{{ t('vehicleBooking.vehicleType') }}</label>
          <select id="veh-type" v-model="form.vehicleType" :class="inputClass">
            <option value="Van">{{ t('vehicleBooking.typeVan') }}</option>
            <option value="Sedan">{{ t('vehicleBooking.typeSedan') }}</option>
          </select>
        </div>
        <div>
          <label for="veh-seats" :class="labelClass">{{ t('fleet.seatCount') }}</label>
          <input id="veh-seats" v-model="form.seatCount" type="number" min="1" max="100" :class="inputClass" />
        </div>
      </div>
      <div>
        <label for="veh-desc" :class="labelClass">{{ t('fleet.description') }}</label>
        <input
          id="veh-desc"
          v-model="form.description"
          type="text"
          maxlength="200"
          :placeholder="t('fleet.descriptionPlaceholder')"
          :class="inputClass"
        />
      </div>
    </FormModal>
  </div>
</template>

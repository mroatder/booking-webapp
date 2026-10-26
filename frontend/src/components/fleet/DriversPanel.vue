<script setup>
import { confirmDialog } from '@/utils/confirm'
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDriversStore } from '@/stores/drivers'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { deleteErrorMessage } from '@/utils/fleetUsage'
import FormModal from '@/components/FormModal.vue'
import OwnerSelect from '@/components/fleet/OwnerSelect.vue'
import AppIcon from '@/components/common/AppIcon.vue'

// คนขับที่ลงทะเบียน: คนขับของบริษัท + คนขับของบริษัทรถเช่า (Grab ไม่มีรายชื่อ - กรอกรายทริปตอนจัดรถ)
const emit = defineEmits(['changed'])
const { t } = useI18n()
const driversStore = useDriversStore()
const toast = useToastStore()

const showInactive = ref(false)
const editingId = ref(null)
const form = reactive({ name: '', phone: '', note: '', providerId: '', isActive: true })
const errorCode = ref('')
const isSubmitting = ref(false)
const isModalOpen = ref(false)

watch(showInactive, (v) => driversStore.fetchAll({ includeInactive: v }), { immediate: true })

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', phone: '', note: '', providerId: '', isActive: true })
  errorCode.value = ''
  isModalOpen.value = true
}

function startEdit(driver) {
  editingId.value = driver.id
  Object.assign(form, { name: driver.name, phone: driver.phone ?? '', note: driver.note ?? '', providerId: driver.providerId ?? '', isActive: driver.isActive })
  errorCode.value = ''
  isModalOpen.value = true
}

function payloadOf(source) {
  return { name: source.name, phone: source.phone ?? '', note: source.note ?? '', providerId: source.providerId || null }
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    if (editingId.value) {
      await driversStore.update(editingId.value, { ...payloadOf(form), isActive: form.isActive })
      toast.success(t('toast.driverUpdated', { name: form.name }))
    } else {
      await driversStore.create(payloadOf(form))
      toast.success(t('toast.driverCreated', { name: form.name }))
    }
    isModalOpen.value = false
    emit('changed')
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isSubmitting.value = false
  }
}

async function setActive(driver, isActive) {
  if (!isActive && !await confirmDialog(t('admin.confirmDeactivateDriver', { name: driver.name }), { danger: true })) return
  try {
    await driversStore.update(driver.id, { ...payloadOf(driver), isActive })
    toast.success(t(isActive ? 'toast.driverActivated' : 'toast.driverDeactivated', { name: driver.name }))
    if (!showInactive.value) await driversStore.fetchAll()
    emit('changed')
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

// ลบได้เฉพาะคนขับที่ไม่เคยถูกใช้ - มีประวัติแล้ว backend บอกเหตุผล ให้ปิดใช้งานแทน
async function remove(driver) {
  if (!await confirmDialog(t('fleet.confirmDeleteDriver', { name: driver.name }), { danger: true })) return
  try {
    await driversStore.remove(driver.id)
    toast.success(t('toast.driverDeleted', { name: driver.name }))
    emit('changed')
  } catch (err) {
    toast.error(deleteErrorMessage(t, err, driver.name))
  }
}

defineExpose({ openCreate })
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
      <slot name="lead" />
      <label class="flex items-center gap-2 text-sm text-slate-600">
        <input v-model="showInactive" type="checkbox" class="rounded-control border-slate-300" />
        {{ t('admin.showInactive') }}
      </label>
      <button type="button" class="btn btn-primary sm:ml-auto" @click="openCreate">
        <AppIcon name="plus" />{{ t('admin.addDriver') }}
      </button>
    </div>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('fleet.driverName') }}</th>
            <th>{{ t('admin.phone') }}</th>
            <th>{{ t('fleet.owner') }}</th>
            <th>{{ t('fleet.driverNote') }}</th>
            <th>{{ t('admin.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="driver in driversStore.drivers" :key="driver.id" :class="{ 'opacity-60': !driver.isActive }">
            <td class="py-3 font-medium text-slate-900">{{ driver.name }}</td>
            <td class="py-3">{{ driver.phone || '-' }}</td>
            <td class="py-3">{{ driver.providerName ?? t('fleet.ownerCompany') }}</td>
            <td class="py-3">{{ driver.note || '-' }}</td>
            <td class="py-3">
              <span
                :class="[
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                  driver.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                ]"
              >
                {{ driver.isActive ? t('admin.active') : t('admin.inactive') }}
              </span>
            </td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="startEdit(driver)">
                {{ t('common.edit') }}
              </button>
              <button
                v-if="driver.isActive"
                type="button"
                class="link-danger ml-3"
                @click="setActive(driver, false)"
              >
                {{ t('admin.deactivate') }}
              </button>
              <button v-else type="button" class="link-action ml-3 !text-emerald-700" @click="setActive(driver, true)">
                {{ t('admin.activate') }}
              </button>
              <button type="button" class="link-danger ml-3 !text-subtle" @click="remove(driver)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="!driversStore.isLoading && driversStore.drivers.length === 0">
            <td colspan="6"><p class="empty-state">{{ t('admin.noDrivers') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <FormModal
      v-if="isModalOpen"
      :title="editingId ? t('fleet.editDriver') : t('admin.addDriver')"
      :submit-label="editingId ? t('common.save') : t('admin.addDriver')"
      :submitting="isSubmitting"
      :error-message="errorCode ? t(`errors.${errorCode}`) : ''"
      @submit="onSubmit"
      @close="isModalOpen = false"
    >
      <div>
        <label for="drv-owner" class="label">{{ t('fleet.owner') }}</label>
        <OwnerSelect id="drv-owner" v-model="form.providerId" />
      </div>
      <div>
        <label for="drv-name" class="label">{{ t('fleet.driverName') }}</label>
        <input
          id="drv-name"
          v-model="form.name"
          type="text"
          required
          maxlength="200"
          class="input"
        />
      </div>
      <div>
        <label for="drv-phone" class="label">{{ t('admin.phone') }}</label>
        <input
          id="drv-phone"
          v-model="form.phone"
          type="tel"
          maxlength="50"
          class="input"
        />
      </div>
      <div>
        <label for="drv-note" class="label">{{ t('fleet.driverNote') }}</label>
        <input
          id="drv-note"
          v-model="form.note"
          type="text"
          maxlength="200"
          :placeholder="t('fleet.driverNotePlaceholder')"
          class="input"
        />
      </div>
    </FormModal>
  </div>
</template>

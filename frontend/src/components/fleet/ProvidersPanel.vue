<script setup>
import { confirmDialog } from '@/utils/confirm'
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFleetStore } from '@/stores/fleet'
import { useToastStore } from '@/stores/toast'
import { errorCodeOf } from '@/api/client'
import { deleteErrorMessage } from '@/utils/fleetUsage'
import FormModal from '@/components/FormModal.vue'
import AppIcon from '@/components/common/AppIcon.vue'

// ผู้ให้บริการภายนอก: บริษัทรถเช่า (มีคนขับ/รถลงทะเบียน) และบริการเรียกรถออนไลน์ เช่น Grab (กรอกรายทริป)
const { t } = useI18n()
const fleet = useFleetStore()
const toast = useToastStore()

const showInactive = ref(false)
const editingId = ref(null)
const form = reactive({ name: '', kind: 'Rental', phone: '', isActive: true })
const errorCode = ref('')
const isSubmitting = ref(false)
const isModalOpen = ref(false)

watch(showInactive, (v) => fleet.fetchProviders({ includeInactive: v }), { immediate: true })

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', kind: 'Rental', phone: '', isActive: true })
  errorCode.value = ''
  isModalOpen.value = true
}

function startEdit(p) {
  editingId.value = p.id
  Object.assign(form, { name: p.name, kind: p.kind, phone: p.phone ?? '', isActive: p.isActive })
  errorCode.value = ''
  isModalOpen.value = true
}

function payloadOf(source) {
  return { name: source.name, kind: source.kind, phone: source.kind === 'Rental' ? (source.phone ?? '') : null }
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  try {
    if (editingId.value) {
      await fleet.updateProvider(editingId.value, { ...payloadOf(form), isActive: form.isActive })
      toast.success(t('toast.providerUpdated', { name: form.name }))
    } else {
      await fleet.createProvider(payloadOf(form))
      toast.success(t('toast.providerCreated', { name: form.name }))
    }
    isModalOpen.value = false
  } catch (err) {
    errorCode.value = errorCodeOf(err)
  } finally {
    isSubmitting.value = false
  }
}

async function setActive(p, isActive) {
  if (!isActive && !await confirmDialog(t('fleet.confirmDeactivateProvider', { name: p.name }), { danger: true })) return
  try {
    await fleet.updateProvider(p.id, { ...payloadOf(p), isActive })
    toast.success(t(isActive ? 'toast.providerActivated' : 'toast.providerDeactivated', { name: p.name }))
    if (!showInactive.value) await fleet.fetchProviders()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

// ลบได้เฉพาะผู้ให้บริการที่ไม่เคยถูกใช้และไม่มีคนขับ/รถ/สายผูกอยู่ - ไม่งั้นบอกเหตุผล ให้ปิดใช้งานแทน
async function remove(p) {
  if (!await confirmDialog(t('fleet.confirmDeleteProvider', { name: p.name }), { danger: true })) return
  try {
    await fleet.deleteProvider(p.id)
    toast.success(t('toast.providerDeleted', { name: p.name }))
  } catch (err) {
    toast.error(deleteErrorMessage(t, err, p.name))
  }
}

const inputClass =
  'w-full rounded-control border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none'
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
      <slot name="lead" />
      <label class="flex items-center gap-2 text-sm text-slate-600">
        <input v-model="showInactive" type="checkbox" class="rounded-control border-slate-300" />
        {{ t('fleet.showInactiveProviders') }}
      </label>
      <button type="button" class="btn btn-primary sm:ml-auto" @click="openCreate">
        <AppIcon name="plus" />{{ t('fleet.addProvider') }}
      </button>
    </div>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('fleet.providerName') }}</th>
            <th>{{ t('fleet.providerKind') }}</th>
            <th>{{ t('admin.phone') }}</th>
            <th>{{ t('admin.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in fleet.providers" :key="p.id" :class="{ 'opacity-60': !p.isActive }">
            <td class="py-3 font-medium text-slate-900">{{ p.name }}</td>
            <td class="py-3">{{ t(`fleet.kind${p.kind}`) }}</td>
            <td class="py-3">
              <span v-if="p.kind === 'OnDemand'" class="text-xs text-slate-400">{{ t('admin.providerPhoneInTrip') }}</span>
              <template v-else>{{ p.phone || '-' }}</template>
            </td>
            <td class="py-3">
              <span
                :class="[
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                  p.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                ]"
              >
                {{ p.isActive ? t('admin.active') : t('admin.inactive') }}
              </span>
            </td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="startEdit(p)">
                {{ t('common.edit') }}
              </button>
              <button v-if="p.isActive" type="button" class="link-danger ml-3" @click="setActive(p, false)">
                {{ t('admin.deactivate') }}
              </button>
              <button v-else type="button" class="link-action ml-3 !text-emerald-700" @click="setActive(p, true)">
                {{ t('admin.activate') }}
              </button>
              <button type="button" class="link-danger ml-3 !text-subtle" @click="remove(p)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="fleet.providers.length === 0">
            <td colspan="5"><p class="empty-state">{{ t('fleet.noProviders') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <FormModal
      v-if="isModalOpen"
      :title="editingId ? t('fleet.editProvider') : t('fleet.addProvider')"
      :submit-label="editingId ? t('common.save') : t('fleet.addProvider')"
      :submitting="isSubmitting"
      :error-message="errorCode ? t(`errors.${errorCode}`) : ''"
      @submit="onSubmit"
      @close="isModalOpen = false"
    >
      <fieldset>
        <legend class="label">{{ t('fleet.providerKind') }}</legend>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label
            v-for="kind in ['Rental', 'OnDemand']"
            :key="kind"
            :class="[
              'flex cursor-pointer flex-col gap-0.5 rounded-control border px-3 py-2 text-sm',
              form.kind === kind ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
            ]"
          >
            <span class="flex items-center gap-2 font-medium text-slate-900">
              <input v-model="form.kind" type="radio" :value="kind" />
              {{ t(`fleet.kind${kind}`) }}
            </span>
            <span class="text-xs text-slate-500">{{ t(`fleet.kind${kind}Hint`) }}</span>
          </label>
        </div>
      </fieldset>
      <div>
        <label for="prov-name" class="label">{{ t('fleet.providerName') }}</label>
        <input
          id="prov-name"
          v-model="form.name"
          type="text"
          required
          maxlength="200"
          :placeholder="form.kind === 'OnDemand' ? 'Grab' : t('fleet.rentalNamePlaceholder')"
          :class="inputClass"
        />
      </div>
      <div v-if="form.kind === 'Rental'">
        <label for="prov-phone" class="label">{{ t('fleet.providerPhone') }}</label>
        <input id="prov-phone" v-model="form.phone" type="tel" maxlength="50" :class="inputClass" />
      </div>
      <p v-else class="rounded-control bg-slate-50 px-3 py-2 text-xs text-slate-600">{{ t('admin.providerPhoneNote') }}</p>
    </FormModal>
  </div>
</template>

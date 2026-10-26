<script setup>
import { confirmDialog } from '@/utils/confirm'
import AppIcon from '@/components/common/AppIcon.vue'
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, ApiError, errorCodeOf } from '@/api/client'
import { useRoomsStore } from '@/stores/rooms'
import { useToastStore } from '@/stores/toast'
import { formatDateTimeDMY } from '@/utils/datetime'
import FormModal from '@/components/FormModal.vue'

// อุปกรณ์ = จอ tablet หน้าห้อง (migration 024) - เพิ่ม/แก้/ย้ายห้อง/ลบ/ออกลิงก์ใหม่ได้
// 1 ห้องมีได้หลายจอ, จอยังไม่ผูกห้องได้ (จะขึ้นข้อความรอผูกห้องบนจอ)
const { t } = useI18n()
const roomsStore = useRoomsStore()
const toast = useToastStore()

const devices = ref([])
const isLoading = ref(false)
const errorCode = ref('')

const isModalOpen = ref(false)
const isSubmitting = ref(false)
const formError = ref('')
const editingId = ref(null)
const form = reactive({ name: '', roomId: '' })

const statusStyle = {
  Online: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', labelKey: 'admin.online' },
  Offline: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-700', labelKey: 'admin.offline' },
  NeverConnected: { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600', labelKey: 'admin.neverConnected' },
}

async function fetchDevices() {
  isLoading.value = true
  errorCode.value = ''
  try {
    const data = await api.get('/tablet/devices')
    devices.value = data.devices
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchDevices()
  roomsStore.fetchAll() // ห้องที่เปิดใช้งาน สำหรับเลือกผูกจอ
})

function formatTime(isoStr) {
  if (!isoStr) return '-'
  return formatDateTimeDMY(isoStr, { withSeconds: true })
}

// ลิงก์ที่ต้องเปิดบน tablet - ใครมีลิงก์ก็เห็นตารางห้องได้โดยไม่ต้อง login
function displayUrl(device) {
  return `${window.location.origin}/tablet/${device.token}`
}

async function copyLink(device) {
  try {
    await navigator.clipboard.writeText(displayUrl(device))
    toast.success(t('admin.deviceLinkCopied', { name: device.name }))
  } catch {
    await confirmDialog(t('admin.deviceLink'), { value: displayUrl(device) })
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', roomId: '' })
  formError.value = ''
  isModalOpen.value = true
}

function startEdit(device) {
  editingId.value = device.id
  Object.assign(form, { name: device.name, roomId: device.roomId ?? '' })
  formError.value = ''
  isModalOpen.value = true
}

// ห้องที่ปิดใช้งานไม่อยู่ในรายการ - จอที่ผูกห้องปิดไว้ ยังแสดงห้องเดิมให้เห็นใน select
const roomOptions = computed(() => {
  const list = roomsStore.rooms.map((r) => ({ id: r.id, label: r.floor ? `${r.name} (${r.floor})` : r.name }))
  const current = devices.value.find((d) => d.id === editingId.value)
  if (current?.roomId && !list.some((r) => r.id === current.roomId)) {
    list.push({ id: current.roomId, label: `${current.roomName} - ${t('admin.inactive')}` })
  }
  return list
})

async function onSubmit() {
  formError.value = ''
  isSubmitting.value = true
  const payload = { name: form.name, roomId: form.roomId || null }
  try {
    if (editingId.value) {
      await api.put(`/tablet/devices/${editingId.value}`, payload)
      toast.success(t('toast.deviceUpdated', { name: payload.name }))
    } else {
      await api.post('/tablet/devices', payload)
      toast.success(t('toast.deviceCreated', { name: payload.name }))
    }
    isModalOpen.value = false
    await fetchDevices()
  } catch (err) {
    formError.value = errorCodeOf(err)
  } finally {
    isSubmitting.value = false
  }
}

async function onRegenerate(device) {
  if (!await confirmDialog(t('admin.confirmRegenerateDeviceToken', { name: device.name }), { danger: true })) return
  try {
    await api.post(`/tablet/devices/${device.id}/token/regenerate`)
    toast.success(t('toast.tokenRegenerated', { name: device.name }))
    await fetchDevices()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

// ลบได้เสมอ - อุปกรณ์ไม่มีประวัติที่อื่นอ้างถึง ลิงก์ของจอนั้นใช้ไม่ได้ทันที
async function onDelete(device) {
  if (!await confirmDialog(t('admin.confirmDeleteDevice', { name: device.name }), { danger: true })) return
  try {
    await api.delete(`/tablet/devices/${device.id}`)
    toast.success(t('toast.deviceDeleted', { name: device.name }))
    await fetchDevices()
  } catch (err) {
    toast.error(t(`errors.${errorCodeOf(err)}`))
  }
}

const inputClass =
  'w-full rounded-control border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'
</script>

<template>
  <section>
    <h1 class="sr-only">{{ t('admin.devices') }}</h1>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="page-note !mt-0">{{ t('admin.deviceStatusNote') }}</p>
      <div class="flex items-center gap-2">
        <button type="button" :disabled="isLoading" class="btn btn-secondary" @click="fetchDevices">
          {{ t('admin.syncNow') }}
        </button>
        <button type="button" class="btn btn-primary" @click="openCreate">
          <AppIcon name="plus" />{{ t('admin.addDevice') }}
        </button>
      </div>
    </div>

    <p v-if="errorCode" role="alert" class="mb-4 rounded-control bg-red-50 p-3 text-sm text-red-600">
      {{ t(`errors.${errorCode}`) }}
    </p>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('admin.deviceName') }}</th>
            <th>{{ t('admin.deviceRoom') }}</th>
            <th>{{ t('admin.deviceStatus') }}</th>
            <th>{{ t('admin.lastSync') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in devices" :key="device.id">
            <td class="py-3 font-medium text-slate-900">{{ device.name }}</td>
            <td class="py-3">
              <template v-if="device.roomId">
                <span :class="device.roomIsActive ? 'text-slate-700' : 'text-slate-400'">
                  {{ device.roomName }}<template v-if="device.floor"> ({{ device.floor }})</template>
                </span>
                <span v-if="!device.roomIsActive" class="ml-1 text-xs text-amber-700"><AppIcon name="warning" class="mr-1" /> {{ t('admin.deviceRoomInactive') }}</span>
              </template>
              <span v-else class="text-xs text-amber-700"><AppIcon name="warning" class="mr-1" /> {{ t('admin.deviceNoRoom') }}</span>
            </td>
            <td class="py-3">
              <span
                :class="[
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  statusStyle[device.status].badge,
                ]"
              >
                <span :class="['h-1.5 w-1.5 rounded-full', statusStyle[device.status].dot]"></span>
                {{ t(statusStyle[device.status].labelKey) }}
              </span>
            </td>
            <td class="py-3 text-slate-600">{{ formatTime(device.lastSeenAt) }}</td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="copyLink(device)">
                {{ t('admin.copyDeviceLink') }}
              </button>
              <button type="button" class="link-action ml-3" @click="startEdit(device)">
                {{ t('common.edit') }}
              </button>
              <button type="button" class="link-action ml-3" @click="onRegenerate(device)">
                {{ t('admin.regenerateToken') }}
              </button>
              <button type="button" class="link-danger ml-3" @click="onDelete(device)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="devices.length === 0 && !isLoading">
            <td colspan="5"><p class="empty-state">{{ t('admin.noDevices') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <FormModal
      v-if="isModalOpen"
      :title="editingId ? t('admin.editDevice') : t('admin.addDevice')"
      :submit-label="editingId ? t('common.save') : t('admin.addDevice')"
      :submitting="isSubmitting"
      :error-message="formError ? t(`errors.${formError}`) : ''"
      @submit="onSubmit"
      @close="isModalOpen = false"
    >
      <div>
        <label for="device-name" :class="labelClass">{{ t('admin.deviceName') }}</label>
        <input
          id="device-name"
          v-model="form.name"
          type="text"
          required
          maxlength="200"
          :placeholder="t('admin.deviceNamePlaceholder')"
          :class="inputClass"
        />
      </div>
      <div>
        <label for="device-room" :class="labelClass">{{ t('admin.deviceRoom') }}</label>
        <select id="device-room" v-model="form.roomId" :class="inputClass">
          <option value="">- {{ t('admin.deviceNoRoom') }} -</option>
          <option v-for="r in roomOptions" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>
        <p class="mt-1 text-xs text-slate-500">{{ t('admin.deviceRoomHint') }}</p>
      </div>
    </FormModal>
  </section>
</template>

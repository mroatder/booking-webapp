<script setup>
import { confirmDialog } from '@/utils/confirm'
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoomsStore } from '@/stores/rooms'
import { useToastStore } from '@/stores/toast'
import { ApiError, errorCodeOf } from '@/api/client'
import FormModal from '@/components/FormModal.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const { t } = useI18n()
const roomsStore = useRoomsStore()
const toast = useToastStore()

const editingId = ref(null)
const form = reactive({ name: '', floor: '' })
const errorCode = ref('')
const isSubmitting = ref(false)
const isModalOpen = ref(false) // ฟอร์มเพิ่ม/แก้ไขอยู่ใน modal (ประหยัดพื้นที่เหนือตาราง)
const showInactive = ref(false)

watch(showInactive, (v) => roomsStore.fetchAll({ includeInactive: v }), { immediate: true })

function resetForm() {
  editingId.value = null
  form.name = ''
  form.floor = ''
  errorCode.value = ''
}

function openCreate() {
  resetForm()
  isModalOpen.value = true
}

function startEdit(room) {
  editingId.value = room.id
  form.name = room.name
  form.floor = room.floor ?? ''
  errorCode.value = ''
  isModalOpen.value = true
}

function closeModal() {
  isModalOpen.value = false
  resetForm()
}

async function onSubmit() {
  errorCode.value = ''
  isSubmitting.value = true
  const payload = { name: form.name, floor: form.floor || null }
  try {
    if (editingId.value) {
      await roomsStore.update(editingId.value, payload)
      toast.success(t('toast.roomUpdated', { name: payload.name }))
    } else {
      await roomsStore.create(payload)
      toast.success(t('toast.roomCreated', { name: payload.name }))
    }
    closeModal()
  } catch (err) {
    errorCode.value = err instanceof ApiError ? err.errorCode : 'GENERIC'
  } finally {
    isSubmitting.value = false
  }
}

// ลบจริงได้เฉพาะห้องที่ไม่เคยมีการจอง - มีประวัติแล้วให้ปิดใช้งานแทน (ประวัติการจองยังอยู่)
async function onDelete(room) {
  if (!await confirmDialog(t('admin.confirmDeleteRoom', { name: room.name }), { danger: true })) return
  try {
    await roomsStore.remove(room.id)
    toast.success(t('toast.roomDeleted', { name: room.name }))
  } catch (err) {
    toast.error(roomErrorMessage(err, room))
  }
}

// ปิดใช้งาน: จองใหม่ไม่ได้ + จอ tablet ของห้องหยุดทำงาน - ปิดไม่ได้ถ้ายังมีการจองที่ยังไม่ถึง
async function setActive(room, isActive) {
  if (!isActive && !await confirmDialog(t('admin.confirmDeactivateRoom', { name: room.name }), { danger: true })) return
  try {
    await roomsStore.setActive(room.id, isActive)
    toast.success(t(isActive ? 'toast.roomActivated' : 'toast.roomDeactivated', { name: room.name }))
    if (!showInactive.value) await roomsStore.fetchAll()
  } catch (err) {
    toast.error(roomErrorMessage(err, room))
  }
}

function roomErrorMessage(err, room) {
  const code = errorCodeOf(err)
  const n = err instanceof ApiError ? err.details?.bookings : undefined
  if (code === 'ROOM_IN_USE' && n) return t('admin.roomInUse', { name: room.name, n })
  if (code === 'ROOM_HAS_UPCOMING_BOOKINGS') return t('admin.roomHasUpcoming', { name: room.name, n })
  return t(`errors.${code}`)
}

</script>

<template>
  <section>
    <div class="mb-6 flex flex-wrap items-center justify-end gap-3">
      <h1 class="sr-only">{{ t('admin.rooms') }}</h1>
      <label class="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input v-model="showInactive" type="checkbox" class="rounded-control border-slate-300" />
        {{ t('admin.showInactive') }}
      </label>
      <button type="button" class="btn btn-primary" @click="openCreate">
        <AppIcon name="plus" />{{ t('admin.addRoom') }}
      </button>
    </div>

    <div class="table-narrow overflow-x-auto">
      <table class="data-table ruled">
        <thead>
          <tr>
            <th>{{ t('admin.roomName') }}</th>
            <th>{{ t('admin.roomFloor') }}</th>
            <th>{{ t('admin.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="room in roomsStore.rooms" :key="room.id" :class="{ 'opacity-60': !room.isActive }">
            <td class="py-3 font-medium text-slate-900">{{ room.name }}</td>
            <td class="py-3">{{ room.floor ?? '-' }}</td>
            <td class="py-3">
              <span
                :class="[
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  room.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                ]"
              >
                {{ room.isActive ? t('admin.active') : t('admin.inactive') }}
              </span>
            </td>
            <td class="whitespace-nowrap py-3 text-right">
              <button type="button" class="link-action" @click="startEdit(room)">
                {{ t('common.edit') }}
              </button>
              <button
                v-if="room.isActive"
                type="button"
                class="link-danger ml-3"
                @click="setActive(room, false)"
              >
                {{ t('admin.deactivate') }}
              </button>
              <button
                v-else
                type="button"
                class="link-action ml-3 !text-emerald-700"
                @click="setActive(room, true)"
              >
                {{ t('admin.activate') }}
              </button>
              <button type="button" class="link-danger ml-3 !text-subtle" @click="onDelete(room)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="roomsStore.rooms.length === 0">
            <td colspan="4"><p class="empty-state">{{ t('admin.noRooms') }}</p></td>
          </tr>
        </tbody>
      </table>
    </div>

    <FormModal
      v-if="isModalOpen"
      :title="editingId ? t('admin.editRoom') : t('admin.addRoom')"
      :submit-label="editingId ? t('common.save') : t('admin.addRoom')"
      :submitting="isSubmitting"
      :error-message="errorCode ? t(`errors.${errorCode}`) : ''"
      @submit="onSubmit"
      @close="closeModal"
    >
      <div>
        <label for="room-name" class="label">{{ t('admin.roomName') }}</label>
        <input id="room-name" v-model="form.name" type="text" required maxlength="200" class="input" />
      </div>
      <div>
        <label for="room-floor" class="label">{{ t('admin.roomFloor') }}</label>
        <input id="room-floor" v-model="form.floor" type="text" maxlength="100" class="input" />
      </div>
    </FormModal>
  </section>
</template>

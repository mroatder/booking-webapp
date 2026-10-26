<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast'
import { useUsersStore } from '@/stores/users'
import DatePicker from '@/components/common/DatePicker.vue'
import TimePicker from '@/components/common/TimePicker.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  event: { type: Object, default: null },
  submitting: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'save'])
const { t } = useI18n()
const toast = useToastStore()
const usersStore = useUsersStore()

// ผู้รับแจ้งเตือนทางอีเมล (เฉพาะตอนสร้าง) - ค่าเริ่มต้นคือเลือกรายคน Admin ต้องเลือกรายชื่อก่อนสร้าง
const notifyMode = ref('selected') // 'selected' | 'all'
const selectedIds = ref(new Set())
const search = ref('')
const departmentFilter = ref('')

const departments = computed(() =>
  [...new Set(usersStore.directory.map((u) => u.department).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'th'),
  ),
)
const visibleUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  return usersStore.directory.filter(
    (u) =>
      (!departmentFilter.value || u.department === departmentFilter.value) &&
      (!q ||
        u.fullName.toLowerCase().includes(q) ||
        (u.department ?? '').toLowerCase().includes(q)),
  )
})
const allVisibleSelected = computed(
  () =>
    visibleUsers.value.length > 0 && visibleUsers.value.every((u) => selectedIds.value.has(u.id)),
)

function toggleUser(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}
/** เลือก/ยกเลิกทุกคนที่กำลังแสดง (ตามตัวกรองแผนกและคำค้น) */
function toggleAllVisible() {
  const next = new Set(selectedIds.value)
  for (const u of visibleUsers.value) {
    if (allVisibleSelected.value) next.delete(u.id)
    else next.add(u.id)
  }
  selectedIds.value = next
}

const title = ref('')
const destination = ref('')

const eventDateDay = ref('')
const eventDateTime = ref('08:00')

const returnDateDay = ref('')
const returnDateTime = ref('17:00')

const deadlineDay = ref('')
const deadlineTime = ref('17:00')

const description = ref('')

onMounted(() => {
  if (!props.event && usersStore.directory.length === 0) usersStore.fetchDirectory().catch(() => {})
  if (props.event) {
    title.value = props.event.Title || ''
    destination.value = props.event.Destination || ''

    if (props.event.EventDate) {
      const [d, t] = parseIso(props.event.EventDate)
      eventDateDay.value = d
      eventDateTime.value = t
    }

    if (props.event.ReturnDate) {
      const [d, t] = parseIso(props.event.ReturnDate)
      returnDateDay.value = d
      returnDateTime.value = t
    }

    if (props.event.RegistrationDeadline) {
      const [d, t] = parseIso(props.event.RegistrationDeadline)
      deadlineDay.value = d
      deadlineTime.value = t
    }

    description.value = props.event.Description || ''
  }
})

function parseIso(isoStr) {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ['', '']
  const pad = (n) => String(n).padStart(2, '0')
  const dayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return [dayStr, timeStr]
}

function handleSubmit() {
  if (!title.value.trim() || !destination.value.trim() || !eventDateDay.value) {
    toast.error(t('errors.VALIDATION_ERROR'))
    return
  }

  if (!props.event && notifyMode.value === 'selected' && selectedIds.value.size === 0) {
    toast.error(t('groupTrips.errPickRecipients'))
    return
  }

  const fullEventDate = `${eventDateDay.value}T${eventDateTime.value || '08:00'}:00`
  const fullReturnDate = returnDateDay.value
    ? `${returnDateDay.value}T${returnDateTime.value || '17:00'}:00`
    : null
  const fullDeadline = deadlineDay.value
    ? `${deadlineDay.value}T${deadlineTime.value || '17:00'}:00`
    : null

  emit('save', {
    title: title.value.trim(),
    destination: destination.value.trim(),
    eventDate: fullEventDate,
    returnDate: fullReturnDate,
    registrationDeadline: fullDeadline,
    description: description.value.trim() || null,
    ...(props.event
      ? {}
      : {
          notify: {
            mode: notifyMode.value,
            userIds: notifyMode.value === 'selected' ? [...selectedIds.value] : [],
          },
        }),
  })
}
</script>

<template>
  <div
    class="modal-backdrop"
    @click.self="emit('close')"
  >
    <div
      class="modal-panel max-h-[92vh] overflow-y-auto p-6"
      :class="event ? 'max-w-lg' : 'max-w-5xl'"
    >
      <div class="flex items-center justify-between border-b border-slate-200 pb-3">
        <h3 class="text-lg font-bold text-slate-900">
          <AppIcon :name="event ? 'edit' : 'plus'" class="mr-1.5 -mt-0.5 text-slate-400" />{{
            event ? t('groupTrips.editTitle') : t('groupTrips.createTitle')
          }}
        </h3>
        <button
          type="button"
          class="cursor-pointer text-slate-400 hover:text-slate-600"
          @click="emit('close')"
        >
          <AppIcon name="close" class="h-5 w-5" />
        </button>
      </div>

      <form class="mt-4" @submit.prevent="handleSubmit">
        <div :class="event ? '' : 'grid grid-cols-1 gap-6 lg:grid-cols-2'">
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-700"
                >{{ t('groupTrips.fTitle') }} <span class="text-red-500">*</span></label
              >
              <input
                v-model="title"
                type="text"
                required
                :placeholder="t('groupTrips.fTitlePh')"
                class="input mt-1"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700"
                >{{ t('groupTrips.fDestination') }} <span class="text-red-500">*</span></label
              >
              <input
                v-model="destination"
                type="text"
                required
                :placeholder="t('groupTrips.fDestinationPh')"
                class="input mt-1"
              />
            </div>

            <!-- Departure Date & Time (Unified Header) -->
            <div>
              <label class="block text-xs font-bold text-slate-700"
                >{{ t('groupTrips.fDepart') }} <span class="text-red-500">*</span></label
              >
              <div class="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DatePicker
                  v-model="eventDateDay"
                  :required="true"
                  :placeholder="t('groupTrips.fDepartDatePh')"
                />
                <TimePicker
                  v-model="eventDateTime"
                  :required="true"
                  :placeholder="t('groupTrips.fTimePh')"
                />
              </div>
            </div>

            <!-- Return Date & Time (Unified Header) -->
            <div>
              <label class="block text-xs font-bold text-slate-700"
                >{{ t('groupTrips.fReturn') }}</label
              >
              <div class="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DatePicker v-model="returnDateDay" :placeholder="t('groupTrips.fReturnDatePh')" />
                <TimePicker v-model="returnDateTime" :placeholder="t('groupTrips.fReturnTimePh')" />
              </div>
            </div>

            <!-- Deadline & Max Seats -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.fDeadline') }}</label>
                <div class="mt-1 grid grid-cols-2 gap-1">
                  <DatePicker v-model="deadlineDay" :placeholder="t('groupTrips.fDeadlineDatePh')" />
                  <TimePicker v-model="deadlineTime" :placeholder="t('groupTrips.fDeadlineTimePh')" />
                </div>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700">{{ t('groupTrips.fNotes') }}</label>
              <textarea
                v-model="description"
                rows="3"
                :placeholder="t('groupTrips.fNotesPh')"
                class="input mt-1"
              ></textarea>
            </div>
          </div>

          <!-- ผู้รับแจ้งเตือนทางอีเมลตอนเปิดกิจกรรม (ตอนสร้างเท่านั้น) - คอลัมน์ขวาบนจอกว้าง -->
          <fieldset v-if="!event" class="self-start rounded-card bg-surface p-3">
            <legend class="px-1 text-xs font-bold text-slate-700">
              {{ t('groupTrips.fNotify') }} <span class="text-red-500">*</span>
            </legend>
            <div class="flex flex-wrap gap-4 text-sm text-slate-700">
              <label class="flex cursor-pointer items-center gap-1.5">
                <input
                  v-model="notifyMode"
                  type="radio"
                  value="selected"
                  class="cursor-pointer"
                />{{ t('groupTrips.fNotifyPick') }}
              </label>
              <label class="flex cursor-pointer items-center gap-1.5">
                <input
                  v-model="notifyMode"
                  type="radio"
                  value="all"
                  class="cursor-pointer"
                />{{ t('groupTrips.fNotifyAll') }}
              </label>
            </div>
            <p v-if="notifyMode === 'all'" class="mt-2 text-xs text-slate-500">
              {{ t('groupTrips.fNotifyAllHint') }}
            </p>
            <div v-else class="mt-2 space-y-2">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  v-model="departmentFilter"
                  class="input"
                >
                  <option value="">{{ t('groupTrips.fAllDepts') }}</option>
                  <option v-for="d in departments" :key="d" :value="d">{{ d }}</option>
                </select>
                <input
                  v-model="search"
                  type="search"
                  :placeholder="t('groupTrips.fSearchPh')"
                  class="input"
                />
              </div>
              <div class="flex items-center justify-between text-xs text-slate-600">
                <span
                  >{{ t('groupTrips.fSelectedCount', { selected: selectedIds.size, shown: visibleUsers.length }) }}</span
                >
                <span class="flex gap-3">
                  <button
                    type="button"
                    class="cursor-pointer font-medium text-accent hover:underline"
                    @click="toggleAllVisible"
                  >
                    {{ allVisibleSelected ? t('groupTrips.fDeselectShown') : t('groupTrips.fSelectShown') }}
                  </button>
                  <button
                    v-if="selectedIds.size"
                    type="button"
                    class="cursor-pointer text-slate-500 hover:underline"
                    @click="selectedIds = new Set()"
                  >
                    {{ t('groupTrips.fClear') }}
                  </button>
                </span>
              </div>
              <ul
                class="max-h-80 divide-y divide-hair overflow-y-auto"
              >
                <li v-for="u in visibleUsers" :key="u.id">
                  <label
                    class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      class="cursor-pointer"
                      :checked="selectedIds.has(u.id)"
                      @change="toggleUser(u.id)"
                    />
                    <span class="text-slate-900">{{ u.fullName }}</span>
                    <span class="text-xs text-slate-400">{{ u.department }}</span>
                  </label>
                </li>
                <li
                  v-if="visibleUsers.length === 0"
                  class="px-3 py-3 text-center text-xs text-slate-400"
                >
                  {{ t('groupTrips.fNoResults') }}
                </li>
              </ul>
            </div>
          </fieldset>
        </div>

        <div class="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            class="btn btn-secondary"
            @click="emit('close')"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="submit"
            :disabled="props.submitting"
            class="btn btn-primary"
          >
            {{ event ? t('groupTrips.fSaveEdit') : t('groupTrips.fCreate') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
